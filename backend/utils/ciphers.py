import string

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

# ATBASH Map
atbash_map = {}
for i in range(22):
    atbash_map[HEBREW_ALPHABET[i]] = HEBREW_ALPHABET[21 - i]
for sofit, base in SOFIT_MAP.items():
    atbash_map[sofit] = atbash_map[base]

# ALBAM Map
albam_map = {}
for i in range(11):
    albam_map[HEBREW_ALPHABET[i]] = HEBREW_ALPHABET[i + 11]
    albam_map[HEBREW_ALPHABET[i + 11]] = HEBREW_ALPHABET[i]
for sofit, base in SOFIT_MAP.items():
    albam_map[sofit] = albam_map[base]

# ATBAH Map
atbah_map = {}
# Units
atbah_map['א'] = 'ט'
atbah_map['ט'] = 'א'
atbah_map['ב'] = 'ח'
atbah_map['ח'] = 'ב'
atbah_map['ג'] = 'ז'
atbah_map['ז'] = 'ג'
atbah_map['ד'] = 'ו'
atbah_map['ו'] = 'ד'

# Tens
atbah_map['י'] = 'צ'
atbah_map['צ'] = 'י'
atbah_map['כ'] = 'פ'
atbah_map['פ'] = 'כ'
atbah_map['ל'] = 'ע'
atbah_map['ע'] = 'ל'
atbah_map['מ'] = 'ס'
atbah_map['ס'] = 'מ'

# Orphaned
atbah_map['ה'] = 'נ'
atbah_map['נ'] = 'ה'

# Hundreds (mapped to themselves as they are not units or tens)
atbah_map['ק'] = 'ק'
atbah_map['ר'] = 'ר'
atbah_map['ש'] = 'ש'
atbah_map['ת'] = 'ת'

for sofit, base in SOFIT_MAP.items():
    atbah_map[sofit] = atbah_map[base]

def _apply_cipher(text: str, cmap: dict) -> str:
    result = []
    for char in text:
        if char in cmap:
            result.append(cmap[char])
        else:
            result.append(char)
    return "".join(result)

def atbash_cipher(text: str) -> str:
    return _apply_cipher(text, atbash_map)

def albam_cipher(text: str) -> str:
    return _apply_cipher(text, albam_map)

def atbah_cipher(text: str) -> str:
    return _apply_cipher(text, atbah_map)

if __name__ == "__main__":
    test_str = "אבגדהוזחטיכלמנסעפצקרשת"
    print("Orig:", test_str)
    print("Atbash:", atbash_cipher(test_str))
    print("Albam:", albam_cipher(test_str))
    print("Atbah:", atbah_cipher(test_str))
