// Owner: Nived
// Single-point answer from lat/lon/UTC/duration/height: Tier A if a curated site matches, else Tier B snap, else Tier C.
// MOCK implementation (N-3): returns fake numbers shaped like the final result.
import { loadCatalog } from './data/catalog';
import { mockQuickAnswer } from './mock/mockResult';
import type { QuickAnswerInput, QuickAnswerResult } from './types';

export async function quickAnswer(input: QuickAnswerInput): Promise<QuickAnswerResult> {
  const { sites } = await loadCatalog();
  return mockQuickAnswer(input, sites);
}
