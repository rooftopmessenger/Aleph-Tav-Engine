from dotenv import load_dotenv
load_dotenv()

import os
import re
import csv
import json
import zipfile
import io
import time
from collections import defaultdict
from datetime import datetime
from sqlalchemy import create_engine, ForeignKey, Integer, String, Text, event, update, DateTime, Boolean, select
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship, sessionmaker
from pgvector.sqlalchemy import Vector
from utils.normalization import normalize_hebrew_text

# ==========================================
# 1. Database Configuration & PRAGMAs
# ==========================================

# Default to local postgresql if not specified
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+asyncpg://postgres:postgres@localhost:5433/aleph_tav_db")

# Convert DATABASE_URL to a sync psycopg URL for the synchronous ingestion engine
sync_url = DATABASE_URL
if sync_url.startswith("postgresql+asyncpg://"):
    sync_url = sync_url.replace("postgresql+asyncpg://", "postgresql+psycopg://")
elif sync_url.startswith("postgresql://"):
    sync_url = sync_url.replace("postgresql://", "postgresql+psycopg://")

# Enable foreign key constraints in SQLite for backward compatibility/testing
if sync_url.startswith("sqlite"):
    @event.listens_for(Engine, "connect")
    def set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

engine = create_engine(sync_url, echo=False)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# ==========================================
# 2. SQLAlchemy 2.0 Declarative Models
# ==========================================

class Base(DeclarativeBase):
    pass

class Book(Base):
    __tablename__ = "books"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True)  # BookNum (1 to 39)
    osis_code: Mapped[str] = mapped_column(String(10), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(50), nullable=False)
    testament: Mapped[str] = mapped_column(String(5), default="OT")
    
    verses: Mapped[list["Verse"]] = relationship(back_populates="book")

class StrongsLexicon(Base):
    __tablename__ = "strongs_lexicon"
    
    strongs_number: Mapped[str] = mapped_column(String(20), primary_key=True)  # Normalized (e.g. H7225)
    lemma: Mapped[str] = mapped_column(String(50), nullable=False)
    transliteration: Mapped[str] = mapped_column(String(50), nullable=True)
    pronunciation: Mapped[str] = mapped_column(String(50), nullable=True)
    part_of_speech: Mapped[str] = mapped_column(String(50), nullable=True)
    gloss: Mapped[str] = mapped_column(String(200), nullable=True)
    definition: Mapped[str] = mapped_column(Text, nullable=True)
    
    words: Mapped[list["Word"]] = relationship(back_populates="lexicon")

class Verse(Base):
    __tablename__ = "verses"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True)  # KJVverseID (1 to 23,145)
    book_id: Mapped[int] = mapped_column(Integer, ForeignKey("books.id"), nullable=False)
    chapter: Mapped[int] = mapped_column(Integer, nullable=False)
    verse: Mapped[int] = mapped_column(Integer, nullable=False)
    osis_id: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)
    hebrew_text: Mapped[str] = mapped_column(Text, nullable=True)
    english_text: Mapped[str] = mapped_column(Text, nullable=False)
    embedding: Mapped[list[float]] = mapped_column(Vector(1024), nullable=True)  # Vector embedding for semantic search
    
    book: Mapped["Book"] = relationship(back_populates="verses")
    words: Mapped[list["Word"]] = relationship(back_populates="verse")
    notes: Mapped[list["SavedNote"]] = relationship(back_populates="verse", cascade="all, delete-orphan")

class Word(Base):
    __tablename__ = "words"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    verse_id: Mapped[int] = mapped_column(Integer, ForeignKey("verses.id"), nullable=False)
    bhs_sort: Mapped[int] = mapped_column(Integer, unique=True, nullable=False)
    word_index: Mapped[int] = mapped_column(Integer, nullable=False)
    hebrew_segment: Mapped[str] = mapped_column(String(100), nullable=False)
    transliteration: Mapped[str] = mapped_column(String(100), nullable=True)
    strongs_number: Mapped[str] = mapped_column(String(20), ForeignKey("strongs_lexicon.strongs_number"), nullable=True)
    morph_code: Mapped[str] = mapped_column(String(50), nullable=True)
    morph_detail: Mapped[str] = mapped_column(Text, nullable=True)
    english_gloss: Mapped[str] = mapped_column(String(200), nullable=True)
    
    verse: Mapped["Verse"] = relationship(back_populates="words")
    lexicon: Mapped["StrongsLexicon"] = relationship(back_populates="words")

