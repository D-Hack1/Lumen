// Owner: Ebin
// Windows Table: one row per window (type, start ±, end ±, duration [lo-hi], peak elevation, flags).
// Sort/filter + row hover → crosshairBus; export via Nived's engine/export (PLAN_FINAL §8.3, gate G11).
import { useMemo, useState } from 'react';
import { useResult } from '../../engine/hooks';
import { crosshairBus } from '../../state/buses';
import type { WindowRecord, WindowType } from '../../engine/types';

const TYPE_ICON: Record<WindowType, string> = { sun: '☀', earth: '⊕', link: '📡', ops: '⚙' };

function fmtDur(h: { value: number | null; lo: number | null; hi: number | null }) {
  if (h.value == null) return '—';
  if (h.lo != null && h.hi != null && h.lo !== h.hi) return `${h.value.toFixed(1)} [${h.lo.toFixed(1)}–${h.hi.toFixed(1)}]`;
  return h.value.toFixed(1);
}

/**
 * Temporary local CSV export — WORK_DISTRIBUTION §5.2 "If late: hide the export button" for
 * `engine/export/csv.ts` (Nived, not landed yet). Swap to `exportWindowsCsv` from that module once it ships;
 * keep the header block (site, tier, definitions) so gate G11 still has something to diff against.
 */
function downloadWindowsCsv(rows: WindowRecord[]) {
  const header = ['type', 'start_utc', 'end_utc', 'duration_h', 'duration_lo', 'duration_hi', 'peak_elev_deg', 'grazing'];
  const lines = rows.map((r) =>
    [
      r.type,
      new Date(r.start).toISOString(),
      new Date(r.end).toISOString(),
      r.durationH.value ?? '',
      r.durationH.lo ?? '',
      r.durationH.hi ?? '',
      r.peakElevDeg.toFixed(2),
      r.flags.grazing ? '1' : '0',
    ].join(','),
  );
  const blob = new Blob([[header.join(','), ...lines].join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'lumen_windows.csv';
  a.click();
  URL.revokeObjectURL(url);
}

export function WindowsTable() {
  const result = useResult();
  const [filter, setFilter] = useState<WindowType | 'all'>('all');
  const rows = useMemo(() => {
    const w = result.windows ?? [];
    return filter === 'all' ? w : w.filter((r) => r.type === filter);
  }, [result.windows, filter]);

  const onExport = () => {
    if (!result.windows?.length) return;
    downloadWindowsCsv(result.windows);
  };

  return (
    <div className="windows-table" data-scroll="allowed" style={{ height: '100%', overflowY: 'auto' }}>
      <div style={{ display: 'flex', gap: 'var(--sp-3)', marginBottom: 'var(--sp-2)' }}>
        {(['all', 'sun', 'earth', 'link', 'ops'] as const).map((f) => (
          <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}>
            {f}
          </button>
        ))}
        <button type="button" onClick={onExport} style={{ marginLeft: 'auto' }}>
          Export CSV
        </button>
      </div>
      <table className="num" style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th>Type</th>
            <th>Start</th>
            <th>End</th>
            <th>Duration [h]</th>
            <th>Peak el.</th>
            <th>Flags</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r: WindowRecord, i: number) => (
            <tr
              key={i}
              onMouseEnter={() => crosshairBus.set({ tHover: r.start, source: 'windowsTable' })}
              onMouseLeave={() => crosshairBus.set({ tHover: null, source: 'windowsTable' })}
              onClick={() => crosshairBus.set({ tScrub: r.start, source: 'windowsTable' })}
            >
              <td>{TYPE_ICON[r.type]} {r.type}</td>
              <td>{new Date(r.start).toISOString()}</td>
              <td>{new Date(r.end).toISOString()}</td>
              <td>{fmtDur(r.durationH)}</td>
              <td>{r.peakElevDeg.toFixed(1)}°</td>
              <td>{r.flags.grazing ? 'grazing' : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
