import sys
import asyncio
if sys.platform == 'win32':
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

import unittest
from utils.normalization import (
    strip_html_tags,
    strip_diacritics,
    normalize_sofit,
    normalize_hebrew_text,
)
from models.cryptography import TopographicalMapping, CryptographicArray
from ingest_db import CryptographicLetter, Word

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

class TestWordCryptographyModel(unittest.TestCase):
    
    def test_model_cryptography_fields(self):
        # Verify Word model fields mapping
        word = Word(
            verse_id=1,
            bhs_sort=999999,
            word_index=1,
            hebrew_segment="אבג",
            gematria_absolute=6,
            gematria_ordinal=6,
            gematria_reduced=6,
            atbash="תשר",
            albam="למנ",
            atbah="טחז"
        )
        self.assertEqual(word.gematria_absolute, 6)
        self.assertEqual(word.gematria_ordinal, 6)
        self.assertEqual(word.gematria_reduced, 6)
        self.assertEqual(word.atbash, "תשר")
        self.assertEqual(word.albam, "למנ")
        self.assertEqual(word.atbah, "טחז")

from fastapi.testclient import TestClient
from main import app

class TestCryptographicSearchAPI(unittest.TestCase):
    
    def setUp(self):
        self.client = TestClient(app)
        
    def test_search_no_params_error(self):
        # Hits endpoint with no parameters, should return 400 Bad Request
        resp = self.client.get("/api/search/cryptography")
        self.assertEqual(resp.status_code, 400)
        self.assertIn("At least one search filter", resp.json()["detail"])

    def test_search_with_params(self):
        # Hits endpoint with a search parameter, e.g. gematria_absolute=26
        # It should return a 200 OK with a list
        resp = self.client.get("/api/search/cryptography?gematria_absolute=26")
        self.assertEqual(resp.status_code, 200)
        self.assertIsInstance(resp.json(), list)
        
    def test_search_with_cipher_params(self):
        # Hits endpoint with cipher search parameter
        resp = self.client.get("/api/search/cryptography?atbash=בראשית")
        self.assertEqual(resp.status_code, 200)
        self.assertIsInstance(resp.json(), list)

if __name__ == "__main__":
    unittest.main()

