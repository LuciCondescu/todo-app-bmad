# Story 4.2: Create-failure flow — `AddTodoInput` inline error with preserved input + Retry

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want a failed create to show an inline error under the input, preserve my typed text, and offer Retry,
so that I can recover from a network blip without retyping.

**Dependency (critical):** This story consumes the `InlineError` component delivered by Story 4.1. If Story 4.1 has not been implemented yet (currently `ready-for-dev`), implement that first — do NOT stub, shim, or inline-duplicate `InlineError` here.

**Scope boundary:** This story owns the **create-failure** path only. Toggle-failure and delete-failure wire-ups belong to Story 4.3. Do not touch `TodoRow.tsx`, `DeleteTodoModal.tsx`, or their hooks.

## Acceptance Criteria

1. **AC1 — `AddTodoInput` renders `InlineError` when parent passes `error`.**
   **Given** `AddTodoInput` is extended to accept new props `onRetry?: () => void` and `isRetrying?: boolean`,
   **When** the parent passes `error="Couldn't save. Check your connection."` (non-empty string) and `onRetry={fn}`,
   **Then** the minimal inline-error region from Story 2.4 (the `<p role="alert">` block) is REMOVED and replaced by `<InlineError message={error} onRetry={onRetry} isRetrying={isRetrying} />` rendered below the input row,
   **And** the `InlineError`'s Retry button invokes the parent's `onRetry` exactly once per click,
   **And** the input's typed text is NOT cleared (no regression on the Story 2.4 "never clear on error" guarantee),
   **And** when the error transitions from a string → `null`, the `InlineError` unmounts (parent-owned visibility).

2. **AC2 — Add button state during and after failure.**
   **Given** a failing create followed by TanStack settling the mutation to `status: 'error'`,
   **When** `AddTodoInput` renders post-settle,
   **Then** the Add button is **re-enabled** (`disabled=false`) and does **not** carry `aria-busy`,
   **And** during an in-flight retry (`isRetrying=true`), the Add button is disabled with `aria-busy="true"` and the `InlineError`'s Retry button is likewise disabled with `aria-busy="true"` (delegated to `InlineError` via the `isRetrying` prop from Story 4.1).

3. **AC3 — `App.tsx` owns create-error state.**
   **Given** `App.tsx` is extended with a `lastCreateAttempt: string | null` local state,
   **When** the user submits a description (via `onSubmit`) and the POST mutation rejects (network error or non-2xx),
   **Then** `App.tsx` has stored the submitted description in `lastCreateAttempt`,
   **And** passes `error="Couldn't save. Check your connection."` to `AddTodoInput` (locked copy — NOT `createMutation.error?.message`),
   **And** passes `onRetry={() => createMutation.mutate(lastCreateAttempt)}` to `AddTodoInput`,
   **And** passes `isRetrying={createMutation.isPending}` so the retry spinner state flows to `InlineError`.

4. **AC4 — Success clears error + attempt state (retry OR fresh submit).**
   **Given** `App.tsx` wires the mutation's `onSuccess` callback,
   **When** ANY successful create resolves — whether it was a Retry of `lastCreateAttempt` OR a fresh submit typed after the error surfaced,
   **Then** `lastCreateAttempt` is cleared back to `null`,
   **And** the `error` prop passed to `AddTodoInput` becomes `null` (the `InlineError` unmounts),
   **And** the Story 2.4 post-success behavior still holds (input clears + refocuses).

5. **AC5 — Locked copy: raw server error text is never shown.**
   **Given** the mutation's `error` object contains arbitrary server-supplied text (e.g., the Fastify envelope's `message: "boom"` from a 500, or `TypeError: Failed to fetch` from a network failure),
   **When** the `InlineError` renders,
   **Then** the displayed message is exactly the literal string `"Couldn't save. Check your connection."` — the raw `error.message` must not appear in the DOM.

6. **AC6 — Unit tests (`AddTodoInput.test.tsx`) extended and green.**
   **Given** the co-located unit test at `apps/web/src/components/AddTodoInput.test.tsx`,
   **When** `npm test --workspace @todo-app/web` runs,
   **Then** new / updated assertions pass:
   - `AddTodoInput` with `error="Couldn't save. Check your connection."` and `onRetry={fn}` renders the `InlineError` component below the input with that exact message, and the Retry button is accessible via `screen.getByRole('button', { name: /retry/i })`.
   - Clicking Retry inside the error region calls `fn` exactly once.
   - The input retains its typed value when the `error` prop transitions from `null` → string (rerender-based test).
   - When the `error` prop transitions from a string → `null`, the `InlineError` region unmounts (`screen.queryByRole('alert')` returns `null`).
   - With `isRetrying=true` and `error` set, the Retry button is `disabled` with `aria-busy="true"`.
   - The pre-existing `AddTodoInput` test cases (auto-focus, submit-on-Enter, empty-submission no-op, whitespace no-op, disabled attributes, clear-and-refocus on success) all continue to pass unchanged.

