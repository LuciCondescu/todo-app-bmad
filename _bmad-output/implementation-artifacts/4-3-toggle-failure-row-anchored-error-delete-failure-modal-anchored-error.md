# Story 4.3: Toggle-failure row-anchored error + delete-failure modal-anchored error

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want a failed toggle to surface an inline error on the affected row, and a failed delete to surface the error inside the still-open modal,
so that errors appear exactly where I took the action and I can retry without re-navigating.

**Dependency chain (critical):**
- Hard dependency on Story 4.1 (`InlineError` component).
- Shared-pattern dependency on Story 4.2 (`App.tsx` state + locked-copy contract for create failure). The toggle path mirrors 4.2's state-management pattern (per-mutation error tracking in App; locked copy, not `error.message`; per-call `onSuccess`/`onError`). Ideal implementation order: 4.1 → 4.2 → 4.3.
- This story does **not** modify `AddTodoInput.tsx` or the create flow (that is Story 4.2's scope).

**Scope boundary:** This story delivers two failure paths in a single dev arc because they share `InlineError` plumbing and the same locked-copy discipline. Partitioned tasks below keep the toggle and delete halves separable during implementation.

## Acceptance Criteria

### Toggle-failure half

1. **AC1 — `TodoRow` accepts and renders row-anchored error.**
   **Given** `TodoRow` is extended with new props `{ error?: string | null, onRetry?: () => void, isRetrying?: boolean }`,
   **When** `error` is a non-empty string,
   **Then** an `<InlineError message={error} onRetry={onRetry} isRetrying={isRetrying} />` renders as a second block directly below the row's main content and REMAINS INSIDE THE SAME `<li>` element (per UX spec row-anchoring),
   **And** the `<li>` keeps its `border-b border-[--color-border]` boundary so section rhythm is unchanged,
   **And** when `error` is `null` / `undefined` / empty string, the row renders exactly as today (no error region, no extra DOM).

2. **AC2 — `TodoList` threads per-row error state to the correct `TodoRow`.**
   **Given** `TodoList` is extended with new props `{ toggleErrors: Map<string, { desiredCompleted: boolean; message: string }>, onToggleRetry: (id: string) => void, retryingIds: Set<string> }`,
   **When** rendering each `TodoRow`,
   **Then** `TodoList` looks up `toggleErrors.get(todo.id)` and, if present, passes `error={entry.message}`, `onRetry={() => onToggleRetry(todo.id)}`, `isRetrying={retryingIds.has(todo.id)}` to that specific row,
   **And** rows not in the error Map receive `error={null}` (or omit the prop) — their behavior is identical to today.

3. **AC3 — `App.tsx` tracks toggle failures by id and drives retry.**
   **Given** `App.tsx` owns two new pieces of local state: `toggleErrors: Map<string, { desiredCompleted: boolean; message: string }>` and `retryingIds: Set<string>`,
   **When** the user clicks a row's checkbox and the PATCH mutation rejects,
   **Then** the hook-level optimistic factory has already reverted the row to its prior state (existing Story 3.3 behavior — no change required),
   **And** `App.tsx` sets `toggleErrors[id] = { desiredCompleted, message: "Couldn't save. Check your connection." }` using the per-call `onError` callback on `toggleMutate`,
   **And** `App.tsx` passes `toggleErrors`, a memoized `handleToggleRetry`, and `retryingIds` down to `<TodoList />`.

4. **AC4 — Toggle retry dispatches the same mutation and clears state on success.**
   **Given** a row has an active toggle error in `toggleErrors`,
   **When** the user clicks Retry inside the row's `InlineError`,
   **Then** `handleToggleRetry(id)` adds `id` to `retryingIds`, calls `toggleMutate({ id, completed: entry.desiredCompleted })`,
   **And** the per-call `onSuccess` deletes `id` from both `toggleErrors` and `retryingIds`,
   **And** the per-call `onError` keeps the `toggleErrors` entry but removes the id from `retryingIds` (the row re-displays its error without the retry spinner).

5. **AC5 — Fresh-success on the same row also clears pending error.**
   **Given** a row has an active toggle error in `toggleErrors`,
   **When** the user clicks the row's checkbox again (NOT Retry — a fresh toggle) and it succeeds,
   **Then** the per-call `onSuccess` also deletes the entry from `toggleErrors` for this id (the wrapped `handleToggle` always cleans up its own error state on success, regardless of whether this success came from Retry or a fresh interaction).

6. **AC6 — Toggle-failure locked copy: raw server text never appears.**
   **Given** the server returns a 500 with an arbitrary envelope message (e.g., `"boom"`) OR the network fails,
   **When** the row's `InlineError` renders,
   **Then** the message is exactly the literal string `"Couldn't save. Check your connection."` — `error.message` is never read for UI display (same discipline as Story 4.2 AC5).

### Delete-failure half

7. **AC7 — `DeleteTodoModal` accepts and renders in-modal error state.**
   **Given** `DeleteTodoModal` is extended with new props `{ error?: string | null, isDeleting?: boolean }`,
   **When** `error` is a non-empty string,
   **Then** the modal BODY (the current `<p id={bodyId}>This cannot be undone.</p>` text) is REPLACED by an `<InlineError message={error} />` region — `onRetry` is **not** passed to `InlineError` because the modal's Delete button doubles as the Retry control (single-source-of-truth for the danger-styled action),
   **And** the modal's `<dialog aria-describedby={bodyId}>` still points at the new `InlineError` (the id lives on the replaced element so screen-readers read the error as the dialog's description),
   **And** the Delete button's label flips from `"Delete"` to `"Retry"` while retaining the Danger variant (`bg-[--color-danger] text-white text-sm font-medium`),
   **And** the Delete/Retry button carries `disabled={isDeleting}` and `aria-busy={isDeleting ? 'true' : undefined}`,
   **And** the Cancel button remains enabled (never disabled by `isDeleting`) and still dismisses the modal.

8. **AC8 — `App.tsx` overrides the Story 3.5 synchronous close when delete fails.**
   **Given** `App.tsx` is extended with `deleteError: string | null` local state,
   **When** the user clicks Delete in the modal and the DELETE mutation rejects,
   **Then** the modal DOES NOT close (the current Story 3.5 behavior at `App.tsx:48` — `setTodoPendingDelete(null)` synchronously on confirm — MUST MOVE INTO the per-call `onSuccess` callback, not fire unconditionally),
   **And** the optimistic factory has already reverted the row removal (the row reappears in the list behind the modal — existing Story 3.3 behavior),
   **And** `setDeleteError("Couldn't delete. Check your connection.")` fires in the per-call `onError`,
   **And** `App.tsx` passes `error={deleteError}` and `isDeleting={deleteMutation.isPending}` down to `<DeleteTodoModal />`.

