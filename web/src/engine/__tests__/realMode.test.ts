// Owner: Nived
// Every data loader against the REAL files in public/data (VITE_LUMEN_DATA=real). Skipped if real data is absent.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadDsn } from '../data/dsn';
import { loadEphem } from '../data/ephem';
import { loadMask } from '../data/masks';
import { loadLayers } from '../data/layers';
import { loadPad } from '../data/pad';
import { loadPsr } from '../data/psr';
import { loadSigma } from '../data/sigma';
import { loadDispersion } from '../data/dispersion';
import { setDataMode } from '../data/source';
import { PUBLIC, stubFetch } from './helpers';

const have = existsSync(join(PUBLIC, 'data/catalog/sites.json'));
beforeAll(() => { stubFetch(); setDataMode('real'); });
afterAll(() => setDataMode(null));

describe.skipIf(!have)('real-mode loaders', () => {
  it('ephem', async () => { const e = await loadEphem(); expect(e.count).toBeGreaterThan(1000); expect(e.cadenceMs).toBe(3600_000); });
  it('dsn', async () => { expect((await loadDsn()).stations.length).toBe(3); });
  for (const id of ['cy3_shiv_shakti', 'im2_athena', 'shackleton_ridge']) {
    it(`mask ${id}`, async () => { await loadMask(id); });
  }
  it('pad im2_athena', async () => { await loadPad('im2_athena'); });
  it('layers', async () => { const l = await loadLayers(); expect(l).toBeTruthy(); });
  it('psr raster', async () => {
    const r = await loadPsr();
    expect(r.sizePx[0]).toBe(2534);
    expect(Number.isNaN(r.distanceKm(10_000, 0))).toBe(true);
    let finite = 0, zero = 0;
    for (let x = -300; x <= 300; x += 5) for (let y = -300; y <= 300; y += 5) {
      const d = r.distanceKm(x, y);
      if (Number.isFinite(d)) { finite++; if (d === 0) zero++; }
    }
    console.log(`psr: ${finite} finite samples, ${zero} inside a PSR`);
    expect(finite).toBeGreaterThan(1000);
  });
  it('sigma: not produced yet (404)', async () => { await expect(loadSigma('im2_athena')).rejects.toThrow(/404/); });
  it('dispersion: not produced yet (404)', async () => { await expect(loadDispersion('im2_athena')).rejects.toThrow(/404/); });
});
