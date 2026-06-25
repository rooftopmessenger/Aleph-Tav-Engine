import os
import json
import httpx
import logging
from typing import Dict, Any, List, Optional

logger = logging.getLogger(__name__)

SEFARIA_API_BASE = "https://www.sefaria.org/api"

class SefariaIngestionService:
    def __init__(self, cache_dir: Optional[str] = None):
        if cache_dir is None:
            # Default cache location: data_sources/sefaria_cache/
            # Resolve relative to the backend directory
            base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
            self.cache_dir = os.path.join(base_dir, "data_sources", "sefaria_cache")
        else:
            self.cache_dir = cache_dir
            
        os.makedirs(self.cache_dir, exist_ok=True)
        
    def _get_cache_path(self, book_name: str, chapter: Optional[int] = None) -> str:
        # Standardize book name for filenames
        safe_book_name = book_name.replace(" ", "_").lower()
        if chapter is not None:
            return os.path.join(self.cache_dir, f"{safe_book_name}_ch{chapter}.json")
        return os.path.join(self.cache_dir, f"{safe_book_name}_index.json")

    async def fetch_book_index(self, book_name: str, bypass_cache: bool = False) -> Dict[str, Any]:
        """
        Fetch index metadata for a book from Sefaria's index API.
        Includes chapter/verse lengths and title variations.
        """
        cache_path = self._get_cache_path(book_name)
        
        if not bypass_cache and os.path.exists(cache_path):
            logger.info(f"Loading index metadata for {book_name} from cache.")
            with open(cache_path, "r", encoding="utf-8") as f:
                return json.load(f)
                
        url = f"{SEFARIA_API_BASE}/v2/index/{book_name}"
        logger.info(f"Fetching index metadata for {book_name} from Sefaria API: {url}")
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(url)
            if response.status_code != 200:
                raise httpx.HTTPStatusError(
                    f"Failed to fetch index for {book_name}. Status: {response.status_code}",
                    request=response.request,
                    response=response
                )
                
            data = response.json()
            # Save to cache
            with open(cache_path, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
                
            return data

    async def fetch_chapter_text(
        self, 
        book_name: str, 
        chapter: int, 
        version: str = "Miqra according to the Masorah", 
        bypass_cache: bool = False
    ) -> List[str]:
        """
        Fetch a single chapter's Hebrew text from Sefaria's Texts API.
        Returns a list of Hebrew strings representing the verses of the chapter.
        """
        cache_path = self._get_cache_path(book_name, chapter)
        
        if not bypass_cache and os.path.exists(cache_path):
            logger.info(f"Loading chapter {chapter} of {book_name} from cache.")
            with open(cache_path, "r", encoding="utf-8") as f:
                cached_data = json.load(f)
                # Ensure the requested version is matching or fallback
                if cached_data.get("versionTitle") == version or not version:
                    return cached_data.get("he", [])
        
        # Sefaria Texts API format: /texts/{Book}.{Chapter}
        # Specify version in parameters to get the exact Hebrew manuscript source
        url = f"{SEFARIA_API_BASE}/texts/{book_name}.{chapter}"
        params = {}
        if version:
            params["version"] = f"he|{version}"
            
        logger.info(f"Fetching {book_name} chapter {chapter} from Sefaria API: {url} (version: {version})")
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(url, params=params)
            if response.status_code != 200:
                raise httpx.HTTPStatusError(
                    f"Failed to fetch {book_name} Ch {chapter}. Status: {response.status_code}",
                    request=response.request,
                    response=response
                )
                
            data = response.json()
            
            # The 'he' field contains the list of Hebrew verses
            hebrew_verses = data.get("he", [])
            if not isinstance(hebrew_verses, list):
                # If there's only one verse, it could be a single string; convert to list
                if isinstance(hebrew_verses, str):
                    hebrew_verses = [hebrew_verses]
                else:
                    hebrew_verses = []
            
            # Save the full API response in cache
            with open(cache_path, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
                
            return hebrew_verses

    async def fetch_book_text(
        self, 
        book_name: str, 
        version: str = "Miqra according to the Masorah", 
        bypass_cache: bool = False
    ) -> Dict[int, List[str]]:
        """
        Fetch all chapters for a given book.
        Returns a dictionary mapping chapter number (1-based) to list of Hebrew verse strings.
        """
        # Fetch index first to determine chapter count
        index_data = await self.fetch_book_index(book_name, bypass_cache=bypass_cache)
        schema = index_data.get("schema", {})
        lengths = schema.get("lengths", [])
        
        if not lengths:
            # Fallback if lengths are not found in schema
            raise ValueError(f"Could not determine chapter lengths for book: {book_name}")
            
        num_chapters = lengths[0]
        logger.info(f"Book {book_name} has {num_chapters} chapters according to schema.")
        
        book_data = {}
        for chapter in range(1, num_chapters + 1):
            try:
                chapter_verses = await self.fetch_chapter_text(
                    book_name=book_name,
                    chapter=chapter,
                    version=version,
                    bypass_cache=bypass_cache
                )
                book_data[chapter] = chapter_verses
            except Exception as e:
                logger.error(f"Error fetching {book_name} chapter {chapter}: {e}")
                raise e
                
        return book_data