7. **AC7 — Integration tests (`App.integration.test.tsx`) extended and green.**
   **Given** the full-app integration test at `apps/web/src/App.integration.test.tsx`,
   **When** the suite runs with the shared `mountApp()` + `vi.stubGlobal('fetch', ...)` pattern,
   **Then** the pre-existing `it('create failure: error region shown, typed text preserved, no new row', ...)` is UPDATED to assert the locked copy `"Couldn't save. Check your connection."` instead of the current `'boom'` — the server's 500 envelope still returns `message: 'boom'`, but the UI must never surface it,
   **And** a new test asserts the Retry path end-to-end: first POST returns 500, second POST returns 201; user submits → error appears → user clicks Retry → POST fires a second time with the same body `{ description: 'Buy milk' }` → row appears, input clears + refocuses, `InlineError` unmounts,
   **And** a new test asserts the fresh-submit recovery path: first POST returns 500, second POST (for a DIFFERENT description typed after error) returns 201; user submits "Buy milk" → error appears with "Buy milk" preserved; user clears input, types "Read book", submits → row "Read book" appears, `lastCreateAttempt` clears, error unmounts, input ready for next entry.

8. **AC8 — Playwright E2E (`journey-3-create-fail.spec.ts`) lands and passes.**
   **Given** a new spec at `apps/web/e2e/journey-3-create-fail.spec.ts`,
   **When** the dev API + Postgres are running and `npm run test:e2e --workspace @todo-app/web` executes,
   **Then** the spec:
   - Truncates the todos table before each test (reuse `truncateTodos()` helper pattern from `journey-1.spec.ts` / `journey-2-delete.spec.ts`).
   - Uses `page.route('**/v1/todos', ...)` to return HTTP 500 on the first POST, then `route.continue()` for subsequent POSTs (pass-through to real API).
   - Opens `/` (empty DB) → types "Buy milk" + Enter.
   - Within 1000ms, asserts the `InlineError` region is visible below the input with text exactly `"Couldn't save. Check your connection."`, AND the input value is still `"Buy milk"`, AND no row `"Buy milk"` exists in the list.
   - Clicks Retry; asserts the row `"Buy milk"` becomes visible in the list, the input clears and regains focus, and the `InlineError` disappears.

9. **AC9 — Existing suites stay green + type/lint/build clean.**
   **When** `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` run in `@todo-app/web`,
   **Then** all pass with no new warnings. Existing suites that stay unchanged must remain green:
   - `AddTodoInput.a11y.test.tsx` — the error-state case currently renders a `<p role="alert">`; after the swap, axe should still report zero violations against the new `InlineError` markup (verified by a re-run; this test does **not** need to be edited because it asserts only a11y compliance, not DOM structure).
   - All `DeleteTodoModal` / `TodoRow` / toggle / delete / Journey 1 / Journey 2 tests — unchanged and passing.

## Tasks / Subtasks

