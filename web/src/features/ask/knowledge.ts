// Owner: Ebin
// "Explain": a small, deterministic keyword search over web/public/content/knowledge.json (built by
// web/scripts/build-knowledge.mjs from the glossary, the validation report and the plan's decision log).
// No language model and no network: BM25 ranking, light stemming and a short, hand-written synonym list. It can only
// return text that is already in the knowledge file, with its source — so it cannot invent an answer. When nothing
// matches well enough it says so.

export interface KnowledgeEntry {
  id: string;
  kind: 'term' | 'validation' | 'limitation' | 'decision';
  title: string;
  summary: string;
  body: string;
  source: string;
  anchor?: string;
  /** MetricSet keys this entry explains (from the glossary's related_metric_ids). */
  metrics?: string[];
}

export interface KnowledgeHit {
  entry: KnowledgeEntry;
  score: number;
}

const STOP = new Set(['a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'to', 'of', 'in', 'on', 'for', 'and', 'or', 'it', 'this', 'that', 'what', 'why', 'how', 'does', 'do', 'did', 'so', 'me', 'my', 'about', 'mean', 'means', 'explain', 'tell', 'with', 'than', 'big', 'large', 'small', 'much']);

/** What people type → the words the knowledge file actually uses. Kept short so it stays reviewable. */
const SYNONYMS: Record<string, string[]> = {
  '±': ['uncertainty'],
  plusminus: ['uncertainty'],
  error: ['uncertainty'],
  errors: ['uncertainty'],
  bar: ['uncertainty'],
  margin: ['uncertainty', 'margin'],
  sigma: ['uncertainty'],
  σ: ['uncertainty'],
  confidence: ['uncertainty'],
  sunset: ['sun', 'clearance', 'uncertainty'],
  sunrise: ['sun', 'clearance'],
  shadow: ['shadow', 'night'],
  dark: ['night'],
  night: ['night'],
  skimming: ['grazing'],
  graze: ['grazing'],
  light: ['sun'],
  radio: ['dsn', 'link'],
  comms: ['dsn', 'link'],
  contact: ['dsn', 'link'],
  antenna: ['dsn'],
  tilt: ['slope', 'tilt'],
  panel: ['array', 'cosine'],
  solar: ['sun', 'array'],
  crater: ['psr'],
  ice: ['psr'],
  tier: ['fidelity', 'tier'],
  accuracy: ['validation', 'uncertainty'],
  correct: ['validation'],
  verify: ['validation'],
  validated: ['validation'],
  trust: ['validation', 'uncertainty', 'fidelity'],
  why: [],
};

/** lower-case, split on non-letters (keeping ±/σ), drop stop words, strip a plural "s". */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}±]+/gu, ' ')
    .split(' ')
    .filter(Boolean)
    .filter((t) => !STOP.has(t))
    .map((t) => (t.length > 3 && t.endsWith('s') && !t.endsWith('ss') ? t.slice(0, -1) : t));
}

export function expandQuery(query: string): string[] {
  const out: string[] = [];
  for (const t of tokenize(query)) {
    out.push(t);
    for (const s of SYNONYMS[t] ?? []) out.push(s);
  }
  return out;
}

interface Indexed {
  entry: KnowledgeEntry;
  title: Map<string, number>;
  body: Map<string, number>;
  len: number;
}

const counts = (tokens: string[]) => {
  const m = new Map<string, number>();
  for (const t of tokens) m.set(t, (m.get(t) ?? 0) + 1);
  return m;
};

export interface KnowledgeIndex {
  docs: Indexed[];
  df: Map<string, number>;
  avgLen: number;
}

export function buildIndex(entries: readonly KnowledgeEntry[]): KnowledgeIndex {
  const docs: Indexed[] = entries.map((entry) => {
    const title = tokenize(entry.title);
    const body = tokenize(`${entry.summary} ${entry.body}`);
    return { entry, title: counts(title), body: counts(body), len: title.length + body.length };
  });
  const df = new Map<string, number>();
  for (const d of docs) for (const t of new Set([...d.title.keys(), ...d.body.keys()])) df.set(t, (df.get(t) ?? 0) + 1);
  const avgLen = docs.reduce((a, d) => a + d.len, 0) / Math.max(1, docs.length);
  return { docs, df, avgLen };
}

const K1 = 1.4;
const B = 0.7;
const TITLE_BOOST = 3;
/** A query word that IS a word of the entry's title is the strongest signal there is ("uncertainty" → the Uncertainty term). */
const TITLE_MATCH_BONUS = 1.5;
/** Below this the box says "I don't have an answer" instead of showing a weak match. */
export const MIN_SCORE = 1.2;

export function searchKnowledge(index: KnowledgeIndex, query: string, limit = 3): KnowledgeHit[] {
  const q = [...new Set(expandQuery(query))];
  if (q.length === 0) return [];
  const N = index.docs.length;
  const hits: KnowledgeHit[] = [];
  for (const d of index.docs) {
    let score = 0;
    for (const t of q) {
      const tf = (d.title.get(t) ?? 0) * TITLE_BOOST + (d.body.get(t) ?? 0);
      if (!tf) continue;
      const n = index.df.get(t) ?? 0;
      const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
      score += idf * ((tf * (K1 + 1)) / (tf + K1 * (1 - B + (B * d.len) / index.avgLen)));
      if (d.title.has(t)) score += TITLE_MATCH_BONUS;
    }
    if (score >= MIN_SCORE) hits.push({ entry: d.entry, score });
  }
  return hits.sort((a, b) => b.score - a.score || a.entry.id.localeCompare(b.entry.id)).slice(0, limit);
}

/** First sentence-ish chunk, for a compact answer card. */
export function snippet(entry: KnowledgeEntry, max = 220): string {
  const s = entry.summary.trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const stop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('; '));
  return `${stop > 80 ? cut.slice(0, stop + 1) : cut.replace(/\s+\S*$/, '')}…`;
}

// ---- loading (once per page; the file is part of the offline cache)
let cached: Promise<KnowledgeIndex | null> | null = null;

export function loadKnowledge(): Promise<KnowledgeIndex | null> {
  cached ??= (async () => {
    try {
      const b = (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
      const r = await fetch(`${b.replace(/\/$/, '')}/content/knowledge.json`);
      if (!r.ok) return null;
      const j = (await r.json()) as { entries?: KnowledgeEntry[] };
      return j.entries?.length ? buildIndex(j.entries) : null;
    } catch {
      return null;
    }
  })();
  return cached;
}
