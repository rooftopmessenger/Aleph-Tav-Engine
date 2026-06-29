import math
import re
import unicodedata

def calculate_shannon_entropy(text: str) -> float:
    """
    Calculate the Shannon Entropy of a Hebrew or Greek string.
    
    Steps:
    1. Greek Normalization: Map Greek final sigma (ς / U+03C2) to standard sigma (σ / U+03C3).
    2. Normalize to Unicode NFD (Decomposed form).
    3. Strip all combining diacritical marks in the \u0300-\u036f range.
    4. Unicode Extraction: Extract Hebrew letters (\u05D0-\u05EA) and Greek letters (\u0370-\u03FF and \u1F00-\u1FFF).
    5. Safe Fallback: Return 0.0 if the length of the filtered characters is 0.
    6. Compute the probability p_i of each unique character.
    7. Calculate entropy: H = -sum(p_i * log2(p_i)).
    """
    if not text:
        return 0.0
        
    # 1. Greek Normalization: Map final sigma to standard sigma
    normalized_text = text.replace('\u03c2', '\u03c3')
    
    # 2. Normalize to Unicode NFD (Decomposed form)
    decomposed = unicodedata.normalize('NFD', normalized_text)
    
    # 3. Strip all combining diacritical marks (accents and breathings in the \u0300-\u036f range)
    stripped = re.sub(r'[\u0300-\u036f]', '', decomposed)
    
    # 4. Unicode Extraction: Hebrew letters (\u05D0-\u05EA) and Greek letters (\u0370-\u03FF, \u1F00-\u1FFF)
    letters = re.findall(r'[\u05d0-\u05ea\u0370-\u03ff\u1f00-\u1fff]', stripped)
    
    # 5. Safe Fallback: return 0.0 if empty to avoid division by zero or log errors
    if not letters:
        return 0.0
        
    total_len = len(letters)
    frequencies = {}
    for char in letters:
        frequencies[char] = frequencies.get(char, 0) + 1
        
    entropy = 0.0
    for count in frequencies.values():
        p_i = count / total_len
        entropy -= p_i * math.log2(p_i)
        
    return entropy

