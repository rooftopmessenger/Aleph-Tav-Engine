import asyncio
import numpy as np
from sqlalchemy import select
from backend.ingest_db import Book, Verse, Word
from backend.main import engine, async_sessionmaker, AsyncSession
from backend.utils.ciphers import atbash_cipher
from backend.utils.gematria import calculate_gematria
from backend.utils.normalization import normalize_hebrew_text

async def analyze_isaiah():
    async with async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)() as session:
        # Get Isaiah book ID
        stmt = select(Book).where(Book.osis_code == "Isa")
        result = await session.execute(stmt)
        isaiah = result.scalar_one_or_none()

        if not isaiah:
            print("Isaiah not found in DB.")
            return

        # Get all verses in Isaiah with words
        stmt = select(Verse).where(Verse.book_id == isaiah.id).order_by(Verse.chapter, Verse.verse)
        result = await session.execute(stmt)
        verses = result.scalars().all()

        all_abs = []
        all_atbash_abs = []

        verse_densities = {}

        for verse in verses:
            # We would need joinedload for words, this is just a mockup
            # Let's write the real code that would work with the DB models
            stmt_words = select(Word).where(Word.verse_id == verse.id).order_by(Word.word_index)
            words_res = await session.execute(stmt_words)
            words = words_res.scalars().all()

            v_abs_list = []

            for word in words:
                # Need to use hebrew_segment and clean it up
                clean_word = normalize_hebrew_text(word.hebrew_segment, keep_spaces=False)
                if not clean_word:
                    continue

                g_abs = calculate_gematria(clean_word, "absolute")
                atbash_word = atbash_cipher(clean_word)
                atbash_abs = calculate_gematria(atbash_word, "absolute")

                if g_abs > 0:
                    all_abs.append(g_abs)
                    all_atbash_abs.append(atbash_abs)
                    v_abs_list.append(g_abs)

            if v_abs_list:
                verse_densities[(verse.chapter, verse.verse)] = {
                    "mean": np.mean(v_abs_list),
                    "total": sum(v_abs_list),
                    "count": len(v_abs_list)
                }

        mean_abs = np.mean(all_abs)
        std_abs = np.std(all_abs)

        print(f"Total Words Analyzed in Isaiah: {len(all_abs)}")
        print(f"Mean Abs Gematria: {mean_abs:.2f}, Std Dev: {std_abs:.2f}")

        # Sort verse densities to find highest
        sorted_densities = sorted(verse_densities.items(), key=lambda item: item[1]['mean'], reverse=True)
        print("\nTop 10 Verses by Average Numerical Density (Divine Speech Candidates):")
        for i in range(10):
            if i < len(sorted_densities):
                (chap, v), stats = sorted_densities[i]
                print(f"Isaiah {chap}:{v} | Avg Density: {stats['mean']:.2f}")

if __name__ == "__main__":
    # To run this script, it needs to be placed in a directory where backend can be imported
    # and we run it using asyncio.run(analyze_isaiah())
    pass