class User(Base):
    __tablename__ = "users"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(200), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    
    notes: Mapped[list["SavedNote"]] = relationship(back_populates="user", cascade="all, delete-orphan")

class SavedNote(Base):
    __tablename__ = "saved_notes"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    verse_id: Mapped[int] = mapped_column(Integer, ForeignKey("verses.id", ondelete="CASCADE"), nullable=False)
    note_text: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    is_public: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    x_position: Mapped[int | None] = mapped_column(Integer, nullable=True)
    y_position: Mapped[int | None] = mapped_column(Integer, nullable=True)
    
    user: Mapped["User"] = relationship(back_populates="notes")
    verse: Mapped["Verse"] = relationship(back_populates="notes")

class CryptographicLetter(Base):
    __tablename__ = "cryptographic_letters"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    absolute_index: Mapped[int] = mapped_column(Integer, index=True, nullable=False)
    character: Mapped[str] = mapped_column(String(1), nullable=False)
    book_id: Mapped[int] = mapped_column(Integer, ForeignKey("books.id"), nullable=False)
    chapter: Mapped[int] = mapped_column(Integer, nullable=False)
    verse_num: Mapped[int] = mapped_column(Integer, nullable=False)
    word_index_in_verse: Mapped[int] = mapped_column(Integer, nullable=False)
    letter_index_in_word: Mapped[int] = mapped_column(Integer, nullable=False)
    
    book: Mapped["Book"] = relationship()

# ==========================================
# 3. Helper Functions
# ==========================================

BOOKS_METADATA = {
    1: ("Gen", "Genesis"),
    2: ("Exod", "Exodus"),
    3: ("Lev", "Leviticus"),
    4: ("Num", "Numbers"),
    5: ("Deut", "Deuteronomy"),
    6: ("Josh", "Joshua"),
    7: ("Judg", "Judges"),
    8: ("Ruth", "Ruth"),
    9: ("1Sam", "1 Samuel"),
    10: ("2Sam", "2 Samuel"),
    11: ("1Kgs", "1 Kings"),
    12: ("2Kgs", "2 Kings"),
    13: ("1Chr", "1 Chronicles"),
    14: ("2Chr", "2 Chronicles"),
    15: ("Ezra", "Ezra"),
    16: ("Neh", "Nehemiah"),
    17: ("Esth", "Esther"),
    18: ("Job", "Job"),
    19: ("Ps", "Psalms"),
    20: ("Prov", "Proverbs"),
    21: ("Eccl", "Ecclesiastes"),
    22: ("Song", "Song of Solomon"),
    23: ("Isa", "Isaiah"),
    24: ("Jer", "Jeremiah"),
    25: ("Lam", "Lamentations"),
    26: ("Ezek", "Ezekiel"),
    27: ("Dan", "Daniel"),
    28: ("Hos", "Hosea"),
    29: ("Joel", "Joel"),
    30: ("Amos", "Amos"),
    31: ("Obad", "Obadiah"),
    32: ("Jonah", "Jonah"),
    33: ("Mic", "Micah"),
    34: ("Nah", "Nahum"),
    35: ("Hab", "Habakkuk"),
    36: ("Zeph", "Zephaniah"),
    37: ("Hag", "Haggai"),
    38: ("Zech", "Zechariah"),
    39: ("Mal", "Malachi"),
}

def normalize_strongs(raw_sn: str) -> str:
    """Normalize Strong's number by stripping leading zeros (e.g. H07225 -> H7225, H0001 -> H1)"""
    if not raw_sn:
        return None
    raw_sn = raw_sn.strip()
    if not raw_sn or raw_sn.lower() == "nan" or raw_sn == "－":
        return None
        
    # Match standard patterns like H0001 or H7225 or G0001 with optional suffix letters
    match = re.match(r"^([HG])0*(\d+)([a-zA-Z]*)$", raw_sn)
    if match:
        prefix, number, suffix = match.groups()
        return f"{prefix}{number}{suffix}"
        
    return raw_sn

def extract_raw_bhsa(bhsa_col: str) -> str:
    """Extract contents of all <heb>...</heb> tags to reconstruct spacing-friendly text"""
    parts = re.findall(r"<heb>(.*?)</heb>", bhsa_col)
    return "".join(parts)

def find_data_file(relative_path: str) -> str:
    """Find file in data_sources or _data_sources, relative to backend script directory"""
    paths_to_try = [
        os.path.join("..", "data_sources", relative_path),
        os.path.join("..", "_data_sources", relative_path),
        os.path.join(".", "data_sources", relative_path),
        os.path.join(".", "_data_sources", relative_path),
    ]
    for p in paths_to_try:
        if os.path.exists(p):
            return p
    raise FileNotFoundError(f"Could not locate data file: {relative_path} in tried paths: {paths_to_try}")

