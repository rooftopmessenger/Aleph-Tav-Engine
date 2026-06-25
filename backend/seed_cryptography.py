import os
import time
import logging
from sqlalchemy import select, delete
from ingest_db import SessionLocal, Book, Verse, Base, engine
from models.cryptography import CryptographicCharacter
from utils.normalization import normalize_hebrew_text

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

BATCH_SIZE = 50000

def seed_cryptographic_array():
    logger.info("Ensuring database tables are initialized...")
    Base.metadata.create_all(engine)
    logger.info("Starting topographical cryptographic indexing...")
    session = SessionLocal()
    start_time = time.time()
    
    try:
        # 1. Clear existing topographical data
        logger.info("Clearing existing cryptographic characters from table...")
        session.execute(delete(CryptographicCharacter))
        session.commit()
        
        # 2. Fetch all OT Books and their verses in canonical order
        logger.info("Fetching OT verses in canonical order...")
        # OT books have ID 1 to 39
        verses = (
            session.query(Verse)
            .join(Book)
            .filter(Book.testament == "OT")
            .order_by(Verse.book_id, Verse.chapter, Verse.verse)
            .all()
        )
        logger.info(f"Loaded {len(verses)} verses to process.")
        
        # 3. Process verses and build character mappings
        character_mappings = []
        absolute_index = 0
        verse_count = 0
        
        for verse in verses:
            if not verse.hebrew_text:
                continue
                
            # Normalize hebrew text, keeping spaces to split words
            normalized = normalize_hebrew_text(verse.hebrew_text, keep_spaces=True)
            if not normalized:
                continue
                
            # Split into individual words
            words = normalized.split(" ")
            
            for w_idx, word in enumerate(words, start=1):
                for l_idx, letter in enumerate(word, start=1):
                    # Prepare dictionary for bulk insert mapping
                    mapping = {
                        "absolute_index": absolute_index,
                        "char": letter,
                        "book_id": verse.book_id,
                        "chapter": verse.chapter,
                        "verse_num": verse.verse,
                        "verse_id": verse.id,
                        "word_index": w_idx,
                        "letter_index": l_idx,
                    }
                    character_mappings.append(mapping)
                    absolute_index += 1
            
            verse_count += 1
            
            # Flush batch to database to manage memory
            if len(character_mappings) >= BATCH_SIZE:
                logger.info(f"Writing batch of {len(character_mappings)} characters (processed {verse_count} verses, current index: {absolute_index})...")
                session.bulk_insert_mappings(CryptographicCharacter, character_mappings)
                session.commit()
                character_mappings.clear()
                
        # Insert any remaining records
        if character_mappings:
            logger.info(f"Writing final batch of {len(character_mappings)} characters...")
            session.bulk_insert_mappings(CryptographicCharacter, character_mappings)
            session.commit()
            
        elapsed = time.time() - start_time
        logger.info("==========================================")
        logger.info("Cryptographic topographical seeding complete!")
        logger.info(f"Total consonants indexed: {absolute_index}")
        logger.info(f"Total verses processed: {verse_count}")
        logger.info(f"Time elapsed: {elapsed:.2f}s")
        logger.info("==========================================")
        
    except Exception as e:
        session.rollback()
        logger.error(f"Error during cryptographic seeding: {e}")
        raise e
    finally:
        session.close()

if __name__ == "__main__":
    seed_cryptographic_array()
