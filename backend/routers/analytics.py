from typing import Annotated, List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy import select
from sqlalchemy.orm import joinedload

# Import models
from ingest_db import Word, Verse, Book, TempleDimension
from utils.entropy import calculate_shannon_entropy

router = APIRouter(
    prefix="/api/analytics",
    tags=["analytics"]
)

import os

# SQLite database configuration matching main.py and search.py
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

class ChapterAggregation(BaseModel):
    chapter: int
    mean_entropy: float
    mean_gematria: float

class WordAnalyticsSchema(BaseModel):
    word_index: int
    hebrew_segment: str
    english_gloss: Optional[str] = None
    gematria_absolute: Optional[int] = None
    entropy_score: float

class VerseAnalyticsResponse(BaseModel):
    osis_id: str
    english_text: str
    hebrew_text: Optional[str] = None
    words: List[WordAnalyticsSchema]

@router.get("/book/{book_id}", response_model=List[ChapterAggregation])
async def get_book_analytics(book_id: int, db: DbSession):
    """
    Get chapter-level averages for a single book.
    Returns mean entropy and mean gematria for every chapter.
    """
    # 1. Verify if book exists
    book_stmt = select(Book).where(Book.id == book_id)
    book_res = await db.execute(book_stmt)
    book_exists = book_res.scalar_one_or_none()
    if not book_exists:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Book with ID {book_id} not found."
        )

    # 2. Query all verses in the book, eagerly loading words
    stmt = (
        select(Verse)
        .where(Verse.book_id == book_id)
        .options(joinedload(Verse.words))
    )
    result = await db.execute(stmt)
    verses = result.unique().scalars().all()

    if not verses:
        return []

    # 3. Group by chapter
    from collections import defaultdict
    chapter_verses = defaultdict(list)
    for v in verses:
        chapter_verses[v.chapter].append(v)

    response_data = []
    for ch, ch_verses in sorted(chapter_verses.items()):
        # Calculate mean_entropy (excluding None values)
        entropy_scores = [v.entropy_score for v in ch_verses if v.entropy_score is not None]
        mean_entropy = sum(entropy_scores) / len(entropy_scores) if entropy_scores else 0.0

        # Calculate mean_gematria:
        # Each verse's gematria is the sum of its words' gematria_absolute values.
        # We calculate the cumulative gematria of each verse, then average across all verses in the chapter.
        verse_gematrias = []
        for v in ch_verses:
            v_gem = sum(w.gematria_absolute for w in v.words if w.gematria_absolute is not None)
            verse_gematrias.append(v_gem)
        mean_gematria = sum(verse_gematrias) / len(verse_gematrias) if verse_gematrias else 0.0

        response_data.append(ChapterAggregation(
            chapter=ch,
            mean_entropy=mean_entropy,
            mean_gematria=mean_gematria
        ))

    return response_data

@router.get("/verse/{osis_id}", response_model=VerseAnalyticsResponse)
async def get_verse_analytics(osis_id: str, db: DbSession):
    """
    Get word-level analytics for a single verse.
    Returns the absolute gematria and on-the-fly Shannon Entropy for each word.
    """
    # Query verse and its words
    stmt = (
        select(Verse)
        .where(Verse.osis_id == osis_id)
        .options(joinedload(Verse.words))
    )
    result = await db.execute(stmt)
    verse = result.unique().scalar_one_or_none()

    if not verse:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Verse with OSIS ID '{osis_id}' not found."
        )

    # Sort words by word_index
    sorted_words = sorted(verse.words, key=lambda w: w.word_index)

    word_schemas = []
    for w in sorted_words:
        # Calculate word-level entropy on the fly
        w_entropy = calculate_shannon_entropy(w.hebrew_segment)
        word_schemas.append(WordAnalyticsSchema(
            word_index=w.word_index,
            hebrew_segment=w.hebrew_segment,
            english_gloss=w.english_gloss,
            gematria_absolute=w.gematria_absolute,
            entropy_score=w_entropy
        ))

    return VerseAnalyticsResponse(
        osis_id=verse.osis_id,
        english_text=verse.english_text,
        hebrew_text=verse.hebrew_text,
        words=word_schemas
    )

class StructureComparisonSchema(BaseModel):
    id: int
    osis_id: str
    object_name: str
    measurement_type: str
    physical_value: float
    gematria_value: int
    ratio: float
    english_text: str

@router.get("/compare-structure", response_model=List[StructureComparisonSchema])
async def compare_structure(db: DbSession):
    """
    Compare temple dimensions with cumulative gematria of their corresponding verses.
    """
    stmt = (
        select(TempleDimension)
        .options(joinedload(TempleDimension.verse).joinedload(Verse.words))
    )
    result = await db.execute(stmt)
    dimensions = result.unique().scalars().all()
    
    response = []
    for d in dimensions:
        verse = d.verse
        if not verse:
            continue
            
        gematria_value = sum(w.gematria_absolute for w in verse.words if w.gematria_absolute is not None)
        ratio = gematria_value / d.value if d.value != 0 else 0.0
        
        response.append(StructureComparisonSchema(
            id=d.id,
            osis_id=d.osis_id,
            object_name=d.object_name,
            measurement_type=d.measurement_type,
            physical_value=d.value,
            gematria_value=gematria_value,
            ratio=ratio,
            english_text=verse.english_text
        ))
        
    return response


# --- Parallel Delta Analysis (Difference Engine) Schemas ---

class DeltaDimensionDetailsSchema(BaseModel):
    object_name: str
    measurement_type: str
    value: float

class DeltaTargetSchema(BaseModel):
    osis_id: str
    english_text: str
    hebrew_text: Optional[str] = None
    gematria_sum: int
    entropy_score: float
    dimensions: List[DeltaDimensionDetailsSchema]

