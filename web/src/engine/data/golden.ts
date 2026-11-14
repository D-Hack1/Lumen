// Owner: Nived
// Loader: golden/golden_set{1,2}.json. DRAFT: data_golden.md gives only the content, not the file layout, so only the
// envelope (version, cases[], tolerances) is assumed. Parity tests must skip while `cases` is empty.
import { fetchJson } from './source';

export interface GoldenSet {
  set: 1 | 2;
  cases: unknown[];
  tolerances: { elevation_deg?: number; time_s?: number };
  empty: boolean;
  mock: boolean;
}

export async function loadGolden(set: 1 | 2): Promise<GoldenSet> {
  const j = await fetchJson<{ cases?: unknown[]; tolerances?: GoldenSet['tolerances']; mock?: boolean }>(`golden/golden_set${set}.json`, [1, '1', '1.0.0']);
  const cases = Array.isArray(j.cases) ? j.cases : [];
  return { set, cases, tolerances: j.tolerances ?? {}, empty: cases.length === 0, mock: j.mock === true };
}
