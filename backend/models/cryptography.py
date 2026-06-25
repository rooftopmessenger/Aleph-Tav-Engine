from sqlalchemy import ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship
from pydantic import BaseModel, ConfigDict
from typing import List, Optional

# Import Base from the main DB module to share the SQLAlchemy Metadata
from ingest_db import Base

class CryptographicCharacter(Base):
    """
    SQLAlchemy model representing a single normalized consonant in the continuous 
    cryptographic character array of the Tanakh.
    """
    __tablename__ = "cryptographic_characters"
    
    # Absolute index in the contiguous array (0-based or 1-based)
    absolute_index: Mapped[int] = mapped_column(Integer, primary_key=True)
    
    # The single normalized base consonant (e.g. 'א', 'ב')
    char: Mapped[str] = mapped_column(String(1), nullable=False)
    
    # Coordinates mapping back to the canonical scripture structure
    book_id: Mapped[int] = mapped_column(Integer, ForeignKey("books.id"), nullable=False)
    chapter: Mapped[int] = mapped_column(Integer, nullable=False)
    verse_num: Mapped[int] = mapped_column(Integer, nullable=False)
    verse_id: Mapped[int] = mapped_column(Integer, ForeignKey("verses.id"), nullable=False)
    word_index: Mapped[int] = mapped_column(Integer, nullable=False)   # 1-based index of word in verse
    letter_index: Mapped[int] = mapped_column(Integer, nullable=False) # 1-based index of letter in word
    
    # Relationships
    book = relationship("Book")
    verse = relationship("Verse")


class TopographicalMapping(BaseModel):
    """
    Pydantic schema representing a single character and its exact topographical coordinates.
    """
    model_config = ConfigDict(from_attributes=True)
    
    absolute_index: int
    char: str
    book_id: int
    chapter: int
    verse_num: int
    verse_id: int
    word_index: int
    letter_index: int


class CryptographicArray(BaseModel):
    """
    In-memory representation of the continuous cryptographic array.
    """
    characters: List[TopographicalMapping]
    
    @property
    def raw_text(self) -> str:
        """Get the continuous string of characters (without spaces)."""
        return "".join(c.char for c in self.characters)
        
    def reconstruct_text_with_spaces(self) -> str:
        """
        Reconstruct the text spacing by placing spaces between distinct words 
        as defined by the word_index coordinates.
        """
        if not self.characters:
            return ""
            
        reconstructed = []
        last_word_key = None
        
        for mapping in self.characters:
            # Word changes if book_id, chapter, verse_num, or word_index changes
            word_key = (mapping.book_id, mapping.chapter, mapping.verse_num, mapping.word_index)
            
            if last_word_key is not None and last_word_key != word_key:
                reconstructed.append(" ")
                
            reconstructed.append(mapping.char)
            last_word_key = word_key
            
        return "".join(reconstructed)
