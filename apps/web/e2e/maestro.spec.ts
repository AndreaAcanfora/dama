import { expect, test } from '@playwright/test';

test('Maestro loads the trained network and answers a move', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'Maestro' }).click();
  await page.getByRole('button', { name: 'Inizia la partita' }).click();

  await page.locator('[data-square="22"]').click();
  await page.locator('[data-square="18"]').click();
  await expect(page.getByRole('status')).toContainText('Il computer ci pensa');
  // The first move also downloads the runtime and the model.
  await expect(page.getByRole('status')).toContainText('Tocca a te', { timeout: 30_000 });
  await expect(page.locator('.player-top .count')).toHaveText(/1[12]/);
  expect(errors).toEqual([]);
});
