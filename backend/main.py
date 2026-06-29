from dotenv import load_dotenv
load_dotenv()

import re
from contextlib import asynccontextmanager
from typing import Annotated, List, Optional
from datetime import datetime, timedelta
from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel, ConfigDict, computed_field
import os
from sqlalchemy import select, or_, and_
from sqlalchemy.orm import joinedload
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from jose import JWTError, jwt
from passlib.context import CryptContext
import bcrypt

from ingest_db import Book, StrongsLexicon, Verse, Word, User, SavedNote, normalize_strongs
from services.ai_service import OllamaService
from routers import cryptography, search, semantic_search, analytics, export, els, temurah, topology

# ==========================================
# 1. Pydantic V2 Schemas for Serialization
# ==========================================

class BookFilter(BaseModel):
    book: str  # Can be book name (e.g. "Genesis") or OSIS code (e.g. "Gen")
    chapter: Optional[int] = None

class PatternSearchRequest(BaseModel):
    prompt: str
    search_mode: Optional[str] = "Standard Search"
    filters: Optional[List[BookFilter]] = None

class BookSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    
    id: int
    osis_code: str
    name: str
    testament: str

class StrongsLexiconSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    
    strongs_number: str
    lemma: str
    transliteration: Optional[str] = None
    pronunciation: Optional[str] = None
    part_of_speech: Optional[str] = None
    gloss: Optional[str] = None
    definition: Optional[str] = None

class WordSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    
    id: int
    verse_id: int
    bhs_sort: int
    word_index: int
    hebrew_segment: str
    transliteration: Optional[str] = None
    strongs_number: Optional[str] = None
    morph_code: Optional[str] = None
    morph_detail: Optional[str] = None
    english_gloss: Optional[str] = None
    
    # Cryptographic persists fields
    gematria_absolute: Optional[int] = None
    gematria_ordinal: Optional[int] = None
    gematria_reduced: Optional[int] = None
    atbash: Optional[str] = None
    albam: Optional[str] = None
    atbah: Optional[str] = None
    
    # Eagerly load lexicon mappings for interlinear popups
    lexicon: Optional[StrongsLexiconSchema] = None

class WordDetailResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    
    id: int
    verse_id: int
    bhs_sort: int
    word_index: int
    hebrew_segment: str
    transliteration: Optional[str] = None
    strongs_number: Optional[str] = None
    morph_code: Optional[str] = None
    morph_detail: Optional[str] = None
    english_gloss: Optional[str] = None
    
    gematria_absolute: Optional[int] = None
    gematria_ordinal: Optional[int] = None
    gematria_reduced: Optional[int] = None
    atbash: Optional[str] = None
    albam: Optional[str] = None
    atbah: Optional[str] = None
    
    lexicon: Optional[StrongsLexiconSchema] = None
    
    atbash_match: Optional[StrongsLexiconSchema] = None
    albam_match: Optional[StrongsLexiconSchema] = None
    atbah_match: Optional[StrongsLexiconSchema] = None
    
    # Context references
    verse_osis: Optional[str] = None
    verse_text: Optional[str] = None
    verse_english: Optional[str] = None

class VerseSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    
    id: int
    book_id: int
    chapter: int
    verse: int
    osis_id: str
    hebrew_text: Optional[str] = None
    english_text: str
    entropy_score: Optional[float] = None
    
    # Nested word segments to build the interlinear view
    words: List[WordSchema]

    @computed_field
    @property
    def direction(self) -> str:
        return "rtl" if self.book_id <= 39 else "ltr"

class UserAuthSchema(BaseModel):
    email: str
    password: str

class TokenSchema(BaseModel):
    access_token: str
    token_type: str

class UserResponseSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    email: str
    created_at: datetime

class SavedNoteCreateSchema(BaseModel):
    verse_id: int
    note_text: str
    is_public: Optional[bool] = False
    x_position: Optional[int] = None
    y_position: Optional[int] = None

class VerseInfoSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    osis_id: str
    english_text: str

class SavedNoteResponseSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    
    id: int
    user_id: int
    verse_id: int
    note_text: str
    created_at: datetime
    is_public: bool
    x_position: Optional[int] = None
    y_position: Optional[int] = None
    user: Optional[UserResponseSchema] = None
    verse: Optional[VerseInfoSchema] = None

