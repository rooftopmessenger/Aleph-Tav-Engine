import re
import unicodedata

# Mapping of the five final Hebrew letters (Sofit) to their standard counterparts
SOFIT_MAP = {
    'ך': 'כ',  # Final Kaf -> Kaf (U+05DA -> U+05DB)
    'ם': 'מ',  # Final Mem -> Mem (U+05DD -> U+05DE)
    'ן': 'נ',  # Final Nun -> Nun (U+05DF -> U+05E0)
    'ף': 'פ',  # Final Pe -> Pe (U+05E3 -> U+05E4)
    'ץ': 'צ',  # Final Tsadi -> Tsadi (U+05E5 -> U+05E6)
}

def strip_html_tags(text: str) -> str:
    """Strip HTML tags (like <big>, </big>, etc.) from Sefaria API responses."""
    if not text:
        return ""
    return re.sub(r'<[^>]+>', '', text)

def strip_diacritics(text: str) -> str:
    """
    Remove all vowel points (nikud), cantillation marks (te'amim), 
    and combining marks from Hebrew text, leaving only base consonantal letters.
    """
    if not text:
        return ""
    
    # Normalize to NFD (Decomposed form) to isolate base characters and combining marks
    decomposed = unicodedata.normalize('NFD', text)
    
    cleaned_chars = []
    for char in decomposed:
        cp = ord(char)
        category = unicodedata.category(char)
        
        # 1. Skip combining diacritic marks (Mn - Mark, Nonspacing)
        if category == 'Mn':
            continue
            
        # 2. Skip specific Hebrew accents (te'amim) and points (nikud) ranges
        # Hebrew accents: U+0591 to U+05AE and U+05AF (Masora circle)
        # Hebrew points: U+05B0 to U+05BD, U+05BF (Rafe), U+05C1 (Shin dot), U+05C2 (Sin dot),
        # U+05C4 (Upper dot), U+05C5 (Lower dot), U+05C7 (Kamatz Qatan)
        if 0x0591 <= cp <= 0x05BD or cp == 0x05BF or 0x05C1 <= cp <= 0x05C2 or 0x05C4 <= cp <= 0x05C5 or cp == 0x05C7:
            continue
            
        cleaned_chars.append(char)
        
    # Re-compose to NFC (Composed form)
    composed = "".join(cleaned_chars)
    return unicodedata.normalize('NFC', composed)

def normalize_sofit(text: str) -> str:
    """Map the five final letters (ך, ם, ן, ף, ץ) to their standard positional equivalents."""
    if not text:
        return ""
    return "".join(SOFIT_MAP.get(char, char) for char in text)

def normalize_hebrew_text(text: str, keep_spaces: bool = True) -> str:
    """
    Full normalization pipeline for cryptographic processing.
    
    1. Strips HTML tags.
    2. Maps Hebrew hyphen (maqaf U+05BE) to space (or strips it if spaces are not kept).
    3. Strips all cantillation marks (te'amim) and vowel points (nikud).
    4. Maps final letters (sofit) to standard positional equivalents.
    5. Filters output to retain only Hebrew consonants (U+05D0 to U+05EA) and optionally spaces.
    """
    if not text:
        return ""
        
    # Strip HTML tags
    text = strip_html_tags(text)
    
    # Translate maqaf to space or empty string depending on space preservation
    if keep_spaces:
        text = text.replace('\u05be', ' ')
    else:
        text = text.replace('\u05be', '')
        
    # Strip vowels, accents, and combining diacritics
    text = strip_diacritics(text)
    
    # Normalize final letters
    text = normalize_sofit(text)
    
    # Keep only Hebrew consonants (U+05D0 through U+05EA) and optionally space
    allowed_consonants = set(chr(i) for i in range(0x05D0, 0x05EB))
    
    filtered_chars = []
    for char in text:
        if char in allowed_consonants:
            filtered_chars.append(char)
        elif char.isspace() and keep_spaces:
            filtered_chars.append(' ')
            
    normalized_str = "".join(filtered_chars)
    
    if keep_spaces:
        # Collapse multiple spaces to single spaces and strip leading/trailing spaces
        normalized_str = re.sub(r'\s+', ' ', normalized_str).strip()
        
    return normalized_str
