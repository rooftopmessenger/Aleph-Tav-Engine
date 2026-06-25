import os
import httpx
import asyncio

# Configuration
BASE_URL = "http://127.0.0.1:8000"
VERSES = ["Isa.40.1", "Isa.40.2", "Isa.40.3", "Isa.40.4", "Isa.40.5", 
          "Isa.40.6", "Isa.40.7", "Isa.40.8", "Isa.40.9", "Isa.40.10", "Isa.40.11"]

async def run_analysis():
    async with httpx.AsyncClient() as client:
        print("Starting cryptographic analysis of Isaiah 40...")
        
        # Determine the directory of the script and build the path for the output file
        script_dir = os.path.dirname(os.path.abspath(__file__))
        output_path = os.path.join(script_dir, "isaiah40_cryptographic_analysis.txt")
        
        with open(output_path, "w", encoding="utf-8") as f:
            f.write("--- Analyzing Divine Speech Patterns in Isaiah 40 ---\n\n")
            
            for osis_id in VERSES:
                # 1. Fetch Verse Data
                verse_resp = await client.get(f"{BASE_URL}/api/verses/{osis_id}")
                verse_data = verse_resp.json()
                
                f.write(f"Analyzing {osis_id}:\n")
                
                # 2. Cryptographic Analysis for each word in the verse
                for word in verse_data.get('words', []):
                    # Pass normalized Hebrew text to our new cryptographic router
                    crypto_payload = {"text": word['hebrew_segment']}
                    crypto_resp = await client.post(f"{BASE_URL}/api/cryptography/analyze", json=crypto_payload)
                    analysis = crypto_resp.json()
                    
                    # Filter for "Signposts": check if Gematria (Absolute) matches any known divine patterns
                    f.write(f"  Word: {word['hebrew_segment']} | Gematria (Abs): {analysis['gematria_absolute']} | Atbash: {analysis['atbash']}\n")
                
                f.write("\n")
                
            f.write("--- Analysis Complete. Data ready for NotebookLM ingestion. ---\n")
            
        print("Analysis complete. Results successfully written to 'isaiah40_cryptographic_analysis.txt'.")

if __name__ == "__main__":
    asyncio.run(run_analysis())