class SavedNoteUpdateSchema(BaseModel):
    note_text: Optional[str] = None
    is_public: Optional[bool] = None
    x_position: Optional[int] = None
    y_position: Optional[int] = None



# ==========================================
# 2. Database Configuration & Dependency Injection
# ==========================================

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///kjv_strongs.db")
if DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://")
elif DATABASE_URL.startswith("sqlite://") and "aiosqlite" not in DATABASE_URL:
    DATABASE_URL = DATABASE_URL.replace("sqlite://", "sqlite+aiosqlite://")

connect_args = {}
if "sqlite" in DATABASE_URL:
    connect_args = {"check_same_thread": False}

async_engine = create_async_engine(
    DATABASE_URL, 
    echo=False, 
    connect_args=connect_args
)
AsyncSessionLocal = async_sessionmaker(
    bind=async_engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)

async def get_db():
    async with AsyncSessionLocal() as session:
        yield session

DbSession = Annotated[AsyncSession, Depends(get_db)]

# ==========================================
# 1.5 JWT Authentication & Authorization Helpers
# ==========================================
SECRET_KEY = os.getenv("JWT_SECRET_KEY", "supersecretkey_for_testing_purposes_only_change_in_prod")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # 1 day

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))
    except Exception:
        return False

def get_password_hash(password: str) -> str:
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password.encode('utf-8'), salt)
    return hashed.decode('utf-8')

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

async def get_current_user(token: Annotated[Optional[str], Depends(oauth2_scheme)], db: DbSession) -> Optional[User]:
    if not token:
        return None
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
        
    stmt = select(User).where(User.email == email)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()
    if user is None:
        raise credentials_exception
    return user

async def get_required_current_user(current_user: Annotated[Optional[User], Depends(get_current_user)]) -> User:
    if current_user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return current_user


# ==========================================
# 3. Lifespan Event Handling
# ==========================================

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup tasks
    print("[Aleph-Tav Engine] FastAPI backend initializing...")
    yield
    # Shutdown tasks
    print("[Aleph-Tav Engine] FastAPI backend shutting down...")

# ==========================================
# 4. FastAPI Application Setup
# ==========================================

app = FastAPI(
    title="Aleph-Tav Engine API",
    description="Backend API serving Hebrew/English interlinear Scripture data.",
    version="1.0.0",
    lifespan=lifespan,
    redirect_slashes=False
)

# CORS Configuration (supporting frontend on localhost:3000 and 127.0.0.1:3000)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(cryptography.router)
app.include_router(search.router)
app.include_router(semantic_search.router)
app.include_router(analytics.router)
app.include_router(export.router)
app.include_router(els.router)
app.include_router(temurah.router)
app.include_router(topology.router)


# ==========================================
# 5. API Endpoints
# ==========================================

@app.get("/health", status_code=status.HTTP_200_OK)
def health_check():
    """Simple API status health check endpoint."""
    return {
        "status": "healthy", 
        "engine": "Aleph-Tav Engine API", 
        "version": "1.0.0"
    }

# ==========================================
# 5.1 Authentication API Endpoints
# ==========================================

@app.post("/api/auth/signup", response_model=TokenSchema)
async def signup(user_data: UserAuthSchema, db: DbSession):
    # Check if user already exists
    stmt = select(User).where(User.email == user_data.email)
    result = await db.execute(stmt)
    existing_user = result.scalar_one_or_none()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email address already registered."
        )
        
    hashed_password = get_password_hash(user_data.password)
    new_user = User(
        email=user_data.email,
        hashed_password=hashed_password
    )
    db.add(new_user)
    await db.commit()
    
    access_token = create_access_token(data={"sub": new_user.email})
    return {"access_token": access_token, "token_type": "bearer"}

