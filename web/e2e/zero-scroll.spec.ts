// Owner: Abhinav
// §5.1 zero-scroll check with the worst-case fixture at V1/V2/V3/V4/V4b (+ V1 at 110% zoom as a stress case).
// Per viewport × view: no page scroll; no bento cell overflows except whitelisted scroll containers; Cockpit slot
// heights match the §4 budgets; Mission Bar does not overflow; Fast Lane elements have no transitions.
// Screenshots → e2e/screens/phase-1/<viewport>-<view>.png
import { expect, test, type Page } from '@playwright/test';
import { colBudget, pickCols, pickDensity, sideBudget, slotBudget } from '../src/ui/tokens';

const PHASE = 1;
const VIEWPORTS = [
  { name: 'V1', width: 1920, height: 960 },
  { name: 'V2', width: 1536, height: 754 },
  { name: 'V3', width: 1440, height: 810 },
  { name: 'V4', width: 1280, height: 720 },
  { name: 'V4b', width: 1280, height: 640 },
  { name: 'V1-zoom110', width: Math.round(1920 / 1.1), height: Math.round(960 / 1.1) },
] as const;
const VIEWS = [
  { id: 'cockpit', tab: 'Cockpit' },
  { id: 'compare', tab: 'Compare' },
  { id: 'methodology', tab: 'Methodology' },
] as const;

async function open(page: Page, view: (typeof VIEWS)[number]) {
  await page.goto('/?fixture=worst-case');
  await page.waitForSelector('html[data-ready="true"]');
  if (view.id !== 'cockpit') await page.getByRole('tab', { name: view.tab, exact: false }).first().click();
  await page.waitForSelector(`.app-root[data-view="${view.id}"]`);
  await page.waitForTimeout(250); // let the ≤150 ms view crossfade finish before the screenshot
}

function overflowReport(page: Page) {
  return page.evaluate(() => {
    const de = document.documentElement;
    const page = {
      scrollH: Math.max(de.scrollHeight, document.body.scrollHeight),
      scrollW: Math.max(de.scrollWidth, document.body.scrollWidth),
      innerH: window.innerHeight,
      innerW: window.innerWidth,
    };
    const cells = Array.from(document.querySelectorAll<HTMLElement>('[data-slot], [data-region]'))
      .filter((el) => el.dataset.scroll !== 'allowed')
      .map((el) => ({
        id: el.dataset.slot ?? el.dataset.region!,
        overY: el.scrollHeight - el.clientHeight,
        overX: el.scrollWidth - el.clientWidth,
      }))
      .filter((c) => c.overY > 1 || c.overX > 1);
    const hot = Array.from(document.querySelectorAll<HTMLElement>('[data-hotpath]'))
      .map((el) => ({ el: el.className, t: getComputedStyle(el).transitionDuration, a: el.getAnimations().length }))
      .filter((h) => h.t.split(',').some((d) => parseFloat(d) !== 0) || h.a > 0);
    return { page, cells, hot };
  });
}

for (const vp of VIEWPORTS) {
  test.describe(`${vp.name} ${vp.width}×${vp.height}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    for (const view of VIEWS) {
      test(`${view.id}: zero scroll, no cell overflow`, async ({ page }) => {
        await open(page, view);
        const r = await overflowReport(page);
        await page.screenshot({ path: `e2e/screens/phase-${PHASE}/${vp.name}-${view.id}.png` });

        expect(r.page.scrollH, 'page scrollHeight ≤ innerHeight').toBeLessThanOrEqual(r.page.innerH);
        expect(r.page.scrollW, 'page scrollWidth ≤ innerWidth').toBeLessThanOrEqual(r.page.innerW);
        expect(r.cells, 'cells overflowing their box (non-whitelisted)').toEqual([]);
        expect(r.hot, 'data-hotpath elements with transitions/animations').toEqual([]);
      });
    }

    test('cockpit: slot sizes match §4 budgets', async ({ page }) => {
      await open(page, VIEWS[0]);
      const d = pickDensity(vp.width, vp.height);
      const c = pickCols(vp.width);
      const b = slotBudget[d];
      const s = sideBudget[d];
      const box = (sel: string) => page.locator(sel).first().boundingBox();

      const fixed: [string, number][] = [
        ['[data-region="mission-bar"]', b.missionBar],
        ['[data-slot="answer"]', b.answer],
        ['[data-slot="definitions"]', b.definitions],
        ['[data-slot="analysis"]', b.analysis],
        ['[data-slot="barcode"]', b.barcode],
        ['[data-slot="slip"]', b.slip],
        ['[data-slot="search"]', s.search],
        ['[data-slot="map"]', s.map],
        ['[data-slot="profileBattery"]', s.accordionHeader],
      ];
      for (const [sel, h] of fixed) expect((await box(sel))!.height, sel).toBeCloseTo(h, 0);
      expect((await box('[data-slot="ribbon"]'))!.height, 'ribbon ≥ min').toBeGreaterThanOrEqual(b.ribbonMin);

      // Map is square at its budget (inside the slot's 1 px border)
      const map = (await box('.map-square'))!;
      expect(Math.round(map.width)).toBe(s.map - 2);
      expect(Math.round(map.height)).toBe(s.map - 2);

      // Columns: nominal widths include padding + half gutter
      const cols = colBudget[c];
      const slack = b.pad + b.gutter;
      const left = (await box('[data-col="left"]'))!;
      const right = (await box('[data-col="right"]'))!;
      expect(Math.abs(left.width - cols.left)).toBeLessThanOrEqual(slack);
      expect(Math.abs(right.width - cols.right)).toBeLessThanOrEqual(slack);
    });
  });
}
