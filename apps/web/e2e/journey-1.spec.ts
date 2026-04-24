import { test, expect, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Repo root is three levels up from apps/web/e2e/
const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

// Reset the shared dev DB before each test. `docker compose exec` runs psql
// inside the running postgres container. Credentials come from docker-compose.yml:
// POSTGRES_USER=postgres, POSTGRES_DB=todo_app.
function truncateTodos() {
  execFileSync(
    'docker',
    [
      'compose',
      'exec',
      '-T',
      'postgres',
      'psql',
      '-U',
      'postgres',
      '-d',
      'todo_app',
      '-c',
      'TRUNCATE TABLE todos;',
    ],
    { cwd: REPO_ROOT, stdio: 'inherit' },
  );
}

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
    truncateTodos();
    // A prior test's torn-down page may have a POST/DELETE in-flight that
    // commits server-side after our truncate returns. Give it a short drain
    // window, then truncate again to catch stragglers.
    await new Promise((resolve) => setTimeout(resolve, 200));
    truncateTodos();
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
