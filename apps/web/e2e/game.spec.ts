import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const square = (page: Page, n: number) => page.locator(`[data-square="${n}"]`);

async function move(page: Page, from: number, to: number) {
  await square(page, from).click();
  await square(page, to).click();
}

test('two players on one phone: compulsory capture removes a piece', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Due giocatori/ }).click();
  await expect(page.getByRole('status')).toHaveText('Muove il bianco');

  await move(page, 22, 19);
  await expect(page.getByRole('status')).toHaveText('Muove il nero');
  await move(page, 10, 14);
  await expect(page.getByRole('status')).toContainText('Presa obbligatoria');

  // A quiet move is refused while a capture is available.
  await move(page, 21, 17);
  await expect(page.getByRole('status')).toContainText('Muove il bianco');

  await move(page, 19, 10);
  await expect(page.locator('.player-top .count')).toHaveText('11');
});

test('against the computer: it answers and undo returns to my turn', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Principiante' }).click();
  await page.getByRole('button', { name: 'Inizia la partita' }).click();
  await expect(page.getByRole('status')).toHaveText('Tocca a te');

  await move(page, 22, 18);
  await expect(page.getByRole('status')).toContainText('Tocca a te', { timeout: 10_000 });
  await expect(page.locator('.sq-last')).toHaveCount(2);

  await page.getByRole('button', { name: 'Annulla mossa' }).click();
  await expect(page.getByRole('button', { name: 'Annulla mossa' })).toBeDisabled();
  await expect(page.locator('.sq-last')).toHaveCount(0);
});

test('the board fits a phone screen without horizontal scroll', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Due giocatori/ }).click();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
