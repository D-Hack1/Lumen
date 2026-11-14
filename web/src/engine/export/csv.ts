// Owner: Nived
// CSV export with header block (site, tier, σ source, definitions, data versions). STUB (N-3): real round-trip at N-9.
import type { ScenarioResult } from '../types';

export type ExportKind = 'windows' | 'metrics';

export function exportHeaderLines(r: ScenarioResult): string[] {
  const m = r.meta;
  return [
    `# site: ${m?.siteId ?? ''}`,
    `# tier: ${m?.tierBadge ?? ''}`,
    `# sigma_source: ${m?.sigmaSource ?? ''}`,
    `# definitions: ${m?.definitionsSummary ?? ''}`,
    `# data_versions: ${JSON.stringify(m?.dataVersions ?? {})}`,
    ...(m?.mock ? ['# MOCK DATA'] : []),
  ];
}

export function exportCsv(r: ScenarioResult, kind: ExportKind = 'windows'): string {
  const head = exportHeaderLines(r);
  if (kind === 'windows') {
    const rows = r.windows.map((w) =>
      [w.type, new Date(w.start).toISOString(), w.startPmMs ?? '', new Date(w.end).toISOString(), w.endPmMs ?? '',
       w.durationH.value ?? '', w.durationH.lo ?? '', w.durationH.hi ?? '', w.peakElevDeg.toFixed(3),
       Object.entries(w.flags).filter(([, v]) => v).map(([k]) => k).join('|')].join(','));
    return [...head, 'type,start_utc,start_pm_ms,end_utc,end_pm_ms,duration_h,duration_lo_h,duration_hi_h,peak_elev_deg,flags', ...rows].join('\n') + '\n';
  }
  const rows = Object.entries(r.metrics ?? {}).map(([k, v]) => `${k},${JSON.stringify(v)}`);
  return [...head, 'metric,value', ...rows].join('\n') + '\n';
}
