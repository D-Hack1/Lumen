// Owner: Ebin
// Ask LUMEN with REAL data (VITE_LUMEN_DATA=real): the "Why?" button next to a number on Stand here must explain EXACTLY
// the number on screen — same site, array height and window — and must never print a ± the result doesn't have.
// Run from web/: npm run e2e:real   (or: npx playwright test -c e2e/playwright.real.config.ts ask)
import { expect, test } from '@playwright/test';

const tile = (metric: string) => `.lm-nums__tile[data-metric="${metric}"]`;

test.describe('Why? on Stand here explains the numbers on screen', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/#stand-here');
    await page.waitForSelector('.lm-nums__tile', { timeout: 60_000 });
  });

  test('sunlit %: the card quotes the same value as the tile', async ({ page }) => {
    const shown = (await page.locator(`${tile('metric.sunlit')} .lm-nums__value`).innerText()).trim(); // e.g. "43%"
    await page.locator(`${tile('metric.sunlit')} .lm-nums__why`).click();
    const card = page.locator('.ask__card--why').first();
    await expect(card).toContainText('Time in sunlight', { timeout: 30_000 });
    await expect(card).toContainText(`Time in sunlight: ${shown}`);
    await expect(card).toContainText('Same numbers as', { ignoreCase: true });
    await expect(card).toContainText('2 m array');
  });

  test('clearance: the card quotes the tile value and says why there is no ± (σ pending), inventing none', async ({ page }) => {
    const shown = (await page.locator(`${tile('metric.clearance')} .lm-nums__value`).innerText()).split('·')[0].trim(); // "−6.17°"
    await page.locator(`${tile('metric.clearance')} .lm-nums__why`).click();
    const card = page.locator('.ask__card--why').first();
    await expect(card).toContainText('Sun clearance', { timeout: 30_000 });
    await expect(card).toContainText(shown);
    const text = await card.innerText();
    if (/σ pending/.test(text)) expect(text).not.toMatch(/±\s*\d/); // no ± number while σ is pending
    expect(text).toMatch(/derived from the series|from the series/); // the clearance rate is derived, never hard-coded
  });

  test('the card follows the array height you changed', async ({ page }) => {
    await page.getByRole('button', { name: '5 m' }).first().click();
    await page.waitForTimeout(2500);
    await page.locator(`${tile('metric.sunlit')} .lm-nums__why`).click();
    await expect(page.locator('.ask__card--why').first()).toContainText('5 m array', { timeout: 30_000 });
  });

  test('Esc closes the box and the page is unchanged', async ({ page }) => {
    await page.locator(`${tile('metric.link')} .lm-nums__why`).click();
    await expect(page.locator('.ask')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.ask')).toHaveCount(0);
    await expect(page).toHaveURL(/#stand-here$/);
  });
});
