import os
import sys
import httpx
import asyncio
import logging

# Import the existing cryptographic utilities for local processing
# This avoids 400,000+ individual HTTP roundtrips, bringing execution time down from hours to seconds.
from utils.ciphers import atbash_cipher, albam_cipher, atbah_cipher
from utils.gematria import calculate_gematria
from utils.normalization import normalize_hebrew_text

# Configuration
BASE_URL = "http://127.0.0.1:8000"

# Setup logging relative to the script directory
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
LOG_FILE = os.path.join(SCRIPT_DIR, "batch_analysis.log")

logging.basicConfig(
    filename=LOG_FILE,
    level=logging.ERROR,
    format="%(asctime)s - %(levelname)s - %(message)s"
)

def process_word_local(word: dict) -> dict:
    """
    Perform cryptographic analysis on a single word locally.
    Uses the exact same algorithms as the `/api/cryptography/analyze` endpoint.
    """
    hebrew = word.get('hebrew_segment', '')
    if not hebrew:
        return {}
    try:
        clean_text = normalize_hebrew_text(hebrew, keep_spaces=False)
        return {
            "word": hebrew,
            "gematria_absolute": calculate_gematria(clean_text, "absolute"),
            "gematria_ordinal": calculate_gematria(clean_text, "ordinal"),
            "gematria_reduced": calculate_gematria(clean_text, "reduced"),
            "atbash": atbash_cipher(clean_text),
            "albam": albam_cipher(clean_text),
            "atbah": atbah_cipher(clean_text)
        }
    except Exception as e:
        logging.error(f"Error locally analyzing word '{hebrew}': {e}")
        return {}

async def process_chapter(client: httpx.AsyncClient, book_osis: str, chapter_num: int, output_dir: str) -> str:
    """
    Fetch a chapter, process all its words, and write results to file.
    """
    try:
        # Fetch chapter verses from API
        resp = await client.get(f"{BASE_URL}/api/chapters/{book_osis}/{chapter_num}")
        if resp.status_code == 404:
            return "EOF"  # No more chapters for this book
        resp.raise_for_status()
        verses = resp.json()
        
        # Write results to output file
        output_file = os.path.join(output_dir, f"chapter_{chapter_num}.txt")
        with open(output_file, "w", encoding="utf-8") as f:
            f.write(f"--- Cryptographic Analysis of {book_osis} Chapter {chapter_num} ---\n\n")
            
            for verse in verses:
                osis_id = verse.get('osis_id', f"{book_osis}.{chapter_num}.{verse.get('verse')}")
                f.write(f"\nAnalyzing {osis_id}:\n")
                
                for word in verse.get('words', []):
                    res = process_word_local(word)
                    if res:
                        f.write(f"  Word: {res['word']} | Gematria: Abs={res['gematria_absolute']}, Ord={res['gematria_ordinal']}, Red={res['gematria_reduced']} | Atbash: {res['atbash']} | Albam: {res['albam']} | Atbah: {res['atbah']}\n")
                    else:
                        hebrew = word.get('hebrew_segment', '')
                        f.write(f"  Word: {hebrew} | [Error during analysis]\n")
                    
        return "SUCCESS"
    except Exception as e:
        err_msg = f"Failed to process chapter {book_osis} {chapter_num}: {e}"
        logging.error(err_msg)
        return "FAILED"

async def run_batch_analysis():
    research_data_dir = os.path.join(SCRIPT_DIR, "research_data")
    os.makedirs(research_data_dir, exist_ok=True)
    
    print("Starting batch cryptographic analysis of the database...")
    
    async with httpx.AsyncClient(timeout=60.0) as client:
        try:
            # Query backend to get list of all available books
            books_resp = await client.get(f"{BASE_URL}/api/books")
            books_resp.raise_for_status()
            books = books_resp.json()
        except Exception as e:
            print(f"Error fetching books from API: {e}")
            logging.error(f"Error fetching books from API: {e}")
            return
            
        total_books = len(books)
        print(f"Discovered {total_books} books. Commencing processing...")
        
        success_chapters = 0
        failed_chapters = 0
        
        for idx, book in enumerate(books, 1):
            book_name = book.get('name')
            book_osis = book.get('osis_code')
            
            # Create subfolder for each book
            book_dir = os.path.join(research_data_dir, book_osis)
            os.makedirs(book_dir, exist_ok=True)
            
            print(f"[{idx}/{total_books}] Processing Book: {book_name} ({book_osis})...")
            
            chapter_num = 1
            while True:
                # Console progress indicator
                sys.stdout.write(f"\r  Processing Chapter {chapter_num}...")
                sys.stdout.flush()
                
                status = await process_chapter(client, book_osis, chapter_num, book_dir)
                if status == "EOF":
                    sys.stdout.write(f"\r  Finished all chapters for {book_osis}.\n")
                    break
                elif status == "SUCCESS":
                    success_chapters += 1
                else:
                    failed_chapters += 1
                    
                chapter_num += 1
                
        print("\n" + "="*50)
        print("Batch Cryptographic Analysis Complete!")
        print(f"Successfully processed: {success_chapters} chapters.")
        print(f"Failed: {failed_chapters} chapters.")
        print(f"Errors logged to: backend/batch_analysis.log")
        print("="*50)

if __name__ == "__main__":
    # Fix event loop policy on Windows for asyncio subprocess/socket operations
    if sys.platform == 'win32':
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(run_batch_analysis())
