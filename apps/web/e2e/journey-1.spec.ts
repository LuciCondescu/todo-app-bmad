import { test, expect, type Page } from '@playwright/test';
import { truncateTodos } from './_helpers/db.js';

async function addTodo(page: Page, description: string): Promise<void> {
  const input = page.getByRole('textbox', { name: 'Add a todo' });
  const postResponse = page.waitForResponse(
    (res) => res.url().includes('/v1/todos') && res.request().method() === 'POST' && res.ok(),
  );
  await input.fill(description);
  await input.press('Enter');
  await postResponse;
  await expect(page.getByText(description).first()).toBeVisible({ timeout: 2_000 });
}

test.describe('Journey 1 — create & view', () => {
  test.beforeEach(async () => {
    await truncateTodos();
    // A prior test's torn-down page may have a POST/DELETE in-flight that
    // commits server-side after our truncate returns. Give it a short drain
    // window, then truncate again to catch stragglers.
    await new Promise((resolve) => setTimeout(resolve, 200));
    await truncateTodos();
  });

  test('shows EmptyState on a freshly-migrated DB', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: 'Todos' })).toBeVisible();
    await expect(page.getByText('No todos yet.')).toBeVisible();
  });

  test('typing + Enter lands the row within 1s', async ({ page }) => {
    await page.goto('/');
    await addTodo(page, 'Buy milk');
    await expect(page.getByText('Buy milk')).toBeVisible({ timeout: 1_000 });
  });

  test('persists across reload (FR-011 boundary 1)', async ({ page }) => {
    await page.goto('/');
    await addTodo(page, 'Buy milk');
    await expect(page.getByText('Buy milk')).toBeVisible();
    await page.reload();
    await expect(page.getByText('Buy milk')).toBeVisible();
  });

  test('no horizontal scroll at 320px viewport', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto('/');
    await addTodo(page, 'Buy milk');
    await expect(page.getByText('Buy milk')).toBeVisible();
    const widths = await page.evaluate(() => ({
      doc: document.documentElement.scrollWidth,
      win: window.innerWidth,
    }));
    expect(widths.doc).toBeLessThanOrEqual(widths.win);
  });
});
