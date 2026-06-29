import pytest
import math
from utils.entropy import calculate_shannon_entropy

def test_empty_string():
    assert calculate_shannon_entropy("") == 0.0
    assert calculate_shannon_entropy("   ") == 0.0
    assert calculate_shannon_entropy("!,@#") == 0.0

def test_hebrew_entropy_distinct():
    # 22 distinct Hebrew consonants. Each count = 1.
    # Expected entropy = -22 * (1/22 * log2(1/22)) = log2(22)
    expected = math.log2(22)
    text = "אבגדהוזחטיכלמנסעפצקרשת"
    assert abs(calculate_shannon_entropy(text) - expected) < 1e-9

def test_hebrew_vowels_and_spaces():
    # Vowels, cantillation marks, and spaces should be stripped.
    # The clean consonants for "בְּרֵאשִׁ֖ית בָּרָ֣א אֱלֹהִ֑ים" should match "בראשיתבראאלהים"
    text_with_vowels = "בְּרֵאשִׁ֖ית בָּרָ֣א אֱלֹהִ֑ים"
    text_only_consonants = "בראשיתבראאלהים"
    assert abs(calculate_shannon_entropy(text_with_vowels) - calculate_shannon_entropy(text_only_consonants)) < 1e-9

def test_greek_entropy_normalization():
    # "λόγος" (logos)
    # 1. 'ς' (final sigma) maps to 'σ'
    # 2. 'ό' (accented omicron) maps to 'ο'
    # Base letters should be: λ (lambda), ο (omicron), γ (gamma), ο (omicron), σ (sigma)
    # Frequencies: λ:1, ο:2, γ:1, σ:1. Total = 5 letters.
    # Probabilities: 0.2, 0.4, 0.2, 0.2.
    expected = -(3 * 0.2 * math.log2(0.2) + 0.4 * math.log2(0.4))
    
    text = "λόγος"
    assert abs(calculate_shannon_entropy(text) - expected) < 1e-9
