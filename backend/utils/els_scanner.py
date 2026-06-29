import re
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from ingest_db import StrongsLexicon, Verse
from utils.normalization import normalize_hebrew_text, strip_diacritics

# Cache for the unvocalized lexicon to prevent querying the DB on every request
_lexicon_cache = None

async def get_unvocalized_lexicon(db: AsyncSession):
    """
    Query the database for all Hebrew Strong's Lexicon entries, normalize their lemmas
    by stripping vowels/diacritics, and cache the resulting lookup table.
    """
    global _lexicon_cache
    if _lexicon_cache is not None:
        return _lexicon_cache

    print("Loading strongs_lexicon into memory for ELS scanning...")
    # Query all entries starting with H (Hebrew)
    stmt = select(StrongsLexicon).where(StrongsLexicon.strongs_number.like("H%"))
    result = await db.execute(stmt)
    entries = result.scalars().all()

    lexicon_map = {}
    for entry in entries:
        if not entry.lemma:
            continue
            
        # Strip vowels/diacritics
        stripped = strip_diacritics(entry.lemma)
        
        # Retain only standard Hebrew consonants (U+05D0 to U+05EA)
        clean_lemma = "".join(c for c in stripped if 0x05D0 <= ord(c) <= 0x05EA)
        
        # We only match words of length >= 3 for ELS to avoid millions of trivial matches
        if len(clean_lemma) >= 3:
            if clean_lemma not in lexicon_map:
                lexicon_map[clean_lemma] = []
            lexicon_map[clean_lemma].append(entry)
            
    _lexicon_cache = lexicon_map
    print(f"Strongs Lexicon loaded. Found {len(lexicon_map)} unique unvocalized lemmas of length >= 3.")
    return _lexicon_cache

async def scan_els(hebrew_text: str, db: AsyncSession, min_skip: int = -50, max_skip: int = 50, min_len: int = 3, max_len: int = 12) -> tuple[str, list[dict]]:
    """
    Perform an Equidistant Letter Sequence (ELS) scan on the raw Hebrew consonants of the text.
    
    Returns:
        consonants: The raw space-stripped consonant string.
        matches: A list of dictionaries representing the found ELS words, their positions, and skip sizes.
    """
    # 1. Normalize Hebrew text to raw consonants (keep_spaces=False)
    consonants = normalize_hebrew_text(hebrew_text, keep_spaces=False)
    N = len(consonants)
    
    if N < min_len:
        return consonants, []
        
    # 2. Get unvocalized lexicon map
    lexicon_map = await get_unvocalized_lexicon(db)
    
    matches = []
    
    # 3. Scan all skips in range [min_skip, max_skip] excluding 0
    for skip in range(min_skip, max_skip + 1):
        if skip == 0:
            continue
            
        # For a given skip, scan all possible start indices
        for start_idx in range(N):
            # Build list of indices
            indices = []
            curr = start_idx
            while 0 <= curr < N:
                indices.append(curr)
                curr += skip
                
            # If we don't even have enough letters for the minimum length, skip
            if len(indices) < min_len:
                continue
                
            # Build the sequence of characters
            chars = "".join(consonants[idx] for idx in indices)
            
            # Check all prefixes of chars starting from min_len up to max_len
            limit = min(len(chars), max_len)
            for L in range(min_len, limit + 1):
                candidate = chars[:L]
                
                # Check if this sequence matches any Hebrew lemma
                if candidate in lexicon_map:
                    matched_entries = lexicon_map[candidate]
                    
                    matches.append({
                        "word": candidate,
                        "start_index": start_idx,
                        "skip": skip,
                        "indices": indices[:L],
                        "lexicon_entries": [
                            {
                                "strongs_number": entry.strongs_number,
                                "lemma": entry.lemma,
                                "transliteration": entry.transliteration,
                                "gloss": entry.gloss,
                                "definition": entry.definition
                            }
                            for entry in matched_entries
                        ]
                    })
                    
    return consonants, matches
