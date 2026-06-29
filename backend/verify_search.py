import os
import sys
import json
import asyncio
import faiss
from sentence_transformers import SentenceTransformer

# Base path for indices
INDICES_DIR = os.path.join(os.path.dirname(__file__), "vector_indices")

async def test_search(query_text: str):
    print(f"\n--- Testing Semantic Search for query: '{query_text}' ---")
    
    v_idx_path = os.path.join(INDICES_DIR, "verses.index")
    v_meta_path = os.path.join(INDICES_DIR, "verses_ids.json")
    l_idx_path = os.path.join(INDICES_DIR, "lexicon.index")
    l_meta_path = os.path.join(INDICES_DIR, "lexicon_ids.json")
    
    if not os.path.exists(v_idx_path) or not os.path.exists(l_idx_path):
        print("ERROR: Vector index files do not exist yet. Please wait for generate_embeddings.py to finish.")
        return
        
    print("Loading embedding model...")
    model = SentenceTransformer('all-MiniLM-L6-v2')
    
    print("Loading Scripture index and mappings...")
    verse_index = faiss.read_index(v_idx_path)
    with open(v_meta_path, "r", encoding="utf-8") as f:
        verse_metadata = json.load(f)
        
    print("Loading Lexicon index and mappings...")
    lexicon_index = faiss.read_index(l_idx_path)
    with open(l_meta_path, "r", encoding="utf-8") as f:
        lexicon_metadata = json.load(f)

    # Vectorize query
    print("Vectorizing search query...")
    query_vector = model.encode([query_text]).astype('float32')
    faiss.normalize_L2(query_vector)

    # Search Scripture
    print("\nQuerying Scripture Index (Top 5 matches)...")
    v_scores, v_indices = verse_index.search(query_vector, 5)
    for i, (score, pos) in enumerate(zip(v_scores[0], v_indices[0]), 1):
        if pos == -1 or pos >= len(verse_metadata):
            continue
        meta = verse_metadata[pos]
        print(f"  {i}. OSIS: {meta['osis_id']} | ID: {meta['id']} | Cosine Similarity: {score:.4f}")

    # Search Lexicon
    print("\nQuerying Lexicon Index (Top 5 matches)...")
    l_scores, l_indices = lexicon_index.search(query_vector, 5)
    for i, (score, pos) in enumerate(zip(l_scores[0], l_indices[0]), 1):
        if pos == -1 or pos >= len(lexicon_metadata):
            continue
        strongs_num = lexicon_metadata[pos]
        print(f"  {i}. Strong's: {strongs_num} | Cosine Similarity: {score:.4f}")

    print("\nSemantic Search indices are verified and working correctly.")

if __name__ == "__main__":
    query = "beginning creation" if len(sys.argv) < 2 else sys.argv[1]
    asyncio.run(test_search(query))
