import os
import json
import time
import numpy as np
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
import faiss
from sentence_transformers import SentenceTransformer

# Import models from our database module
from ingest_db import Base, Verse, StrongsLexicon

# Strictly use local SQLite database file
DB_PATH = "kjv_strongs.db"
DATABASE_URL = f"sqlite:///{DB_PATH}"

def main():
    print(f"Connecting to database: {DATABASE_URL}")
    if not os.path.exists(DB_PATH):
        raise FileNotFoundError(f"Database file '{DB_PATH}' not found in current directory ({os.getcwd()}).")

    engine = create_engine(DATABASE_URL, echo=False)
    Session = sessionmaker(bind=engine)
    session = Session()

    # Load local sentence transformer model
    print("Loading local embedding model: all-MiniLM-L6-v2...")
    model_start = time.time()
    model = SentenceTransformer('all-MiniLM-L6-v2')
    print(f"Model loaded in {time.time() - model_start:.2f}s.")

    # Create directories for vector indices if they don't exist
    indices_dir = os.path.join(os.path.dirname(__file__), "vector_indices")
    os.makedirs(indices_dir, exist_ok=True)
    print(f"Saving indices to: {indices_dir}")

    # ==========================================
    # 1. Indexing Scripture (KJV English verses)
    # ==========================================
    print("\n--- Indexing Scripture (KJV Verses) ---")
    verses = session.query(Verse.id, Verse.osis_id, Verse.english_text).order_by(Verse.id).all()
    print(f"Retrieved {len(verses)} verses from database.")

    verse_texts = [v.english_text for v in verses]
    verse_metadata = [{"id": v.id, "osis_id": v.osis_id} for v in verses]

    print("Generating embeddings for verses...")
    embed_start = time.time()
    verse_embeddings = model.encode(verse_texts, show_progress_bar=True, batch_size=64)
    print(f"Generated verse embeddings in {time.time() - embed_start:.2f}s.")

    # Convert to float32 numpy array and normalize for Cosine Similarity
    verse_embeddings = np.array(verse_embeddings).astype('float32')
    faiss.normalize_L2(verse_embeddings)

    # Initialize and save FAISS index
    dimension = verse_embeddings.shape[1]
    print(f"Initializing FAISS Inner Product index with dimension {dimension}...")
    verse_index = faiss.IndexFlatIP(dimension)
    verse_index.add(verse_embeddings)

    # Save Verse index and ID mapping
    faiss.write_index(verse_index, os.path.join(indices_dir, "verses.index"))
    with open(os.path.join(indices_dir, "verses_ids.json"), "w", encoding="utf-8") as f:
        json.dump(verse_metadata, f, ensure_ascii=False, indent=2)
    print("Scripture indexing complete.")

    # ==========================================
    # 2. Indexing Lexicon (Strong's Hebrew/Greek)
    # ==========================================
    print("\n--- Indexing Strong's Lexicon ---")
    entries = session.query(
        StrongsLexicon.strongs_number,
        StrongsLexicon.lemma,
        StrongsLexicon.transliteration,
        StrongsLexicon.gloss,
        StrongsLexicon.definition
    ).order_by(StrongsLexicon.strongs_number).all()
    print(f"Retrieved {len(entries)} Lexicon entries from database.")

    lexicon_texts = []
    lexicon_metadata = []

    for entry in entries:
        # Combined string of [Root Lemma] + [Transliteration] + [Gloss] + [Extended Definition]
        lemma = entry.lemma or ""
        translit = entry.transliteration or ""
        gloss = entry.gloss or ""
        definition = entry.definition or ""
        
        combined_text = f"{lemma} {translit} {gloss} {definition}".strip()
        
        # fallback to strongs number if all fields are empty
        if not combined_text:
            combined_text = entry.strongs_number

        lexicon_texts.append(combined_text)
        lexicon_metadata.append(entry.strongs_number)

    print("Generating embeddings for lexicon entries...")
    embed_start = time.time()
    lexicon_embeddings = model.encode(lexicon_texts, show_progress_bar=True, batch_size=64)
    print(f"Generated lexicon embeddings in {time.time() - embed_start:.2f}s.")

    # Convert to float32 numpy array and normalize for Cosine Similarity
    lexicon_embeddings = np.array(lexicon_embeddings).astype('float32')
    faiss.normalize_L2(lexicon_embeddings)

    # Initialize and save FAISS index
    print(f"Initializing FAISS Inner Product index with dimension {dimension}...")
    lexicon_index = faiss.IndexFlatIP(dimension)
    lexicon_index.add(lexicon_embeddings)

    # Save Lexicon index and ID mapping
    faiss.write_index(lexicon_index, os.path.join(indices_dir, "lexicon.index"))
    with open(os.path.join(indices_dir, "lexicon_ids.json"), "w", encoding="utf-8") as f:
        json.dump(lexicon_metadata, f, ensure_ascii=False, indent=2)
    print("Lexicon indexing complete.")

    session.close()
    print("\nVector Indexing Pipeline execution completed successfully.")

if __name__ == "__main__":
    main()
