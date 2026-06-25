from dotenv import load_dotenv
load_dotenv()

import os
import re
import xml.etree.ElementTree as ET
import json
import asyncio
import unicodedata
from collections import defaultdict
from typing import List, Dict, Tuple
import httpx
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy import select

# Import models from the existing database definition script
from ingest_db import Base, Book, StrongsLexicon, Verse, Word

# ==========================================
# 1. Database Configuration
# ==========================================
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+asyncpg://postgres:postgres@localhost:5433/aleph_tav_db")
engine = create_async_engine(DATABASE_URL, echo=False)
AsyncSessionLocal = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)

# ==========================================
# 2. Metadata and Mappings
# ==========================================
NT_BOOKS = {
    40: ("Matt", "Matthew"),
    41: ("Mark", "Mark"),
    42: ("Luke", "Luke"),
    43: ("John", "John"),
    44: ("Acts", "Acts"),
    45: ("Rom", "Romans"),
    46: ("1Cor", "1 Corinthians"),
    47: ("2Cor", "2 Corinthians"),
    48: ("Gal", "Galatians"),
    49: ("Eph", "Ephesians"),
    50: ("Phil", "Philippians"),
    51: ("Col", "Colossians"),
    52: ("1Thess", "1 Thessalonians"),
    53: ("2Thess", "2 Thessalonians"),
    54: ("1Tim", "1 Timothy"),
    55: ("2Tim", "2 Timothy"),
    56: ("Titus", "Titus"),
    57: ("Phlm", "Philemon"),
    58: ("Heb", "Hebrews"),
    59: ("Jas", "James"),
    60: ("1Pet", "1 Peter"),
    61: ("2Pet", "2 Peter"),
    62: ("1John", "1 John"),
    63: ("2John", "2 John"),
    64: ("3John", "3 John"),
    65: ("Jude", "Jude"),
    66: ("Rev", "Revelation"),
}

MAP_BOOK_GNT_TO_OSIS = {
    "MAT": "Matt", "MRK": "Mark", "LUK": "Luke", "JHN": "John",
    "ACT": "Acts", "ROM": "Rom", "1CO": "1Cor", "2CO": "2Cor",
    "GAL": "Gal", "EPH": "Eph", "PHP": "Phil", "COL": "Col",
    "1TH": "1Thess", "2TH": "2Thess", "1TI": "1Tim", "2TI": "2Tim",
    "TIT": "Titus", "PHM": "Phlm", "HEB": "Heb", "JAS": "Jas",
    "1PE": "1Pet", "2PE": "2Pet", "1JN": "1John", "2JN": "2John",
    "3JN": "3John", "JUD": "Jude", "REV": "Rev"
}

# ==========================================
# 3. Helper Functions
# ==========================================
def normalize_greek_strongs(raw_sn: str) -> str:
    """Normalize Strong's number by stripping leading zeros and prefixing with G (e.g. 976 -> G976, G0001 -> G1)"""
    if not raw_sn:
        return None
    raw_sn = raw_sn.strip()
    if not raw_sn or raw_sn.lower() == "nan" or raw_sn == "－":
        return None
    
    # Handle composite Strong's numbers (take first part)
    first_part = re.split(r'[\s,;]+', raw_sn)[0].strip()
    
    # Remove 'strong:' prefix if present
    if first_part.lower().startswith('strong:'):
        first_part = first_part[7:]
        
    # If it doesn't start with H or G, prefix with G
    if not first_part.upper().startswith(('H', 'G')):
        first_part = 'G' + first_part
        
    # Strip leading zeros
    match = re.match(r"^([HG])0*(\d+)([a-zA-Z]*)$", first_part, re.IGNORECASE)
    if match:
        prefix, number, suffix = match.groups()
        return f"{prefix.upper()}{number}{suffix}"
        
    return first_part.upper()