9. **AC9 — Delete retry closes the modal on success; Cancel in error-state also closes cleanly.**
   **Given** the modal is in error state (`deleteError` is set, `todoPendingDelete` is still non-null),
   **When** the user clicks Retry (the same Delete button, now labeled "Retry") and the DELETE succeeds,
   **Then** the per-call `onSuccess` clears `todoPendingDelete` to `null` AND clears `deleteError` to `null`,
   **And** the row is removed from the list (optimistic filter sticks because the retry succeeded),
   **And** focus returns per the existing Story 3.5 `queueMicrotask` focus-restoration pattern (no new focus code needed here — the existing `handleCancel` flow already handles this; the `onSuccess` path also needs to return focus, which is a NEW requirement and SHOULD use the same `queueMicrotask(() => deleteTriggerRef.current?.focus())` pattern).
   **When** instead the user clicks Cancel in the error state,
   **Then** the modal closes, `deleteError` clears to `null`, `todoPendingDelete` clears to `null`, and no DELETE request fires; the row remains in the list (reverted state).

10. **AC10 — Delete-failure locked copy: raw server text never appears.**
    **Given** the DELETE returns a 500 with an arbitrary envelope message (e.g., `"boom"`) OR 404 (`"Todo <id> not found"`) OR the network fails,
    **When** the modal's `InlineError` renders,
    **Then** the message is exactly the literal string `"Couldn't delete. Check your connection."` — `error.message` is never read for UI display.

### Cross-cutting

11. **AC11 — Unit tests (`TodoRow.test.tsx`, `DeleteTodoModal.test.tsx`) extended and green.**
    **When** `npm test --workspace @todo-app/web` runs:
    - `TodoRow.test.tsx`: new cases validate AC1 — `<TodoRow error="..." onRetry={fn} isRetrying={false} />` renders an `InlineError` inside the same `<li>` with the exact message; Retry button clickable; `isRetrying` prop forwards correctly. **The existing test at `TodoRow.test.tsx:37` (`expect(li).toHaveClass('flex', 'items-center', 'gap-3', 'py-3', 'border-b')`) must be UPDATED** — see Dev Notes on the required layout refactor.
    - `DeleteTodoModal.test.tsx`: new cases validate AC7 — with `error="..."`, the body text is replaced by an `InlineError` region; the Delete button's accessible name is now `"Retry"` and still has `bg-[--color-danger]`; Cancel stays enabled and still fires `onCancel` on click; `isDeleting=true` sets `disabled` + `aria-busy="true"` on the Delete/Retry button but NOT on Cancel.
    - All pre-existing tests in both files continue to pass unchanged (except the one class-assertion tweak above).

12. **AC12 — A11y tests (`TodoRow.a11y.test.tsx`, `DeleteTodoModal.a11y.test.tsx`) cover error states.**
    **When** axe runs against each component's error state:
    - `TodoRow.a11y.test.tsx`: new case — `<TodoRow ... error="Couldn't save. Check your connection." onRetry={() => {}} />` reports zero axe violations.
    - `DeleteTodoModal.a11y.test.tsx`: new case — modal rendered with a todo AND `error="Couldn't delete. Check your connection."` reports zero axe violations.
    - Existing a11y tests for both components continue to pass unchanged.

