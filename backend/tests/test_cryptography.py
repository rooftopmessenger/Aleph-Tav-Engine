import unittest
from utils.normalization import (
    strip_html_tags,
    strip_diacritics,
    normalize_sofit,
    normalize_hebrew_text,
)
from models.cryptography import TopographicalMapping, CryptographicArray
from ingest_db import CryptographicLetter

# Import the ciphers and gematria calculators to test them
from utils.ciphers import atbash_cipher, albam_cipher, atbah_cipher
from utils.gematria import calculate_gematria

class TestHebrewNormalization(unittest.TestCase):
    
    def test_strip_html_tags(self):
        # Sefaria API often returns text enclosed in HTML tags (e.g. big letters)
        self.assertEqual(strip_html_tags("<big>ב</big>ראשית"), "בראשית")
        self.assertEqual(strip_html_tags("<b>ה</b>שמים <i>ו</i>הארץ"), "השמים והארץ")
        self.assertEqual(strip_html_tags(""), "")
        
    def test_strip_diacritics(self):
        # Test stripping vowel points (nikud) and accents (te'amim)
        # בְּרֵאשִׁ֖ית (Genesis 1:1 - Bereshit)
        word_with_nikud = "בְּרֵאשִׁ֖ית"
        self.assertEqual(strip_diacritics(word_with_nikud), "בראשית")
        
        # אֱלֹהִ֑ים (Elohim)
        elohim_with_nikud = "אֱלֹהִ֑ים"
        self.assertEqual(strip_diacritics(elohim_with_nikud), "אלהים")
        
    def test_normalize_sofit(self):
        # Test mapping final letters (sofit) to their standard counterparts
        self.assertEqual(normalize_sofit("מלך"), "מלכ")  # Kaf
        self.assertEqual(normalize_sofit("יום"), "יומ")  # Mem
        self.assertEqual(normalize_sofit("בן"), "בנ")    # Nun
        self.assertEqual(normalize_sofit("כנף"), "כנפ")  # Pe
        self.assertEqual(normalize_sofit("ארץ"), "ארצ")  # Tsadi
        
    def test_normalize_hebrew_text_with_spaces(self):
        # Genesis 1:1 raw with HTML, nikud, te'amim, and maqaf (־)
        raw_text = "<big>בְּ</big>רֵאשִׁ֖ית בָּרָ֣א אֱלֹהִ֑ים אֵ֥ת הַשָּׁמַ֖יִם וְאֵ֥ת הָאָֽרֶץ׃"
        expected = "\u05d1\u05e8\u05d0\u05e9\u05d9\u05ea \u05d1\u05e8\u05d0 \u05d0\u05dc\u05d4\u05d9\u05de \u05d0\u05ea \u05d4\u05e9\u05de\u05d9\u05de \u05d5\u05d0\u05ea \u05d4\u05d0\u05e8\u05e6"
        self.assertEqual(normalize_hebrew_text(raw_text, keep_spaces=True), expected)
        
    def test_normalize_hebrew_text_without_spaces(self):
        # Genesis 1:1 normalized continuous array (no spaces)
        raw_text = "<big>בְּ</big>רֵאשִׁ֖ית בָּרָ֣א אֱלֹהִ֑ים אֵ֥ת הַשָּׁמַ֖יִם וְאֵ֥ת הָאָֽרֶץ׃"
        expected = "\u05d1\u05e8\u05d0\u05e9\u05d9\u05ea\u05d1\u05e8\u05d0\u05d0\u05dc\u05d4\u05d9\u05de\u05d0\u05ea\u05d4\u05e9\u05de\u05d9\u05de\u05d5\u05d0\u05ea\u05d4\u05d0\u05e8\u05e6"
        self.assertEqual(normalize_hebrew_text(raw_text, keep_spaces=False), expected)

class TestCryptographicArray(unittest.TestCase):
    
    def setUp(self):
        # Setup sample topographical mappings representing "ברא שית" (created six)
        self.mappings = [
            # Word 1: ברא (created)
            TopographicalMapping(absolute_index=0, char="ב", book_id=1, chapter=1, verse_num=1, verse_id=1, word_index=1, letter_index=1),
            TopographicalMapping(absolute_index=1, char="ר", book_id=1, chapter=1, verse_num=1, verse_id=1, word_index=1, letter_index=2),
            TopographicalMapping(absolute_index=2, char="א", book_id=1, chapter=1, verse_num=1, verse_id=1, word_index=1, letter_index=3),
            # Word 2: שית (six / put)
            TopographicalMapping(absolute_index=3, char="ש", book_id=1, chapter=1, verse_num=1, verse_id=1, word_index=2, letter_index=1),
            TopographicalMapping(absolute_index=4, char="י", book_id=1, chapter=1, verse_num=1, verse_id=1, word_index=2, letter_index=2),
            TopographicalMapping(absolute_index=5, char="ת", book_id=1, chapter=1, verse_num=1, verse_id=1, word_index=2, letter_index=3),
        ]
        self.array = CryptographicArray(characters=self.mappings)
        
    def test_raw_text(self):
        self.assertEqual(self.array.raw_text, "בראשית")
        
    def test_reconstruct_text_with_spaces(self):
        self.assertEqual(self.array.reconstruct_text_with_spaces(), "ברא שית")

class TestCryptographicLetterModel(unittest.TestCase):
    
    def test_model_fields(self):
        letter = CryptographicLetter(
            absolute_index=42,
            character="א",
            book_id=1,
            chapter=1,
            verse_num=1,
            word_index_in_verse=2,
            letter_index_in_word=3,
        )
        self.assertEqual(letter.absolute_index, 42)
        self.assertEqual(letter.character, "א")
        self.assertEqual(letter.book_id, 1)
        self.assertEqual(letter.chapter, 1)
        self.assertEqual(letter.verse_num, 1)
        self.assertEqual(letter.word_index_in_verse, 2)
        self.assertEqual(letter.letter_index_in_word, 3)

class TestHebrewCiphers(unittest.TestCase):
    
    def test_atbash_cipher(self):
        self.assertEqual(atbash_cipher("אבג"), "תשר")
        # Kaf Sofit 'ך' maps to standard Kaf 'כ', which ciphers to 'ל'
        self.assertEqual(atbash_cipher("מלך"), "יכל")

    def test_albam_cipher(self):
        self.assertEqual(albam_cipher("אבג"), "למנ")
        # Kaf Sofit 'ך' maps to standard Kaf 'כ', which ciphers to 'ת'
        self.assertEqual(albam_cipher("מלך"), "באת")

    def test_atbah_cipher(self):
        self.assertEqual(atbah_cipher("אבג"), "טחז")
        # Kaf Sofit 'ך' maps to standard Kaf 'כ', which ciphers to 'פ'
        self.assertEqual(atbah_cipher("מלך"), "סעפ")

class TestHebrewGematria(unittest.TestCase):
    
    def test_calculate_gematria_absolute(self):
        self.assertEqual(calculate_gematria("יהוה", "absolute"), 26)
        self.assertEqual(calculate_gematria("בראשית", "absolute"), 913)

    def test_calculate_gematria_ordinal(self):
        self.assertEqual(calculate_gematria("יהוה", "ordinal"), 26)
        self.assertEqual(calculate_gematria("ברא", "ordinal"), 23)

    def test_calculate_gematria_reduced(self):
        self.assertEqual(calculate_gematria("יהוה", "reduced"), 8)
        self.assertEqual(calculate_gematria("בראשית", "reduced"), 4)

if __name__ == "__main__":
    unittest.main()
