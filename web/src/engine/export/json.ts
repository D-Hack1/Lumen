// Owner: Nived
// JSON export (header block + payload). STUB (N-3): real round-trip at N-9.
import type { ScenarioResult } from '../types';
import type { ExportKind } from './csv';

export function exportJson(r: ScenarioResult, kind: ExportKind = 'windows'): string {
  const header = { site: r.meta?.siteId ?? null, tier: r.meta?.tierBadge ?? null, sigmaSource: r.meta?.sigmaSource ?? null,
    definitions: r.meta?.definitionsSummary ?? null, dataVersions: r.meta?.dataVersions ?? {}, mock: r.meta?.mock ?? false };
  return JSON.stringify({ header, [kind]: kind === 'windows' ? r.windows : r.metrics }, null, 2);
}
