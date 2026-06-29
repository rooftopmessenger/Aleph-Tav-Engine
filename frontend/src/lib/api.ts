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
  entropy_score?: number | null;
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
  atbash_match?: StrongsLexicon | null;
  albam_match?: StrongsLexicon | null;
  atbah_match?: StrongsLexicon | null;
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

export interface CryptographyResponse {
  text: string;
  atbash: string;
  albam: string;
  atbah: string;
  gematria_absolute: number;
  gematria_ordinal: number;
  gematria_reduced: number;
}

export interface BatchCryptographyResponse {
  results: CryptographyResponse[];
}

export async function fetchBatchCryptography(texts: string[]): Promise<BatchCryptographyResponse> {
  const res = await fetch(`${API_BASE_URL}/api/cryptography/analyze/batch`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ texts }),
  });
  if (!res.ok) {
    throw new Error('Failed to fetch batch cryptography analysis');
  }
  return res.json();
}

export interface ChapterAggregation {
  chapter: number;
  mean_entropy: number;
  mean_gematria: number;
}

export interface WordAnalytics {
  word_index: number;
  hebrew_segment: string;
  english_gloss: string | null;
  gematria_absolute: number | null;
  entropy_score: number;
}

export interface VerseAnalytics {
  osis_id: string;
  english_text: string;
  hebrew_text: string | null;
  words: WordAnalytics[];
}

export async function fetchBookAnalytics(bookId: number): Promise<ChapterAggregation[]> {
  const res = await fetch(`${API_BASE_URL}/api/analytics/book/${bookId}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch book analytics for book ID ${bookId}`);
  }
  return res.json();
}

export async function fetchVerseAnalytics(osisId: string): Promise<VerseAnalytics> {
  const res = await fetch(`${API_BASE_URL}/api/analytics/verse/${osisId}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch verse analytics for OSIS ID ${osisId}`);
  }
  return res.json();
}

export interface StructureComparison {
  id: number;
  osis_id: string;
  object_name: string;
  measurement_type: string;
  physical_value: number;
  gematria_value: number;
  ratio: number;
  english_text: string;
}

export async function fetchStructureComparison(): Promise<StructureComparison[]> {
  const res = await fetch(`${API_BASE_URL}/api/analytics/compare-structure`);
  if (!res.ok) {
    throw new Error('Failed to fetch structural correlation data');
  }
  return res.json();
}

export interface DeltaDimensionDetails {
  object_name: string;
  measurement_type: string;
  value: number;
}

export interface DeltaTarget {
  osis_id: string;
  english_text: string;
  hebrew_text: string | null;
  gematria_sum: number;
  entropy_score: number;
  dimensions: DeltaDimensionDetails[];
}

export interface DeltaValue {
  abs_diff: number;
  pct_diff: number;
}

export interface DimensionDelta {
  measurement_type: string;
  val_a: number;
  val_b: number;
  abs_diff: number;
  pct_diff: number;
  scaling_factor: number | null;
  scaling_type: 'direct' | 'inverse' | 'undefined';
}

export interface DeltaMetrics {
  gematria: DeltaValue;
  entropy: DeltaValue;
  dimensions: DimensionDelta[];
}

export interface DeltaResponse {
  target_a: DeltaTarget;
  target_b: DeltaTarget;
  deltas: DeltaMetrics;
}

export async function fetchDeltaAnalysis(targetA: string, targetB: string): Promise<DeltaResponse> {
  const res = await fetch(`${API_BASE_URL}/api/analytics/delta?target_a=${targetA}&target_b=${targetB}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch delta analysis between ${targetA} and ${targetB}`);
  }
  return res.json();
}

export interface ElsLexiconEntry {
  strongs_number: string;
  lemma: string;
  transliteration: string | null;
  gloss: string | null;
  definition: string | null;
}

export interface ElsMatch {
  word: string;
  start_index: number;
  skip: number;
  indices: number[];
  lexicon_entries: ElsLexiconEntry[];
}

export interface ElsResponse {
  osis_id: string;
  hebrew_text: string | null;
  consonants: string;
  matches: ElsMatch[];
}

export async function fetchElsAnalysis(osisId: string): Promise<ElsResponse> {
  const res = await fetch(`${API_BASE_URL}/api/analytics/els/${osisId}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch ELS analysis for OSIS ID ${osisId}`);
  }
  return res.json();
}

export interface TemurahMatch {
  strongs_number: string;
  lemma: string;
  transliteration: string | null;
  gloss: string | null;
  definition: string | null;
}

export interface TemurahResponse {
  word: string;
  normalized: string;
  permutation: string;
  matches: TemurahMatch[];
}

export interface TopologyNode {
  id: string;
  osis_id: string;
  text: string;
  similarity: number;
}

export interface TopologyLink {
  source: string;
  target: string;
  value: number;
}

export interface TopologyResponse {
  nodes: TopologyNode[];
  links: TopologyLink[];
}

export async function fetchTemurahAnalysis(word: string): Promise<TemurahResponse> {
  const res = await fetch(`${API_BASE_URL}/api/temurah/${encodeURIComponent(word)}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch Temurah permutations for word ${word}`);
  }
  return res.json();
}

export async function fetchTopologyGraph(query: string, k: number = 15): Promise<TopologyResponse> {
  const res = await fetch(`${API_BASE_URL}/api/topology/search?q=${encodeURIComponent(query)}&k=${k}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch Semantic Topology for query: ${query}`);
  }
  return res.json();
}
