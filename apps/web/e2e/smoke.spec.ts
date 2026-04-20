import { test, expect } from '@playwright/test';

test.describe('smoke', () => {
  test('web app renders Todos header', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: 'Todos' })).toBeVisible();
  });

  test('api /healthz reports ok with db ok', async ({ request }) => {
    const res = await request.get('http://localhost:3000/healthz');
    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok', db: 'ok' });
  });
});
