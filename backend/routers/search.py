import os
from typing import Annotated, Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.pool import NullPool
from sqlalchemy import select
from sqlalchemy.orm import joinedload

# Import models
from ingest_db import Word, Verse

router = APIRouter(
    prefix="/api/search/cryptography",
    tags=["cryptography-search"]
)

# Set up database session to avoid circular import with main.py
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+asyncpg://postgres:postgres@localhost:5433/aleph_tav_db")
if DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://")
elif DATABASE_URL.startswith("postgresql+psycopg://"):
    DATABASE_URL = DATABASE_URL.replace("postgresql+psycopg://", "postgresql+asyncpg://")

async_engine = create_async_engine(DATABASE_URL, echo=False, poolclass=NullPool)
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

class WordSearchResponse(BaseModel):
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
    
    # Context references
    verse_osis: Optional[str] = None
    verse_text: Optional[str] = None

@router.get("", response_model=List[WordSearchResponse])
async def search_cryptography(
    db: DbSession,
    gematria_absolute: Optional[int] = Query(None, description="Filter by absolute Gematria value"),
    gematria_ordinal: Optional[int] = Query(None, description="Filter by ordinal Gematria value"),
    gematria_reduced: Optional[int] = Query(None, description="Filter by reduced Gematria value"),
    atbash: Optional[str] = Query(None, description="Filter by Atbash cipher match"),
    albam: Optional[str] = Query(None, description="Filter by Albam cipher match"),
    atbah: Optional[str] = Query(None, description="Filter by Atbah cipher match"),
    limit: int = Query(100, ge=1, le=1000, description="Limit the number of results returned")
):
    """
    Search the entire database for words matching a specific cryptographic footprint.
    Requires at least one search filter query parameter.
    """
    # Build query joining verse relation for context
    stmt = select(Word).options(joinedload(Word.verse))
    
    # Apply query filters
    filters = []
    if gematria_absolute is not None:
        filters.append(Word.gematria_absolute == gematria_absolute)
    if gematria_ordinal is not None:
        filters.append(Word.gematria_ordinal == gematria_ordinal)
    if gematria_reduced is not None:
        filters.append(Word.gematria_reduced == gematria_reduced)
    if atbash is not None:
        filters.append(Word.atbash == atbash)
    if albam is not None:
        filters.append(Word.albam == albam)
    if atbah is not None:
        filters.append(Word.atbah == atbah)
        
    if not filters:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least one search filter (gematria_* or cipher name) must be provided."
        )
        
    stmt = stmt.where(*filters).order_by(Word.bhs_sort).limit(limit)
    
    result = await db.execute(stmt)
    words = result.scalars().all()
    
    response = []
    for word in words:
        item = WordSearchResponse.model_validate(word)
        if word.verse:
            item.verse_osis = word.verse.osis_id
            item.verse_text = word.verse.hebrew_text
        response.append(item)
        
    return response
