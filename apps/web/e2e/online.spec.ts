import { expect, test } from '@playwright/test';

test('two friends play online through an invite link', async ({ browser }) => {
  const host = await (await browser.newContext({ locale: 'it-IT' })).newPage();
  await host.goto('/');
  await host.getByRole('button', { name: /Online con un amico/ }).click();
  await expect(host.getByRole('status')).toHaveText('Aspetto il tuo amico');
  const link = await host.locator('.invite-link').textContent();
  expect(link).toMatch(/#\/play\/[2-9A-Z]{6}$/);

  const guest = await (await browser.newContext({ locale: 'it-IT' })).newPage();
  await guest.goto(link!);
  await expect(guest.getByRole('status')).toHaveText("Tocca all'avversario");
  await expect(host.getByRole('status')).toHaveText('Tocca a te');

  // The guest plays Black, so their board is turned round.
  await host.locator('[data-square="22"]').click();
  await host.locator('[data-square="19"]').click();
  await expect(guest.getByRole('status')).toHaveText('Tocca a te');

  await guest.locator('[data-square="10"]').click();
  await guest.locator('[data-square="14"]').click();
  await expect(host.getByRole('status')).toContainText('Presa obbligatoria');

  // A refresh keeps the guest's seat.
  await guest.reload();
  await expect(guest.getByRole('status')).toHaveText("Tocca all'avversario");

  await host.getByRole('button', { name: 'Abbandona' }).click();
  await host.getByRole('button', { name: 'Sicuro? Tocca di nuovo' }).click();
  await expect(guest.getByRole('status')).toHaveText("L'avversario ha abbandonato");
});