def transliterate_greek(text: str) -> str:
    """Simple Koine Greek character transliteration to Latin characters"""
    g2l = {
        'α': 'a', 'β': 'b', 'γ': 'g', 'δ': 'd', 'ε': 'e', 'ζ': 'z', 'η': 'e', 'θ': 'th',
        'ι': 'i', 'κ': 'k', 'λ': 'l', 'μ': 'm', 'ν': 'n', 'ξ': 'x', 'ο': 'o', 'π': 'p',
        'ρ': 'r', 'σ': 's', 'ς': 's', 'τ': 't', 'υ': 'y', 'φ': 'ph', 'χ': 'ch', 'ψ': 'ps',
        'ω': 'o',
        'Α': 'A', 'Β': 'B', 'Γ': 'G', 'Δ': 'D', 'Ε': 'E', 'Ζ': 'Z', 'Η': 'E', 'Θ': 'Th',
        'Ι': 'I', 'Κ': 'K', 'Λ': 'L', 'Μ': 'M', 'Ν': 'N', 'Ξ': 'X', 'Ο': 'O', 'Π': 'P',
        'Ρ': 'R', 'Σ': 'S', 'Τ': 'T', 'Υ': 'Y', 'Φ': 'Ph', 'Χ': 'Ch', 'Ψ': 'Ps', 'Ω': 'O'
    }
    normalized = unicodedata.normalize('NFD', text)
    result = []
    for char in normalized:
        if char in g2l:
            result.append(g2l[char])
        elif unicodedata.category(char).startswith('M'):
            # Skip diacritic markers
            continue
        else:
            result.append(char)
    return "".join(result)

def format_morph_detail(row: Dict[str, str]) -> str:
    """Concatenate detailed morphological tags into a single readable string"""
    details = []
    for key in ['person', 'number', 'gender', 'case', 'tense', 'voice', 'mood', 'degree']:
        val = row.get(key)
        if val:
            details.append(f"{key}: {val}")
    return ", ".join(details)

def find_data_file(relative_path: str) -> str:
    paths_to_try = [
        os.path.join("data_sources", relative_path),
        os.path.join("..", "data_sources", relative_path),
        os.path.join(".", relative_path),
    ]
    for p in paths_to_try:
        if os.path.exists(p):
            return p
    raise FileNotFoundError(f"Could not locate data file: {relative_path} in tried paths: {paths_to_try}")

# ==========================================
# 4. Ingestion Stages
# ==========================================
async def seed_books(session: AsyncSession):
    print("\n--- Step 1: Seeding New Testament Books Metadata ---")
    
    # Retrieve existing books to prevent duplicate insertions
    result = await session.execute(select(Book.id))
    existing_ids = set(result.scalars().all())
    
    count = 0
    for book_id, (osis_code, name) in NT_BOOKS.items():
        if book_id not in existing_ids:
            book = Book(id=book_id, osis_code=osis_code, name=name, testament="NT")
            session.add(book)
            count += 1
            
    if count > 0:
        await session.commit()
        print(f"Seeded {count} New Testament books.")
    else:
        print("New Testament books already seeded. Skipping.")

async def seed_greek_lexicon(session: AsyncSession, valid_strongs: set):
    print("\n--- Step 2: Seeding Greek Strong's Lexicon ---")
    
    # Cache existing Strong's keys to avoid duplicates
    result = await session.execute(select(StrongsLexicon.strongs_number))
    for key in result.scalars().all():
        valid_strongs.add(key)
        
    lexicon_path = find_data_file("stepbible-tbesg.json")
    print(f"Loading Greek lexicon from: {lexicon_path}")
    
    with open(lexicon_path, "r", encoding="utf-8") as f:
        lexicon_data = json.load(f)
        
    count = 0
    for key, entry in lexicon_data.items():
        norm_key = normalize_greek_strongs(key)
        if not norm_key or norm_key in valid_strongs:
            continue
            
        strongs_entry = StrongsLexicon(
            strongs_number=norm_key[:20] if norm_key else None,
            lemma=(entry.get("lemma") or "")[:50],
            transliteration=(entry.get("transliteration") or "")[:50],
            part_of_speech=(entry.get("morphology") or "")[:50],
            gloss=(entry.get("gloss") or "")[:200],
            definition=entry.get("definition", "")
        )
        session.add(strongs_entry)
        valid_strongs.add(norm_key)
        count += 1
        
        if count % 1000 == 0:
            await session.commit()
            
    await session.commit()
    print(f"Seeded {count} Greek Strong's lexicon entries.")