@app.post("/api/auth/login", response_model=TokenSchema)
async def login(user_data: UserAuthSchema, db: DbSession):
    stmt = select(User).where(User.email == user_data.email)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()
    if not user or not verify_password(user_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
        
    access_token = create_access_token(data={"sub": user.email})
    return {"access_token": access_token, "token_type": "bearer"}

@app.get("/api/auth/me", response_model=UserResponseSchema)
async def read_users_me(current_user: Annotated[User, Depends(get_required_current_user)]):
    return current_user

# ==========================================
# 5.2 Saved Notes API Endpoints
# ==========================================

@app.get("/api/notes", response_model=List[SavedNoteResponseSchema])
async def get_all_user_notes(current_user: Annotated[User, Depends(get_required_current_user)], db: DbSession):
    stmt = (
        select(SavedNote)
        .options(joinedload(SavedNote.user), joinedload(SavedNote.verse))
        .where(SavedNote.user_id == current_user.id)
        .order_by(SavedNote.created_at.desc())
        .limit(5)
    )
    result = await db.execute(stmt)
    notes = result.unique().scalars().all()
    return notes

@app.get("/api/notes/{verse_id}", response_model=List[SavedNoteResponseSchema])
async def get_notes(verse_id: int, current_user: Annotated[Optional[User], Depends(get_current_user)], db: DbSession):
    if current_user:
        stmt = (
            select(SavedNote)
            .options(joinedload(SavedNote.user), joinedload(SavedNote.verse))
            .where(
                and_(
                    SavedNote.verse_id == verse_id,
                    or_(
                        SavedNote.is_public == True,
                        SavedNote.user_id == current_user.id
                    )
                )
            )
        )
    else:
        stmt = (
            select(SavedNote)
            .options(joinedload(SavedNote.user), joinedload(SavedNote.verse))
            .where(
                and_(
                    SavedNote.verse_id == verse_id,
                    SavedNote.is_public == True
                )
            )
        )
        
    result = await db.execute(stmt)
    notes = result.unique().scalars().all()
    return notes

@app.post("/api/notes", response_model=SavedNoteResponseSchema)
async def save_note(note_data: SavedNoteCreateSchema, current_user: Annotated[User, Depends(get_required_current_user)], db: DbSession):
    # Check if verse exists
    verse_stmt = select(Verse).where(Verse.id == note_data.verse_id)
    verse_res = await db.execute(verse_stmt)
    verse_exists = verse_res.scalar_one_or_none()
    if not verse_exists:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Verse with ID '{note_data.verse_id}' not found."
        )
        
    new_note = SavedNote(
        user_id=current_user.id,
        verse_id=note_data.verse_id,
        note_text=note_data.note_text,
        is_public=note_data.is_public,
        x_position=note_data.x_position,
        y_position=note_data.y_position
    )
    db.add(new_note)
    await db.commit()
    
    # Eagerly load the user and verse relationships to satisfy the response schema
    stmt = (
        select(SavedNote)
        .options(joinedload(SavedNote.user), joinedload(SavedNote.verse))
        .where(SavedNote.id == new_note.id)
    )
    res = await db.execute(stmt)
    note_with_user = res.unique().scalar_one()
    return note_with_user

@app.patch("/api/notes/{note_id}", response_model=SavedNoteResponseSchema)
async def update_note(note_id: int, note_data: SavedNoteUpdateSchema, current_user: Annotated[User, Depends(get_required_current_user)], db: DbSession):
    stmt = (
        select(SavedNote)
        .options(joinedload(SavedNote.user), joinedload(SavedNote.verse))
        .where(and_(SavedNote.id == note_id, SavedNote.user_id == current_user.id))
    )
    res = await db.execute(stmt)
    note = res.unique().scalar_one_or_none()
    if not note:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Note with ID '{note_id}' not found or you are not authorized to edit it."
        )
        
    if note_data.note_text is not None:
        note.note_text = note_data.note_text
    if note_data.is_public is not None:
        note.is_public = note_data.is_public
    if note_data.x_position is not None:
        note.x_position = note_data.x_position
    if note_data.y_position is not None:
        note.y_position = note_data.y_position
        
    await db.commit()
    
    # Re-query with loaded relations to satisfy response schema and prevent lazy loading crashes
    stmt = (
        select(SavedNote)
        .options(joinedload(SavedNote.user), joinedload(SavedNote.verse))
        .where(SavedNote.id == note_id)
    )
    res = await db.execute(stmt)
    updated_note = res.unique().scalar_one()
    return updated_note


@app.get("/api/books", response_model=List[BookSchema])
async def get_books(db: DbSession):
    """
    List all books in the database.
    """
    stmt = select(Book).order_by(Book.id)
    res = await db.execute(stmt)
    books = res.scalars().all()
    return books


