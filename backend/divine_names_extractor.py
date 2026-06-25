"""
Divine Names Extractor — Standalone Research Script
=====================================================
Queries the Aleph-Tav PostgreSQL database to extract every verse
containing Hebrew/Greek words translated as "God", "Lord", "Almighty", etc.

Groups results by Strong's number so each divine name/title gets its own
section for external theological analysis (divine speech vs. prophetic voice).

Usage:
    uv run python divine_names_extractor.py

Output:
    divine_names_report.md  (written to the same directory)
"""

import sys
import io

# Force stdout to UTF-8 so Hebrew/Greek/macron characters don't crash on Windows cp1252
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

from dotenv import load_dotenv
load_dotenv()

import os
import time
from datetime import datetime
from collections import OrderedDict
from sqlalchemy import create_engine, select, text
from sqlalchemy.orm import sessionmaker

# ==========================================
# 1. Database Connection (reuses .env)
# ==========================================

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+asyncpg://postgres:postgres@localhost:5433/aleph_tav_db")

# Convert to sync psycopg driver
sync_url = DATABASE_URL
if sync_url.startswith("postgresql+asyncpg://"):
    sync_url = sync_url.replace("postgresql+asyncpg://", "postgresql+psycopg://")
elif sync_url.startswith("postgresql://"):
    sync_url = sync_url.replace("postgresql://", "postgresql+psycopg://")

engine = create_engine(sync_url, echo=False)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# ==========================================
# 2. Divine Name Categories
# ==========================================
# Each entry: Strong's Number -> (Transliteration, English Translation, Description)

HEBREW_DIVINE_NAMES = OrderedDict({
    # --- Primary Names of God ---
    "H3068": ("YHWH / Yahweh", "LORD", "The Tetragrammaton — the covenant name of God, rendered as LORD (all caps) in most English translations."),
    "H3050": ("Yah", "LORD / JAH", "Shortened poetic form of YHWH, used in Hallelu-Yah and in poetic/prophetic contexts."),
    "H430":  ("Elohim", "God", "Plural of majesty — the most common generic word for God. Also used for judges, angels, and false gods contextually."),
    "H433":  ("Eloah", "God", "Singular form of Elohim — used primarily in Job and late poetic texts."),
    "H410":  ("El", "God / Mighty One", "The root/primitive word for God — emphasizes power and might. Used in compound names (El Shaddai, El Elyon)."),
    "H136":  ("Adonai", "Lord", "Emphatic plural of Adon — used exclusively for God in reverent address. Rendered 'Lord' (capital L, lowercase ord)."),
    "H113":  ("Adon", "lord / master", "Singular 'lord/master' — used for both God and human lords/masters. Context determines referent."),
    
    # --- Compound Titles & Attributes ---
    "H7706": ("Shaddai", "Almighty", "Often paired with El as 'El Shaddai' (God Almighty). Dominant in patriarchal narratives and Job."),
    "H5945": ("Elyon", "Most High", "Superlative title — 'God Most High'. Used in Melchizedek narrative, Psalms, Daniel."),
    "H6635": ("Tseva'ot / Sabaoth", "Hosts / Armies", "Used in 'YHWH Tseva'ot' (LORD of Hosts) — emphasizes God's sovereignty over heavenly/earthly armies."),
    "H6944": ("Qadosh", "Holy / Holy One", "Used as a divine title: 'The Holy One of Israel' (especially in Isaiah)."),
    "H5769": ("Olam", "Everlasting / Eternal", "Used in 'El Olam' (The Everlasting God) — Genesis 21:33."),
    
    # --- Aramaic (Daniel / Ezra) ---
    "H426":  ("Elah", "God (Aramaic)", "Aramaic equivalent of Eloah — used extensively in Daniel and Ezra for God."),
    "H4756": ("Mare", "Lord (Aramaic)", "Aramaic for 'Lord/Master' — used in Daniel ('Lord of heaven')."),
})

GREEK_DIVINE_NAMES = OrderedDict({
    # --- Primary NT Names ---
    "G2316": ("Theos", "God", "Standard Greek word for God — used throughout NT for the Father, and in OT quotations."),
    "G2962": ("Kyrios", "Lord", "Greek for 'Lord/Master' — applied to both God the Father and to Jesus. Equivalent of YHWH in LXX quotations."),
    "G1203": ("Despotēs", "Master / Sovereign Lord", "Emphasizes absolute ownership and authority — used for God in Luke 2:29, Acts 4:24, Rev 6:10."),
    "G3841": ("Pantokratōr", "Almighty / All-Powerful", "Greek equivalent of Shaddai/Tseva'ot — used almost exclusively in Revelation."),
    "G5310": ("Hypsistos", "Most High", "Greek equivalent of Elyon — 'the Most High God'. Used in Luke, Acts, Hebrews."),
})

