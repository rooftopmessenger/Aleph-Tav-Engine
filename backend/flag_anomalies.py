import os
import math
import sqlite3
from datetime import datetime

def flag_anomalies():
    db_file = "kjv_strongs.db"
    if not os.path.exists(db_file):
        print(f"Database {db_file} not found. Running in backend directory?")
        return

    print(f"Connecting to database {db_file}...")
    conn = sqlite3.connect(db_file)
    cursor = conn.cursor()

    # Clear existing anomalies
    cursor.execute("DELETE FROM anomalies")
    conn.commit()

    # Fetch all books for lookup
    cursor.execute("SELECT id, name, osis_code FROM books")
    books = {row[0]: (row[1], row[2]) for row in cursor.fetchall()}

    # Fetch verses and their entropy scores
    print("Fetching verses...")
    cursor.execute("SELECT id, book_id, chapter, verse, osis_id, entropy_score FROM verses")
    verses_rows = cursor.fetchall()
    
    # Fetch all words with gematria absolute to sum them up per verse
    print("Fetching word gematria details...")
    cursor.execute("SELECT verse_id, gematria_absolute FROM words")
    words_rows = cursor.fetchall()

    # Group word gematria by verse_id
    verse_gematria = {}
    for verse_id, gem_abs in words_rows:
        if gem_abs is not None:
            verse_gematria[verse_id] = verse_gematria.get(verse_id, 0) + gem_abs

    # Process metrics
    verses_data = []
    entropy_values = []
    gematria_values = []

    for row in verses_rows:
        verse_id, book_id, chapter, verse_num, osis_id, entropy = row
        gematria_sum = verse_gematria.get(verse_id, 0)
        
        verses_data.append({
            "id": verse_id,
            "book_id": book_id,
            "chapter": chapter,
            "verse": verse_num,
            "osis_id": osis_id,
            "entropy": entropy if entropy is not None else 0.0,
            "gematria": gematria_sum
        })
        
        if entropy is not None:
            entropy_values.append(entropy)
        gematria_values.append(gematria_sum)

    total_verses = len(verses_data)
    if total_verses == 0:
        print("No verses found in the database. Exiting.")
        conn.close()
        return

    # Calculate statistics for entropy
    mean_entropy = sum(entropy_values) / len(entropy_values) if entropy_values else 0.0
    var_entropy = sum((x - mean_entropy) ** 2 for x in entropy_values) / len(entropy_values) if entropy_values else 0.0
    std_entropy = math.sqrt(var_entropy)

    # Calculate statistics for gematria
    mean_gematria = sum(gematria_values) / len(gematria_values) if gematria_values else 0.0
    var_gematria = sum((x - mean_gematria) ** 2 for x in gematria_values) / len(gematria_values) if gematria_values else 0.0
    std_gematria = math.sqrt(var_gematria)

    print(f"Entropy stats - Mean: {mean_entropy:.4f}, StdDev: {std_entropy:.4f}")
    print(f"Gematria stats - Mean: {mean_gematria:.2f}, StdDev: {std_gematria:.2f}")

    entropy_high_threshold = mean_entropy + 1.5 * std_entropy
    entropy_low_threshold = mean_entropy - 1.5 * std_entropy
    gematria_high_threshold = mean_gematria + 1.5 * std_gematria

    anomalies_to_insert = []
    now_str = datetime.utcnow().isoformat()

    for v in verses_data:
        book_name, book_osis = books.get(v["book_id"], ("Unknown", "UNK"))
        
        # Check high entropy
        if v["entropy"] > entropy_high_threshold:
            anomalies_to_insert.append((
                book_name,
                v["chapter"],
                v["verse"],
                v["osis_id"],
                "entropy_high",
                v["entropy"],
                f"High Shannon Entropy: {v['entropy']:.4f} exceeds threshold of {entropy_high_threshold:.4f} (Mean: {mean_entropy:.4f}, SD: {std_entropy:.4f})",
                now_str
            ))
            
        # Check low entropy
        elif v["entropy"] < entropy_low_threshold:
            anomalies_to_insert.append((
                book_name,
                v["chapter"],
                v["verse"],
                v["osis_id"],
                "entropy_low",
                v["entropy"],
                f"Low Shannon Entropy: {v['entropy']:.4f} falls below threshold of {entropy_low_threshold:.4f} (Mean: {mean_entropy:.4f}, SD: {std_entropy:.4f})",
                now_str
            ))

        # Check high gematria
        if v["gematria"] > gematria_high_threshold:
            anomalies_to_insert.append((
                book_name,
                v["chapter"],
                v["verse"],
                v["osis_id"],
                "gematria_high",
                float(v["gematria"]),
                f"High Gematria Sum: {v['gematria']} exceeds threshold of {gematria_high_threshold:.2f} (Mean: {mean_gematria:.2f}, SD: {std_gematria:.2f})",
                now_str
            ))

    print(f"Identified {len(anomalies_to_insert)} anomalies. Inserting into database...")
    
    cursor.executemany("""
        INSERT INTO anomalies (book, chapter, verse, osis_id, anomaly_type, score, notes, timestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, anomalies_to_insert)
    
    conn.commit()
    print("Database seeding of anomalies completed successfully!")
    conn.close()

if __name__ == "__main__":
    flag_anomalies()
