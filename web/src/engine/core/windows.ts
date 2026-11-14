// Owner: Nived
// Run-length encoding of visibility windows (Python twin: reference/windows.py). A true run is
// [first true sample, first false sample); a run that touches either end of the range is flagged partial.
import type { WindowRecord, WindowType } from '../types';

export interface RawWindow {
  type: WindowType;
  startMs: number;
  endMs: number;
  peakElevationDeg: number;
  partialStart: boolean;
  partialEnd: boolean;
}

export function mergeWindows(type: WindowType, times: ArrayLike<number>, visible: ArrayLike<boolean>, elevationsDeg: ArrayLike<number>): RawWindow[] {
  if (times.length !== visible.length || times.length !== elevationsDeg.length || times.length < 2) {
    throw new RangeError('times, visibility, and elevations must have matching length >= 2');
  }
  const out: RawWindow[] = [];
  let start: number | null = null;
  for (let i = 0; i < visible.length; i++) {
    if (visible[i] && start === null) start = i;
    if (start !== null && (!visible[i] || i === visible.length - 1)) {
      const stop = i;
      if (stop > start) {
        let peak = -Infinity;
        for (let k = start; k <= stop; k++) peak = Math.max(peak, elevationsDeg[k]);
        out.push({ type, startMs: times[start], endMs: times[stop], peakElevationDeg: peak, partialStart: start === 0, partialEnd: stop === visible.length - 1 });
      }
      start = null;
    }
  }
  return out;
}

export const windowHours = (w: RawWindow): number => (w.endMs - w.startMs) / 3_600_000;

/** Convert to the public `WindowRecord` (± and [lo-hi] stay null until the uncertainty passes exist). */
export function toWindowRecord(w: RawWindow): WindowRecord {
  const h = windowHours(w);
  return {
    type: w.type, start: w.startMs, end: w.endMs, startPmMs: null, endPmMs: null,
    durationH: { value: h, lo: null, hi: null }, peakElevDeg: w.peakElevationDeg,
    flags: { grazing: false, partialStart: w.partialStart, partialEnd: w.partialEnd },
  };
}
