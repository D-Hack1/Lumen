// Owner: Nived
import { describe, expect, it } from 'vitest';
import { computeDeltas, delta } from '../compare/delta';
import { halfExtentKm, project, unproject } from '../projection';

describe('polar projection', () => {
  it('round-trips and matches the layer extents', () => {
    for (const [lat, lon] of [[-84.7906, 29.1957], [-89.54, 129], [-80.5, 310], [-86, 0]] as const) {
      const p = project(lat, lon);
      const q = unproject(p.x, p.y);
      expect(q.lat).toBeCloseTo(lat, 6);
      expect(q.lon).toBeCloseTo(lon, 6);
    }
    expect(halfExtentKm(80)).toBeCloseTo(304.0, 0);
    expect(halfExtentKm(85)).toBeCloseTo(151.9, 0);
  });
  it('puts 0 deg E up and 90 deg E right; CY-3 is off both maps', () => {
    expect(project(-85, 0).y).toBeGreaterThan(0);
    expect(Math.abs(project(-85, 0).x)).toBeLessThan(1e-9);
    expect(project(-85, 90).x).toBeGreaterThan(0);
    expect(Math.hypot(project(-69.373, 32.319).x, project(-69.373, 32.319).y)).toBeGreaterThan(halfExtentKm(80));
  });
});

describe('deltas', () => {
  it('propagates +/- by root-sum-square and leaves Tier C exact', () => {
    expect(delta({ value: 60, lo: 56, hi: 64 }, { value: 50, lo: 47, hi: 53 })).toEqual({ value: 10, pm: Math.hypot(4, 3) });
    expect(delta({ value: 60, lo: 60, hi: 60 }, { value: 50, lo: 50, hi: 50 })?.pm).toBe(0);
    expect(delta({ value: null, lo: null, hi: null }, { value: 1, lo: 1, hi: 1 })).toBeNull();
  });
  it('baseline row has no delta', () => {
    const m = (v: number) => ({ value: v, lo: v, hi: v });
    const mk = (id: string, v: number) => ({ scenarioId: id, deltaVsBaseline: {}, result: { metrics: { sunlitPct: m(v), linkPct: m(v), longestNightH: m(v) } } }) as never;
    const d = computeDeltas([mk('A', 50), mk('B', 60)], 'A');
    expect(d.A).toBeNull();
    expect(d.B?.sunlitPct?.value).toBe(10);
  });
});
