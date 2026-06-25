import json
import httpx
import asyncio
import sys
from datetime import datetime

# 1. Force Windows terminal to accept UTF-8
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

# Configuration
API_URL = "http://127.0.0.1:8000/api/ai/pattern-search"
THEORY_TITLE = "Divine Speech Patterns in Isaiah"
SEARCH_MODE = "Divine Speech & Lexical Analysis"
QUERY = "Analyze Isaiah 40. Distinguish between the narrator speaking about Elohim and the direct quoted voice of YHWH."

async def run_research():
    print(f"Starting research for: '{THEORY_TITLE}'...")
    print(f"Mode: {SEARCH_MODE}\n")
    
    payload = {
        "query": QUERY,
        "search_mode": SEARCH_MODE
    }

    ai_response = ""
    
    try:
        # 2. Increased timeout to ensure long AI generations don't drop
        async with httpx.AsyncClient(timeout=300.0) as client:
            with client.stream("POST", API_URL, json=payload) as response:
                response.raise_for_status()
                for chunk in response.iter_text():
                    # Save the pristine text (including Hebrew) to our variable
                    ai_response += chunk
                    
                    # 3. Safely print to console. If Windows still hates the character, 
                    # we print a dot instead of crashing and wasting API tokens.
                    try:
                        print(chunk, end="", flush=True)
                    except UnicodeEncodeError:
                        print(".", end="", flush=True)
                        
    except Exception as e:
        print(f"\n\n[!] Error connecting to backend or stream interrupted: {e}")
        # We DO NOT return here. We proceed to save whatever text we successfully captured!

    # 4. Generate and save the Markdown file even if the stream was interrupted
    print("\n\nWriting results to file...")
    date_str = datetime.now().strftime("%Y-%m-%d")
    filename = f"{THEORY_TITLE.replace(' ', '_')}.md"
    
    markdown_content = f"""---
title: {THEORY_TITLE}
date: {date_str}
tags: [research, theory, {SEARCH_MODE.replace(' ', '_').replace('&', '')}]
---

# {THEORY_TITLE}

**Query:** {QUERY}
**Search Mode:** {SEARCH_MODE}

## AI Analysis & Raw Data
{ai_response}

## Synthesized Conclusion (Pardes Framework)

### Peshat (פְּשָׁט) — Plain Meaning
[Extract the literal, direct contextual meaning and exact Hebrew source words identified above.]

### Remez (רֶמֶז) — Hint
[Extract the structural quotative frames (e.g., 'lemor') and rhetorical shifting identified above.]

### Derash (דְּרַשׁ) — Seek
[Extract the homiletic and thematic applications of the Messenger Formula identified above.]

### Sod (סוֹד) — Secret
[Extract any deeper theological intent or mystical connections regarding the Divine Name usage.]
"""

    # 5. Force utf-8 encoding on the file write so Obsidian/NotebookLM can read the Hebrew
    with open(filename, "w", encoding="utf-8") as f:
        f.write(markdown_content)
        
    print(f"Success! Research compiled and saved to {filename}")

if __name__ == "__main__":
    asyncio.run(run_research())