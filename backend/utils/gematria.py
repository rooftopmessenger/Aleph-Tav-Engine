HEBREW_ALPHABET = [
    'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט', 'י',
    'כ', 'ל', 'מ', 'נ', 'ס', 'ע', 'פ', 'צ', 'ק', 'ר',
    'ש', 'ת'
]

SOFIT_MAP = {
    'ך': 'כ',
    'ם': 'מ',
    'ן': 'נ',
    'ף': 'פ',
    'ץ': 'צ',
}

ABSOLUTE_VALUES = {
    'א': 1, 'ב': 2, 'ג': 3, 'ד': 4, 'ה': 5, 'ו': 6, 'ז': 7, 'ח': 8, 'ט': 9, 'י': 10,
    'כ': 20, 'ל': 30, 'מ': 40, 'נ': 50, 'ס': 60, 'ע': 70, 'פ': 80, 'צ': 90,
    'ק': 100, 'ר': 200, 'ש': 300, 'ת': 400
}

def get_absolute_value(char: str) -> int:
    base_char = SOFIT_MAP.get(char, char)
    return ABSOLUTE_VALUES.get(base_char, 0)

def get_ordinal_value(char: str) -> int:
    base_char = SOFIT_MAP.get(char, char)
    if base_char in HEBREW_ALPHABET:
        return HEBREW_ALPHABET.index(base_char) + 1
    return 0

def digital_root(n: int) -> int:
    if n == 0:
        return 0
    return 1 + (n - 1) % 9

def calculate_gematria(text: str, method: str = "absolute") -> int:
    if method == "absolute":
        return sum(get_absolute_value(c) for c in text)
    elif method == "ordinal":
        return sum(get_ordinal_value(c) for c in text)
    elif method == "reduced":
        # Usually digital root of the sum of the absolute value of each character
        # Actually Mispar Katan Mispari is the digital root of the entire word's absolute value
        abs_val = sum(get_absolute_value(c) for c in text)
        return digital_root(abs_val)
    else:
        raise ValueError(f"Unknown gematria method: {method}")

if __name__ == "__main__":
    test_str = "אבג"
    print("Orig:", test_str)
    print("Absolute:", calculate_gematria(test_str, "absolute"))
    print("Ordinal:", calculate_gematria(test_str, "ordinal"))
    print("Reduced:", calculate_gematria(test_str, "reduced"))

    test_str2 = "יהוה"
    print("Orig:", test_str2)
    print("Absolute:", calculate_gematria(test_str2, "absolute"))
    print("Ordinal:", calculate_gematria(test_str2, "ordinal"))
    print("Reduced:", calculate_gematria(test_str2, "reduced"))
