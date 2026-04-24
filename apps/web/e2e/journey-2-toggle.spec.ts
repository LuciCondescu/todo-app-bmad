import { test, expect, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Repo root is three levels up from apps/web/e2e/
const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

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
  await input.fill(description);
  await input.press('Enter');
  await expect(page.getByText(description)).toBeVisible({ timeout: 2_000 });
}

test.describe('Journey 2 — toggle complete/incomplete', () => {
  test.beforeEach(() => truncateTodos());

  test('3 seeded todos all render in the Active section', async ({ page }) => {
    await page.goto('/');
    await addTodo(page, 'T1');
    await addTodo(page, 'T2');
    await addTodo(page, 'T3');
    await expect(page.getByRole('heading', { level: 2, name: 'Completed' })).not.toBeVisible();
    await expect(page.getByRole('listitem')).toHaveCount(3);
  });

  test('clicking checkbox moves the row to Completed with strike-through + 60% opacity', async ({
    page,
  }) => {
    await page.goto('/');
    await addTodo(page, 'T1');
    await addTodo(page, 'T2');
    await addTodo(page, 'T3');

    const firstCheckbox = page.getByLabelText('Mark complete: T1');
    await firstCheckbox.click();

    await expect(page.getByRole('heading', { level: 2, name: 'Completed' })).toBeVisible({
      timeout: 300,
    });

    // The description span inside the completed row — locate via the Completed section.
    const completedDesc = page
      .locator('section')
      .filter({ has: page.locator('h2', { hasText: 'Completed' }) })
      .locator('li')
      .first()
      .locator('span.flex-1');
    await expect(completedDesc).toHaveCSS('opacity', '0.6');
    await expect(completedDesc).toHaveCSS('text-decoration-line', 'line-through');
  });

  test('toggled row survives page reload (persistence + section assignment)', async ({ page }) => {
    await page.goto('/');
    await addTodo(page, 'Persist me');
    await page.getByLabelText('Mark complete: Persist me').click();
    await expect(page.getByRole('heading', { level: 2, name: 'Completed' })).toBeVisible({
      timeout: 300,
    });

    await page.reload();
    await expect(page.getByRole('heading', { level: 2, name: 'Completed' })).toBeVisible();
    await expect(page.getByLabelText('Mark incomplete: Persist me')).toBeVisible();
  });

  test('re-clicking the checkbox returns the row to Active', async ({ page }) => {
    await page.goto('/');
    await addTodo(page, 'Reversible');
    await page.getByLabelText('Mark complete: Reversible').click();
    await expect(page.getByRole('heading', { level: 2, name: 'Completed' })).toBeVisible({
      timeout: 300,
    });

    await page.getByLabelText('Mark incomplete: Reversible').click();
    await expect(page.getByRole('heading', { level: 2, name: 'Completed' })).not.toBeVisible({
      timeout: 300,
    });
    await expect(page.getByLabelText('Mark complete: Reversible')).toBeVisible();
  });

  test('toggle works at 320px viewport with no horizontal scroll (FR-009)', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto('/');
    await addTodo(page, 'Narrow');
    await page.getByLabelText('Mark complete: Narrow').click();
    await expect(page.getByRole('heading', { level: 2, name: 'Completed' })).toBeVisible({
      timeout: 300,
    });

    const widths = await page.evaluate(() => ({
      doc: document.documentElement.scrollWidth,
      win: window.innerWidth,
    }));
    expect(widths.doc).toBeLessThanOrEqual(widths.win);
  });
});
