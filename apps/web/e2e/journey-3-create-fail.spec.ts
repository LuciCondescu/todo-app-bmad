// Story 4.2 — AC8: Journey 3 create-failure flow (inline error + preserved input + Retry).
import { test, expect } from '@playwright/test';
import { truncateTodos } from './_helpers/db.js';

test.describe('Journey 3 — create failure', () => {
  test.beforeEach(async () => {
    await truncateTodos();
    await new Promise((resolve) => setTimeout(resolve, 200));
    await truncateTodos();
  });

  test('first POST fails → inline error + preserved input + Retry succeeds → row appears, input clears + refocuses, error disappears', async ({
    page,
  }) => {
    let postCount = 0;
    await page.route('**/v1/todos', async (route) => {
      if (route.request().method() !== 'POST') {
        await route.continue();
        return;
      }
      postCount += 1;
      if (postCount === 1) {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({
            statusCode: 500,
            error: 'Internal Server Error',
            message: 'boom',
          }),
        });
      } else {
        await route.continue();
      }
    });

    await page.goto('/');

    const input = page.getByRole('textbox', { name: 'Add a todo' });
    await input.fill('Buy milk');
    await input.press('Enter');

    // Within 1s (PRD SC-003 perceived latency), the inline error is visible with
    // the locked copy, the typed text is preserved, and no row has appeared.
    const alert = page.getByRole('alert');
    await expect(alert).toBeVisible({ timeout: 1_000 });
    await expect(alert).toHaveText(/Couldn't save\. Check your connection\./);
    await expect(alert).not.toHaveText(/boom/);
    await expect(input).toHaveValue('Buy milk');
    // No <li> with the todo description exists yet.
    await expect(page.locator('li', { hasText: 'Buy milk' })).toHaveCount(0);

    // Click Retry; second POST passes through to real API and succeeds.
    await alert.getByRole('button', { name: /retry/i }).click();

    // Row appears in the list, input clears, input regains focus, alert disappears.
    await expect(page.locator('li', { hasText: 'Buy milk' })).toBeVisible({ timeout: 2_000 });
    await expect(input).toHaveValue('');
    await expect(input).toBeFocused();
    await expect(page.getByRole('alert')).toHaveCount(0);
  });
});
