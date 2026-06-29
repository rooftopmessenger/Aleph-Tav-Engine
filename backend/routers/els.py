import os
from typing import Annotated, List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy import select

# Import models & scanner
from ingest_db import Verse
from utils.els_scanner import scan_els

router = APIRouter(
    prefix="/api/analytics/els",
    tags=["els"]
)

# SQLite/Postgre database configuration matching other routers
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


# --- Pydantic Schemas ---

class ElsLexiconEntrySchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    
    strongs_number: str
    lemma: str
    transliteration: Optional[str] = None
    gloss: Optional[str] = None
    definition: Optional[str] = None

class ElsMatchSchema(BaseModel):
    word: str
    start_index: int
    skip: int
    indices: List[int]
    lexicon_entries: List[ElsLexiconEntrySchema]

class ElsScannerResponse(BaseModel):
    osis_id: str
    hebrew_text: Optional[str] = None
    consonants: str
    matches: List[ElsMatchSchema]


# --- API Route ---

@router.get("/{osis_id}", response_model=ElsScannerResponse)
async def get_els_analysis(osis_id: str, db: DbSession):
    """
    Retrieve a verse's Hebrew text, strip vowels/diacritics/spaces to isolate base consonants,
    and scan it for Equidistant Letter Sequences (ELS) matching valid Strong's Hebrew lemmas.
    """
    # 1. Fetch verse by OSIS ID
    stmt = select(Verse).where(Verse.osis_id == osis_id)
    result = await db.execute(stmt)
    verse = result.scalar_one_or_none()
    
    if not verse:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Verse with OSIS ID '{osis_id}' not found in database."
        )
        
    if not verse.hebrew_text:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Verse '{osis_id}' has no Hebrew text available for scanning."
        )
        
    # 2. Run ELS scanner
    # Scan skips from -50 to 50
    consonants, matches = await scan_els(
        hebrew_text=verse.hebrew_text,
        db=db,
        min_skip=-50,
        max_skip=50,
        min_len=3,
        max_len=12
    )
    
    return ElsScannerResponse(
        osis_id=verse.osis_id,
        hebrew_text=verse.hebrew_text,
        consonants=consonants,
        matches=matches
    )
