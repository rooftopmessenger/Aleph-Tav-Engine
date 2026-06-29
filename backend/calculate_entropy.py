import os
import sqlite3
import psycopg
from dotenv import load_dotenv
from utils.entropy import calculate_shannon_entropy

load_dotenv()

def process_sqlite(db_file):
    if not os.path.exists(db_file):
        print(f"SQLite file {db_file} not found. Skipping.")
        return

    print(f"Processing SQLite database: {db_file}")
    conn = sqlite3.connect(db_file)
    cursor = conn.cursor()

    # 1. Add entropy_score column if it does not exist
    cursor.execute("PRAGMA table_info(verses)")
    columns = [col[1] for col in cursor.fetchall()]
    if "entropy_score" not in columns:
        print(f"Adding entropy_score column to SQLite {db_file}...")
        cursor.execute("ALTER TABLE verses ADD COLUMN entropy_score FLOAT")
        conn.commit()

    # 2. Fetch all verses
    cursor.execute("SELECT id, hebrew_text FROM verses")
    rows = cursor.fetchall()
    print(f"Found {len(rows)} verses in SQLite {db_file}.")

    # 3. Calculate and update in a transaction
    updates = []
    for verse_id, text in rows:
        entropy = calculate_shannon_entropy(text or "")
        updates.append((entropy, verse_id))

    cursor.executemany("UPDATE verses SET entropy_score = ? WHERE id = ?", updates)
    conn.commit()
    print(f"Successfully backfilled {len(updates)} verses in SQLite {db_file}.\n")
    conn.close()

def process_postgres():
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        print("DATABASE_URL environment variable not found. Skipping Postgres backfill.")
        return

    # Clean the connection string to use standard psycopg
    cleaned_url = db_url.replace("postgresql+asyncpg://", "postgresql://")
    print(f"Connecting to PostgreSQL...")

    try:
        conn = psycopg.connect(cleaned_url)
        cursor = conn.cursor()

        # 1. Add entropy_score column if it does not exist
        cursor.execute("""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name='verses' AND column_name='entropy_score';
        """)
        exists = cursor.fetchone()
        if not exists:
            print("Adding entropy_score column to PostgreSQL...")
            cursor.execute("ALTER TABLE verses ADD COLUMN entropy_score FLOAT;")
            conn.commit()

        # 2. Fetch all verses
        cursor.execute("SELECT id, hebrew_text FROM verses")
        rows = cursor.fetchall()
        print(f"Found {len(rows)} verses in PostgreSQL.")

        # 3. Calculate and update
        print("Calculating entropy scores...")
        updates = []
        for verse_id, text in rows:
            entropy = calculate_shannon_entropy(text or "")
            updates.append((entropy, verse_id))

        print("Executing updates...")
        with conn.transaction():
            cursor.executemany("UPDATE verses SET entropy_score = %s WHERE id = %s", updates)
            
        conn.commit()
        print(f"Successfully backfilled {len(updates)} verses in PostgreSQL.\n")
        conn.close()

    except Exception as e:
        print(f"Failed to process PostgreSQL: {e}")

if __name__ == "__main__":
    process_sqlite("kjv_strongs.db")
    process_sqlite("aleph_tav.db")
    process_postgres()
