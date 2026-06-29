import os
import sys
import json
from dotenv import load_dotenv
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker, joinedload

# Import models from local codebase
from ingest_db import Word, StrongsLexicon, Verse, Book

def main():
    load_dotenv()
    
    # Ensure stdout handles unicode/Hebrew properly
    if sys.stdout.encoding != 'utf-8':
        try:
            sys.stdout.reconfigure(encoding='utf-8')
        except AttributeError:
            pass
            
    # 1. Get connection string and normalize it
    db_url = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///kjv_strongs.db")
    print(f"Original DATABASE_URL: {db_url}")
    
    # Convert async schema to sync schema for script usage
    sync_url = db_url
    if sync_url.startswith("postgresql+asyncpg://"):
        sync_url = sync_url.replace("postgresql+asyncpg://", "postgresql+psycopg://")
    elif sync_url.startswith("postgresql://"):
        sync_url = sync_url.replace("postgresql://", "postgresql+psycopg://")
    elif sync_url.startswith("sqlite+aiosqlite://"):
        sync_url = sync_url.replace("sqlite+aiosqlite://", "sqlite://")
        
    print(f"Connecting to database: {sync_url}")
    engine = create_engine(sync_url, echo=False)
    Session = sessionmaker(bind=engine)
    session = Session()

    # Targets to search
    target_values = [279, 17, 16]
    
    # Query all verses in 1 Kings 7 and 2 Chronicles 3
    # Eagerly load words and their strongs lexicon details
    stmt = (
        select(Verse)
        .where(
            (Verse.osis_id.like("1Kgs.7.%")) |
            (Verse.osis_id.like("2Chr.3.%"))
        )
        .options(joinedload(Verse.words).joinedload(Word.lexicon))
    )
    
    verses = session.execute(stmt).unique().scalars().all()
    print(f"Loaded {len(verses)} verses from database.")

    matches = []

    for verse in verses:
        # Sort words in canonical order by word_index
        words = sorted(verse.words, key=lambda w: w.word_index)
        
        # 1-word scan
        for w in words:
            gem = w.gematria_absolute
            if gem in target_values:
                lexicon_gloss = w.lexicon.gloss if w.lexicon else None
                lexicon_lemma = w.lexicon.lemma if w.lexicon else None
                lexicon_trans = w.lexicon.transliteration if w.lexicon else None
                matches.append({
                    "target_value": int(gem),
                    "match_type": "single",
                    "osis_id": verse.osis_id,
                    "english_text": verse.english_text,
                    "words": [{
                        "word_index": w.word_index,
                        "hebrew": w.hebrew_segment,
                        "strongs": w.strongs_number,
                        "english_gloss": w.english_gloss,
                        "lexicon_gloss": lexicon_gloss,
                        "lemma": lexicon_lemma,
                        "transliteration": lexicon_trans,
                        "gematria": int(gem)
                    }]
                })
        
        # 2-word combinations
        for i in range(len(words) - 1):
            w1 = words[i]
            w2 = words[i+1]
            gem1 = w1.gematria_absolute
            gem2 = w2.gematria_absolute
            
            if gem1 is not None and gem2 is not None:
                total_gem = gem1 + gem2
                if total_gem in target_values:
                    lexicon_gloss_1 = w1.lexicon.gloss if w1.lexicon else None
                    lexicon_gloss_2 = w2.lexicon.gloss if w2.lexicon else None
                    matches.append({
                        "target_value": int(total_gem),
                        "match_type": "double",
                        "osis_id": verse.osis_id,
                        "english_text": verse.english_text,
                        "words": [
                            {
                                "word_index": w1.word_index,
                                "hebrew": w1.hebrew_segment,
                                "strongs": w1.strongs_number,
                                "english_gloss": w1.english_gloss,
                                "lexicon_gloss": lexicon_gloss_1,
                                "lemma": w1.lexicon.lemma if w1.lexicon else None,
                                "transliteration": w1.lexicon.transliteration if w1.lexicon else None,
                                "gematria": int(gem1)
                            },
                            {
                                "word_index": w2.word_index,
                                "hebrew": w2.hebrew_segment,
                                "strongs": w2.strongs_number,
                                "english_gloss": w2.english_gloss,
                                "lexicon_gloss": lexicon_gloss_2,
                                "lemma": w2.lexicon.lemma if w2.lexicon else None,
                                "transliteration": w2.lexicon.transliteration if w2.lexicon else None,
                                "gematria": int(gem2)
                            }
                        ]
                    })
                    
    # Log matches to console
    print(f"\nFound {len(matches)} matches matching targets [279, 17, 16] in 1Kgs 7 and 2Chr 3:")
    for m in matches:
        t_val = m["target_value"]
        m_type = m["match_type"]
        osis = m["osis_id"]
        
        if m_type == "single":
            w = m["words"][0]
            print(f"[{osis}] Target {t_val} (Single): {w['hebrew']} ({w['strongs']}) -> gloss: '{w['english_gloss'] or w['lexicon_gloss']}' (gem: {w['gematria']})")
        else:
            w1, w2 = m["words"][0], m["words"][1]
            print(f"[{osis}] Target {t_val} (Double): {w1['hebrew']} + {w2['hebrew']} ({w1['strongs']} + {w2['strongs']}) -> gloss: '{w1['english_gloss'] or w1['lexicon_gloss']}' + '{w2['english_gloss'] or w2['lexicon_gloss']}' (gem: {w1['gematria']} + {w2['gematria']} = {t_val})")
            
    # Save output to JSON file
    out_path = os.path.join(os.path.dirname(__file__), "delta_lexicon_matches.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(matches, f, ensure_ascii=False, indent=2)
    print(f"\nSaved matches to {out_path}")

    session.close()

if __name__ == "__main__":
    main()