# ==========================================
# 4. Ingestion Steps
# ==========================================

def seed_books(session):
    print("\n--- Step 1: Seeding Books Metadata ---")
    start = time.time()
    
    # Check if books are already seeded
    existing_count = session.query(Book).count()
    if existing_count > 0:
        print(f"Books metadata already seeded ({existing_count} records). Skipping.")
        return
        
    for book_id, (osis_code, name) in BOOKS_METADATA.items():
        book = Book(id=book_id, osis_code=osis_code, name=name, testament="OT")
        session.add(book)
        
    session.commit()
    print(f"Seeded {len(BOOKS_METADATA)} books in {time.time() - start:.2f}s.")

def seed_lexicon(session, valid_strongs):
    print("\n--- Step 2: Seeding Strong's Lexicon ---")
    start = time.time()
    
    existing_count = session.query(StrongsLexicon).count()
    if existing_count > 0:
        print(f"Lexicon already seeded. Loading existing keys into memory cache...")
        all_keys = session.query(StrongsLexicon.strongs_number).all()
        for k in all_keys:
            valid_strongs.add(k[0])
        print(f"Loaded {len(valid_strongs)} keys.")
        return

    lexicon_path = find_data_file("stepbible-tbesh.json")
    print(f"Loading lexicon JSON from: {lexicon_path}")
    
    with open(lexicon_path, "r", encoding="utf-8") as f:
        lexicon_data = json.load(f)
        
    count = 0
    for key, entry in lexicon_data.items():
        norm_key = normalize_strongs(key)
        if not norm_key:
            continue
            
        strongs_entry = StrongsLexicon(
            strongs_number=norm_key,
            lemma=entry.get("lemma", ""),
            transliteration=entry.get("transliteration", ""),
            part_of_speech=entry.get("morphology", ""),
            gloss=entry.get("gloss", ""),
            definition=entry.get("definition", "")
        )
        session.add(strongs_entry)
        valid_strongs.add(norm_key)
        count += 1
        
        if count % 1000 == 0:
            session.commit()
            session.expunge_all()
            
    session.commit()
    session.expunge_all()
    print(f"Seeded {count} Strong's lexicon entries in {time.time() - start:.2f}s.")

def seed_verses(session):
    print("\n--- Step 3: Seeding Verses ---")
    start = time.time()
    
    existing_count = session.query(Verse).count()
    if existing_count > 0:
        print(f"Verses already seeded ({existing_count} records). Skipping.")
        return
        
    kjv_mapping_path = find_data_file("OpenHebrewBible-master/008-BHS-mapping-KJV/KJV-OT-mapped-to-BHS.csv")
    print(f"Loading KJV mappings from: {kjv_mapping_path}")
    
    count = 0
    with open(kjv_mapping_path, "r", encoding="utf-8") as f:
        reader = csv.reader(f, delimiter="\t")
        for row in reader:
            if not row or len(row) < 5:
                continue
            kjv_verse_id = int(row[0])
            book_id = int(row[1])
            chapter = int(row[2])
            verse_num = int(row[3])
            raw_text = row[4]
            
            # Clean translation text of Strong's mapping tags
            clean_text = re.sub(r"〈[^〉]+〉", "", raw_text)
            
            # Strip all standard HTML tags (like <sup>, </sup>, <i>, </i>)
            clean_text = re.sub(r"<[^>]+>", "", clean_text)
            
            # Remove any empty parentheses () or ( ) left behind
            clean_text = re.sub(r"\(\s*\)", "", clean_text)
            
            # Clean up double spaces and trailing spaces
            clean_text = re.sub(r"\s+", " ", clean_text).strip()
            
            book_code = BOOKS_METADATA[book_id][0]
            osis_id = f"{book_code}.{chapter}.{verse_num}"
            
            verse = Verse(
                id=kjv_verse_id,
                book_id=book_id,
                chapter=chapter,
                verse=verse_num,
                osis_id=osis_id,
                english_text=clean_text,
                hebrew_text=""
            )
            session.add(verse)
            count += 1
            
            if count % 5000 == 0:
                session.commit()
                session.expunge_all()
                
    session.commit()
    session.expunge_all()
    print(f"Seeded {count} verses in {time.time() - start:.2f}s.")