@app.get("/api/verses/{osis_id}", response_model=VerseSchema)
async def get_verse(osis_id: str, db: DbSession):
    """
    Fetch a verse by OSIS ID (e.g. Gen.1.1).
    Eagerly loads nested word segments and their associated lexicon entries.
    """
    # Optimized query utilizing joinedload to prevent N+1 queries
    stmt = (
        select(Verse)
        .where(Verse.osis_id == osis_id)
        .options(
            joinedload(Verse.words).joinedload(Word.lexicon)
        )
    )
    result = await db.execute(stmt)
    # unique() is required in SQLAlchemy 2.0 when joinedload is used on collections
    verse = result.unique().scalar_one_or_none()
    
    if not verse:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Verse with OSIS ID '{osis_id}' not found."
        )
        
    # Sort the nested word segments by their word_index position in the verse
    verse.words.sort(key=lambda w: w.word_index)
    return verse

_normalized_lexicon_cache = None

async def get_normalized_lexicon_cache(db: AsyncSession):
    global _normalized_lexicon_cache
    if _normalized_lexicon_cache is not None:
        return _normalized_lexicon_cache

    from utils.normalization import normalize_hebrew_text
    
    stmt = select(StrongsLexicon)
    result = await db.execute(stmt)
    entries = result.scalars().all()
    
    cache = {}
    for entry in entries:
        if not entry.lemma:
            continue
        norm = normalize_hebrew_text(entry.lemma, keep_spaces=False)
        if norm and norm not in cache:
            cache[norm] = entry
            
    _normalized_lexicon_cache = cache
    return _normalized_lexicon_cache

@app.get("/api/words/{word_id}", response_model=WordDetailResponse)
async def get_word_detail(word_id: int, db: DbSession):
    """
    Fetch a single word segment by its ID, eagerly loading its lexicon entry and verse context.
    """
    stmt = (
        select(Word)
        .where(Word.id == word_id)
        .options(
            joinedload(Word.lexicon),
            joinedload(Word.verse)
        )
    )
    result = await db.execute(stmt)
    word = result.unique().scalar_one_or_none()
    
    if not word:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Word with ID {word_id} not found."
        )
        
    cache = await get_normalized_lexicon_cache(db)
    
    atbash_match = cache.get(word.atbash) if word.atbash else None
    albam_match = cache.get(word.albam) if word.albam else None
    atbah_match = cache.get(word.atbah) if word.atbah else None
        
    return WordDetailResponse(
        id=word.id,
        verse_id=word.verse_id,
        bhs_sort=word.bhs_sort,
        word_index=word.word_index,
        hebrew_segment=word.hebrew_segment,
        transliteration=word.transliteration,
        strongs_number=word.strongs_number,
        morph_code=word.morph_code,
        morph_detail=word.morph_detail,
        english_gloss=word.english_gloss,
        gematria_absolute=word.gematria_absolute,
        gematria_ordinal=word.gematria_ordinal,
        gematria_reduced=word.gematria_reduced,
        atbash=word.atbash,
        albam=word.albam,
        atbah=word.atbah,
        lexicon=word.lexicon,
        atbash_match=atbash_match,
        albam_match=albam_match,
        atbah_match=atbah_match,
        verse_osis=word.verse.osis_id if word.verse else None,
        verse_text=word.verse.hebrew_text if word.verse else None,
        verse_english=word.verse.english_text if word.verse else None
    )

@app.get("/api/chapters/{book}/{chapter}", response_model=List[VerseSchema])
async def get_chapter(book: str, chapter: int, db: DbSession):
    """
    Fetch all verses in a chapter of a book.
    Eagerly loads nested word segments and their associated lexicon entries.
    """
    # 1. Resolve book by osis_code or name (case-insensitive)
    book_stmt = select(Book).where(
        or_(
            Book.osis_code.ilike(book),
            Book.name.ilike(book)
        )
    )
    book_res = await db.execute(book_stmt)
    db_book = book_res.scalar_one_or_none()
    
    if not db_book:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Book '{book}' not found."
        )
        
    # 2. Query verses in that book and chapter
    stmt = (
        select(Verse)
        .where(
            and_(
                Verse.book_id == db_book.id,
                Verse.chapter == chapter
            )
        )
        .options(
            joinedload(Verse.words).joinedload(Word.lexicon)
        )
        .order_by(Verse.verse)
    )
    
    result = await db.execute(stmt)
    verses = result.unique().scalars().all()
    
    if not verses:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No verses found for {db_book.name} chapter {chapter}."
        )
        
    # Sort the nested word segments by their word_index position in each verse
    for v in verses:
        v.words.sort(key=lambda w: w.word_index)
        
    return verses

