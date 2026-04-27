import { test, expect, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

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
  const postResponse = page.waitForResponse(
    (res) => res.url().includes('/v1/todos') && res.request().method() === 'POST' && res.ok(),
  );
  await input.fill(description);
  await input.press('Enter');
  await postResponse;
  await expect(page.getByText(description).first()).toBeVisible({ timeout: 2_000 });
}

test.describe('Journey 3 — toggle failure (row-anchored InlineError + Retry)', () => {
  test.beforeEach(async () => {
    truncateTodos();
    await new Promise((resolve) => setTimeout(resolve, 200));
    truncateTodos();
  });

  test('PATCH 500 → row reverts, row-anchored InlineError shows; Retry succeeds → row moves to Completed', async ({
    page,
  }) => {
    await page.goto('/');
    await addTodo(page, 'Buy milk');

    // Inject a one-shot 500 on PATCH; subsequent calls pass through.
    let patchCount = 0;
    await page.route('**/v1/todos/*', async (route) => {
      if (route.request().method() === 'PATCH') {
        patchCount += 1;
        if (patchCount === 1) {
          await route.fulfill({
            status: 500,
            contentType: 'application/json',
            body: JSON.stringify({
              statusCode: 500,
              error: 'Internal Server Error',
              message: 'boom',
            }),
          });
          return;
        }
      }
      await route.continue();
    });

    await page.getByLabel('Mark complete: Buy milk').click();

    // Within 1s, the row reverts to Active and the InlineError is visible.
    const alert = page.getByRole('alert');
    await expect(alert).toHaveText(/Couldn't save\. Check your connection\./, { timeout: 1_000 });
    await expect(alert).not.toHaveText(/boom/);
    await expect(page.getByLabel('Mark complete: Buy milk')).toBeVisible();
    await expect(alert.getByRole('button', { name: 'Retry' })).toBeVisible();

    await alert.getByRole('button', { name: 'Retry' }).click();

    await expect(page.getByRole('heading', { level: 2, name: 'Completed' })).toBeVisible();
    await expect(page.getByLabel('Mark incomplete: Buy milk')).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
  });
});