def seed_cryptographic_letters_from_db(session):
    print("\n--- Step 4b: Seeding Cryptographic Letters from existing database ---")
    start = time.time()
    
    # Check if already seeded
    existing_count = session.query(CryptographicLetter).count()
    if existing_count > 0:
        print(f"Cryptographic letters already seeded ({existing_count} records). Skipping.")
        return
        
    print("Loading verse coordinates for cryptographic mapping...")
    verse_coords = {
        v.id: (v.book_id, v.chapter, v.verse)
        for v in session.query(Verse.id, Verse.book_id, Verse.chapter, Verse.verse).all()
    }
    
    print("Querying all words in order...")
    # Select words sorted by verse_id and bhs_sort to keep canonical order
    stmt = session.execute(
        select(Word.verse_id, Word.word_index, Word.hebrew_segment)
        .order_by(Word.verse_id, Word.bhs_sort)
    )
    
    character_mappings = []
    absolute_index = 0
    
    for verse_id, word_index, hebrew_segment in stmt:
        normalized_word = normalize_hebrew_text(hebrew_segment, keep_spaces=False)
        if not normalized_word:
            continue
            
        coords = verse_coords.get(verse_id)
        if not coords:
            continue
            
        book_id, chapter, verse_num = coords
        
        for char_idx, char in enumerate(normalized_word, start=1):
            mapping = {
                "absolute_index": absolute_index,
                "character": char,
                "book_id": book_id,
                "chapter": chapter,
                "verse_num": verse_num,
                "word_index_in_verse": word_index + 1,  # Convert 0-based word_index to 1-based
                "letter_index_in_word": char_idx,
            }
            character_mappings.append(mapping)
            absolute_index += 1
            
            if len(character_mappings) >= 50000:
                session.bulk_insert_mappings(CryptographicLetter, character_mappings)
                session.commit()
                character_mappings.clear()
                
    if character_mappings:
        session.bulk_insert_mappings(CryptographicLetter, character_mappings)
        session.commit()
        
    print(f"Seeded {absolute_index} cryptographic letters in {time.time() - start:.2f}s.")

def seed_words(session, valid_strongs, verse_hebrew_segments):
    print("\n--- Step 4: Seeding Interlinear Words (Streaming Zip) ---")
    start = time.time()
    
    existing_count = session.query(Word).count()
    if existing_count > 0:
        print(f"Words already seeded ({existing_count} records). Skipping word seeding.")
        # Ensure cryptographic letters are seeded from DB
        seed_cryptographic_letters_from_db(session)
        return

    # Clear existing cryptographic letters from table
    session.query(CryptographicLetter).delete()
    session.commit()

    # Load verse coordinates for cryptographic mapping
    print("Loading verse coordinates for cryptographic mapping...")
    verse_coords = {
        v.id: (v.book_id, v.chapter, v.verse)
        for v in session.query(Verse.id, Verse.book_id, Verse.chapter, Verse.verse).all()
    }

    interlinear_zip_path = find_data_file("OpenHebrewBible-master/007-BHS-8-layer-interlinear/BHSA-8-layer-interlinear.csv.zip")
    print(f"Streaming interlinear TSV from zip: {interlinear_zip_path}")
    
    count = 0
    current_verse_id = None
    current_word_index = 0
    
    character_mappings = []
    absolute_index = 0

    with zipfile.ZipFile(interlinear_zip_path, "r") as z:
        csv_filename = [n for n in z.namelist() if n.endswith(".csv")][0]
        with z.open(csv_filename) as f:
            wrapper = io.TextIOWrapper(f, encoding="utf-8")
            reader = csv.reader(wrapper, delimiter="\t")
            
            # Skip header
            header = next(reader)
            
            for row in reader:
                if not row or len(row) < 11:
                    continue
                
                bhs_sort = int(row[0])
                coord_str = row[1]
                bhsa_raw = row[2]
                translit = row[3]
                extended_sn = row[7]
                morph_code = row[8]
                morph_detail = row[9]
                gloss = row[10]
                
                # Parse coordinate string: 〔KJVverseID｜book｜chapter｜verse〕
                coords = coord_str.replace("〔", "").replace("〕", "").split("｜")
                if len(coords) < 4:
                    continue
                kjv_verse_id = int(coords[0])
                
                # Reset word index when verse changes
                if kjv_verse_id != current_verse_id:
                    current_verse_id = kjv_verse_id
                    current_word_index = 0
                
                # Clean Hebrew word segment
                hebrew_segment = re.sub(r"<[^>]+>", "", bhsa_raw).strip()
                norm_sn = normalize_strongs(extended_sn)
                
                # Accumulate raw spacing-preserving Hebrew segment
                bhsa_text = extract_raw_bhsa(bhsa_raw)
                verse_hebrew_segments[kjv_verse_id].append(bhsa_text)
                
                # Run the word through the normalization pipeline
                normalized_word = normalize_hebrew_text(hebrew_segment, keep_spaces=False)
                if normalized_word:
                    v_coords = verse_coords.get(kjv_verse_id)
                    if v_coords:
                        book_id, chapter, verse_num = v_coords
                        for char_idx, char in enumerate(normalized_word, start=1):
                            mapping = {
                                "absolute_index": absolute_index,
                                "character": char,
                                "book_id": book_id,
                                "chapter": chapter,
                                "verse_num": verse_num,
                                "word_index_in_verse": current_word_index + 1,  # 1-based index
                                "letter_index_in_word": char_idx,
                            }
                            character_mappings.append(mapping)
                            absolute_index += 1
                
                # Safeguard referential integrity for custom Strong's numbers (e.g. H9003)
                if norm_sn and norm_sn not in valid_strongs:
                    placeholder = StrongsLexicon(
                        strongs_number=norm_sn,
                        lemma=hebrew_segment,
                        transliteration="",
                        part_of_speech="Prefix / Morpheme",
                        gloss=gloss,
                        definition=f"Extended Strong's morpheme definition for {norm_sn}"
                    )
                    session.add(placeholder)
                    session.commit()
                    valid_strongs.add(norm_sn)
                
                word = Word(
                    verse_id=kjv_verse_id,
                    bhs_sort=bhs_sort,
                    word_index=current_word_index,
                    hebrew_segment=hebrew_segment,
                    transliteration=translit,
                    strongs_number=norm_sn,
                    morph_code=morph_code,
                    morph_detail=morph_detail,
                    english_gloss=gloss
                )
                session.add(word)
                count += 1
                current_word_index += 1
                
                if count % 20000 == 0:
                    session.commit()
                    session.expunge_all()
                    
                    if character_mappings:
                        session.bulk_insert_mappings(CryptographicLetter, character_mappings)
                        session.commit()
                        character_mappings.clear()
                        
                    print(f"  Processed {count} words...")
                    
    session.commit()
    session.expunge_all()
    
    if character_mappings:
        session.bulk_insert_mappings(CryptographicLetter, character_mappings)
        session.commit()
        
    print(f"Seeded {count} interlinear words and {absolute_index} cryptographic letters in {time.time() - start:.2f}s.")