@app.get("/api/lexicon/{strongs_number}", response_model=StrongsLexiconSchema)
async def get_lexicon_entry(strongs_number: str, db: DbSession):
    """
    Fetch a lexicon entry by its Strong's number.
    Input is normalized to strip padding leading zeros to match database format (e.g. H07225 -> H7225).
    """
    normalized_sn = normalize_strongs(strongs_number)
    
    stmt = select(StrongsLexicon).where(StrongsLexicon.strongs_number == normalized_sn)
    result = await db.execute(stmt)
    entry = result.scalar_one_or_none()
    
    if not entry:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Strongs lexicon entry '{strongs_number}' (normalized: '{normalized_sn}') not found."
        )
        
    return entry
def parse_prompt_for_search(prompt: str) -> tuple[List[str], List[str]]:
    """
    Extracts Strong's numbers and key English search keywords from the prompt.
    """
    # Extract Strong's numbers (matching patterns like H7225 or G7225, case-insensitive)
    strongs_raw = re.findall(r'\b[HG]\d+\b', prompt, re.IGNORECASE)
    strongs = [normalize_strongs(s) for s in strongs_raw if normalize_strongs(s)]
    
    # Extract keywords (words 3+ chars long, lowercase, excluding common English stopwords)
    raw_words = re.findall(r'\b[a-zA-Z]{3,}\b', prompt)
    stopwords = {
        "the", "and", "for", "but", "with", "from", "that", "this", "these", "those",
        "have", "has", "had", "are", "was", "were", "what", "where", "when", "how",
        "who", "why", "which", "pattern", "search", "find", "show", "give", "verse",
        "verses", "bible", "scripture", "hebrew", "greek", "strongs"
    }
    keywords = [
        w.lower() for w in raw_words
        if w.lower() not in stopwords and not re.match(r'^[HG]\d+$', w, re.IGNORECASE)
    ]
    return strongs, keywords

