import os
import unicodedata
from typing import Annotated, List, Dict, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from routers.semantic_search import get_db
from ingest_db import StrongsLexicon

router = APIRouter(
    prefix="/api/temurah",
    tags=["temurah"]
)

class LexiconMatch(BaseModel):
    strongs_number: str
    lemma: str
    transliteration: Optional[str] = None
    gloss: Optional[str] = None
    definition: Optional[str] = None

class TemurahResponse(BaseModel):
    word: str
    normalized: str
    permutation: str
    matches: List[LexiconMatch]

# Cache of perm_key -> list of LexiconMatch dicts
_temurah_cache: Optional[Dict[str, List[Dict]]] = None

def normalize_word(text: str) -> str:
    if not text:
        return ""
    # Decompose unicode to separate vowels/diacritics
    decomposed = unicodedata.normalize('NFD', text)
    cleaned = []
    
    # Mapping of the five final Hebrew letters (Sofit) to standard positional equivalents
    SOFIT_MAP = {
        'ך': 'כ',
        'ם': 'מ',
        'ן': 'נ',
        'ף': 'פ',
        'ץ': 'צ'
    }
    
    for char in decomposed:
        cp = ord(char)
        category = unicodedata.category(char)
        
        # Skip combining diacritic marks (Mn)
        if category == 'Mn':
            continue
            
        # Hebrew character range: U+05D0 to U+05EA
        if 0x05D0 <= cp <= 0x05EA:
            char = SOFIT_MAP.get(char, char)
            cleaned.append(char)
        # Greek character range: Greek and Coptic (U+0370 to U+03FF)
        elif 0x0370 <= cp <= 0x03FF:
            lower_char = char.lower()
            if 0x03B1 <= ord(lower_char) <= 0x03C9 or lower_char == 'ς':
                # Map final sigma 'ς' to standard sigma 'σ'
                if lower_char == 'ς':
                    lower_char = 'σ'
                cleaned.append(lower_char)
                
    return "".join(cleaned)

@router.get("/{word}", response_model=TemurahResponse)
async def get_temurah_permutations(
    word: str,
    db: Annotated[AsyncSession, Depends(get_db)]
):
    global _temurah_cache
    
    # 1. Normalize and sort the input word consonants
    normalized = normalize_word(word)
    if not normalized:
        return TemurahResponse(
            word=word,
            normalized="",
            permutation="",
            matches=[]
        )
        
    perm_key = "".join(sorted(normalized))
    
    # 2. Lazily build the cache if it doesn't exist
    if _temurah_cache is None:
        try:
            stmt = select(StrongsLexicon)
            result = await db.execute(stmt)
            entries = result.scalars().all()
            
            cache = {}
            for entry in entries:
                norm_lemma = normalize_word(entry.lemma)
                if not norm_lemma:
                    continue
                lemma_perm = "".join(sorted(norm_lemma))
                
                match_data = {
                    "strongs_number": entry.strongs_number,
                    "lemma": entry.lemma,
                    "transliteration": entry.transliteration,
                    "gloss": entry.gloss,
                    "definition": entry.definition
                }
                
                if lemma_perm not in cache:
                    cache[lemma_perm] = []
                cache[lemma_perm].append(match_data)
                
            _temurah_cache = cache
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to populate Temurah cache: {e}"
            )
            
    # 3. Retrieve matches from the cache
    raw_matches = _temurah_cache.get(perm_key, [])
    
    # 4. Filter out the target word itself so we only return other words
    filtered_matches = []
    # Strip target word diacritics/accents for comparison
    stripped_target = normalize_word(word)
    
    for rm in raw_matches:
        # Strip diacritics from the lemma to verify it's not the exact same word
        stripped_lemma = normalize_word(rm["lemma"])
        if stripped_lemma != stripped_target:
            filtered_matches.append(LexiconMatch(
                strongs_number=rm["strongs_number"],
                lemma=rm["lemma"],
                transliteration=rm["transliteration"],
                gloss=rm["gloss"],
                definition=rm["definition"]
            ))
            
    return TemurahResponse(
        word=word,
        normalized=normalized,
        permutation=perm_key,
        matches=filtered_matches
    )
