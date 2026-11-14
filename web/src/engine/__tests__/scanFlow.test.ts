// Owner: Nived
// Seam: startScan(params, onUpdate) -> { cancel, done }  (the call the Scan panel makes). Real mode, real ephemeris.
// Contract (R3 D-15): stage 1 first (all provisional), then stage 2 refines the TOP 10, ranked best-first throughout.
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startScan } from '../compare/scan';
import { setDataMode } from '../data/source';
import type { ScanParams, ScanResult } from '../types';
import { PUBLIC, stubFetch } from './helpers';

const EPHEM_BIN = join(PUBLIC, 'data/ephem/ephem.bin');
const run = existsSync(EPHEM_BIN) && statSync(EPHEM_BIN).size > 1_000_000;
const T0 = Date.parse('2025-03-06T17:28:50Z');
const params: ScanParams = { mode: 'dates', baseLandingUtc: T0, plusMinusDays: 15, siteIds: ['im2_athena'], durationDays: 14 };

describe.skipIf(!run)('startScan (real data)', () => {
  beforeAll(() => {
    setDataMode('real');
    stubFetch();
  });
  afterAll(() => setDataMode(null));

  it('emits stage 1 (all provisional), then stage 2 with the top 10 refined, ending done', async () => {
    const updates: ScanResult[] = [];
    const final = await startScan(params, (r) => updates.push(r)).done;
    expect(updates[0].stage).toBe(1);
    expect(updates[0].done).toBe(false);
    expect(updates[0].candidates.length).toBe(31);
    expect(updates[0].candidates.every((c) => c.provisional)).toBe(true);
    expect(final.stage).toBe(2);
    expect(final.done).toBe(true);
    const refined = final.candidates.filter((c) => !c.provisional);
    expect(refined.length).toBe(10);
    expect(final.candidates.length).toBe(31);
    expect(new Set(final.candidates.map((c) => c.landingUtc)).size).toBe(31); // no candidate lost or duplicated
  });

  it('every emission is ranked best-first, and stage 2 arrives progressively', async () => {
    const updates: ScanResult[] = [];
    await startScan(params, (r) => updates.push(r)).done;
    for (const u of updates) {
      const vi = u.candidates.map((c) => c.viabilityIndex);
      expect(vi).toEqual([...vi].sort((a, b) => b - a));
    }
    const stage2 = updates.filter((u) => u.stage === 2);
    expect(stage2.length).toBeGreaterThan(1); // streamed, not one lump
    const counts = stage2.map((u) => u.candidates.filter((c) => !c.provisional).length);
    expect(counts).toEqual([...counts].sort((a, b) => a - b)); // the refined count only grows
  });

  it('cancel() stops further updates (a superseded scan never overwrites a newer one)', async () => {
    const updates: ScanResult[] = [];
    const h = startScan(params, (r) => {
      updates.push(r);
      if (r.stage === 1) h.cancel();
    });
    await h.done.catch(() => undefined);
    await new Promise((r) => setTimeout(r, 300));
    expect(updates.length).toBe(1); // stage 1 was delivered, and nothing after the cancel
    expect(updates[0].stage).toBe(1);
  });
});
