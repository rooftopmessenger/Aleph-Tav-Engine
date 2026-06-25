# Aleph-Tav Engine - AI Handoff Documentation

This is a living handoff document tracking the setup, database design, ingestion progress, backend API endpoints, and frontend user interface of the **Aleph-Tav Engine** (interlinear Hebrew/English Bible platform).

---

## 1. Project Overview & Rules Configuration

*   **Project Name**: Aleph-Tav Engine
*   **Technologies**: Python 3.13+, FastAPI, Next.js App Router (React 19), TypeScript, PostgreSQL / SQLAlchemy 2.0.
*   **Active Rules Configured**: Copied 6 best practices rulebooks to [ai_skills/active_rules/](file:///c:/Users/rooft/Desktop/Aleph-Tav/ai_skills/active_rules):
    *   `python-pro.md` — Python 3.12+ style guidelines and async standards.
    *   `fastapi-pro.md` — Async-first FastAPI API development, Pydantic V2.
    *   `typescript-pro.md` — Strict type safety, advanced generics.
    *   `nextjs-app-router.md` — Next.js 14+ layouts, SSR/RSC rendering modes.
    *   `react-best-practices.md` — Vercel React rendering and bundle optimization.
    *   `postgres-best-practices.md` — Supabase database design, index strategies, connection pool setups.

---

## 2. Relational Database Schema

We declared SQLAlchemy 2.0 models inside `backend/ingest_db.py` representing:

1.  **`Book` (`books` table)**: Seeding lookup metadata for the 39 Protestant Old Testament books.
2.  **`StrongsLexicon` (`strongs_lexicon` table)**: Hebrew and Aramaic definitions, lemmas, transliterations, and HTML formatting definitions (mapping standard Strong's H1-H8674 and prefix codes H9000-H9010).
3.  **`Verse` (`verses` table)**: OSIS verse keys, coordinates, clean English KJV translations, and reconstructed spacing-preserved Hebrew verses.
4.  **`Word` (`words` table)**: Word-by-word morpheme segments with BHS sort indices, morphology codes, part of speech details, English glosses, and Strong's number foreign key mapping.
5.  **`User` (`users` table)**: Study accounts containing emails and hashed passwords.
6.  **`SavedNote` (`saved_notes` table)**: Study notes containing text, visibility toggles, and spatial coordinates (`x_position`, `y_position`) for rendering on the visual canvas.

---

## 3. Database Ingestion Pipeline

The complete database seeding script is located at [backend/ingest_db.py](file:///c:/Users/rooft/Desktop/Aleph-Tav/backend/ingest_db.py) and executed using `uv run python ingest_db.py`.

### Ingestion Performance Summary (SQLite Test Run)
*   **Target database**: Local SQLite database [backend/aleph_tav.db](file:///c:/Users/rooft/Desktop/Aleph-Tav/backend/aleph_tav.db) (58.0 MB).
*   **Total Elapsed Time**: **95.88s**
*   **Ingestion breakdown**:
    1.  **Step 1: Books Seeding** — Seeded 39 books (0.12s)
    2.  **Step 2: Lexicon Seeding** — Seeded 9,345 entries from `stepbible-tbesh.json` (1.47s)
    3.  **Step 3: Verses Seeding** — Seeded 23,145 KJV verses from `KJV-OT-mapped-to-BHS.csv` (4.06s)
    4.  **Step 4: Interlinear Words** — Seeded 426,581 segments from `BHSA-8-layer-interlinear.csv.zip` (78.93s)
    5.  **Step 5: Hebrew Reconstruction** — Completed spacing-preserved Hebrew reconstructions for 23,144 verses (11.28s)
*   **Translation Text Cleaning**: Step 3 filters standard HTML tags (e.g. `<sup>`, `</sup>`, `<i>`), empty placeholders `()` or `( )`, and double spaces from KJV text before storing in the database.

---

## 4. FastAPI Backend Layer

The backend code is defined at [backend/main.py](file:///c:/Users/rooft/Desktop/Aleph-Tav/backend/main.py) and runs in the `uv` virtual environment.

### Features Built & Resolved Bugs:
*   **Pydantic V2 Schemas**: Serializers built for `BookSchema`, `StrongsLexiconSchema`, `WordSchema`, `VerseSchema`, `UserAuthSchema`, `TokenSchema`, `SavedNoteResponseSchema`, and `SavedNoteCreateSchema`.
*   **CORS Configuration**: Fully handles preflight requests by allowing origins `http://localhost:3000` and `http://127.0.0.1:3000`. Also disabled trailing slash redirects (`redirect_slashes=False`) on the `FastAPI` instance to ensure preflight `OPTIONS` requests are never redirected (which drops CORS headers).
*   **N+1 & Async Lazy Loading Bug Fix**: Resolved a critical `MissingGreenlet` error during Pydantic response serialization. Eager loads both the `user` and `verse` relationships using `joinedload(SavedNote.user), joinedload(SavedNote.verse)` on all note retrieval, saving, and updating endpoints.
*   **Authentication & Hashing**: Secure password hashing via `bcrypt` (with missing imports fixed) and JWT-token generation.

### API Endpoints:
*   `GET /health` — Health check endpoint.
*   `GET /api/verses/{osis_id}` — Returns the interlinear verse with fully aligned word segments and morphology.
*   `GET /api/lexicon/{strongs_number}` — Returns the normalized Strong's lexicon details.
*   `POST /api/auth/signup` — Sign up a new user account.
*   `POST /api/auth/login` — Sign in and return a JWT access token.
*   `GET /api/auth/me` — Retrieve the current logged-in user.
*   `GET /api/notes` — Retrieve user notes.
*   `GET /api/notes/{verse_id}` — Retrieve all public notes and the user's private notes for a verse.
*   `POST /api/notes` — Create a new study note.
*   `PATCH /api/notes/{note_id}` — Update note coordinates and text.
*   `POST /api/ai/pattern-search` — Accept a user prompt and optional book/chapter filters, perform semantic/keyword scripture retrieval, and stream linguistic pattern analysis back via Ollama. Adjusts the system prompt based on the chosen `search_mode`.

---

## 5. Next.js Frontend UI Layer

The frontend application is set up at [frontend/](file:///c:/Users/rooft/Desktop/Aleph-Tav/frontend/) using Next.js 16 (App Router), TypeScript, and Tailwind CSS.

### File Layout:
*   `frontend/src/lib/api.ts` — TypeScript API client interfaces and fetch methods mapping to backend Pydantic models. Realigned `API_BASE_URL` fallback to `http://127.0.0.1:8000` to prevent localhost IPv6 resolution conflicts.
*   `frontend/src/components/VerseSelector.tsx` — Interactive client component with search input and quick navigation links.
*   `frontend/src/components/InterlinearReader.tsx` — Main interlinear reader component with RTL Hebrew word layouts, SBL transliteration, morphology/Strong's badges, and interactive side panel displaying clicked Strong's dictionary definitions.
*   `frontend/src/components/TheologicalNotes.tsx` — Custom study notes module. Connects notes dynamically on a D3/Framer-Motion Mind Map canvas. Avoids stacking by assigning randomized coordinates to missing note positions. Displays all public notes (including the user's own) in the Community feed. Fires a floating spring-animated toast badge on success.
*   `frontend/src/components/AIPatternSearch.tsx` — Chat-like client component allowing real-time Hebrew linguistic queries.
    *   **Search Modes Selector**: Allows selecting between `Standard Search`, `Divine Speech & Lexical Analysis`, and `Prophetic Voice` to trigger specialized LLM analysis.
    *   **Theory Compiler**: Collates pinned query responses, prompts the backend to generate a 4-level Pardes theological synthesis (Peshat, Remez, Derash, Sod), and exports the results as a Obsidian-ready `.md` file with Dataview YAML metadata.
*   `frontend/src/app/layout.tsx` — App root layout with customized SEO metadata and optimized Geist fonts with preload disabled.

---

## 6. Playwright End-to-End Testing

We set up browser testing at [frontend/tests/e2e-flow.spec.ts](file:///c:/Users/rooft/Desktop/Aleph-Tav/frontend/tests/e2e-flow.spec.ts).
*   **Logic**: Tests homepage loading, Auth Modal signup, automatic login fallback on duplicate email registers (intercepted at HTTP level), reading page note-taking, and note creation/visibility assertions.
*   **Command**: `npx playwright test tests/e2e-flow.spec.ts --headed`

---

## 7. Execution Instructions

To start the developer services concurrently:

1.  **Start Backend API**:
    ```bash
    cd backend
    uv run uvicorn main:app --reload --port 8000
    ```
2.  **Start Frontend UI**:
    ```bash
    cd frontend
    npm run dev
    ```
    Open your browser to `http://localhost:3000`.
