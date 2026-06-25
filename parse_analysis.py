import re
import numpy as np

# We'll use the backend utils to compute Gematria
import sys
sys.path.append("/app/backend")
from utils.gematria import calculate_gematria

with open("../isaiah40_cryptographic_analysis.txt", "r", encoding="utf-8") as f:
    lines = f.readlines()

verses = {}
current_verse = None

for line in lines:
    verse_match = re.search(r"Analyzing Isa\.40\.(\d+):", line)
    if verse_match:
        current_verse = int(verse_match.group(1))
        verses[current_verse] = []
        continue

    word_match = re.search(r"Word:\s*(.*?)\s*\|\s*Gematria\s*\(Abs\):\s*(\d+)\s*\|\s*Atbash:\s*(.*)", line)
    if word_match and current_verse is not None:
        word = word_match.group(1).strip()
        gematria_abs = int(word_match.group(2))
        atbash = word_match.group(3).strip()

        # Calculate Atbash Gematria
        atbash_gematria = calculate_gematria(atbash, "absolute")

        if word and word != "ס":
            verses[current_verse].append({
                "word": word,
                "abs": gematria_abs,
                "atbash": atbash,
                "atbash_abs": atbash_gematria
            })

all_abs = []
all_atbash_abs = []

for v, words in verses.items():
    for w in words:
        if w["abs"] > 0:  # exclude empty parsed elements
            all_abs.append(w["abs"])
            all_atbash_abs.append(w["atbash_abs"])

mean_abs = np.mean(all_abs)
std_abs = np.std(all_abs)
mean_atbash = np.mean(all_atbash_abs)
std_atbash = np.std(all_atbash_abs)

print(f"Total Words Analyzed: {len(all_abs)}")
print(f"Mean Abs Gematria: {mean_abs:.2f}, Std Dev: {std_abs:.2f}")
print(f"Mean Atbash Gematria: {mean_atbash:.2f}, Std Dev: {std_atbash:.2f}\n")

print("--- Statistical Anomalies (Abs Gematria Z-Score > 2 or < -2) ---")
for v, words in verses.items():
    for w in words:
        if w["abs"] == 0: continue
        z = (w["abs"] - mean_abs) / std_abs
        if abs(z) > 2:
            print(f"Verse {v} | Word: {w['word']} | Abs: {w['abs']} | Z-Score: {z:.2f}")

print("\n--- Statistical Anomalies (Atbash Gematria Z-Score > 2 or < -2) ---")
for v, words in verses.items():
    for w in words:
        if w["abs"] == 0: continue
        z = (w["atbash_abs"] - mean_atbash) / std_atbash
        if abs(z) > 2:
            print(f"Verse {v} | Word: {w['word']} | Atbash: {w['atbash']} | Abs Atbash: {w['atbash_abs']} | Z-Score: {z:.2f}")

print("\n--- Verse Density Comparison ---")
for v in [1, 2, 3, 11]:
    if v in verses:
        v_abs = [w["abs"] for w in verses[v] if w["abs"] > 0]
        if v_abs:
            v_mean = np.mean(v_abs)
            v_sum = np.sum(v_abs)
            print(f"Verse {v} | Avg Gematria/Word: {v_mean:.2f} | Total: {v_sum} | Word Count: {len(v_abs)}")