def reconstruct_hebrew_text(session, verse_hebrew_segments):
    if not verse_hebrew_segments:
        print("\n--- Step 5: Hebrew Text Reconstruction (Skipped - Cache Empty) ---")
        return
        
    print("\n--- Step 5: Reconstructing Hebrew Text in Verses ---")
    start = time.time()
    
    count = 0
    for verse_id, segments in verse_hebrew_segments.items():
        # Join spacing-preserving segments and strip trailing whitespace
        full_text = "".join(segments).strip()
        
        stmt = update(Verse).where(Verse.id == verse_id).values(hebrew_text=full_text)
        session.execute(stmt)
        count += 1
        
        if count % 5000 == 0:
            session.commit()
            print(f"  Updated {count} verses...")
            
    session.commit()
    print(f"Completed Hebrew text reconstruction for {count} verses in {time.time() - start:.2f}s.")

# ==========================================
# 5. Main Execution Orchestration
# ==========================================

def main():
    print(f"Initializing Aleph-Tav Database Seed...")
    print(f"Target Database URL: {DATABASE_URL}")
    
    # Create tables
    from models.cryptography import CryptographicCharacter
    Base.metadata.create_all(engine)
    print("Database tables initialized successfully.")
    
    # Initialize session
    session = SessionLocal()
    
    # In-memory caches for reference mapping
    valid_strongs = set()
    verse_hebrew_segments = defaultdict(list)
    
    total_start = time.time()
    try:
        seed_books(session)
        seed_lexicon(session, valid_strongs)
        seed_verses(session)
        seed_words(session, valid_strongs, verse_hebrew_segments)
        reconstruct_hebrew_text(session, verse_hebrew_segments)
        
        print("\n==========================================")
        print(f"Database ingestion completed successfully!")
        print(f"Total time elapsed: {time.time() - total_start:.2f}s")
        print("==========================================")
        
    except Exception as e:
        session.rollback()
        print(f"\n[FATAL ERROR] Ingestion failed: {e}")
        raise e
    finally:
        session.close()

if __name__ == "__main__":
    main()
