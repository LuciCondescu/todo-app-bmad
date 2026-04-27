// Story 5.2 — cross-browser matrix smoke (Chromium + Firefox + WebKit).
//
// NOT in default CI — the existing `.github/workflows/ci.yml` runs Chromium
// only (line ~66 installs `chromium` with `--with-deps`). Run locally
// pre-release via `npm run test:browsers --workspace apps/web` after a
// one-time `npx playwright install firefox webkit --with-deps`. The decision
// (matrix runs locally pre-release, not on every push) is recorded in
// `docs/browser-matrix.md`.
//
// Default `npm run test:e2e` is narrowed via `--project=chromium` in
// `apps/web/package.json` so the existing PR-flow E2E continues to run
// Chromium-only against the existing journey-1/2/3 specs (this matrix spec
// also runs there, on Chromium only — Playwright excludes the firefox /
// webkit projects when `--project=chromium` is passed).

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

async function runJourney1(page: Page) {
  await page.goto('/');
  await expect(page.getByText('No todos yet.')).toBeVisible();
  await addTodo(page, 'buy milk');
  await expect(page.getByText('buy milk')).toBeVisible({ timeout: 1_000 });
  // SC-004 — zero horizontal scroll AT THIS VIEWPORT.
  const widthsAfterCreate = await page.evaluate(() => ({
    doc: document.documentElement.scrollWidth,
    win: window.innerWidth,
  }));
  expect(widthsAfterCreate.doc).toBeLessThanOrEqual(widthsAfterCreate.win);

  await page.reload();
  await expect(page.getByText('buy milk')).toBeVisible();
  // FR-011 persistence regression guard re-verified at this browser × viewport.
  // SC-004 also re-asserted post-reload.
  const widthsAfterReload = await page.evaluate(() => ({
    doc: document.documentElement.scrollWidth,
    win: window.innerWidth,
  }));
  expect(widthsAfterReload.doc).toBeLessThanOrEqual(widthsAfterReload.win);
}

test.describe('Cross-browser matrix — FR-009 / SC-004', () => {
  test.describe.configure({ mode: 'serial' });

  test.describe('at 320×800', () => {
    test.use({ viewport: { width: 320, height: 800 } });

    test.beforeEach(() => {
      truncateTodos();
    });

    test('Journey 1 — create + reload persistence + no h-scroll', async ({ page }) => {
      await runJourney1(page);
    });

    test('modal initial focus + 44×44 Cancel + tab-reachability at 320px (WebKit = iOS Safari proxy)', async ({
      page,
      browserName,
    }) => {
      await page.goto('/');
      await addTodo(page, 'target me');
      await page.getByLabel('Delete todo: target me').click();
      await expect(page.getByRole('dialog')).toBeVisible();

      const cancelBox = await page.getByRole('button', { name: 'Cancel' }).boundingBox();
      expect(cancelBox).not.toBeNull();
      expect(cancelBox!.height).toBeGreaterThanOrEqual(44);
      expect(cancelBox!.width).toBeGreaterThanOrEqual(44);

      // Cancel is initially focused on modal open (Story 3.5 invariant — verified
      // across all three engines).
      await expect(page.getByRole('button', { name: 'Cancel' })).toBeFocused();

      // Modal width at 320px viewport: max-w-[400px] w-[calc(100vw-32px)] →
      // expect ≤ 288px (320-32) and < 400px (cap doesn't kick in here).
      const dialogBox = await page.getByRole('dialog').boundingBox();
      expect(dialogBox).not.toBeNull();
      expect(dialogBox!.width).toBeLessThanOrEqual(288);

      // Tab-traversal across the modal's two buttons.
      //
      // KNOWN PLATFORM LIMITATION: WebKit / Safari (and iOS Safari) by default
      // skip non-form-control elements during Tab traversal — buttons land in
      // the focus chain only when the user explicitly enables "Press Tab to
      // highlight each item on a webpage" in System Preferences. This is a
      // real-world UX gap that the matrix correctly surfaces; we DO NOT mask
      // it by adding `tabindex="0"` to the buttons. The Story-3.5 dialog's
      // focus-trap (which prevents Tab from leaving the dialog) is verified
      // structurally — the surrounding modal mechanics are covered by
      // `journey-2-delete.spec.ts` against Chromium in CI.
      //
      // Documented in `docs/browser-matrix.md` as a manual-verification
      // checkpoint for iOS Safari accessibility.
      if (browserName === 'webkit') {
        return;
      }

      await page.keyboard.press('Tab');
      await expect(page.getByRole('dialog').getByRole('button', { name: 'Delete' })).toBeFocused();
      await page.keyboard.press('Shift+Tab');
      await expect(page.getByRole('button', { name: 'Cancel' })).toBeFocused();
    });
  });

  test.describe('at 1024×800', () => {
    test.use({ viewport: { width: 1024, height: 800 } });

    test.beforeEach(() => {
      truncateTodos();
    });

    test('Journey 1 — create + reload persistence + no h-scroll', async ({ page }) => {
      await runJourney1(page);
    });

    test('modal width caps at 400px on a wide viewport', async ({ page }) => {
      await page.goto('/');
      await addTodo(page, 'wide modal');
      await page.getByLabel('Delete todo: wide modal').click();
      await expect(page.getByRole('dialog')).toBeVisible();
      const dialogBox = await page.getByRole('dialog').boundingBox();
      expect(dialogBox).not.toBeNull();
      // max-w-[400px] cap kicks in at viewports ≥ 432px.
      expect(dialogBox!.width).toBe(400);
    });
  });
});
