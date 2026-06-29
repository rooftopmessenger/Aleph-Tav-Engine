import os
import json
from typing import Annotated, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy import select
import numpy as np
import faiss
from sentence_transformers import SentenceTransformer

# Import models
from ingest_db import Verse, StrongsLexicon

router = APIRouter(
    prefix="/api/search/semantic",
    tags=["semantic-search"]
)

# Global variables for lazy loading resources
model = None
verse_index = None
verse_metadata = None
lexicon_index = None
lexicon_metadata = None

# Base path for indices
INDICES_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "vector_indices")

def load_semantic_resources():
    global model, verse_index, verse_metadata, lexicon_index, lexicon_metadata
    
    if model is None:
        try:
            model = SentenceTransformer('all-MiniLM-L6-v2')
        except Exception as e:
            raise RuntimeError(f"Failed to load local embedding model 'all-MiniLM-L6-v2': {e}")
            
    if verse_index is None or verse_metadata is None:
        v_idx_path = os.path.join(INDICES_DIR, "verses.index")
        v_meta_path = os.path.join(INDICES_DIR, "verses_ids.json")
        
        if not os.path.exists(v_idx_path) or not os.path.exists(v_meta_path):
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Scripture semantic index has not been generated yet. Please run generate_embeddings.py first."
            )
            
        try:
            verse_index = faiss.read_index(v_idx_path)
            with open(v_meta_path, "r", encoding="utf-8") as f:
                verse_metadata = json.load(f)
        except Exception as e:
            raise RuntimeError(f"Failed to load Scripture FAISS index or metadata: {e}")

    if lexicon_index is None or lexicon_metadata is None:
        l_idx_path = os.path.join(INDICES_DIR, "lexicon.index")
        l_meta_path = os.path.join(INDICES_DIR, "lexicon_ids.json")
        
        if not os.path.exists(l_idx_path) or not os.path.exists(l_meta_path):
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Lexicon semantic index has not been generated yet. Please run generate_embeddings.py first."
            )
            
        try:
            lexicon_index = faiss.read_index(l_idx_path)
            with open(l_meta_path, "r", encoding="utf-8") as f:
                lexicon_metadata = json.load(f)
        except Exception as e:
            raise RuntimeError(f"Failed to load Lexicon FAISS index or metadata: {e}")

# SQLite connection setup for async sessions
DATABASE_URL = "sqlite+aiosqlite:///kjv_strongs.db"

async_engine = create_async_engine(
    DATABASE_URL, 
    echo=False, 
    connect_args={"check_same_thread": False}
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

class VerseResponse(BaseModel):
    id: int
    osis_id: str
    english_text: str
    hebrew_text: Optional[str] = None
    score: float

class LexiconResponse(BaseModel):
    strongs_number: str
    lemma: str
    transliteration: Optional[str] = None
    pronunciation: Optional[str] = None
    part_of_speech: Optional[str] = None
    gloss: Optional[str] = None
    definition: Optional[str] = None
    score: float

class SemanticSearchResponse(BaseModel):
    verses: List[VerseResponse]
    lexicon: List[LexiconResponse]

@router.get("", response_model=SemanticSearchResponse)
async def semantic_search(
    db: DbSession,
    q: str = Query(..., min_length=1, description="Natural language search query")
):
    # 1. Ensure semantic resources are loaded
    try:
        load_semantic_resources()
    except HTTPException as he:
        raise he
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )

    # 2. Vectorize the search query
    try:
        query_vector = model.encode([q]).astype('float32')
        faiss.normalize_L2(query_vector)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to vectorize query: {e}"
        )

    # 3. Search Scripture index
    k = 10
    v_scores, v_indices = verse_index.search(query_vector, k)
    
    v_matches = []
    for score, idx_pos in zip(v_scores[0], v_indices[0]):
        if idx_pos == -1 or idx_pos >= len(verse_metadata):
            continue
        v_meta = verse_metadata[idx_pos]
        v_matches.append({
            "id": v_meta["id"],
            "osis_id": v_meta["osis_id"],
            "score": float(score)
        })

    # 4. Search Lexicon index
    l_scores, l_indices = lexicon_index.search(query_vector, k)
    
    l_matches = []
    for score, idx_pos in zip(l_scores[0], l_indices[0]):
        if idx_pos == -1 or idx_pos >= len(lexicon_metadata):
            continue
        strongs_num = lexicon_metadata[idx_pos]
        l_matches.append({
            "strongs_number": strongs_num,
            "score": float(score)
        })

    # 5. Fetch detail records from database and build response (preserving FAISS sorting)
    v_response = []
    if v_matches:
        v_ids = [item["id"] for item in v_matches]
        stmt = select(Verse).where(Verse.id.in_(v_ids))
        result = await db.execute(stmt)
        db_verses = {v.id: v for v in result.scalars().all()}
        
        for item in v_matches:
            db_v = db_verses.get(item["id"])
            if db_v:
                v_response.append(VerseResponse(
                    id=db_v.id,
                    osis_id=db_v.osis_id,
                    english_text=db_v.english_text,
                    hebrew_text=db_v.hebrew_text,
                    score=item["score"]
                ))

    l_response = []
    if l_matches:
        l_strongs = [item["strongs_number"] for item in l_matches]
        stmt = select(StrongsLexicon).where(StrongsLexicon.strongs_number.in_(l_strongs))
        result = await db.execute(stmt)
        db_lexicons = {l.strongs_number: l for l in result.scalars().all()}
        
        for item in l_matches:
            db_l = db_lexicons.get(item["strongs_number"])
            if db_l:
                l_response.append(LexiconResponse(
                    strongs_number=db_l.strongs_number,
                    lemma=db_l.lemma,
                    transliteration=db_l.transliteration,
                    pronunciation=db_l.pronunciation,
                    part_of_speech=db_l.part_of_speech,
                    gloss=db_l.gloss,
                    definition=db_l.definition,
                    score=item["score"]
                ))

    return SemanticSearchResponse(
        verses=v_response,
        lexicon=l_response
    )
