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

test.describe('Journey 2 — delete with modal confirmation', () => {
  test.beforeEach(async () => {
    truncateTodos();
    await new Promise((resolve) => setTimeout(resolve, 200));
    truncateTodos();
  });

  test('clicking delete icon opens the modal with locked copy and Cancel focused', async ({
    page,
  }) => {
    await page.goto('/');
    await addTodo(page, 'Delete me');

    await page.getByLabel('Delete todo: Delete me').click();

    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Delete this todo?' })).toBeVisible();
    await expect(page.getByText('This cannot be undone.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cancel' })).toBeFocused();
  });

  test('Escape closes the modal and the row remains', async ({ page }) => {
    await page.goto('/');
    await addTodo(page, 'Keep me');
    await page.getByLabel('Delete todo: Keep me').click();

    await page.keyboard.press('Escape');

    await expect(page.getByRole('dialog')).not.toBeVisible();
    await expect(page.getByText('Keep me')).toBeVisible();
  });

  test('Cancel button closes the modal and the row remains', async ({ page }) => {
    await page.goto('/');
    await addTodo(page, 'Keep me');
    await page.getByLabel('Delete todo: Keep me').click();

    await page.getByRole('button', { name: 'Cancel' }).click();

    await expect(page.getByRole('dialog')).not.toBeVisible();
    await expect(page.getByText('Keep me')).toBeVisible();
  });

  test('clicking Delete removes the row and closes the modal', async ({ page }) => {
    await page.goto('/');
    await addTodo(page, 'Delete me');
    await page.getByLabel('Delete todo: Delete me').click();

    await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();

    // Row disappears (optimistic removal) within 300ms.
    await expect(page.getByText('Delete me')).not.toBeVisible({ timeout: 300 });
    await expect(page.getByRole('dialog')).not.toBeVisible();
  });

  test('deleted row does not reappear after reload (persistence)', async ({ page }) => {
    await page.goto('/');
    await addTodo(page, 'Persisted delete');
    await page.getByLabel('Delete todo: Persisted delete').click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByText('Persisted delete')).not.toBeVisible({ timeout: 1_000 });

    await page.reload();

    await expect(page.getByText('No todos yet.')).toBeVisible();
    await expect(page.getByText('Persisted delete')).not.toBeVisible();
  });

  test('at 320px viewport, modal width is viewport - 32px and buttons are ≥44px tall', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto('/');
    await addTodo(page, 'Narrow delete');
    await page.getByLabel('Delete todo: Narrow delete').click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    const dialogBox = await dialog.boundingBox();
    expect(dialogBox).not.toBeNull();
    // CSS: max-w-[400px] w-[calc(100vw-32px)] → at 320px viewport, width is 288px.
    expect(dialogBox!.width).toBeLessThanOrEqual(288);

    const cancel = page.getByRole('button', { name: 'Cancel' });
    const del = page.getByRole('dialog').getByRole('button', { name: 'Delete' });
    const cancelBox = await cancel.boundingBox();
    const delBox = await del.boundingBox();
    expect(cancelBox!.height).toBeGreaterThanOrEqual(44);
    expect(delBox!.height).toBeGreaterThanOrEqual(44);
  });
});