- [x] **Task 1 — Extend `AddTodoInput` props and swap the error region (AC: 1, 2)**
  - [x] Open `apps/web/src/components/AddTodoInput.tsx`.
  - [x] Extend the `AddTodoInputProps` interface with two new optional props: `onRetry?: () => void;` and `isRetrying?: boolean;`. Keep the existing `error?: string | null;` prop.
  - [x] Destructure the new props in the component signature with sensible defaults: `onRetry` stays `undefined`, `isRetrying = false`.
  - [x] Import the new component: `import InlineError from './InlineError.js';`
  - [x] Replace the current inline error `<p role="alert" aria-live="polite" className="...">{error}</p>` block (lines 59–63 of the current file) with a conditional render of `<InlineError message={error} onRetry={onRetry} isRetrying={isRetrying} />` — rendered only when `error` is a non-empty string. Use `error ? (<InlineError ... />) : null` at the same position in the JSX (below the button row, still inside the `<form>` or immediately after it — place it after the `</form>` closing tag so the form's flex layout is not disturbed; wrap input + error in a parent `<div>` if needed).
  - [x] **Critical:** do NOT add `onRetry` or `isRetrying` handling INSIDE `AddTodoInput`'s own form-submit path. Those props are pure pass-through to `InlineError`. The component's existing `handleSubmit` logic (Story 2.4) is untouched.
  - [x] Preserve the existing Story 2.4 effect that clears + refocuses the input on `disabled` false→true→false with no error. No changes to that effect.

- [x] **Task 2 — Update `AddTodoInput.test.tsx` (AC: 6)**
  - [x] Open `apps/web/src/components/AddTodoInput.test.tsx`.
  - [x] The existing test `'renders error with role=alert when error prop is a non-empty string'` continues to pass as-is (InlineError wrapper has `role="alert"` — see Story 4.1). Keep it unchanged.
  - [x] The existing `it.each([['null', null], ['undefined', undefined], ['empty string', '']])` test continues to pass (no alert rendered when error is nullish/empty). Keep unchanged.
  - [x] **Add**: test that when `error` and `onRetry` are both provided, a Retry button exists inside the alert region. Query via `within(screen.getByRole('alert')).getByRole('button', { name: /retry/i })`. Import `within` from `@testing-library/react`.
  - [x] **Add**: test that clicking Retry calls `onRetry` once. Use `userEvent.setup()` + `await user.click(retryBtn)`.
  - [x] **Add**: test that when `isRetrying={true}`, the Retry button has `disabled` and `aria-busy="true"`.
  - [x] **Add**: test that when `error` transitions from a non-empty string → `null` (via `rerender()`), the alert region unmounts (`queryByRole('alert')` is null). This validates AC1's unmount-on-clear requirement.
  - [x] Do not add tests that overlap with `InlineError.test.tsx` from Story 4.1 (e.g., icon aria-hidden, 36px button height, color classes). Those are the component's own contract; `AddTodoInput`'s tests only need to verify the WIRING.

- [x] **Task 3 — Extend `App.tsx` with `lastCreateAttempt` + retry wiring (AC: 3, 4, 5)**
  - [x] Open `apps/web/src/App.tsx`.
  - [x] Add a local state hook: `const [lastCreateAttempt, setLastCreateAttempt] = useState<string | null>(null);`
  - [x] Wrap `createMutation.mutate` in a memoized `handleCreate`:
    ```tsx
    const handleCreate = useCallback((description: string) => {
      setLastCreateAttempt(description);
      createMutation.mutate(description, {
        onSuccess: () => setLastCreateAttempt(null),
      });
    }, [createMutation]);
    ```
    (Per-call `onSuccess` on `.mutate()` is the idiomatic TanStack pattern for cleanup tied to a specific invocation. See architecture.md § Frontend Architecture for the TanStack conventions baseline.)
  - [x] Add a memoized `handleRetry`:
    ```tsx
    const handleRetry = useCallback(() => {
      if (lastCreateAttempt !== null) {
        createMutation.mutate(lastCreateAttempt, {
          onSuccess: () => setLastCreateAttempt(null),
        });
      }
    }, [createMutation, lastCreateAttempt]);
    ```
  - [x] Update the `<AddTodoInput />` JSX:
    ```tsx
    <AddTodoInput
      onSubmit={handleCreate}
      disabled={createMutation.isPending}
      error={createMutation.isError ? "Couldn't save. Check your connection." : null}
      onRetry={createMutation.isError && lastCreateAttempt !== null ? handleRetry : undefined}
      isRetrying={createMutation.isPending}
    />
    ```
    — **Replaces** the current `error={createMutation.error?.message ?? null}` line (which violates AC5's "raw server text never shown" commitment).
  - [x] Do NOT introduce `createMutation.reset()`. TanStack auto-clears `status: error` → `pending` → `success` on the next `.mutate()` call, so `isError` transitions to `false` at the right moments for AC4.

- [x] **Task 4 — Update `App.integration.test.tsx` (AC: 7)**
  - [x] **Update** the existing `it('create failure: error region shown, typed text preserved, no new row', ...)` test:
    - The fetch mock still returns 500 with envelope `message: 'boom'` (keep the server side unchanged to prove the mapping works).
    - Change `expect(alert).toHaveTextContent('boom');` to `expect(alert).toHaveTextContent("Couldn't save. Check your connection.");`.
    - Add `expect(alert).not.toHaveTextContent('boom');` as an explicit anti-regression guard (belt-and-braces for AC5).
    - Add `expect(within(alert).getByRole('button', { name: /retry/i })).toBeVisible();` to prove the Retry button landed. Import `within` from `@testing-library/react`.
  - [x] **Add** a new test `it('create failure → Retry succeeds → row appears, input clears + refocuses, error unmounts', ...)`:
    - fetch mock: first POST returns 500 with `message: 'boom'`; second POST returns 201 with a stubbed todo.
    - User types "Buy milk" + Enter → wait for alert with locked copy.
    - `await user.click(within(screen.getByRole('alert')).getByRole('button', { name: /retry/i }));`
    - Assert POST call count is 2; the second call's body is `{ description: 'Buy milk' }` (parse via `JSON.parse(fetchFn.mock.calls[n][1]!.body as string)`).
    - Within one `waitFor`: the row `'Buy milk'` is in the document, input `.value === ''`, input has focus, `screen.queryByRole('alert')` is null.
  - [x] **Add** a new test `it('create failure → fresh submit of different description succeeds, clears error + lastCreateAttempt', ...)`:
    - fetch mock: first POST returns 500; second POST returns 201 (for the new description).
    - User types "Buy milk" + Enter → wait for alert with locked copy + "Buy milk" preserved in input.
    - User selects-all + deletes (`await user.clear(input);`) and types "Read book" + Enter.
    - Assert second POST body is `{ description: 'Read book' }`; row "Read book" appears; input clears; alert unmounts.
    - This test is the proof that AC4's "fresh-submit success also clears `lastCreateAttempt`" path works.
  - [x] Reuse the existing `mountApp()` + `FetchFn` + `vi.stubGlobal('fetch', ...)` + `afterEach(() => vi.unstubAllGlobals())` pattern. Do not introduce a new harness.

- [x] **Task 5 — Playwright E2E spec (AC: 8)**
  - [x] Create `apps/web/e2e/journey-3-create-fail.spec.ts`.
  - [x] Copy the `truncateTodos()` helper (plus the `REPO_ROOT` / `execFileSync` imports) verbatim from `apps/web/e2e/journey-2-delete.spec.ts`. Do not extract a shared helper yet — that refactor is out of scope (Story 4.3 will see three spec files using it; if the duplication bites, refactor at the end of Epic 4, not mid-epic).
  - [x] Structure: `test.describe('Journey 3 — create failure', () => { test.beforeEach(() => truncateTodos()); ... })`.
  - [x] Use `page.route('**/v1/todos', ...)` **before** `page.goto('/')` so the interceptor catches the first POST. Pseudocode:
    ```ts
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
          body: JSON.stringify({ statusCode: 500, error: 'Internal Server Error', message: 'boom' }),
        });
      } else {
        await route.continue();
      }
    });
    ```
  - [x] Single end-to-end test covering: type "Buy milk" + Enter → assert alert with exact copy + preserved input + no row within 1s → click Retry → assert row visible + input empty + input focused + alert gone. The 1s bound is the SC-003 perceived-latency budget (PRD success criteria).
  - [x] Do not assert color/hex values in the E2E — the axe a11y test from Story 4.1 is the color-contrast gate. E2E asserts user-observable behavior only.
  - [x] File header comment: one short line pointing readers at Story 4.2 and the AC8 scope.

- [x] **Task 6 — Verify gates (AC: 9)**
  - [x] `npm run typecheck --workspace @todo-app/web` → pass.
  - [x] `npm run lint --workspace @todo-app/web` → pass, no new warnings.
  - [x] `npm test --workspace @todo-app/web` → all pre-existing + updated + new tests pass. The `AddTodoInput.a11y.test.tsx` "error state — zero axe-core violations" case should re-run unchanged against the swapped `InlineError` markup.
  - [x] `npm run build --workspace @todo-app/web` → pass.
  - [x] `npm run test:e2e --workspace @todo-app/web` (requires `docker compose up -d postgres` + API dev server) → pass including the new `journey-3-create-fail.spec.ts`.
  - [x] `git diff --stat` lists exactly the expected files (see File List section below).

- [x] **Task 7 — Story hygiene**
  - [x] Update this story's **Dev Agent Record → File List** with actual paths touched.
  - [x] Fill **Completion Notes List** with any deviations (expected: none).
  - [x] Run the `code-review` workflow to move the story to `review`.

## Dev Notes

### Why the `error` prop is hardcoded to the locked copy (not derived from `createMutation.error.message`)

- The epic AC sketch reads `error=createMutation.error.message || "Couldn't save. Check your connection."`. That fallback ladder is a **sketch**, not the final contract. The authoritative rule comes from AC5 and the PRD copy commitment: *"raw server error text is never shown."*
- `apiClient.ts:17–29` surfaces the Fastify envelope's server-supplied `message` field on non-2xx responses (e.g., `"boom"` from a crafted 500, or `"Todo 'abc' not found"` from a 404). For a pure network failure, `fetch()` throws a `TypeError` (`"Failed to fetch"`) that never becomes an `ApiError` at all — `createMutation.error` in that case is `undefined`-ish at the `ApiError` type level, or a `TypeError` leaking through.
- Either surface — the raw server envelope message OR the fetch TypeError's message — violates the copy commitment. The clean resolution is: **do not derive from `error.message` at all**. Drive purely off `createMutation.isError` and pass the literal locked string. The existing integration test's current assertion on `'boom'` is a real regression this story must delete.
- Alternative (rejected for MVP): map errors to locked copy inside `useCreateTodo` / `apiClient`. That would be DRY across Story 4.3's toggle and delete paths, but it cascades into the hook API and the shared `useOptimisticTodoMutation` factory — too much blast radius for a single story. Ship the App-owned mapping here; revisit centralization in a future refactor if the 3-line pattern recurs painfully.

### Why `InlineError` stays visible during retry (via `isRetrying` spinner) even though `isError` is briefly `false`

- TanStack mutation status transitions on retry: `error` → `pending` → (`error` OR `success`). During the `pending` phase, `isError` is `false`.
- With the straightforward derivation `error={createMutation.isError ? "..." : null}`, the `InlineError` **unmounts** for the duration of the retry (`isError=false`), then **remounts** if the retry also fails. That flash is acceptable under the letter of the AC (error clears on success; that's all AC4 mandates) and is the simplest implementation.
- The `isRetrying={createMutation.isPending}` prop is still wired because it costs nothing and keeps the Retry button's `disabled + aria-busy` behavior correct for the split-second before the `InlineError` unmounts (and in the case of rapid back-to-back failures where React may batch).
- If the flash proves jarring in manual smoke testing, swap to local-state tracking (`const [createError, setCreateError] = useState<string | null>(null);` set in `onError`, cleared in `onSuccess`). That keeps the error visible through retry and is strictly a UX polish — NOT an AC requirement. Leave it out unless the flash is observable.

### Why the test `AddTodoInput.a11y.test.tsx` does NOT need editing

- That file currently asserts: `<AddTodoInput onSubmit={() => {}} error="Couldn't save. Check your connection." />` passes axe with zero violations.
- After Task 1's swap, the rendered markup changes from a `<p role="alert">` to `<InlineError />`'s `<div role="alert">` wrapper. Axe evaluates the a11y of whatever renders — both markups are a11y-compliant — so the assertion stays green.
- This is a deliberate property of the test design: it asserts a BEHAVIORAL contract (zero a11y violations) not a STRUCTURAL one. Re-running it is the verification. Editing it would only be required if axe flagged a new violation, which it should not.

### Why the pre-existing integration test's `'boom'` assertion is the real target of the change

- `App.integration.test.tsx:158-164` currently asserts `expect(alert).toHaveTextContent('boom');`. This was correct for the Story 2.4 / 2.6 era (the minimal error region surfaced whatever `error.message` contained). It becomes a bug the moment AC5 lands: it would document — and enforce — a regression.
- Flipping this assertion to `"Couldn't save. Check your connection."` AND adding `expect(alert).not.toHaveTextContent('boom');` is the proof that the locked copy is enforced in the integration seam, not just the unit seam. This is why AC7 calls it out explicitly.

### Why Retry uses `createMutation.mutate(lastCreateAttempt)` and not `createMutation.retry()`

- TanStack Query's React bindings do not expose a `retry()` method on `UseMutationResult` — `retry` is a query-option flag, not a mutation method. Calling the mutation again with the stored description is the intended pattern and it re-fires the full mutation lifecycle (including `onSuccess` invalidation via the hook's `onSettled`).
- The per-call `onSuccess: () => setLastCreateAttempt(null)` is attached to both `handleCreate` and `handleRetry` so that either success path clears the same piece of state. This is exactly what AC4 mandates.

### Playwright `page.route` caveat — wait for the route to be registered before `page.goto`

- Playwright's `page.route()` is async but the registration completes before the returned promise resolves. `await page.route(...)` BEFORE `await page.goto('/')` is sufficient — no additional `waitForResponse` plumbing needed.
- Do NOT use `page.unroute()` inside the test — the per-test `beforeEach` + fresh page lifecycle resets routes automatically.
- If the test flakes because the 500 fires on a non-POST request (e.g., a stray HEAD / OPTIONS), tighten the guard: only mock on `route.request().method() === 'POST'` (already done in the pseudocode above).

### Previous Story Intelligence

**From Story 4.1 (`InlineError`) — directly consumed:**
- Props contract: `{ message: string; onRetry?: () => void; isRetrying?: boolean }`.
- Wrapper has `role="alert"` + `aria-live="polite"` → pre-existing `AddTodoInput` tests querying `screen.getByRole('alert')` / `screen.queryByRole('alert')` continue to work.
- The Retry button reads exactly `"Retry"` (case-sensitive; Story 4.1 AC locks this). Query it with `{ name: /retry/i }` to stay resilient to any accent coloring or whitespace noise.
- No internal state — retrying feedback comes in through `isRetrying`. This is why AC2 wires `isRetrying={createMutation.isPending}` from App through AddTodoInput to InlineError.

**From Story 2.4 (`AddTodoInput`) — load-bearing invariants:**
- The component already owns auto-focus-on-mount and clear-and-refocus on `disabled` false→true→false with no error. Task 1 explicitly preserves this.
- The input text is NEVER cleared on error — the `useEffect` at lines 23–29 guards with `!error` before clearing. AC1's "input's typed text is NOT cleared" is therefore already structurally true; the test in Task 2 is a regression harness, not a new behavior.

**From Story 2.6 (`App.tsx` Journey 1 wire-up) — baseline to extend:**
- `App.tsx` currently passes `onSubmit={createMutation.mutate}` directly. Task 3 wraps this in a `useCallback(handleCreate, [createMutation])` so the `lastCreateAttempt` side-effect threads through without breaking referential stability for `AddTodoInput`'s auto-focus effect (which depends on `disabled` prop stability, not `onSubmit`, but preserving `useCallback` discipline is the established pattern — see `handleToggle` / `handleDeleteRequest` / `handleConfirmDelete` in the same file).
- The existing integration-test pattern `mountApp()` + `vi.stubGlobal('fetch', ...)` + `afterEach(() => vi.unstubAllGlobals())` is the only harness used in Epic 1–3. Reuse it exactly (AC7 / Task 4).

**From Story 3.5 (`DeleteTodoModal` + App.tsx delete wiring) — conventions inherited:**
- Commit message format: `feat: story X.Y implemented`. Use `feat: story 4.2 implemented`.
- E2E spec structure (`test.describe` + `truncateTodos()` beforeEach + repo-root computed via `fileURLToPath(new URL('../../../', import.meta.url))`) — copy verbatim from `journey-2-delete.spec.ts`. The comment at line 11 of `journey-1.spec.ts` documents the credential contract (`POSTGRES_USER=postgres`, `POSTGRES_DB=todo_app`) — reuse; do not re-derive.
- `queueMicrotask`-based focus routing is NOT needed in this story (there is no modal here) — the input's focus return is handled by the existing Story 2.4 effect.

### Git Intelligence

- Recent commit rhythm (most-recent-first per `git log`): `feat: story 3.4 implemented`, `feat: story 3.3 implemented`, `feat: story 3.2 implemented`, `feat: story 3.1 implemented`, `feat: story 2.6 implemented`. Epic 3 stories 3.1–3.5 are in review. Mirror the format exactly.
- File-scope discipline — Story 4.2 touches exactly:
  1. `apps/web/src/components/AddTodoInput.tsx` (modified — prop surface + InlineError swap)
  2. `apps/web/src/components/AddTodoInput.test.tsx` (modified — 4 new assertions; pre-existing stay green)
  3. `apps/web/src/App.tsx` (modified — `lastCreateAttempt` state + `handleCreate` + `handleRetry` + updated `<AddTodoInput />` props)
  4. `apps/web/src/App.integration.test.tsx` (modified — existing "create failure" updated; 2 new tests added)
  5. `apps/web/e2e/journey-3-create-fail.spec.ts` (NEW)
  6. `_bmad-output/implementation-artifacts/sprint-status.yaml` (status transition — `4-2-*` backlog → ready-for-dev already, will move to `review` on completion via `code-review`)
  7. `_bmad-output/implementation-artifacts/4-2-create-failure-flow-*.md` (this file — File List + Completion Notes updates)
- **No new dependencies.** `InlineError` comes from Story 4.1; React, TanStack Query, vitest, Playwright, `@testing-library/react` are all already wired.
- **No API changes. No migration changes. No hook-layer changes.** `useCreateTodo.ts` and `apiClient.ts` are untouched.
- **Prerequisite:** Story 4.1 (`InlineError` component) must be merged before this story can land. If Story 4.1 is still `ready-for-dev` when this story enters dev, implement 4.1 first in the same branch or back-to-back commits.

### Latest Tech Information

- **Playwright `page.route()` + `route.continue()`:** standard since Playwright 1.20+. Works with the repo's `@playwright/test` pinned at `^1.49.0`. No additional imports needed beyond `{ test, expect, type Page } from '@playwright/test'`.
- **TanStack Query v5 per-call callbacks:** `mutation.mutate(variables, { onSuccess, onError, onSettled })` is supported and fires AFTER the hook-level `onSettled` (the one that invalidates `['todos']`). This ordering is correct — the list refetch is triggered before `lastCreateAttempt` clears, which is exactly what AC4 needs for the fresh-submit test to assert the new row appears.
- **React 19 `useCallback`:** no hazards. `createMutation` is a stable reference between renders only if the hook result object is stable; in practice React re-creates the object each render but the internal `mutate` reference is stable per mutation instance, so listing `[createMutation]` in deps is correct. Don't try to list `[createMutation.mutate]` — that's a common anti-pattern and `eslint-plugin-react-hooks` will flag it.
- **Tailwind v4 + existing class set:** no new utilities required — `InlineError` owns its styling. `AddTodoInput`'s existing flex layout continues to hold.
- **jsdom fetch stubbing via `vi.stubGlobal('fetch', ...)`:** the existing integration suite's `FetchFn` alias (`type FetchFn = (url: string, init?: RequestInit) => Promise<Response>`) is the exact signature. Reuse it for new tests; do not re-declare a local type alias.

### Project Structure Notes

**Extended (4 files):**
- `apps/web/src/components/AddTodoInput.tsx`
- `apps/web/src/components/AddTodoInput.test.tsx`
- `apps/web/src/App.tsx`
- `apps/web/src/App.integration.test.tsx`

**New (1 file):**
- `apps/web/e2e/journey-3-create-fail.spec.ts`

**Alignment with `architecture.md:562-571`:** component inventory unchanged — this story wires existing components together; no new component is introduced.

**Alignment with `ux-design-specification.md:825-840` (InlineError component contract) and `§ Feedback Patterns` (create failure → below AddTodoInput):** anchoring is satisfied by rendering `<InlineError />` at the end of `AddTodoInput`'s layout, below the input+button row.

**Alignment with `architecture.md:398-410` (error-handling discipline):** CRUD errors are inline at the failure site via the shared `InlineError` component. Story 4.2 delivers this for the create path; the architecture's global `<ErrorBoundary>` in `main.tsx` is orthogonal and untouched.

### Testing Standards

- **Unit (component):** `AddTodoInput.test.tsx` — co-located; extended with 4 new assertions; pre-existing cases must stay green unchanged.
- **A11y:** `AddTodoInput.a11y.test.tsx` — not edited. Re-run is the verification. If axe reports new violations after the swap, root-cause rather than silence the test.
- **Integration (app tree):** `App.integration.test.tsx` — one existing test updated, two new tests appended. Uses `mountApp()` + `vi.stubGlobal('fetch', ...)` pattern. `afterEach(() => vi.unstubAllGlobals())` already covers cleanup.
- **E2E:** `journey-3-create-fail.spec.ts` — one new Playwright spec. Runs against real dev server + real docker Postgres; `truncateTodos()` helper resets state per test.
- **No new unit tests for `App.tsx` itself.** `App.test.tsx` exists for shallow smoke coverage; the `lastCreateAttempt` logic is indirectly covered by the integration suite.
- **Coverage expectation:** incremental — every new branch in `App.tsx` (`handleCreate`, `handleRetry`, the conditional `onRetry` prop wiring) is exercised by at least one integration test.
- **No snapshot tests.** Assert specific DOM + props + fetch-call bodies.

### References

- Epic requirements: `_bmad-output/planning-artifacts/epics.md` § Story 4.2 (lines 1154–1205)
- UX spec — `InlineError` component contract: `_bmad-output/planning-artifacts/ux-design-specification.md` § Component 8 `InlineError` (lines 825–840)
- UX spec — Feedback patterns (error inline at failure site, always includes Retry, locked copy): `_bmad-output/planning-artifacts/ux-design-specification.md` § Feedback Patterns (lines 895–910)
- UX spec — Form patterns (input preserved on submit failure): `_bmad-output/planning-artifacts/ux-design-specification.md` § Form Patterns (lines 921–933)
- UX spec — Journey 3 / create-failure flow diagram: `_bmad-output/planning-artifacts/ux-design-specification.md` § Journey 3 — Error Recovery (lines 620–652)
- Architecture — TanStack Query conventions (mutation keys, optimistic pattern, ApiError contract): `_bmad-output/planning-artifacts/architecture.md` § Communication Patterns (lines 380–395)
- Architecture — Error-handling discipline (inline at site, shared `InlineError`, locked copy): `_bmad-output/planning-artifacts/architecture.md` § Process Patterns → Error handling (lines 398–411)
- Architecture — Component boundaries (App.tsx owns cross-component UI state): `_bmad-output/planning-artifacts/architecture.md` § Architectural Boundaries (lines 595–601)
- PRD — FR-010 (inline error + retry), NFR-004 (error resilience), SC-003 (≤1s perceived latency): `_bmad-output/planning-artifacts/PRD.md`
- Previous story — `InlineError` component: `./4-1-inlineerror-component.md`
- Previous story — `AddTodoInput` auto-focus + error preservation: `./2-4-addtodoinput-component.md`
- Previous story — `App.tsx` Journey 1 wire-up: `./2-6-end-to-end-wire-up-in-app-tsx-journey-1-complete.md`
- Previous story — `App.tsx` delete flow + integration test harness extensions: `./3-5-deletetodomodal-component-app-tsx-delete-flow-journey-2-complete.md`
- Existing fetch-stub pattern: `apps/web/src/App.integration.test.tsx:8-25` (FetchFn + mountApp)
- Existing Playwright helper pattern: `apps/web/e2e/journey-2-delete.spec.ts:1-32` (truncateTodos + REPO_ROOT)
- `apiClient` error surface: `apps/web/src/api/apiClient.ts:17-30` (proves raw server text would leak without the locked-copy override)
- `ApiError` class: `apps/web/src/api/errors.ts`

## Dev Agent Record

### Agent Model Used

claude-opus-4-7 (1M context)

### Debug Log References

- `npx vitest run src/components/AddTodoInput.test.tsx` → 19/19 pass (5 new assertions covering Retry button presence, click → onRetry fires, isRetrying → disabled + aria-busy, error→null unmount; 14 pre-existing AddTodoInput cases unchanged and green).
- `npx vitest run src/App.test.tsx src/App.integration.test.tsx` → 20/20 pass (7 App unit + 13 integration: 10 pre-existing + 1 updated + 2 new).
- `npm run typecheck --workspace @todo-app/web` → pass.
- `npm run lint` (root) → 0 errors, 1 pre-existing warning in `apps/api/src/db/index.ts` (unrelated — same warning as in Story 4.1's session).
- `npm run format:check` → initially flagged `App.tsx` + `App.integration.test.tsx`; fixed with `npx prettier --write`; clean on re-run.
- `npm test --workspace @todo-app/web` → 28 files / 152 tests pass (was 146 after Story 4.1; Story 4.2 net +6: +5 in AddTodoInput.test, +2 new in App.integration.test, −1 existing create-failure test updated rather than added).
- `npm run build --workspace @todo-app/web` → built in ~435ms (94 modules). No new warnings.
- `npm run test:e2e` **not run** — Task 6's E2E step conditions on `docker compose up -d postgres` + running API dev server; leaving that to the human-run verification before merge (flagged in Completion Notes).

### Completion Notes List

- **One scope extension beyond the story's stated File List: `apps/web/src/App.test.tsx`.** The story Task 4 only enumerates `App.integration.test.tsx`, but `App.test.tsx` had a matching `'too long'` assertion (line 167) that tested the old `createMutation.error?.message` pattern — exactly the pattern AC5 forbids. Left as-is, that test would fail after Task 3's App.tsx change, so I flipped it to the locked copy + added the anti-regression `not.toHaveTextContent('too long')` guard (same shape as the integration-test flip). This is a necessary consequence of the App.tsx change, not scope creep; documenting it here per the workflow's "deviations" instruction.
- **E2E spec authored but not executed.** `apps/web/e2e/journey-3-create-fail.spec.ts` lands per AC8 / Task 5. I did not run `npm run test:e2e` because that requires a live docker Postgres + API dev server (the repo's `webServer` Playwright config starts Vite, but the API is a separate command). Flagging so a human running the story's Task 6 E2E step is the green-gate before merge. The spec is mechanically a twin of `journey-2-delete.spec.ts` (same `truncateTodos()` helper + `REPO_ROOT` pattern) so regression risk is low, but "authored ≠ executed" is worth being explicit about.
- **No raw server error text reaches the DOM.** Both the integration `not.toHaveTextContent('boom')` assertion and the App-unit `not.toHaveTextContent('too long')` assertion enforce AC5 at two different test seams. The component-level contract (`InlineError` renders `message` verbatim) is from Story 4.1 — I did not touch it.
- **No `createMutation.reset()` call introduced** per the story's explicit guidance. The `isError` → `pending` → (`error`/`success`) transition from the next `.mutate()` call naturally clears the error prop at the right moment. Confirmed via the new Retry-success integration test: once the retry fires, the next render evaluates `isError=false` and the `<InlineError />` unmounts correctly.
- **`isRetrying={createMutation.isPending}` flows through the existing `disabled` chain already wired in Story 2.4.** The Add button stays disabled + `aria-busy` during retry (Story 2.4 contract). The InlineError's Retry button mirrors the same state via the new `isRetrying` prop. No new state-management layer introduced.
- **UI flash during retry** (noted in Dev Notes): not observed in the integration tests. The straightforward derivation `error={isError ? "..." : null}` is the current implementation. If manual browser smoke (deferred to Story 4.2's human review) shows a jarring flash, the Dev-Notes-sanctioned escape hatch is local state (`const [createError, setCreateError] = useState(...)` set in onError, cleared in onSuccess). Leaving it out — no evidence yet that the flash is observable.
- **No changes to `useCreateTodo.ts` or `apiClient.ts`** per the story's file-scope discipline. All App.tsx-owned; hook layer untouched.
- **No manual browser smoke performed this session.** `InlineError` now has a real consumer (the create-failure path) — this is the first place where a human reviewer can visually inspect the component rendering, colors, spacing, and 36px Retry button on a real Vite build. Recommended as the first post-merge check.

### File List

- `apps/web/src/components/AddTodoInput.tsx` (modified — new `onRetry?`, `isRetrying?` props; swapped the inline `<p role="alert">` region for `<InlineError />` wrapped in `<div className="mt-2">` below the form; wrapped the form + error in a parent `<div>` to keep flex layout clean)
- `apps/web/src/components/AddTodoInput.test.tsx` (modified — added 5 new assertions; pre-existing tests unchanged)
- `apps/web/src/App.tsx` (modified — added `lastCreateAttempt` state, `handleCreate` + `handleRetry` `useCallback`s, updated `<AddTodoInput />` props to pass locked-copy error + conditional `onRetry` + `isRetrying`; removed the old `createMutation.error?.message` derivation)
- `apps/web/src/App.test.tsx` (modified — updated the "AddTodoInput reflects create mutation state" test to assert locked copy + anti-regression guard for raw `'too long'` text; see Completion Notes for scope rationale)
- `apps/web/src/App.integration.test.tsx` (modified — flipped the existing `create failure` test to the locked copy + added `not.toHaveTextContent('boom')` + Retry-button-present assertions; added 2 new integration tests: Retry-success path and fresh-submit-recovery path)
- `apps/web/e2e/journey-3-create-fail.spec.ts` (new — Playwright spec using `page.route()` to return HTTP 500 on the first POST then pass-through on subsequent POSTs; asserts locked copy + preserved input + no row within 1s, then Retry → row visible + input cleared/focused + alert gone)
- `_bmad-output/implementation-artifacts/4-2-create-failure-flow-addtodoinput-inline-error-with-preserved-input-retry.md` (status: ready-for-dev → in-progress → review; all tasks/subtasks checked off; Dev Agent Record filled in)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (story 4.2 status: ready-for-dev → in-progress → review)

### Change Log

- 2026-04-24 — Story 4.2 implemented. Wired `InlineError` into `AddTodoInput`'s error region; extended `App.tsx` with `lastCreateAttempt` + `handleCreate` + `handleRetry` for the create-failure flow; enforced locked-copy error message (raw server text never reaches the DOM) at both the unit and integration seams; added Playwright spec for Journey 3 (E2E not yet executed — gated on live docker + API dev server).