class DeltaValueSchema(BaseModel):
    abs_diff: float
    pct_diff: float

class DimensionDeltaSchema(BaseModel):
    measurement_type: str
    val_a: float
    val_b: float
    abs_diff: float
    pct_diff: float
    scaling_factor: Optional[float] = None
    scaling_type: Optional[str] = None  # "direct", "inverse", "undefined"

class DeltaMetricsSchema(BaseModel):
    gematria: DeltaValueSchema
    entropy: DeltaValueSchema
    dimensions: List[DimensionDeltaSchema]

class DeltaResponseSchema(BaseModel):
    target_a: DeltaTargetSchema
    target_b: DeltaTargetSchema
    deltas: DeltaMetricsSchema


@router.get("/delta", response_model=DeltaResponseSchema)
async def get_verse_delta(target_a: str, target_b: str, db: DbSession):
    """
    Perform a cryptographic and physical delta analysis between two parallel verses.
    """
    # Fetch verse A
    stmt_a = (
        select(Verse)
        .where(Verse.osis_id == target_a)
        .options(joinedload(Verse.words))
    )
    verse_a = (await db.execute(stmt_a)).unique().scalar_one_or_none()
    if not verse_a:
        raise HTTPException(status_code=404, detail=f"Verse '{target_a}' not found in database.")
        
    # Fetch verse B
    stmt_b = (
        select(Verse)
        .where(Verse.osis_id == target_b)
        .options(joinedload(Verse.words))
    )
    verse_b = (await db.execute(stmt_b)).unique().scalar_one_or_none()
    if not verse_b:
        raise HTTPException(status_code=404, detail=f"Verse '{target_b}' not found in database.")

    # Fetch dimensions for A
    dims_a_stmt = select(TempleDimension).where(TempleDimension.osis_id == target_a)
    dims_a = (await db.execute(dims_a_stmt)).scalars().all()

    # Fetch dimensions for B
    dims_b_stmt = select(TempleDimension).where(TempleDimension.osis_id == target_b)
    dims_b = (await db.execute(dims_b_stmt)).scalars().all()

    # Calculate target details
    gem_a = sum(w.gematria_absolute for w in verse_a.words if w.gematria_absolute is not None)
    gem_b = sum(w.gematria_absolute for w in verse_b.words if w.gematria_absolute is not None)

    ent_a = verse_a.entropy_score if verse_a.entropy_score is not None else calculate_shannon_entropy(verse_a.hebrew_text or "")
    ent_b = verse_b.entropy_score if verse_b.entropy_score is not None else calculate_shannon_entropy(verse_b.hebrew_text or "")

    # Map dimensions lists
    dims_a_details = [
        DeltaDimensionDetailsSchema(
            object_name=d.object_name,
            measurement_type=d.measurement_type,
            value=d.value
        ) for d in dims_a
    ]
    dims_b_details = [
        DeltaDimensionDetailsSchema(
            object_name=d.object_name,
            measurement_type=d.measurement_type,
            value=d.value
        ) for d in dims_b
    ]

    target_a_schema = DeltaTargetSchema(
        osis_id=target_a,
        english_text=verse_a.english_text,
        hebrew_text=verse_a.hebrew_text,
        gematria_sum=gem_a,
        entropy_score=ent_a,
        dimensions=dims_a_details
    )

    target_b_schema = DeltaTargetSchema(
        osis_id=target_b,
        english_text=verse_b.english_text,
        hebrew_text=verse_b.hebrew_text,
        gematria_sum=gem_b,
        entropy_score=ent_b,
        dimensions=dims_b_details
    )

    # Gematria deltas
    gem_abs = gem_b - gem_a
    gem_pct = (gem_abs / gem_a * 100) if gem_a != 0 else 0.0

    # Entropy deltas
    ent_abs = ent_b - ent_a
    ent_pct = (ent_abs / ent_a * 100) if ent_a != 0 else 0.0

    # Dimension deltas matching by type
    dim_deltas = []
    dims_a_map = {d.measurement_type: d for d in dims_a}
    dims_b_map = {d.measurement_type: d for d in dims_b}

    all_types = set(dims_a_map.keys()) | set(dims_b_map.keys())
    for t in all_types:
        d_a = dims_a_map.get(t)
        d_b = dims_b_map.get(t)

        val_a = d_a.value if d_a else 0.0
        val_b = d_b.value if d_b else 0.0

        d_abs = val_b - val_a
        d_pct = (d_abs / val_a * 100) if val_a != 0 else 0.0

        scaling_factor = None
        scaling_type = "undefined"

        if d_abs != 0:
            scaling_factor = gem_abs / d_abs
            # Determine scaling relationship
            if (gem_abs > 0 and d_abs > 0) or (gem_abs < 0 and d_abs < 0):
                scaling_type = "direct"
            elif (gem_abs > 0 and d_abs < 0) or (gem_abs < 0 and d_abs > 0):
                scaling_type = "inverse"
            else:
                scaling_type = "direct" if gem_abs == 0 else "inverse"

        dim_deltas.append(DimensionDeltaSchema(
            measurement_type=t,
            val_a=val_a,
            val_b=val_b,
            abs_diff=d_abs,
            pct_diff=d_pct,
            scaling_factor=scaling_factor,
            scaling_type=scaling_type
        ))

    return DeltaResponseSchema(
        target_a=target_a_schema,
        target_b=target_b_schema,
        deltas=DeltaMetricsSchema(
            gematria=DeltaValueSchema(abs_diff=gem_abs, pct_diff=gem_pct),
            entropy=DeltaValueSchema(abs_diff=ent_abs, pct_diff=ent_pct),
            dimensions=dim_deltas
        )
    )


