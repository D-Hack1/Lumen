// Owner: Nived
// Seam: the shared Compare store (subscribeCompare / getCompare) driven by the scenario store's compareRows.
// Oracle for the numbers: Gowri's golden set 1 (IM-2 sunlit 49.2963 %) and the Blue Ghost fact (Earth always up => link 100 %).
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getCompare, subscribeCompare } from '../compareStore';
import { setDataMode } from '../data/source';
import { DEFAULT_SCENARIO, useScenario, type CompareRow } from '../../state/scenarioStore';
import { PUBLIC, stubFetch } from './helpers';

const EPHEM_BIN = join(PUBLIC, 'data/ephem/ephem.bin');
const GOLDEN = join(PUBLIC, 'data/golden/golden_set1.json');
const run = existsSync(EPHEM_BIN) && statSync(EPHEM_BIN).size > 1_000_000 && existsSync(GOLDEN);
const T0 = Date.parse('2025-03-06T17:28:50Z');

const row = (id: CompareRow['id'], siteId: string, baseline = false): CompareRow => ({
  id, site: { kind: 'site', id: siteId }, landingUtc: T0, panelPreset: 'fourSide', yawDeg: null, tilt: { magnitudeDeg: 0, directionDeg: 0 }, heightM: 2, baseline,
});

function until(pred: () => boolean, ms = 8000): Promise<void> {
  return new Promise((resolve, reject) => {
    if (pred()) return resolve();
    const off = subscribeCompare(() => {
      if (pred()) {
        off();
        clearTimeout(t);
        resolve();
      }
    });
    const t = setTimeout(() => {
      off();
      reject(new Error('timed out waiting for the compare result'));
    }, ms);
  });
}

describe.skipIf(!run)('compare store (real data)', () => {
  const golden = run ? JSON.parse(readFileSync(GOLDEN, 'utf8')).cases[0].metrics : null;
  beforeAll(() => {
    setDataMode('real');
    stubFetch();
    useScenario.setState({ durationDays: 30, compareRows: [] });
  });
  afterAll(() => {
    setDataMode(null);
    useScenario.setState({ compareRows: DEFAULT_SCENARIO.compareRows, durationDays: DEFAULT_SCENARIO.durationDays });
  });

  it('is idle with no rows', async () => {
    subscribeCompare(() => undefined);
    await new Promise((r) => setTimeout(r, 80));
    expect(getCompare().status).toBe('idle');
    expect(getCompare().rows).toEqual([]);
  });

  it('two rows compute once each, with deltas against the baseline and golden-correct numbers', async () => {
    useScenario.setState({ compareRows: [row('A', 'im2_athena', true), row('B', 'blue_ghost_m1')] });
    await until(() => getCompare().status === 'ready' && getCompare().rows.length === 2);
    const c = getCompare();
    expect(c.baselineId).toBe('A');
    expect(c.rows[0].result.metrics!.sunlitPct.value!).toBeCloseTo(golden.sunlitPct.value, 4);
    expect(c.rows[1].result.metrics!.linkPct.value).toBe(100);
    expect(c.rows[1].deltaVsBaseline.linkPct!).toBeCloseTo(100 - golden.earthVisiblePct.value, 3);
    expect(c.rows[0].deltaVsBaseline).toEqual({});
  });

  it('moving the baseline recomputes the deltas with the opposite sign', async () => {
    const before = getCompare().rows[1].deltaVsBaseline.linkPct!;
    useScenario.setState({ compareRows: [row('A', 'im2_athena'), row('B', 'blue_ghost_m1', true)] });
    await until(() => getCompare().baselineId === 'B');
    expect(getCompare().rows[0].deltaVsBaseline.linkPct!).toBeCloseTo(-before, 9);
  });

  it('changes unrelated to the compare rows (persona, view) do not recompute', async () => {
    await new Promise((r) => setTimeout(r, 100));
    const before = getCompare();
    useScenario.setState({ persona: 'educator', view: 'compare' });
    await new Promise((r) => setTimeout(r, 200));
    expect(getCompare()).toBe(before);
    useScenario.setState({ persona: 'planner', view: 'cockpit' });
  });
});