13. **AC13 — Integration tests (`App.integration.test.tsx`) extended and green.**
    **When** the suite runs:
    - The existing `it('toggle failure reverts the row to its prior state ...')` (currently lines 396–437) is EXTENDED with additional assertions: after the revert, the row's `InlineError` is visible with locked copy `"Couldn't save. Check your connection."`; and `expect(alert).not.toHaveTextContent('boom');` as an anti-regression guard.
    - **New** test: toggle failure → click Retry → second PATCH with identical body `{ completed: true }` succeeds → row moves to Completed → error unmounts.
    - **New** test: toggle failure → user clicks the same checkbox again (fresh toggle, not Retry) → PATCH succeeds on the second attempt → error unmounts (AC5 proof).
    - **New** test: delete failure → modal stays open → body replaced by `InlineError` with locked copy `"Couldn't delete. Check your connection."` → Delete button now reads "Retry" → click Retry → DELETE succeeds → modal closes, row gone.
    - **New** test: delete failure → click Cancel in error state → modal closes, DELETE count unchanged (no retry fired), row still in list (reverted).
    - The existing `it('clicking Delete removes the row and closes the modal ...')` continues to pass unchanged (the success path's Story 3.5 behavior is preserved).

14. **AC14 — Playwright E2E specs land and pass.**
    **When** `npm run test:e2e --workspace @todo-app/web` runs against real API + Postgres:
    - `apps/web/e2e/journey-3-toggle-fail.spec.ts` (NEW): seed 1 todo via the app flow; intercept `PATCH /v1/todos/*` to return 500 once then pass through; click the row's checkbox → within 1s, row briefly appears in Completed, reverts to Active, `InlineError` is visible below the row with the locked toggle copy; click Retry → row moves to Completed, error disappears.
    - `apps/web/e2e/journey-3-delete-fail.spec.ts` (NEW): seed 1 todo; intercept `DELETE /v1/todos/*` to return 500 once then pass through; open the modal; click Delete → modal stays open with body replaced by the locked delete-failure copy and Retry button; click Retry → row removed, modal closes.

15. **AC15 — All gates green; diff stays scoped.**
    **When** `npm run typecheck && npm run lint && npm test && npm run build && npm run test:e2e` run in `@todo-app/web`,
    **Then** all pass with no new warnings, and `git diff --stat` lists only the files enumerated in the File List Plan below.

## Tasks / Subtasks

> **Implementation order suggestion:** Toggle path (Tasks 1–4) first, then Delete path (Tasks 5–8), then Playwright (Task 9), then gates (Task 10). Each half is independently testable; landing them in one commit is fine, but the partition keeps debugging narrow.

### Toggle path

- [x] **Task 1 — Extend `TodoRow` layout + props (AC: 1)**
  - [x] Open `apps/web/src/components/TodoRow.tsx`.
  - [x] Extend `TodoRowProps` with three optional new props: `error?: string | null;`, `onRetry?: () => void;`, `isRetrying?: boolean;`. Keep the existing four.
  - [x] Refactor the `<li>` to be a CONTAINER (no flex on `<li>` itself). Move the current flex-row classes (`flex items-center gap-3 py-3 md:py-4 px-2`) onto an INNER `<div>` that wraps the checkbox + description + delete button. The `<li>` keeps only `border-b border-[--color-border]` and picks up `flex flex-col` so error stacks beneath.
  - [x] Conditionally render `<InlineError message={error} onRetry={onRetry} isRetrying={isRetrying} />` inside the `<li>`, wrapped in a padded sibling `<div className="pb-3 md:pb-4 px-2">` so the error aligns with the row's horizontal rhythm. Condition: `error && error.length > 0 ? (<div>...InlineError...</div>) : null`.
  - [x] Import `InlineError` with the project's `.js` extension convention: `import InlineError from './InlineError.js';`
  - [x] **Do NOT** wire `error` / `onRetry` / `isRetrying` into the `memo()` comparator — React.memo's default shallow comparison works as long as parents pass stable references. Use `useCallback` for `onRetry` in `TodoList` / `App.tsx` callers.
  - [x] `isMutating` and the new `isRetrying` prop serve different purposes: `isMutating` disables the row's checkbox + delete button (existing Story 2.5 behavior; unused in MVP — no caller sets it today); `isRetrying` threads down to the `InlineError`'s Retry button. Do not conflate them.

- [x] **Task 2 — Update `TodoRow.test.tsx` + `TodoRow.a11y.test.tsx` (AC: 11, 12)**
  - [x] Open `apps/web/src/components/TodoRow.test.tsx`.
  - [x] Update the existing `it('renders <li> root with flex row layout and border', ...)` at line 33 — move the flex-row-class assertions from the `<li>` to the inner `<div>`. The `<li>` should be asserted to have `border-b` and `flex-col`; the inner `<div>` should be asserted to have `flex items-center gap-3 py-3`. Tag the test comment explicitly: `// Layout refactor: <li> is the container; flex-row sits on an inner wrapper so InlineError can stack below.`
  - [x] Add: `it('renders <InlineError> inside the same <li> when error prop is non-empty', ...)` — assert `screen.getByRole('alert')` exists and the `<li>` is the ancestor.
  - [x] Add: `it('forwards onRetry to InlineError; clicking Retry fires onRetry once', ...)` — use `userEvent.setup()`.
  - [x] Add: `it('forwards isRetrying to InlineError; Retry button is disabled + aria-busy', ...)`.
  - [x] Add: `it('does NOT render error region when error is null / undefined / empty', ...)` — table-driven with `.each`.
  - [x] Open `apps/web/test/a11y/TodoRow.a11y.test.tsx`.
  - [x] Add a new `it('error state — zero axe-core violations', ...)` that renders `<TodoRow todo={...} onToggle={() => {}} onDeleteRequest={() => {}} error="Couldn't save. Check your connection." onRetry={() => {}} />` and asserts `axe` reports zero violations. Mirror the existing pattern (import `axe`, call `expect(results).toHaveNoViolations()`).

- [x] **Task 3 — Extend `TodoList` to thread per-row error state (AC: 2)**
  - [x] Open `apps/web/src/components/TodoList.tsx`.
  - [x] Extend `TodoListProps` with three optional new props: `toggleErrors?: Map<string, { desiredCompleted: boolean; message: string }>`, `onToggleRetry?: (id: string) => void`, `retryingIds?: Set<string>`. All optional so existing callers (there's just `App.tsx` — but keep it graceful) don't break.
  - [x] In both the Active map and the Completed map, compute per-row error data:
    ```tsx
    const entry = toggleErrors?.get(todo.id);
    const error = entry?.message ?? null;
    const isRetrying = retryingIds?.has(todo.id) ?? false;
    const rowRetry = error && onToggleRetry ? () => onToggleRetry(todo.id) : undefined;
    ```
  - [x] Pass `error={error}`, `onRetry={rowRetry}`, `isRetrying={isRetrying}` to `<TodoRow />`.
  - [x] **Performance consideration:** the `rowRetry` closure is created on every render. For MVP list sizes (≤50 todos per SC), this is acceptable. The React.memo on `TodoRow` will re-render the row when the closure identity changes — but that only matters for rows with an active error (at most one per render cycle in practice, since failures are rare). Do not over-engineer with a per-id `useMemo`/`useCallback` map.
  - [x] Keep `list-none` class on `<ul>`; no layout change needed beyond TodoRow's internal refactor.

- [x] **Task 4 — Extend `App.tsx` toggle-failure state + handlers (AC: 3, 4, 5, 6)**
  - [x] Open `apps/web/src/App.tsx`.
  - [x] Add two new state hooks near the existing `todoPendingDelete`:
    ```tsx
    type ToggleAttempt = { desiredCompleted: boolean; message: string };
    const [toggleErrors, setToggleErrors] = useState<Map<string, ToggleAttempt>>(() => new Map());
    const [retryingIds, setRetryingIds] = useState<Set<string>>(() => new Set());
    ```
  - [x] Replace the existing `handleToggle` with a version that clears/sets per-id error state via per-call callbacks:
    ```tsx
    const handleToggle = useCallback(
      (id: string, completed: boolean) => {
        toggleMutate(
          { id, completed },
          {
            onSuccess: () => {
              setToggleErrors((prev) => {
                if (!prev.has(id)) return prev;
                const next = new Map(prev);
                next.delete(id);
                return next;
              });
              setRetryingIds((prev) => {
                if (!prev.has(id)) return prev;
                const next = new Set(prev);
                next.delete(id);
                return next;
              });
            },
            onError: () => {
              setToggleErrors((prev) => {
                const next = new Map(prev);
                next.set(id, { desiredCompleted: completed, message: "Couldn't save. Check your connection." });
                return next;
              });
              setRetryingIds((prev) => {
                if (!prev.has(id)) return prev;
                const next = new Set(prev);
                next.delete(id);
                return next;
              });
            },
          },
        );
      },
      [toggleMutate],
    );
    ```
    Note: The outer `handleToggle` signature `(id, completed) => void` is preserved — existing `onToggle` callers (TodoRow) pass through unchanged.
  - [x] Add `handleToggleRetry`:
    ```tsx
    const handleToggleRetry = useCallback(
      (id: string) => {
        setToggleErrors((prev) => prev); // no-op to hold ref; the actual read comes from closure
        const attempt = toggleErrors.get(id);
        if (!attempt) return;
        setRetryingIds((prev) => new Set(prev).add(id));
        handleToggle(id, attempt.desiredCompleted); // reuse the same success/error cleanup
      },
      [toggleErrors, handleToggle],
    );
    ```
    This deliberately calls `handleToggle` so the success/error path is a single implementation (avoiding drift between retry-cleanup and fresh-toggle-cleanup).
  - [x] Pass new props to `<TodoList />`:
    ```tsx
    <TodoList
      todos={data}
      onToggle={handleToggle}
      onDeleteRequest={handleDeleteRequest}
      toggleErrors={toggleErrors}
      onToggleRetry={handleToggleRetry}
      retryingIds={retryingIds}
    />
    ```
    Note: the `renderListArea` helper function currently spreads these via a props object — update both the helper signature and the call site accordingly.

### Delete path

- [x] **Task 5 — Extend `DeleteTodoModal` props + conditional render (AC: 7)**
  - [x] Open `apps/web/src/components/DeleteTodoModal.tsx`.
  - [x] Extend `DeleteTodoModalProps` with two optional new props: `error?: string | null;`, `isDeleting?: boolean;`.
  - [x] Destructure with defaults: `error = null`, `isDeleting = false`.
  - [x] Replace the body `<p id={bodyId}>This cannot be undone.</p>` with a conditional:
    ```tsx
    {error ? (
      <div id={bodyId} className="mt-2">
        <InlineError message={error} />
      </div>
    ) : (
      <p id={bodyId} className="mt-2 text-base text-[--color-fg]">
        This cannot be undone.
      </p>
    )}
    ```
    — the `id={bodyId}` attribute MOVES onto whichever element is rendered so `aria-describedby` on the `<dialog>` always points at a real node.
  - [x] Replace the Delete button's literal label `Delete` with `{error ? 'Retry' : 'Delete'}`. Keep everything else about the button (type, onClick, className) identical — the Danger variant is preserved whether the label is "Delete" or "Retry".
  - [x] Add `disabled={isDeleting}` and `aria-busy={isDeleting ? 'true' : undefined}` on the Delete/Retry button.
  - [x] Cancel button stays exactly as-is (no `disabled` wiring). The initial-focus effect (line 26: `cancelBtnRef.current?.focus()`) continues to fire on mount — which is still correct for the error state (Cancel is the least destructive option).
  - [x] Import `InlineError` with the `.js` extension: `import InlineError from './InlineError.js';`
  - [x] **Do NOT** pass `onRetry` to the nested `InlineError`. The modal's Delete/Retry button is the single danger control — wiring `onRetry` on `InlineError` would produce TWO buttons labeled "Retry" in the same alert region, which is both a UX and a tab-order regression.

- [x] **Task 6 — Update `DeleteTodoModal.test.tsx` + `DeleteTodoModal.a11y.test.tsx` (AC: 11, 12)**
  - [x] Open `apps/web/src/components/DeleteTodoModal.test.tsx`.
  - [x] Add: `it('renders InlineError in place of body text when error prop is set', ...)` — assert `screen.getByRole('alert')` exists with the provided message; assert the original body text `"This cannot be undone."` is NOT present.
  - [x] Add: `it('Delete button label flips to "Retry" in error state', ...)` — assert `screen.getByRole('button', { name: 'Retry' })` exists and has `bg-[--color-danger]`.
  - [x] Add: `it('isDeleting disables the Delete/Retry button and sets aria-busy', ...)` — both `"Delete"` and `"Retry"` labels; Cancel stays enabled in both.
  - [x] Add: `it('Cancel button remains enabled in error state', ...)` — `{ error: "...", isDeleting: false }`, Cancel has no `disabled` attribute, click fires `onCancel`.
  - [x] Add: `it('aria-describedby on <dialog> still points at a real node when body is replaced', ...)` — re-use the existing `aria-describedby` test pattern at line 32 but in the error state.
  - [x] Open `apps/web/test/a11y/DeleteTodoModal.a11y.test.tsx`.
  - [x] Add: `it('error state — zero axe-core violations', ...)` — render modal with a fake todo and `error="Couldn't delete. Check your connection."` and `isDeleting={false}`.

- [x] **Task 7 — Extend `App.tsx` delete-failure state + handlers (AC: 8, 9, 10)**
  - [x] Open `apps/web/src/App.tsx`.
  - [x] Add: `const [deleteError, setDeleteError] = useState<string | null>(null);`
  - [x] Refactor `handleConfirmDelete` (currently at line 45 in the Story 3.5 version) — MOVE the `setTodoPendingDelete(null)` synchronous call into the mutation's per-call `onSuccess`:
    ```tsx
    const handleConfirmDelete = useCallback(
      (todo: Todo) => {
        deleteMutate(todo.id, {
          onSuccess: () => {
            setTodoPendingDelete(null);
            setDeleteError(null);
            queueMicrotask(() => {
              deleteTriggerRef.current?.focus();
            });
          },
          onError: () => {
            setDeleteError("Couldn't delete. Check your connection.");
            // Modal stays open — do NOT clear todoPendingDelete here.
          },
        });
      },
      [deleteMutate],
    );
    ```
    This is the single biggest semantic change in the file — the Story 3.5 comment about "focus falls to document.body" at lines 49–54 must be UPDATED (or removed) since the `queueMicrotask` pattern is now in use for the success path too.
  - [x] Update `handleCancel` to also clear the delete error:
    ```tsx
    const handleCancel = useCallback(() => {
      setTodoPendingDelete(null);
      setDeleteError(null); // NEW — clear any in-flight error when user cancels out of error state
      queueMicrotask(() => {
        deleteTriggerRef.current?.focus();
      });
    }, []);
    ```
  - [x] Wire the modal with the new props:
    ```tsx
    <DeleteTodoModal
      todo={todoPendingDelete}
      onCancel={handleCancel}
      onConfirm={handleConfirmDelete}
      error={deleteError}
      isDeleting={deleteMutation.isPending}
    />
    ```
    — `deleteMutation` is currently destructured as `const { mutate: deleteMutate } = useDeleteTodo();` (line 18). Change that to `const deleteMutation = useDeleteTodo();` and rename `deleteMutate` references to `deleteMutation.mutate`. (Or keep both by also capturing `deleteMutation` alongside.) Choose whichever yields the smallest diff.
  - [x] **Important:** the `deleteMutation.isPending` flag is true during the in-flight delete AND during an in-flight retry. Both are periods where the Delete/Retry button should be disabled. This is AC7-correct behavior.

### Integration + E2E + gates

- [x] **Task 8 — Update `App.integration.test.tsx` (AC: 13)**
  - [x] Extend the existing `it('toggle failure reverts the row to its prior state ...')` (currently lines 396–437):
    - After the revert assertion, add: `const alert = await screen.findByRole('alert');`, `expect(alert).toHaveTextContent("Couldn't save. Check your connection.");`, `expect(alert).not.toHaveTextContent('boom');`, `expect(within(alert).getByRole('button', { name: /retry/i })).toBeVisible();`. Import `within` from `@testing-library/react`.
  - [x] Add: `it('toggle failure → Retry succeeds → row moves to Completed, error unmounts', ...)` — fetch mock returns 500 on first PATCH, 200 on second; after click Retry, PATCH count is 2, both calls' body is `{ completed: true }`, row is in the Completed section, `screen.queryByRole('alert')` is null.
  - [x] Add: `it('toggle failure → fresh toggle on same row succeeds, error unmounts', ...)` — fetch mock returns 500 on first PATCH, 200 on second; after second checkbox click (not Retry), error unmounts per AC5.
  - [x] Add: `it('delete failure → modal stays open with error, Retry succeeds → row removed, modal closes', ...)` — fetch mock: GET returns one todo; DELETE returns 500 on first call, 204 on second. Click delete icon → modal opens → click Delete → assert modal still visible, body replaced by alert with locked delete copy, Delete button now labeled "Retry". Click Retry → DELETE count is 2, modal not visible, todo gone from list.
  - [x] Add: `it('delete failure → Cancel in error state closes modal without firing DELETE', ...)` — DELETE returns 500 once; click Cancel after seeing the error; assert modal closed, DELETE count stays at 1 (no retry fired), row still visible.
  - [x] Reuse the established `mountApp()` + `FetchFn` + `vi.stubGlobal('fetch', ...)` + `afterEach(() => vi.unstubAllGlobals())` harness. No new infrastructure.

- [x] **Task 9 — Playwright E2E specs (AC: 14)**
  - [x] Create `apps/web/e2e/journey-3-toggle-fail.spec.ts`:
    - Copy `truncateTodos()` helper + `REPO_ROOT` + `addTodo` helper verbatim from `journey-2-delete.spec.ts`.
    - Seed one todo via the app UI (`addTodo(page, 'Buy milk')`).
    - Register `page.route('**/v1/todos/*', ...)` BEFORE the checkbox click. On method === 'PATCH', return 500 on first call (`postCount++` pattern from Story 4.2 guidance) and `route.continue()` thereafter.
    - Click the checkbox (`page.getByLabelText('Mark complete: Buy milk').click()`).
    - Assert within 1000ms: the row's `InlineError` is visible with exact text `"Couldn't save. Check your connection."`; the checkbox is unchecked (reverted); within the row, a Retry button is present.
    - Click Retry; assert the row moves to the Completed section (locate by `heading: "Completed"` + row presence in its subtree); assert the alert disappears.
  - [x] Create `apps/web/e2e/journey-3-delete-fail.spec.ts`:
    - Same helper boilerplate.
    - Seed one todo; click delete icon; modal opens.
    - Register `page.route('**/v1/todos/*', ...)` filtering on method === 'DELETE'; 500 on first, pass-through thereafter.
    - Click Delete; assert the modal stays visible; assert the body now contains the alert with `"Couldn't delete. Check your connection."`; assert a button labeled `Retry` is present.
    - Click Retry; assert the modal disappears; assert the todo row is gone from the list.
  - [x] Do not factor a shared helper file yet — three specs duplicating `truncateTodos()` is acceptable for MVP; a single refactor at Epic 4 close is the better moment.

- [x] **Task 10 — Verify gates (AC: 15)**
  - [x] `npm run typecheck --workspace @todo-app/web` → pass.
  - [x] `npm run lint --workspace @todo-app/web` → pass, no new warnings.
  - [x] `npm test --workspace @todo-app/web` → all pre-existing + extended + new tests pass.
  - [x] `npm run build --workspace @todo-app/web` → pass.
  - [x] `npm run test:e2e --workspace @todo-app/web` (requires `docker compose up -d postgres` + API dev server) → all specs pass including both new journey-3 specs.
  - [x] `git diff --stat` lists exactly the expected files (see File List Plan below).

- [x] **Task 11 — Story hygiene**
  - [x] Update this story's **Dev Agent Record → File List** with actual paths touched.
  - [x] Fill **Completion Notes List** with any deviations.
  - [x] Run `code-review` to move the story to `review`.

### File List Plan

**Modified (7 files):**
- `apps/web/src/components/TodoRow.tsx` — layout refactor + new props
- `apps/web/src/components/TodoRow.test.tsx` — updated flex-class assertion + new tests
- `apps/web/test/a11y/TodoRow.a11y.test.tsx` — new error-state axe case
- `apps/web/src/components/TodoList.tsx` — new props for per-row error threading
- `apps/web/src/components/DeleteTodoModal.tsx` — new props + body/button swap
- `apps/web/src/components/DeleteTodoModal.test.tsx` — new error-state tests
- `apps/web/test/a11y/DeleteTodoModal.a11y.test.tsx` — new error-state axe case
- `apps/web/src/App.tsx` — toggle error Map + Set + delete error slot + handler overrides
- `apps/web/src/App.integration.test.tsx` — one extended + four new tests

**New (2 files):**
- `apps/web/e2e/journey-3-toggle-fail.spec.ts`
- `apps/web/e2e/journey-3-delete-fail.spec.ts`

**Status file:**
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `_bmad-output/implementation-artifacts/4-3-toggle-failure-row-anchored-error-delete-failure-modal-anchored-error.md` (this file's File List section)

## Dev Notes

### Why the `<li>` must become a column container (and the test at `TodoRow.test.tsx:37` must change)

- The existing test asserts the flex-row classes on the `<li>` itself: `expect(li).toHaveClass('flex', 'items-center', 'gap-3', 'py-3', 'border-b')`. That test is the canary for a structural refactor.
- The AC (and the UX spec) require `InlineError` to render INSIDE the same `<li>` but BELOW the main row — impossible with flex-row on the `<li>`. The refactor is: `<li>` becomes `flex flex-col border-b ...`, and the current flex-row content moves to an inner `<div>` with `flex items-center gap-3 py-3 md:py-4 px-2`.
- **Do NOT** keep the flex-row on `<li>` when `error` is null and swap to column when `error` is set. That branching complicates memo comparisons AND creates a layout shift the instant an error appears. The unconditional refactor is cleaner and matches the test update.
- Update path for the test: move the class-list assertion off `<li>` and onto the inner `<div>` — e.g., `const row = container.querySelector('li > div'); expect(row).toHaveClass('flex', 'items-center', 'gap-3', 'py-3')` and separately `expect(li).toHaveClass('border-b')`.

### Why toggle errors live in a `Map` (not a single slot) but delete errors live in a single slot

- Multiple rows can be in an error state simultaneously (imagine 10 in-flight toggles, 3 reject). Each row's `InlineError` is independent — it lives on its row. `Map<string, ToggleAttempt>` is the natural shape.
- Only one modal can be open at a time. `todoPendingDelete` is already a single slot (Story 3.5). `deleteError` mirrors that — a single `string | null`. No Map needed.
- **Why not reuse the TanStack mutation's `.error`?** Because (a) raw server text leaks through (AC6/10 forbid), and (b) after a SUCCESSFUL retry the mutation clears `.error`, but a PRIOR row error for a different id would also get obliterated. Shared mutation state cannot express "row A errored, row B is retrying, row C succeeded." App-owned per-row state is the only correct shape.

### Why `handleToggleRetry` reuses `handleToggle` instead of inlining a parallel code path

- AC4 (retry success/error cleanup) and AC5 (fresh-success cleanup) specify IDENTICAL cleanup behavior. The only difference is that retry needs to mark the id as `retrying` before dispatch.
- Calling `handleToggle(id, attempt.desiredCompleted)` after `setRetryingIds((prev) => new Set(prev).add(id))` satisfies both paths with one implementation. If you split them, the success cleanup in the two branches will drift — guaranteed maintenance bug.
- The slight awkwardness of `setToggleErrors((prev) => prev)` in the sketch above can be removed if you read `toggleErrors` directly via closure (it's already in the `useCallback` dependency list). That no-op `setToggleErrors` was included only to document that the state is read, not written, at retry time.

### Why the delete modal's Delete button doubles as Retry (no `onRetry` on the nested `InlineError`)

- The UX spec treats the modal's primary Danger button as the single commitment point. Rendering a Retry button INSIDE the `InlineError` AND a Retry-labeled Delete button would create two visually similar danger controls, two tab stops to the same action, and ambiguity about which one the screen-reader should announce as the primary destructive affordance.
- The spec says: *"the Delete button label flips to `Retry` while still Danger-styled."* That is load-bearing. `InlineError` is imported without `onRetry`; it renders just icon + message.
- AC7 and Task 5 call this out explicitly. Do not wire `onRetry` on the modal's `InlineError` "to be symmetric with the row" — the symmetry is a mirage; the two contexts have different action budgets.

### Why the `aria-describedby` id must move to the replaced element

- `DeleteTodoModal.tsx:55` sets `aria-describedby={bodyId}` on the `<dialog>`. If we keep `bodyId` on a node that no longer renders (the original `<p>`), screen readers follow a dead reference — silent failure, axe won't catch it, users lose context.
- Moving `id={bodyId}` onto the new `<div>` that wraps `<InlineError />` (OR onto a surrounding wrapper) preserves the reference. This is a correctness fix, not styling.

### Why `App.tsx` switches `deleteMutate` destructuring to `deleteMutation`

- Story 3.5 destructured only `.mutate`: `const { mutate: deleteMutate } = useDeleteTodo();`. That line lets us call `deleteMutate(id)` succinctly.
- Story 4.3 needs BOTH `.mutate` (to dispatch) AND `.isPending` (to drive `isDeleting` on the modal). The cleanest is to grab the whole result object: `const deleteMutation = useDeleteTodo();` then `deleteMutation.mutate(...)` and `deleteMutation.isPending`.
- This mirrors how Story 4.2 interacts with `createMutation` — established pattern.

### Why the Story 3.5 "focus falls to document.body" comment must be removed or updated

- That comment (App.tsx:49–54) was accurate for Story 3.5's success-synchronous-close: at the moment the modal closed, the row was optimistically removed, the delete icon was already detached from the DOM, and there was no good focus target — so focus fell to body.
- Story 4.3 changes the success close to happen in `onSuccess` (after the mutation resolves). At that point, we KNOW the delete succeeded and can safely return focus via `queueMicrotask(() => deleteTriggerRef.current?.focus())` — the same pattern as `handleCancel`. Focus will still land on a dead reference (the removed delete icon's old position), but the browser will fall back to `<body>` gracefully. The semantic improvement: focus return is now explicit, not accidental.
- If you leave the outdated comment in place it will mislead the next reader into thinking the focus handling is still a known-broken edge case.

### Why per-call `onSuccess`/`onError` are used (vs. `useEffect` on mutation status)

- Per-call callbacks (`mutate(vars, { onSuccess, onError })`) fire AFTER the hook-level callbacks in `useOptimisticTodoMutation.ts` (`onError` reverts the snapshot; `onSettled` invalidates the list). That ordering is exactly what we need: the optimistic factory handles rollback, then OUR callback updates per-row error state.
- `useEffect` watching `mutation.status` runs on EVERY mutation state transition, including ones we don't care about, and requires reading `mutation.variables` to know which id was affected — flaky because `.variables` may be stale by the time the effect fires for concurrent mutations.
- Follow the Story 4.2 precedent exactly: one mutation instance, per-call callbacks on each `.mutate()` invocation.

### Why `isRetrying` is per-id (Set) and not just `mutation.isPending`

- `useToggleTodo()` returns ONE mutation result. `mutation.isPending` is true if ANY toggle is in flight.
- If we drove `isRetrying` off `mutation.isPending`, then while Row A's retry was pending, Row B's error (if it had one) would ALSO display a retry spinner — false UI.
- Tracking a `Set<string>` of retrying ids lets us say precisely "row X is currently retrying" without cross-contamination.
- Same argument does not apply to delete: only one delete is ever in-flight (the user can only open one modal at a time). `deleteMutation.isPending` is the correct global — no Set needed.

### Previous Story Intelligence

**From Story 4.1 (`InlineError`) — directly consumed twice:**
- Props contract: `{ message: string; onRetry?: () => void; isRetrying?: boolean }`.
- Wrapper has `role="alert"` — both `TodoRow`'s and `DeleteTodoModal`'s error states will be discoverable via `screen.getByRole('alert')`.
- Inside `DeleteTodoModal`, pass only `message` (no `onRetry`) — the modal's primary button is the Retry control.
- Inside `TodoRow`, pass all three props.

**From Story 4.2 (`AddTodoInput` create failure) — architectural pattern:**
- App-owned error state + per-call `onSuccess`/`onError` on `.mutate()` + locked copy (not `error.message`) is the pattern. Story 4.3 applies it to two more mutations (toggle, delete) with the twist of per-id tracking for toggle.
- Same commit rhythm: `feat: story 4.3 implemented`.

**From Story 3.3 (optimistic factory) — load-bearing:**
- `useOptimisticTodoMutation` already reverts on error via `ctx.previous`. Story 4.3 does NOT touch this hook. App's per-call `onError` fires AFTER the factory's rollback — the row is already back in its prior state by the time we set `toggleErrors`.
- The factory's `onSettled` invalidates `['todos']` → list refetches and converges. This is independent of our per-row error state.

**From Story 3.5 (`DeleteTodoModal` + App delete flow):**
- `handleConfirmDelete` currently closes the modal synchronously (line 48). Task 7 moves this into the mutation's `onSuccess`. This is the ONE file-scope invariant this story breaks with Story 3.5.
- `queueMicrotask(() => deleteTriggerRef.current?.focus())` — reuse in `onSuccess` path (new) and keep in `handleCancel` (existing).
- `HTMLDialogElement` polyfill in `test/setup.ts` — unchanged; no action needed.

**From Story 2.5 (`TodoRow` + delete icon):**
- Delete icon `aria-label={\`Delete todo: ${description}\`}` — stable; unchanged.
- The component has `React.memo` wrapping — preserve it. The new `error` / `onRetry` / `isRetrying` props work with the default shallow comparator as long as parents pass stable references (Task 3's `rowRetry` closure is the one that will re-create per render; that's acceptable for MVP list sizes).

**From Story 1.5 (design tokens):**
- `--color-danger` is used for the Delete/Retry button; no color change. The `#fef2f2` / `#fecaca` / `#991b1b` palette for `InlineError` is self-contained in Story 4.1's component file.

### Git Intelligence

- Recent commit rhythm (most-recent first): `feat: story 3.4 implemented`, `feat: story 3.3 implemented`, `feat: story 3.2 implemented`, `feat: story 3.1 implemented`, `feat: story 2.6 implemented`. Use `feat: story 4.3 implemented`.
- File-scope discipline: see the File List Plan block above for the authoritative list. `git diff --stat` at the end of implementation should match exactly.
- **No new dependencies.** Consumes `InlineError` from Story 4.1; React, TanStack, vitest, Playwright, `@testing-library/react` are already wired.
- **No API changes. No migration changes. No hook-layer changes.** `useToggleTodo.ts` / `useDeleteTodo.ts` / `useOptimisticTodoMutation.ts` / `apiClient.ts` are untouched.
- **Prerequisite implementations:** Story 4.1 (`InlineError`) and ideally Story 4.2 (`AddTodoInput` + App create-error pattern) landed first. If you attempt 4.3 before 4.1, there is no `InlineError.tsx` to import — the typecheck will fail fast.

### Latest Tech Information

- **TanStack Query v5 `mutate(vars, { onSuccess, onError })` callbacks:** fire AFTER the hook-level callbacks defined in `useMutation({ onError, onSettled })` (which lives in `useOptimisticTodoMutation.ts`). Ordering: hook-`onMutate` → request → hook-`onError`/`onSuccess` → per-call-`onError`/`onSuccess` → hook-`onSettled`. For toggle: the optimistic rollback is done before our per-call `onError` sets the error state. For delete: same.
- **Playwright `page.route()` method filtering:** `route.request().method()` is a synchronous read; don't `await` it. Use in a conditional before `route.fulfill({...})` or `route.continue()`.
- **React 19 stable Set/Map updates:** functional updater form (`setState(prev => new Map(prev).set(k, v))`) is idiomatic. Do not mutate `prev` in place — React's bail-out check uses `Object.is`, and a mutated Map with the same reference will not trigger re-render.
- **jsdom `HTMLDialogElement` polyfill (`test/setup.ts:13-24`):** already handles `.showModal()` and `.close()`. `isDeleting` tests render with mock `deleteMutation.isPending=true`; no additional polyfill required.
- **Tailwind v4:** no new tokens. Re-use existing `--color-danger`, `--color-border`, `--color-surface`, `--color-fg`. `InlineError` brings its own palette internally.

### Project Structure Notes

**Modified (7 source files, 2 test files):** enumerated in the File List Plan above.

**New (2 Playwright specs):** `journey-3-toggle-fail.spec.ts` and `journey-3-delete-fail.spec.ts`, both in `apps/web/e2e/`.

**Alignment with `architecture.md:562-571` (component inventory):** no new component introduced. `InlineError` added in Story 4.1 is now consumed three times total (`AddTodoInput`, `TodoRow`, `DeleteTodoModal`) — achieving FR-010's "shared component" contract.

**Alignment with `architecture.md:398-410` (error-handling discipline):** "CRUD errors are inline at the failure site (FR-010) via a shared `<InlineError>` component with a `Retry` button." After Story 4.3, all three CRUD mutations (create in 4.2, toggle/delete here) follow this discipline.

**Alignment with `ux-design-specification.md § Feedback Patterns (lines 895-910)`:** create failure → below `AddTodoInput` (4.2); toggle failure → anchored to row (AC1–6 here); delete failure → inside still-open modal (AC7–10 here). The full locked-copy table also lands here: `"Couldn't save. Check your connection."` for toggle; `"Couldn't delete. Check your connection."` for delete.

### Testing Standards

- **Unit (component):** `TodoRow.test.tsx` + `DeleteTodoModal.test.tsx` — extended; co-located; one pre-existing class-assert test updated; all other pre-existing tests stay green untouched.
- **A11y:** `TodoRow.a11y.test.tsx` + `DeleteTodoModal.a11y.test.tsx` — extended with error-state cases. Both files gain one `it` block; axe runs against the new markup.
- **Integration (app tree):** `App.integration.test.tsx` — one existing test extended (toggle failure), four new tests added. Fetch-mocked with `vi.stubGlobal`; `afterEach(() => vi.unstubAllGlobals())` handles cleanup.
- **E2E (Playwright):** two new specs under `apps/web/e2e/`, both using `truncateTodos()` + `page.route()` fault-injection pattern. Must run against real API + Postgres (`docker compose up -d postgres` + API dev server + web dev server via `npm run test:e2e`).
- **Coverage:** every new branch in `TodoRow` (error-present vs absent), `DeleteTodoModal` (error-present vs absent), `TodoList` (Map lookup paths), and `App.tsx` (toggle Map set/delete, retryingIds add/delete, delete error set/clear) exercised by at least one unit or integration test.
- **No snapshot tests.** Continue the project's explicit-assertion discipline.

### References

- Epic requirements: `_bmad-output/planning-artifacts/epics.md` § Story 4.3 (lines 1206–1283)
- UX spec — InlineError component contract: `_bmad-output/planning-artifacts/ux-design-specification.md` § Component 8 `InlineError` (lines 825–840)
- UX spec — Feedback patterns (inline-at-failure-site discipline + locked copy per verb): `_bmad-output/planning-artifacts/ux-design-specification.md` § Feedback Patterns (lines 895–910)
- UX spec — Journey 3 / toggle-fail + delete-fail diagrams: `_bmad-output/planning-artifacts/ux-design-specification.md` § Journey 3 — Error Recovery (lines 620–652)
- UX spec — TodoRow component contract (states: error anchored below row): `_bmad-output/planning-artifacts/ux-design-specification.md` § Component 3 `TodoRow` (around line 769)
- UX spec — DeleteTodoModal component contract (error-within-modal state): `_bmad-output/planning-artifacts/ux-design-specification.md` § Component 5 `DeleteTodoModal` (around line 782)
- Architecture — TanStack Query conventions (optimistic factory, invalidation): `_bmad-output/planning-artifacts/architecture.md` § Communication Patterns (lines 380–395)
- Architecture — Error-handling discipline: `_bmad-output/planning-artifacts/architecture.md` § Process Patterns → Error handling (lines 398–411)
- Architecture — Component boundaries (App owns cross-component UI state): `_bmad-output/planning-artifacts/architecture.md` § Architectural Boundaries (lines 595–601)
- PRD — FR-004 (delete with modal confirm), FR-010 (inline error + retry), NFR-004 (error resilience): `_bmad-output/planning-artifacts/PRD.md`
- Previous story — `InlineError` component: `./4-1-inlineerror-component.md`
- Previous story — create-failure pattern (App-owned error state + locked copy): `./4-2-create-failure-flow-addtodoinput-inline-error-with-preserved-input-retry.md`
- Previous story — `useOptimisticTodoMutation` factory (invariants preserved): `./3-3-useoptimistictodomutation-factory-usetoggletodo-usedeletetodo-hooks.md`
- Previous story — `TodoRow` delete icon + isMutating prop: `./2-5-todorow-non-completed-todolist-active-section-loadingskeleton-emptystate.md`
- Previous story — `DeleteTodoModal` + App delete flow (Story 3.5): `./3-5-deletetodomodal-component-app-tsx-delete-flow-journey-2-complete.md`
- Previous story — completed state + sectioning (TodoList section boundaries unchanged): `./3-4-todorow-completed-state-todolist-completed-section-app-tsx-sectioning.md`
- Existing toggle-fail baseline test: `apps/web/src/App.integration.test.tsx:396-437`
- Existing fetch-stub pattern: `apps/web/src/App.integration.test.tsx:8-25` (FetchFn + mountApp + afterEach cleanup)
- Existing Playwright helper pattern: `apps/web/e2e/journey-2-delete.spec.ts:1-32` (truncateTodos + REPO_ROOT + addTodo)
- Current TodoRow to refactor: `apps/web/src/components/TodoRow.tsx:17` (the `<li>` whose class list changes)
- Current DeleteTodoModal body node: `apps/web/src/components/DeleteTodoModal.tsx:63-65` (the `<p id={bodyId}>` to swap)
- Current App handleConfirmDelete (Story 3.5 synchronous close): `apps/web/src/App.tsx:45-55` (pattern moves into `onSuccess`)

## Dev Agent Record

### Agent Model Used

claude-opus-4-7 (Opus 4.7, 1M context)

### Debug Log References

- Full unit + integration suite (`npm test --workspace @todo-app/web`): 28 files, 169 tests, all green.
- Typecheck (`npm run typecheck --workspace @todo-app/web`): clean.
- Build (`npm run build --workspace @todo-app/web`): clean (240.78 kB JS / 14.35 kB CSS).
- Lint (`npm run lint` from repo root): 0 errors; 1 pre-existing warning in `apps/api/src/db/index.ts` (unrelated to this story; verified against `master` baseline via `git stash`).
- Playwright e2e (`npm run test:e2e --workspace @todo-app/web`): 20/20 passed including new `journey-3-toggle-fail.spec.ts` and `journey-3-delete-fail.spec.ts`.

### Completion Notes List

- **TodoRow refactor (Task 1)**: `<li>` is now `flex flex-col border-b`; flex-row layout moved to inner `<div>` so `InlineError` can stack below the row content. Existing class-list assertion in `TodoRow.test.tsx` was updated to assert `flex-col` on the `<li>` and `flex items-center gap-3 py-3` on the inner wrapper (per Dev Notes).
- **TodoList per-row threading (Task 3)**: The `rowRetry` closure is created per render — left as-is for MVP list sizes per Task 3 explicit guidance ("at most one per render cycle in practice"); no `useMemo`/`useCallback` map.
- **App.tsx toggle path (Task 4)**: `handleToggleRetry` reuses `handleToggle` (after marking the id retrying) so success/error cleanup lives in a single implementation. Map/Set updates use functional updaters with new instances to avoid React's `Object.is` bail-out (per Dev Notes "Latest Tech Information").
- **DeleteTodoModal (Task 5)**: `id={bodyId}` moves onto whichever element renders so `aria-describedby` always points at a real node. Cancel button stays enabled in error state (least-destructive default). `InlineError` is imported WITHOUT `onRetry` — the modal's Delete/Retry button is the single danger control (per Dev Notes "no `onRetry` on the nested `InlineError`").
- **App.tsx delete path (Task 7)**: Switched `const { mutate: deleteMutate } = useDeleteTodo();` → `const deleteMutation = useDeleteTodo();` to access both `.mutate` and `.isPending`. The Story 3.5 synchronous `setTodoPendingDelete(null)` was moved into the per-call `onSuccess`; the outdated comment about focus falling to body was removed and replaced with a note explaining the explicit `queueMicrotask` focus-restoration. `handleCancel` now also clears `deleteError`.
- **AC15 — diff scope clean**: only the files in the File List Plan are touched; pre-staged Story 5.x context files and `docs/ai-usage-log.md` (already staged before this story started) are unrelated.

### File List

**Modified:**
- `apps/web/src/components/TodoRow.tsx`
- `apps/web/src/components/TodoRow.test.tsx`
- `apps/web/test/a11y/TodoRow.a11y.test.tsx`
- `apps/web/src/components/TodoList.tsx`
- `apps/web/src/components/DeleteTodoModal.tsx`
- `apps/web/src/components/DeleteTodoModal.test.tsx`
- `apps/web/test/a11y/DeleteTodoModal.a11y.test.tsx`
- `apps/web/src/App.tsx`
- `apps/web/src/App.integration.test.tsx`

**New:**
- `apps/web/e2e/journey-3-toggle-fail.spec.ts`
- `apps/web/e2e/journey-3-delete-fail.spec.ts`

**Status:**
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (4-3 → review; last_updated → 2026-04-27)
- `_bmad-output/implementation-artifacts/4-3-toggle-failure-row-anchored-error-delete-failure-modal-anchored-error.md` (this file)

### Change Log

- 2026-04-27 — Story 4.3 implemented: row-anchored toggle-failure InlineError + retry; modal-anchored delete-failure InlineError with Delete→Retry button flip; locked copy across both verbs; per-call mutation callbacks for App-owned per-id error state. All 11 tasks complete; AC1–AC15 verified.