# ==========================================
# 3. SQL Query
# ==========================================

QUERY = text("""
    SELECT 
        w.strongs_number,
        sl.lemma,
        sl.transliteration,
        sl.gloss,
        sl.part_of_speech,
        v.osis_id,
        b.name AS book_name,
        v.chapter,
        v.verse AS verse_num,
        v.english_text,
        v.hebrew_text,
        w.hebrew_segment,
        w.english_gloss AS word_gloss,
        w.morph_code,
        w.morph_detail
    FROM words w
    JOIN verses v ON w.verse_id = v.id
    JOIN books b ON v.book_id = b.id
    LEFT JOIN strongs_lexicon sl ON w.strongs_number = sl.strongs_number
    WHERE w.strongs_number = :sn
    ORDER BY b.id, v.chapter, v.verse, w.word_index
""")

# ==========================================
# 4. Main Extraction Logic
# ==========================================

def extract_divine_names():
    print("=" * 60)
    print("  Divine Names Extractor — Aleph-Tav Research Tool")
    print("=" * 60)
    print(f"  Database: {sync_url.split('@')[1] if '@' in sync_url else sync_url}")
    print(f"  Started:  {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 60)
    
    session = SessionLocal()
    total_start = time.time()
    
    output_path = os.path.join(os.path.dirname(__file__), "divine_names_report.md")
    
    all_categories = OrderedDict()
    all_categories.update(HEBREW_DIVINE_NAMES)
    all_categories.update(GREEK_DIVINE_NAMES)
    
    grand_total = 0
    category_counts = {}
    category_results = {}
    
    try:
        # --- Pass 1: Query all categories ---
        for sn, (translit, eng, desc) in all_categories.items():
            print(f"\n  Querying {sn} ({translit} — \"{eng}\")...")
            
            rows = session.execute(QUERY, {"sn": sn}).fetchall()
            
            # Deduplicate by verse (a word may appear multiple times in a verse)
            seen_verses = {}
            for row in rows:
                osis_id = row.osis_id
                if osis_id not in seen_verses:
                    seen_verses[osis_id] = row
                else:
                    # Keep the row but note multiple occurrences
                    pass
            
            unique_verses = list(seen_verses.values())
            count = len(unique_verses)
            category_counts[sn] = count
            category_results[sn] = unique_verses
            grand_total += count
            
            print(f"    -> {count} unique verses found.")
        
        # --- Pass 2: Write Markdown report ---
        print(f"\n{'=' * 60}")
        print(f"  Writing report: {output_path}")
        print(f"  Total unique verse occurrences: {grand_total}")
        print(f"{'=' * 60}")
        
        with open(output_path, "w", encoding="utf-8") as f:
            # --- YAML Frontmatter ---
            f.write("---\n")
            f.write("title: \"Divine Names & Titles — Complete Verse Extraction\"\n")
            f.write(f"date: \"{datetime.now().strftime('%Y-%m-%d')}\"\n")
            f.write("source: \"Aleph-Tav Engine Database (BHS / Nestle-Aland)\"\n")
            f.write(f"total_verses: {grand_total}\n")
            f.write(f"categories: {len([c for c in category_counts.values() if c > 0])}\n")
            f.write("purpose: \"Isolate every biblical verse by the specific Hebrew/Greek word used for God/Lord to analyze divine speech patterns vs. prophetic/narrative voice.\"\n")
            f.write("---\n\n")
            
            # --- Table of Contents ---
            f.write("# Divine Names & Titles — Complete Verse Extraction\n\n")
            f.write("> **Purpose:** This report extracts every verse from the Aleph-Tav database grouped by the specific\n")
            f.write("> Strong's Hebrew or Greek number used for God, Lord, Almighty, etc. This allows you to compare\n")
            f.write("> when the text uses YHWH vs. Elohim vs. Adonai, and to analyze whether the verse contains\n")
            f.write("> **direct divine speech** (God speaking in first person) vs. **prophetic/narrative voice**\n")
            f.write("> (a prophet or narrator speaking *about* God).\n\n")
            
            f.write("## Table of Contents\n\n")
            f.write("| # | Strong's | Word | Translation | Verses |\n")
            f.write("|---|----------|------|-------------|--------|\n")
            
            idx = 1
            for sn, (translit, eng, desc) in all_categories.items():
                count = category_counts.get(sn, 0)
                if count > 0:
                    anchor = sn.lower().replace(" ", "-")
                    f.write(f"| {idx} | `{sn}` | {translit} | {eng} | {count:,} |\n")
                    idx += 1
            
            f.write(f"\n**Grand Total: {grand_total:,} verse occurrences across {idx - 1} categories.**\n\n")
            f.write("---\n\n")
            
            # --- Hebrew Section ---
            f.write("# Part I — Hebrew (Old Testament)\n\n")
            
            for sn, (translit, eng, desc) in HEBREW_DIVINE_NAMES.items():
                verses = category_results.get(sn, [])
                count = category_counts.get(sn, 0)
                if count == 0:
                    continue
                
                f.write(f"## `{sn}` — {translit} (\"{eng}\")\n\n")
                f.write(f"> {desc}\n\n")
                f.write(f"**{count:,} verses found.**\n\n")
                
                # Group by book
                book_groups = OrderedDict()
                for row in verses:
                    book = row.book_name
                    if book not in book_groups:
                        book_groups[book] = []
                    book_groups[book].append(row)
                
                for book, book_verses in book_groups.items():
                    f.write(f"### {book} ({len(book_verses)} verses)\n\n")
                    
                    for row in book_verses:
                        ref = f"{row.book_name} {row.chapter}:{row.verse_num}"
                        hebrew_word = row.hebrew_segment or row.lemma or ""
                        gloss = row.word_gloss or row.gloss or ""
                        
                        f.write(f"**{ref}** — `{hebrew_word}` ({gloss})\n")
                        f.write(f"> {row.english_text}\n\n")
                    
                f.write("---\n\n")
            
            # --- Greek Section ---
            f.write("# Part II — Greek (New Testament)\n\n")
            
            for sn, (translit, eng, desc) in GREEK_DIVINE_NAMES.items():
                verses = category_results.get(sn, [])
                count = category_counts.get(sn, 0)
                if count == 0:
                    continue
                
                f.write(f"## `{sn}` — {translit} (\"{eng}\")\n\n")
                f.write(f"> {desc}\n\n")
                f.write(f"**{count:,} verses found.**\n\n")
                
                book_groups = OrderedDict()
                for row in verses:
                    book = row.book_name
                    if book not in book_groups:
                        book_groups[book] = []
                    book_groups[book].append(row)
                
                for book, book_verses in book_groups.items():
                    f.write(f"### {book} ({len(book_verses)} verses)\n\n")
                    
                    for row in book_verses:
                        ref = f"{row.book_name} {row.chapter}:{row.verse_num}"
                        hebrew_word = row.hebrew_segment or row.lemma or ""
                        gloss = row.word_gloss or row.gloss or ""
                        
                        f.write(f"**{ref}** — `{hebrew_word}` ({gloss})\n")
                        f.write(f"> {row.english_text}\n\n")
                    
                f.write("---\n\n")
            
            # --- Appendix: Quick Stats ---
            f.write("# Appendix — Statistical Summary\n\n")
            f.write("| Strong's | Word | Translation | Verse Count | % of Total |\n")
            f.write("|----------|------|-------------|-------------|------------|\n")
            
            for sn, (translit, eng, desc) in all_categories.items():
                count = category_counts.get(sn, 0)
                if count > 0:
                    pct = (count / grand_total * 100) if grand_total > 0 else 0
                    f.write(f"| `{sn}` | {translit} | {eng} | {count:,} | {pct:.1f}% |\n")
            
            f.write(f"\n**Total: {grand_total:,} verse occurrences.**\n\n")
            f.write(f"*Generated by Divine Names Extractor — {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}*\n")
        
        elapsed = time.time() - total_start
        print(f"\n  [OK] Report written successfully!")
        print(f"  File: {output_path}")
        print(f"  Completed in {elapsed:.2f}s")
        print(f"  {grand_total:,} total verse occurrences across {idx - 1} categories")
        
    except Exception as e:
        print(f"\n  [ERROR] FATAL ERROR: {e}")
        raise
    finally:
        session.close()


if __name__ == "__main__":
    extract_divine_names()
