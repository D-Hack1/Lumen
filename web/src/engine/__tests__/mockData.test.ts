// Owner: Nived
// Smoke test: the mock dataset loads through the real loaders and has the shapes the contract promises.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadCatalog } from '../data/catalog';
import { loadLayers } from '../data/layers';
import { dataUrl, fetchJson, checkVersion } from '../data/source';
import { mockScenarioResult } from '../mock/mockResult';

const ROOT = join(__dirname, '..', '..', '..', 'public');

beforeAll(() => {
  globalThis.fetch = (async (url: string) => {
    try {
      const buf = await readFile(join(ROOT, url));
      const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
      return { ok: true, status: 200, json: async () => JSON.parse(buf.toString()), arrayBuffer: async () => ab } as unknown as Response;
    } catch {
      return { ok: false, status: 404 } as unknown as Response;
    }
  }) as typeof fetch;
});

describe('mock dataset', () => {
  it('switches to data-mock by default', () => {
    expect(dataUrl('catalog/sites.json')).toBe('/data-mock/catalog/sites.json');
  });

  it('loads the catalog, including sparklines and a Tier C site', async () => {
    const c = await loadCatalog();
    expect(c.sites.length).toBe(4);
    expect(c.sites.every((s) => s.mock)).toBe(true);
    expect(c.sites.find((s) => s.tier === 'C')?.sigmaSource).toMatch(/smooth/);
    const sp = c.sparklines[c.sites[0].id];
    expect(sp.sunlitPct.length).toBe(400);
    expect(sp.linkPct.length).toBe(400);
  });

  it('loads layers and regions', async () => {
    const l = await loadLayers();
    expect(l.layers.length).toBe(10);
    expect(l.extents?.['85S'].halfExtentKm).toBeLessThan(l.extents!['80S'].halfExtentKm);
    expect(l.regions.length).toBe(3);
  });

  it('ephem.bin size matches its header', async () => {
    const h = await fetchJson<{ count: number; byte_length: number }>('ephem/ephem.json', [1]);
    const buf = await readFile(join(ROOT, 'data-mock/ephem/ephem.bin'));
    expect(buf.length).toBe(h.byte_length);
    expect(h.byte_length).toBe(h.count * 12 * 4);
  });

  it('rejects an unsupported header version', () => {
    expect(() => checkVersion('x', { version: 9 }, [1])).toThrow(/unsupported/);
  });

  it('mock result is fully shaped', async () => {
    const { sites } = await loadCatalog();
    const r = mockScenarioResult(sites[0]);
    expect(r.status).toBe('ready');
    expect(r.series!.sunElevDeg.length).toBe(r.series!.sunUp.length);
    expect(r.windows.length).toBeGreaterThan(0);
    expect(r.metrics!.sunlitPct.lo!).toBeLessThanOrEqual(r.metrics!.sunlitPct.hi!);
    const c = mockScenarioResult(sites.find((s) => s.tier === 'C')!);
    expect(c.metrics!.sunlitPct.lo).toBe(c.metrics!.sunlitPct.hi); // Tier C: no terrain ±
  });
});