def extract_kjv_nt_verses() -> Tuple[Dict[str, int], Dict[str, str]]:
    print("\n--- Step 3: Extracting clean KJV NT Verses from XML ---")
    xml_path = find_data_file(os.path.join("kjvxml", "kjvfull.xml"))
    print(f"Parsing OSIS XML from: {xml_path}")
    
    ns = {'o': 'http://www.bibletechnologies.net/2003/OSIS/namespace'}
    tree = ET.parse(xml_path)
    root = tree.getroot()
    
    osis_to_id = {}
    osis_to_text = {}
    
    state = {
        'current_verse': None,
        'verse_counter': 23146,
        'current_words': []
    }
    
    def walk(element):
        tag = element.tag.split('}')[-1]
        
        if tag in ('note', 'title'):
            return
            
        if tag == 'verse':
            if 'sID' in element.attrib:
                state['current_verse'] = element.attrib['sID']
                state['current_words'] = []
            elif 'eID' in element.attrib:
                if state['current_verse']:
                    raw_txt = "".join(state['current_words'])
                    clean_txt = re.sub(r"\s+", " ", raw_txt).strip()
                    clean_txt = re.sub(r"\(\s*\)", "", clean_txt).strip()
                    osis_to_id[state['current_verse']] = state['verse_counter']
                    osis_to_text[state['current_verse']] = clean_txt
                    state['verse_counter'] += 1
                state['current_verse'] = None
                
        if state['current_verse'] and tag != 'verse':
            if element.text:
                state['current_words'].append(element.text)
                
        for child in element:
            walk(child)
            
        if state['current_verse'] and tag != 'verse':
            if element.tail:
                state['current_words'].append(element.tail)

    for book_id, (osis_book, _) in NT_BOOKS.items():
        book_elem = root.find(f".//o:div[@osisID='{osis_book}']", ns)
        if book_elem is not None:
            for chapter in book_elem.findall('.//o:chapter', ns):
                walk(chapter)
                        
    print(f"Successfully extracted {len(osis_to_text)} KJV New Testament verses.")
    return osis_to_id, osis_to_text

async def download_gnt_tsv() -> str:
    print("\n--- Step 4: Downloading SBLGNT TSV Interlinear Dataset ---")
    url = "https://raw.githubusercontent.com/Clear-Bible/macula-greek/main/SBLGNT/tsv/macula-greek-SBLGNT.tsv"
    print(f"Downloading from: {url}")
    
    async with httpx.AsyncClient(timeout=120.0) as client:
        response = await client.get(url)
        response.raise_for_status()
        return response.text

