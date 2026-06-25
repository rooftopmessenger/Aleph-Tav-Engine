export interface StrongsLexicon {
  strongs_number: string;
  lemma: string;
  transliteration: string | null;
  pronunciation: string | null;
  part_of_speech: string | null;
  gloss: string | null;
  definition: string | null;
}

export interface Word {
  id: number;
  verse_id: number;
  bhs_sort: number;
  word_index: number;
  hebrew_segment: string;
  transliteration: string | null;
  strongs_number: string | null;
  morph_code: string | null;
  morph_detail: string | null;
  english_gloss: string | null;
  lexicon: StrongsLexicon | null;
  gematria_absolute?: number | null;
  gematria_ordinal?: number | null;
  gematria_reduced?: number | null;
  atbash?: string | null;
  albam?: string | null;
  atbah?: string | null;
}

export interface Verse {
  id: number;
  book_id: number;
  chapter: number;
  verse: number;
  osis_id: string;
  hebrew_text: string | null;
  english_text: string;
  words: Word[];
  direction: string;
}

export interface User {
  id: number;
  email: string;
  created_at: string;
}

export interface Token {
  access_token: string;
  token_type: string;
}

export interface SavedNote {
  id: number;
  user_id: number;
  verse_id: number;
  note_text: string;
  created_at: string;
  is_public: boolean;
  x_position?: number | null;
  y_position?: number | null;
  user?: User;
  verse?: {
    id: number;
    osis_id: string;
    english_text: string;
  };
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

/**
 * Fetches an interlinear verse from the backend.
 * Uses Next.js data cache for caching (ISR).
 */
export async function fetchVerse(osisId: string): Promise<Verse> {
  const res = await fetch(`${API_BASE_URL}/api/verses/${osisId}`, {
    next: { revalidate: 3600 }, // Cache for 1 hour
  });

  if (!res.ok) {
    if (res.status === 404) {
      throw new Error(`Verse '${osisId}' not found.`);
    }
    throw new Error(`Failed to fetch verse '${osisId}': ${res.statusText}`);
  }

  return res.json();
}

/**
 * Fetches an entire chapter of interlinear verses from the backend.
 */
export async function fetchChapter(book: string, chapter: number): Promise<Verse[]> {
  const res = await fetch(`${API_BASE_URL}/api/chapters/${book}/${chapter}`, {
    next: { revalidate: 3600 }, // Cache for 1 hour
  });

  if (!res.ok) {
    if (res.status === 404) {
      throw new Error(`Chapter '${book} ${chapter}' not found.`);
    }
    throw new Error(`Failed to fetch chapter '${book} ${chapter}': ${res.statusText}`);
  }

  return res.json();
}

/**
 * Fetches a Strong's lexicon entry from the backend.
 */
export async function fetchLexicon(strongsNumber: string): Promise<StrongsLexicon> {
  const res = await fetch(`${API_BASE_URL}/api/lexicon/${strongsNumber}`, {
    next: { revalidate: 86400 }, // Cache for 24 hours
  });

  if (!res.ok) {
    if (res.status === 404) {
      throw new Error(`Lexicon entry '${strongsNumber}' not found.`);
    }
    throw new Error(`Failed to fetch lexicon entry '${strongsNumber}': ${res.statusText}`);
  }

  return res.json();
}

// Auth API Methods
export async function signupUser(email: string, password: string): Promise<Token> {
  const res = await fetch(`${API_BASE_URL}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to signup.' }));
    throw new Error(err.detail || 'Failed to signup.');
  }

  return res.json();
}

export async function loginUser(email: string, password: string): Promise<Token> {
  const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to login.' }));
    throw new Error(err.detail || 'Failed to login.');
  }

  return res.json();
}

export async function fetchAuthMe(token: string): Promise<User> {
  const res = await fetch(`${API_BASE_URL}/api/auth/me`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });

  if (!res.ok) {
    throw new Error('Unauthorized');
  }

  return res.json();
}

// Notes API Methods
export async function fetchAllNotes(token: string): Promise<SavedNote[]> {
  const res = await fetch(`${API_BASE_URL}/api/notes`, {
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    return [];
  }

  return res.json();
}

export async function fetchSavedNote(verseId: number, token?: string | null): Promise<SavedNote[]> {
  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  const res = await fetch(`${API_BASE_URL}/api/notes/${verseId}`, {
    headers,
  });

  if (!res.ok) {
    return [];
  }

  return res.json();
}

export async function saveVerseNote(
  verseId: number, 
  noteText: string, 
  token: string, 
  isPublic: boolean = false,
  xPosition?: number,
  yPosition?: number
): Promise<SavedNote> {
  const res = await fetch(`${API_BASE_URL}/api/notes`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ 
      verse_id: verseId, 
      note_text: noteText, 
      is_public: isPublic,
      x_position: xPosition,
      y_position: yPosition
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to save note.' }));
    throw new Error(err.detail || 'Failed to save note.');
  }

  return res.json();
}

export async function updateSavedNote(
  noteId: number,
  token: string,
  updates: { note_text?: string; is_public?: boolean; x_position?: number | null; y_position?: number | null }
): Promise<SavedNote> {
  const res = await fetch(`${API_BASE_URL}/api/notes/${noteId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(updates),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to update note.' }));
    throw new Error(err.detail || 'Failed to update note.');
  }

  return res.json();
}

export interface Book {
  id: number;
  osis_code: string;
  name: string;
  testament: string;
}

export interface CryptographySearchQueryParams {
  gematria_absolute?: number | null;
  gematria_ordinal?: number | null;
  gematria_reduced?: number | null;
  atbash?: string | null;
  albam?: string | null;
  atbah?: string | null;
  limit?: number;
}

export interface CryptographySearchResponseWord {
  id: number;
  verse_id: number;
  bhs_sort: number;
  word_index: number;
  hebrew_segment: string;
  transliteration: string | null;
  strongs_number: string | null;
  morph_code: string | null;
  morph_detail: string | null;
  english_gloss: string | null;
  gematria_absolute: number | null;
  gematria_ordinal: number | null;
  gematria_reduced: number | null;
  atbash: string | null;
  albam: string | null;
  atbah: string | null;
  verse_osis: string | null;
  verse_text: string | null;
}

export async function fetchBooks(): Promise<Book[]> {
  const res = await fetch(`${API_BASE_URL}/api/books`);
  if (!res.ok) {
    throw new Error('Failed to fetch books');
  }
  return res.json();
}

export async function searchCryptography(params: CryptographySearchQueryParams): Promise<CryptographySearchResponseWord[]> {
  const query = new URLSearchParams();
  if (params.gematria_absolute !== undefined && params.gematria_absolute !== null) query.append('gematria_absolute', String(params.gematria_absolute));
  if (params.gematria_ordinal !== undefined && params.gematria_ordinal !== null) query.append('gematria_ordinal', String(params.gematria_ordinal));
  if (params.gematria_reduced !== undefined && params.gematria_reduced !== null) query.append('gematria_reduced', String(params.gematria_reduced));
  if (params.atbash) query.append('atbash', params.atbash);
  if (params.albam) query.append('albam', params.albam);
  if (params.atbah) query.append('atbah', params.atbah);
  if (params.limit !== undefined) query.append('limit', String(params.limit));

  const res = await fetch(`${API_BASE_URL}/api/search/cryptography?${query.toString()}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to search cryptography.' }));
    throw new Error(err.detail || 'Failed to search cryptography.');
  }
  return res.json();
}

export interface WordExtended extends Word {
  gematria_absolute: number | null;
  gematria_ordinal: number | null;
  gematria_reduced: number | null;
  atbash: string | null;
  albam: string | null;
  atbah: string | null;
  verse_osis: string | null;
  verse_text: string | null;
  verse_english: string | null;
}

export async function fetchWordDetail(wordId: number): Promise<WordExtended> {
  const res = await fetch(`${API_BASE_URL}/api/words/${wordId}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch word with ID ${wordId}`);
  }
  return res.json();
}