@app.post("/api/ai/pattern-search")
async def pattern_search(request: PatternSearchRequest, db: DbSession):
    """
    Perform a semantic/lexical pattern search. Queries the database for relevant
    verses, interlinear segments, and Strong's lexicon details, then streams analysis
    back token-by-token using Ollama.
    """
    # 1. Parse prompt for search parameters
    strongs_list, keywords = parse_prompt_for_search(request.prompt)
    
    # 2. Build search query
    stmt = (
        select(Verse)
        .outerjoin(Verse.words)
        .options(
            joinedload(Verse.words).joinedload(Word.lexicon)
        )
    )
    
    # Apply book/chapter filters if provided
    if request.filters:
        filter_conditions = []
        for f in request.filters:
            book_clause = (Book.osis_code.ilike(f.book) | Book.name.ilike(f.book))
            if f.chapter is not None:
                filter_conditions.append(book_clause & (Verse.chapter == f.chapter))
            else:
                filter_conditions.append(book_clause)
        
        if filter_conditions:
            stmt = stmt.join(Verse.book).where(or_(*filter_conditions))
            
    # Apply search criteria
    search_clauses = []
    if strongs_list:
        search_clauses.append(Verse.words.any(Word.strongs_number.in_(strongs_list)))
    
    for kw in keywords:
        search_clauses.append(
            Verse.english_text.ilike(f"%{kw}%") |
            Verse.words.any(Word.english_gloss.ilike(f"%{kw}%")) |
            Verse.words.any(Word.hebrew_segment.ilike(f"%{kw}%"))
        )
        
    if search_clauses:
        stmt = stmt.where(or_(*search_clauses))
    else:
        # Fallback: search prompt directly
        stmt = stmt.where(Verse.english_text.ilike(f"%{request.prompt}%"))
        
    # Limit search to 5 verses for context
    stmt = stmt.limit(5)
    
    # Execute query
    result = await db.execute(stmt)
    verses = result.unique().scalars().all()
    
    # Sort the words for each verse by word_index
    for v in verses:
        v.words.sort(key=lambda w: w.word_index)
        
    # 3. Format ground-truth context block
    context_str = ""
    if verses:
        context_str = "Ground-Truth Context Biblical Data:\n"
        for v in verses:
            context_str += f"Verse: {v.osis_id}\n"
            context_str += f"English (KJV): {v.english_text}\n"
            context_str += "Hebrew Interlinear:\n"
            for w in v.words:
                lex = w.lexicon
                lex_info = ""
                if lex:
                    lex_info = f" (lemma: {lex.lemma}, transliteration: {lex.transliteration}, gloss: {lex.gloss})"
                context_str += f"  - Segment: {w.hebrew_segment} | Translit: {w.transliteration} | Strongs: {w.strongs_number or 'N/A'}{lex_info}\n"
            context_str += "\n"
    else:
        context_str = "No exact matching verses or words found in the database for the given keywords/Strong's numbers.\n"
        
    # 4. Initialize Ollama service and prompt
    ai_service = OllamaService()
    
    if request.search_mode == "Divine Speech & Lexical Analysis":
        system_prompt = (
            "You are an expert Biblical Hebrew and interlinear linguistics assistant specializing in Divine Speech analysis.\n"
            "Your goal is to perform a semantic and lexical pattern search analysis with a strict focus on identifying the direct speech of God.\n"
            "1. Strictly identify the exact Hebrew source words behind English names and references for God (e.g., distinguishing YHWH [H3068], Elohim [H430], Adonai [H136], El [H410]) and discuss their distinct theological significance in the context.\n"
            "2. Identify structural quotative frames (such as the root 'amr' in 'lemor' לֵאמֹר [H559] or 'neum' נְאֻם [H5002]) to clearly separate the narrator or prophet's introductory voice from the direct quotations of the deity.\n"
            "3. Focus your theological and linguistic analysis exclusively on the content and intent of the direct Divine Speech itself.\n"
            "Be scholarly, objective, and precise, referencing the Hebrew lemmas and Strong's numbers from the context data.\n"
            "Always base your analysis strictly on the provided context. If no context is found, state that clearly and provide a general overview."
        )
    elif request.search_mode == "Prophetic Voice":
        system_prompt = (
            "You are an expert Biblical Hebrew and interlinear linguistics assistant specializing in prophetic rhetoric and voice analysis.\n"
            "Your goal is to analyze the prophet's rhetorical framing and grammatical structure.\n"
            "1. Distinguish between when the prophet is speaking on behalf of themselves (their own thoughts, prayers, or reactions) versus when they are utilizing the formal Messenger Formula (e.g., 'ko amar YHWH' כֹּה אָמַר יְהוָה, 'Thus says the LORD').\n"
            "2. Analyze how this prophetic framing shapes the delivery, authority, and grammatical tense of the oracle.\n"
            "Be scholarly, objective, and precise, referencing the Hebrew lemmas and Strong's numbers from the context data.\n"
            "Always base your analysis strictly on the provided context. If no context is found, state that clearly and provide a general overview."
        )
    else:
        system_prompt = (
            "You are an expert Biblical Hebrew and interlinear linguistics assistant.\n"
            "Your goal is to perform a semantic and lexical pattern search analysis using the ground-truth biblical data provided.\n"
            "Analyze the user's query utilizing the provided context verses, Strong's numbers, transliterations, and lexicon definitions.\n"
            "Explain any relevant patterns, theological emphasis, grammatical features, or word connections you find.\n"
            "Be scholarly, objective, and precise, referencing the Hebrew lemmas and Strong's numbers from the context data.\n"
            "Always base your analysis strictly on the provided context. If no context is found, state that clearly and provide a general overview based on your knowledge."
        )
    
    llm_prompt = (
        f"User Query: {request.prompt}\n\n"
        f"{context_str}\n"
        f"Please analyze the pattern or topic requested by the user using the interlinear details above."
    )
    
    # 5. Return StreamingResponse
    return StreamingResponse(
        ai_service.generate_stream(llm_prompt, system_prompt=system_prompt),
        media_type="text/plain; charset=utf-8"
    )

# ==========================================
# 6. Local Server Runner
# ==========================================

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