async def seed_nt_verses_and_words(session: AsyncSession, tsv_content: str, osis_to_id: Dict[str, int], osis_to_text: Dict[str, str], valid_strongs: set):
    print("\n--- Step 5: Seeding Verses and Interlinear Words ---")
    
    # Get last OT sort index to continue sequentially
    result = await session.execute(select(Word.bhs_sort).order_by(Word.bhs_sort.desc()).limit(1))
    last_sort = result.scalar_one_or_none()
    next_sort_index = (last_sort + 1) if last_sort is not None else 426582
    print(f"Starting unique NT word sort index at: {next_sort_index}")
    
    # Check already seeded NT verses to prevent duplication
    result = await session.execute(select(Verse.osis_id))
    existing_verses = set(result.scalars().all())
    
    # Group TSV rows by OSIS ID
    gnt_words_by_verse = defaultdict(list)
    
    lines = tsv_content.split('\n')
    header = lines[0].split('\t')
    
    for line in lines[1:]:
        if not line:
            continue
        row = dict(zip(header, line.split('\t')))
        ref_val = row.get('ref')
        if not ref_val:
            continue
            
        # Parse MAT 1:1!1 coordinate
        book_code, rest = ref_val.split(' ')
        ref_coords, _ = rest.split('!')
        chapter_str, verse_str = ref_coords.split(':')
        
        osis_book = MAP_BOOK_GNT_TO_OSIS.get(book_code)
        if not osis_book:
            continue
            
        osis_id = f"{osis_book}.{chapter_str}.{verse_str}"
        gnt_words_by_verse[osis_id].append(row)
        
    print(f"Grouped GNT TSV into {len(gnt_words_by_verse)} verses.")
    
    verse_count = 0
    word_count = 0
    inserted_osis_ids = set()
    
    for osis_id, tsv_rows in gnt_words_by_verse.items():
        if osis_id in existing_verses:
            continue
            
        verse_id = osis_to_id.get(osis_id)
        if not verse_id:
            # Skip if not found in KJV map
            continue
            
        # 1. Reconstruct Spacing-Preserved Greek Verse Text
        greek_parts = []
        for r in tsv_rows:
            greek_parts.append(r.get('text', '') + r.get('after', ''))
        greek_text = "".join(greek_parts).strip()
        
        # 2. Get clean KJV English text
        english_text = osis_to_text.get(osis_id, "")
        
        # Parse book number from Book model
        book_code = osis_id.split('.')[0]
        # Reverse lookup book_id
        book_id = None
        for b_id, (code, _) in NT_BOOKS.items():
            if code == book_code:
                book_id = b_id
                break
                
        if not book_id:
            continue
            
        # Create Verse
        chapter_num = int(osis_id.split('.')[1])
        verse_num = int(osis_id.split('.')[2])
        
        verse = Verse(
            id=verse_id,
            book_id=book_id,
            chapter=chapter_num,
            verse=verse_num,
            osis_id=osis_id,
            hebrew_text=greek_text,  # Storing Greek text in hebrew_text
            english_text=english_text
        )
        session.add(verse)
        inserted_osis_ids.add(osis_id)
        verse_count += 1
        
        # 3. Create Word segments
        for index, r in enumerate(tsv_rows):
            greek_seg = r.get('text', '')
            translit = transliterate_greek(greek_seg)
            norm_sn = normalize_greek_strongs(r.get('strong', ''))
            morph_code = r.get('morph', '')
            morph_detail = format_morph_detail(r)
            gloss = r.get('gloss', '')
            
            # Ensure lexicon referential integrity (add placeholder if Strong's not in lexicon)
            if norm_sn and norm_sn not in valid_strongs:
                placeholder = StrongsLexicon(
                    strongs_number=norm_sn,
                    lemma=greek_seg,
                    transliteration=translit,
                    part_of_speech="Prefix / Morpheme",
                    gloss=gloss,
                    definition=f"Extended Strong's morpheme definition for {norm_sn}"
                )
                session.add(placeholder)
                valid_strongs.add(norm_sn)
                await session.flush()
                
            word = Word(
                verse_id=verse_id,
                bhs_sort=next_sort_index,
                word_index=index,
                hebrew_segment=greek_seg,  # Storing Greek segment in hebrew_segment
                transliteration=translit,
                strongs_number=norm_sn,
                morph_code=morph_code,
                morph_detail=morph_detail,
                english_gloss=gloss
            )
            session.add(word)
            next_sort_index += 1
            word_count += 1
            
        if verse_count % 500 == 0:
            await session.commit()
            print(f"  Processed {verse_count} verses, {word_count} word segments...")
            
    # Handle critical-text omitted verses (verses in KJV but omitted in GNT)
    omitted_count = 0
    for osis_id, verse_id in osis_to_id.items():
        if osis_id not in existing_verses and osis_id not in inserted_osis_ids:
            book_code = osis_id.split('.')[0]
            book_id = None
            for b_id, (code, _) in NT_BOOKS.items():
                if code == book_code:
                    book_id = b_id
                    break
            if not book_id:
                continue
                
            chapter_num = int(osis_id.split('.')[1])
            verse_num = int(osis_id.split('.')[2])
            english_text = osis_to_text.get(osis_id, "")
            
            verse = Verse(
                id=verse_id,
                book_id=book_id,
                chapter=chapter_num,
                verse=verse_num,
                osis_id=osis_id,
                hebrew_text="",  # Empty Greek text for omitted verse
                english_text=english_text
            )
            session.add(verse)
            verse_count += 1
            omitted_count += 1
            
    await session.commit()
    print(f"Seeded {verse_count} NT verses (including {omitted_count} critical-text omitted KJV placeholders) and {word_count} interlinear words.")

# ==========================================
# 5. Main Orchestration
# ==========================================
async def main():
    print("==========================================")
    print("Aleph-Tav New Testament Data Ingestor")
    print(f"Database URL: {DATABASE_URL}")
    print("==========================================")
    
    async with AsyncSessionLocal() as session:
        valid_strongs = set()
        
        # Stage 1: Seed books
        await seed_books(session)
        
        # Stage 2: Seed lexicon
        await seed_greek_lexicon(session, valid_strongs)
        
        # Stage 3: Parse KJV XML
        osis_to_id, osis_to_text = extract_kjv_nt_verses()
        
        # Stage 4: Download GNT TSV
        tsv_content = await download_gnt_tsv()
        
        # Stage 5: Ingest verses and words
        await seed_nt_verses_and_words(session, tsv_content, osis_to_id, osis_to_text, valid_strongs)
        
        print("\n==========================================")
        print("New Testament Ingestion completed successfully!")
        print("==========================================")

if __name__ == "__main__":
    asyncio.run(main())
