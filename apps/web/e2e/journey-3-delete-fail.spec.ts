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

test.describe('Journey 3 — delete failure (modal-anchored InlineError + Retry)', () => {
  test.beforeEach(async () => {
    truncateTodos();
    await new Promise((resolve) => setTimeout(resolve, 200));
    truncateTodos();
  });

  test('DELETE 500 → modal stays open with InlineError, Retry succeeds → row removed, modal closes', async ({
    page,
  }) => {
    await page.goto('/');
    await addTodo(page, 'Delete me');

    // Inject a one-shot 500 on DELETE; subsequent calls pass through.
    let deleteCount = 0;
    await page.route('**/v1/todos/*', async (route) => {
      if (route.request().method() === 'DELETE') {
        deleteCount += 1;
        if (deleteCount === 1) {
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

    await page.getByLabel('Delete todo: Delete me').click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Delete' }).click();

    // Modal stays open with the locked delete-failure copy and Retry button.
    await expect(dialog).toBeVisible();
    const alert = dialog.getByRole('alert');
    await expect(alert).toHaveText(/Couldn't delete\. Check your connection\./, { timeout: 1_000 });
    await expect(alert).not.toHaveText(/boom/);
    await expect(dialog.getByRole('button', { name: 'Retry' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Delete' })).toHaveCount(0);

    await dialog.getByRole('button', { name: 'Retry' }).click();

    await expect(dialog).not.toBeVisible();
    await expect(page.getByText('Delete me')).not.toBeVisible({ timeout: 1_000 });
  });
});
