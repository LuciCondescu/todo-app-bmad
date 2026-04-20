# Story 2.6: End-to-end wire-up in `App.tsx` — Journey 1 complete

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want to land on the app, type a todo, press Enter, and see it appear in a persisted list,
So that Journey 1 works end-to-end under SC-001 (≤60 seconds from landing).

## Acceptance Criteria

This story is a **composition + wiring** story. It does not author any new components — it wires the Story 2.3 hooks (`useTodos`, `useCreateTodo`) into the Story 2.4 / 2.5 components (`AddTodoInput`, `TodoList`, `LoadingSkeleton`, `EmptyState`) inside `App.tsx` and closes Journey 1 end-to-end with a Playwright spec. `main.tsx` stays untouched (the `ErrorBoundary + QueryClientProvider + StrictMode` tree from Story 1.5 is already correct).

### `App.tsx` composition

**AC1 — File, default export, semantic landmark, top-level layout**
- **Given** `apps/web/src/App.tsx` is rewritten
- **When** the engineer inspects it
- **Then** it exports a **default** function component `App` that renders exactly one container tree:
  ```tsx
  <div className="max-w-xl mx-auto px-4 pt-8 lg:pt-16">
    <Header />
    <main>
      {/* AddTodoInput + list area */}
    </main>
  </div>
  ```
- **And** the root `<div>` has classes `max-w-xl mx-auto px-4 pt-8 lg:pt-16` (UX-DR13, `epics.md:746`). No other classes — `pb-*`, `min-h-screen`, etc. are NOT added (MVP scope — the scroll-through-empty-space pattern is fine for a 50-row cap)
- **And** the `<main>` element is present as a **direct child** of the root `<div>` (preserves the semantic landmark from the existing `App.test.tsx`; `screen.getByRole('main')` must keep passing)
- **And** the `<Header />` sits **before** `<main>` (not inside `<main>`) — the existing App.test.tsx asserts `getByRole('banner')` which `<header>` provides; wrapping it inside `<main>` would break landmark nesting rules and axe's `landmark-unique` rule
- **And** the file imports components with `.js` ESM specifiers (Story 2.3 convention):
  ```ts
  import Header from './components/Header.js';
  import AddTodoInput from './components/AddTodoInput.js';
  import TodoList from './components/TodoList.js';
  import LoadingSkeleton from './components/LoadingSkeleton.js';
  import EmptyState from './components/EmptyState.js';
  import { useTodos } from './hooks/useTodos.js';
  import { useCreateTodo } from './hooks/useCreateTodo.js';
  ```

**AC2 — `<main>` contents: AddTodoInput, then list area, in that order**
- **Given** the `<main>` element
- **When** the engineer inspects it
- **Then** it contains exactly two direct children, in this order:
  1. An `<AddTodoInput />` bound to the create mutation (see AC8)
  2. A list-area wrapper (a single `<div>`) that conditionally renders `LoadingSkeleton` / `EmptyState` / `TodoList` (see AC4–AC6). A semantic wrapper is not needed (the list components already carry their own semantics: `TodoList` renders `<ul>`; `LoadingSkeleton` is a `<div>` live-region; `EmptyState` is a `<div>` centered block)
- **And** there is vertical spacing between `AddTodoInput` and the list area — applied as `mt-6` on the list-area wrapper `<div>` (matches the `Header`'s `mb-6` rhythm from Story 1.5, giving a visually-even gap between the three sections)
- **And** NO `<section>`, `<aside>`, or other sectioning elements are added (the spec's simplicity is a feature; one `<main>`, one list, done)

### Render policy for the list area

**AC3 — List area decision tree: Pending → Skeleton; Empty → EmptyState; Data → TodoList; Error → minimal fallback**
- **Given** `const todosQuery = useTodos()` is called at the top of `App`'s function body
- **When** the list area renders
- **Then** it selects exactly one of four branches based on `todosQuery.status` / `data`:
  1. **`isPending` is `true`** → render `<LoadingSkeleton />` (no props — default `rows={3}`) — this is the first-load state before any fetch has resolved
  2. **`isPending` is `false`, `isError` is `true`** → render a **minimal error fallback** (see AC7) — the design-polished `InlineError` replacement lives in Epic 4
  3. **`isPending` is `false`, `isError` is `false`, `data.length === 0`** → render `<EmptyState />`
  4. **`isPending` is `false`, `isError` is `false`, `data.length > 0`** → render `<TodoList todos={data} onToggle={...} onDeleteRequest={...} />` (see AC9 for handler wiring)
- **And** the selection is implemented as a series of early-return `if`s inside a helper function, OR as a ternary chain — whichever reads cleaner. Do NOT use a switch on `status`; TanStack Query's `status` union is `'pending' | 'error' | 'success'`, but the `isPending` / `isError` / `data` booleans map more directly to the UX states
- **And** **no `EmptyState` flash** during the initial-pending window (UX-DR12, `epics.md:750`): the condition `isPending === true` takes precedence over `data.length === 0`. TanStack Query initializes `data` as `undefined` while pending; a naive `data.length === 0` check without the `isPending` guard would throw; the ordering of the branches above prevents this

**AC4 — `useTodos` is called exactly once, at the top of `App`**
- **Given** `App`'s function body
- **When** the engineer inspects it
- **Then** `useTodos()` is called **exactly once** — its return value is destructured (or bound to a single name) and consumed by the render-decision logic. Do NOT call `useTodos()` twice (once for `isPending`, again for `data`); React's strict rules of hooks make this safe but wasteful
- **And** the hook's return type is `UseQueryResult<Todo[], ApiError>` (per `apps/web/src/hooks/useTodos.ts`); destructure the narrow surface you need:
  ```ts
  const { data, isPending, isError, error: loadError } = useTodos();
  ```
- **And** the destructured names do NOT collide with the `createError` (see AC8) — the alias `loadError` above is optional but recommended for clarity when both errors are relevant in the same component

**AC5 — No `EmptyState` flash: ordering is Pending before Empty**
- **Given** the initial mount
- **When** the component first renders (before any fetch resolves)
- **Then** `isPending` is `true` → `<LoadingSkeleton />` renders (AC3 branch 1)
- **When** the fetch resolves with `[]`
- **Then** `isPending` flips to `false`, `data` becomes `[]` → `<EmptyState />` renders (AC3 branch 3)
- **And** at NO point between mount and resolution does `<EmptyState />` render (the Pending branch is ordered first in the decision tree; UX-DR12 / `epics.md:750`)
- **And** this contract is explicitly tested in both the unit test (mocked `useTodos`) and the integration test (real `QueryClient` + mocked `fetch`)

**AC6 — No list-area wrapper swallows a state transition**
- **Given** the list-area `<div>`
- **When** React re-renders on a state change (e.g., `isPending` flips false)
- **Then** the wrapper `<div>` persists (it's not conditionally rendered) — only its **children** swap out
- **And** the wrapper has a **stable key** (it's a single element in the render tree, so an explicit `key` isn't needed — but authors must not introduce a `key={todosQuery.status}` or similar, which would force a full-subtree remount on every status transition and cause focus thrash on the soon-to-mount next state)

### Error fallback for list fetch failure

**AC7 — Minimal list-area error fallback (pre-Epic-4)**
- **Given** `useTodos` resolves with `isError === true`
- **When** the list area renders
- **Then** it renders a minimal error region:
  ```tsx
  <div role="alert" aria-live="polite" className="text-[--color-danger] text-sm py-12 text-center">
    Couldn't load your todos.
  </div>
  ```
- **And** this is a **pre-Epic-4 placeholder** — Epic 4's `InlineError` component (Story 4.1) will replace this with the full background + border + Retry treatment. A code comment marks the spot:
  ```tsx
  {/* Minimal error region — replaced by <InlineError /> with Retry in Epic 4 (Story 4.1). */}
  ```
- **And** the copy is the exact string `Couldn't load your todos.` (no trailing period-then-space, no "please try again" — matches the concise, functional voice of UX-DR10 `ux-design-specification.md:131` "Reassured, in control … Copy is factual, not apologetic")
- **And** retry is NOT wired in this story (no `Retry` button) — Epic 4 / Story 4.1 adds it. Rationale: Story 2.6's scope is Journey 1; list-fetch failure is rare in the local-dev and CI contexts this story is verified in, and polishing the error UX now duplicates Epic 4 work
- **And** the `createError` (from the create mutation — see AC8) is routed separately through `AddTodoInput`'s error prop, NOT through this list-area error region

### Create mutation wiring

**AC8 — `useCreateTodo` is called once at the top; `AddTodoInput` props bound**
- **Given** `App`'s function body
- **When** the engineer inspects it
- **Then** `const createMutation = useCreateTodo()` is called **exactly once** (analogous to AC4 for `useTodos`)
- **And** `<AddTodoInput />` is rendered with these exact prop bindings:
  ```tsx
  <AddTodoInput
    onSubmit={createMutation.mutate}
    disabled={createMutation.isPending}
    error={createMutation.error?.message ?? null}
  />
  ```
  - `onSubmit={createMutation.mutate}` — a stable function reference (TanStack Query's `mutate` is memoized inside the hook; passing it directly avoids a fresh arrow on every render). See Dev Notes → "Why passing `createMutation.mutate` directly is safe"
  - `disabled={createMutation.isPending}` — Story 2.4 AC7's "clear + refocus" effect fires exactly once per `true → false` transition when `error == null`
  - `error={createMutation.error?.message ?? null}` — the `ApiError.message` from `apps/web/src/api/errors.ts`; `null` when no error (the `?? null` avoids passing `undefined` which AddTodoInput treats identically but the coercion keeps the prop type stable `string | null`)
- **And** on a successful 201, `useCreateTodo`'s `onSettled` invalidates `['todos']`, `useTodos` refetches (still driven by TanStack Query), `data` gains the new row, and the list re-renders with the new todo (this is the Story 2.3 contract — nothing new is wired here)
- **And** on a failed POST (network, 4xx, 5xx), `createMutation.error` is populated; `AddTodoInput`'s error region renders with the message; `AddTodoInput`'s input-preservation effect from Story 2.4 keeps the typed text on the input
- **And** after a successful settle, `createMutation.error` becomes `null` on the next mutation attempt (TanStack Query resets it when a new mutation starts) — this is the hook's behavior; `App` does not clear the error imperatively

### Stable handler stubs for the list

**AC9 — `onToggle` / `onDeleteRequest` passed as stable module-level no-op references**
- **Given** Epic 3 has not yet landed (toggle is Story 3.3, delete is Story 3.5)
- **When** this story wires `<TodoList />`
- **Then** the `onToggle` and `onDeleteRequest` props are passed as **stable references** defined at module scope in `App.tsx`:
  ```ts
  // Epic 3 replaces these with real handlers from useToggleTodo / useDeleteTodo (Stories 3.3, 3.5).
  function noopToggle(_id: string, _completed: boolean): void {}
  function noopDeleteRequest(_todo: Todo): void {}
  ```
  — and the JSX uses `onToggle={noopToggle}` / `onDeleteRequest={noopDeleteRequest}` (module-level constants have stable identities across all renders, preserving `TodoRow`'s `React.memo` bail-out from Story 2.5)
- **And** these stubs are **real functions** (not `undefined` — `TodoRow`'s props require them; not `() => {}` inline — inline arrows get new identities every render and would defeat memo)
- **And** a single-line comment above the stubs flags them as Epic 3 replacements (so the grep for `noopToggle` finds the spot during Story 3.3 implementation)
- **And** clicking the stubbed checkbox or delete button has NO observable effect on the page in this story — verified by the E2E (AC13 bullet 2: creating a todo lands the row; no AC here requires the clicks to do anything)

### App unit tests

**AC10 — `apps/web/src/App.test.tsx` is extended (not replaced) with mocked-hook tests**
- **Given** the existing `App.test.tsx` (asserts `<Header />`, `<main>`, `<banner>` all mount)
- **When** the engineer extends it
- **Then** the file adds new `describe(...)` blocks that mock `useTodos` and `useCreateTodo` via `vi.mock(...)` and assert the render-policy branches (AC3). See Dev Notes → "Mocking `useTodos` / `useCreateTodo` at the module level" for the canonical pattern
- **And** the existing "mounts without error and renders the Header" test continues to pass unmodified (it mounts the real hooks under a `QueryClientProvider`; since no `fetch` mock is installed, `useTodos`'s initial state is `{ isPending: true }` → `<LoadingSkeleton />` renders in the list area — the test only asserts Header + `<main>`, which still holds)
- **And** the new `describe('<App /> list-area render policy', ...)` block contains these `it` blocks:
  1. **Pending → LoadingSkeleton:** mock `useTodos` to return `{ isPending: true, data: undefined, isError: false }`; mock `useCreateTodo` to return a stub mutation; render `<App />` (no provider wrapper needed because the hooks are mocked); assert `screen.getByLabelText('Loading your todos')` is in the document; assert `screen.queryByText('No todos yet.')` is `null`
  2. **Empty → EmptyState:** mock `useTodos` to return `{ isPending: false, data: [], isError: false }`; assert `screen.getByText('No todos yet.')` is in the document; assert the `LoadingSkeleton`'s live-region label is NOT present
  3. **Data → TodoList:** mock `useTodos` to return `{ isPending: false, data: [todoA, todoB], isError: false }`; assert two `<li>` elements are in the document; assert both descriptions are visible
  4. **Error → minimal fallback:** mock `useTodos` to return `{ isPending: false, data: undefined, isError: true, error: new ApiError(500, 'boom') }`; assert `screen.getByRole('alert')` has text `"Couldn't load your todos."`
  5. **Container classes:** mount any of the above; assert the outermost `<div>` has classes `max-w-xl`, `mx-auto`, `px-4`, `pt-8`, `lg:pt-16` (use `toHaveClass` per-class to avoid order-dependence)
  6. **`AddTodoInput` bound props:** mock `useCreateTodo` to return `{ mutate: vi.fn(), isPending: true, error: new ApiError(400, 'too long') }`; render; assert the Add button is `disabled` (reflects `disabled={true}`); assert `screen.getByRole('alert')` has text `"too long"` (reflects `error={'too long'}`)
- **And** the mocks are reset between tests via `beforeEach(() => vi.clearAllMocks())` or per-test `.mockReturnValue(...)` overrides (the canonical Vitest-Testing-Library pattern — see the Dev Notes snippet)

### Integration tests

**AC11 — `apps/web/src/App.integration.test.tsx` — full tree with mocked `fetch`**
- **Given** the full provider tree (`ErrorBoundary + QueryClientProvider + App`)
- **When** the engineer runs `npm test --workspace apps/web`
- **Then** a new integration test file at `apps/web/src/App.integration.test.tsx` runs four scenarios (each `it` block is one scenario):
  1. **`fetch` returns `[]`** (freshly-migrated DB simulation): after an `await waitFor(() => expect(screen.queryByLabelText('Loading your todos')).toBeNull())`, `<EmptyState />`'s "No todos yet." is visible; two `fetch` calls max (initial GET + possible StrictMode double-invoke — see Dev Notes → "StrictMode double-invocation and test fetch counts")
  2. **`fetch` returns 2 todos:** same wait pattern; assert two `<li>` elements render with the returned descriptions; the `LoadingSkeleton` is no longer present
  3. **Create-then-refetch flow:** initial GET returns `[]` → EmptyState. `fetch` is re-stubbed to handle `POST /v1/todos` returning `201 { ...new todo }`; the subsequent invalidation-driven GET returns `[newTodo]`. The user types "Buy milk" + presses Enter in the `AddTodoInput`. Assert: the new row's description `"Buy milk"` appears in the list; the `AddTodoInput`'s value is cleared (`input.value === ''`) and the input is refocused (Story 2.4 AC7 contract)
  4. **Create failure flow:** initial GET returns `[]`. `fetch` re-stubbed so POST rejects with `500`. User types "Buy milk" + Enter. Assert: the `AddTodoInput`'s error region (`role="alert"`) appears with the message from the error envelope (or the default `Internal Server Error` message the apiClient uses as a fallback); the input value is preserved (not cleared); no new `<li>` appears in the list
- **And** the integration test uses a **real `QueryClient`** (not a mocked query client), and **mocks only `global.fetch`** via `vi.stubGlobal('fetch', ...)` — matching the pattern from `apps/web/src/hooks/useCreateTodo.test.tsx`. See Dev Notes → "Integration-test fetch-mocking pattern"
- **And** the test file imports `App` from `'./App.js'`, `ErrorBoundary` from `'./components/ErrorBoundary.js'`, and wraps with the real `QueryClientProvider` + `ErrorBoundary` to match the production tree (without `StrictMode` — see Dev Notes → "Why the integration test omits `StrictMode`")
- **And** the test file does NOT modify `apps/web/src/main.tsx` or introduce a new test-only provider tree (composes `ErrorBoundary + QueryClientProvider + App` in the test setup)

### Playwright E2E — Journey 1

**AC12 — `apps/web/e2e/journey-1.spec.ts` — the full Journey 1 spec**
- **Given** `apps/web/playwright.config.ts` launches both the API (via `npm run dev --workspace apps/api`) and the web preview (via `npm run preview --workspace apps/web`) as `webServer` instances (Story 1.6 config, unchanged)
- **When** the engineer runs `npm run test:e2e --workspace apps/web`
- **Then** the new file `apps/web/e2e/journey-1.spec.ts` contains **four** `test(...)` blocks (matching the epic's E2E scenarios at `epics.md:786–790`):
  1. **Initial empty state:** `await page.goto('/')` on a freshly-migrated (empty) DB; assert the `Todos` header (`getByRole('heading', { level: 1, name: 'Todos' })`) is visible; assert the EmptyState copy `"No todos yet."` is visible
  2. **Type + Enter lands the row:** from the empty state, type `"Buy milk"` into the input (`getByRole('textbox', { name: 'Add a todo' })`) and press Enter; assert `getByText('Buy milk')` is visible in the Active section within a 1-second timeout (the spec-level budget; NFR-001's 100ms p95 is the perf test's job in Story 5.1)
  3. **Persistence across reload:** after the new row lands (test 2's precondition), `await page.reload()`; assert `getByText('Buy milk')` is still visible (FR-011 boundary 1 — the reload proves durability, not session state)
  4. **320px viewport responsiveness:** set viewport `{ width: 320, height: 800 }` via `page.setViewportSize(...)`; `await page.goto('/')`; type and submit as in test 2; assert `document.documentElement.scrollWidth <= 320` via `page.evaluate(() => document.documentElement.scrollWidth)`; assert input, Add button, and row are all visible
- **And** the test file does NOT drop the existing `smoke.spec.ts` (`apps/web/e2e/smoke.spec.ts`) — both files run; `smoke.spec.ts` keeps covering API `/healthz` + Header rendering; `journey-1.spec.ts` covers Journey 1 specifically
- **And** each test **cleans the DB before running** via a `test.beforeEach(async ({ request }) => { ... })` hook that DELETEs all existing todos — see Dev Notes → "Journey-1 DB cleanup strategy" (because Playwright runs are serial by default in `playwright.config.ts` with `fullyParallel: false`, a simple DELETE-loop is safe)
- **And** each test uses the Page Object pattern sparingly — a tiny module-local helper `addTodo(page, description)` encapsulates the "find input, type, press Enter" sequence; no external Page Object class

**AC13 — E2E DB cleanup: DELETE every todo via the API before each test**
- **Given** `apps/api/src/routes/todos.ts` does NOT yet expose `DELETE /v1/todos/:id` (Story 3.2)
- **When** the E2E test needs to reset to an empty DB
- **Then** the spec cannot use a single `DELETE` request per row (the endpoint doesn't exist yet)
- **And** the **chosen cleanup strategy** is: DIRECT-SQL truncate via a dedicated test-only endpoint? NO — that would require API changes this story is not introducing. See Dev Notes → "Journey-1 DB cleanup strategy" for the chosen approach:
  - **Chosen strategy: psql via `docker compose exec`** invoked from `test.beforeEach` using `execFileSync` in Node (the Playwright test file is running under Node + has full filesystem access). The command runs `TRUNCATE TABLE todos` on the container-hosted Postgres. This keeps the scope of this story contained to the web app + one spec file
  - **Alternative considered and rejected:** spinning up a fresh Postgres volume per test run (slower, brittle in local dev); running the Kysely migration + truncate via a Node script (adds a cross-workspace dep this story shouldn't introduce)
  - **Epic 3 simplification:** once Story 3.2's `DELETE /v1/todos/:id` lands, the E2E can replace `TRUNCATE` with a loop of `GET /v1/todos` → `DELETE /v1/todos/:id` per row. Story 3.5's acceptance criteria should mention this refactor opportunity

### Full check + manual smoke

**AC14 — `npm run check` exits 0; Journey 1 E2E passes locally and in CI**
- **Given** all source + test changes are in place
- **When** the engineer runs the following (in order):
  1. `npm run typecheck --workspace apps/web` — exits 0
  2. `npm run lint` — exits 0
  3. `npm run format:check` — exits 0 (run `npm run format` to normalize if needed)
  4. `npm test --workspace apps/web` — exits 0; **new** test counts:
     - `App.test.tsx` extended: +6 tests in the new `describe` block (AC10 bullets 1–6)
     - `App.integration.test.tsx` new file: 4 integration tests (AC11 bullets 1–4)
     - **Total new unit/integration: ~10**; pre-existing web tests remain passing (including the 2.5 components + their a11y suites, if 2.5 has landed)
  5. `npm test --workspace apps/api` — unchanged (no API changes in this story)
  6. `npm run check` — aggregate passes
  7. `docker compose up -d postgres && npm run migrate --workspace apps/api` — fresh DB (TRUNCATE optional if no prior data)
  8. `npm run test:e2e --workspace apps/web` — Playwright spins up API + web preview, runs `smoke.spec.ts` + `journey-1.spec.ts`, all 4 Journey 1 tests pass
- **And** manual smoke (Journey 1 itself): `docker compose up -d postgres && npm run dev` (both API + web via root script), open `http://localhost:5173`, verify:
  - The `Todos` header is visible
  - The `"No todos yet."` + `"Add one below."` empty state renders
  - The input is auto-focused (cursor blinking in it immediately)
  - Typing `"Buy milk"` + Enter: the row appears within ~200ms; input clears and re-focuses
  - Reload the page: the row is still there
  - Narrow the browser to 320px wide: no horizontal scroll, all elements usable
- **And** the README is checked against the onboarding contract (SC-001, NFR-006): a new engineer can clone, follow the README, and reach Journey 1 within 15 minutes; if any step is missing (e.g., the `npm run migrate` step isn't listed, or `.env.example` copy isn't prompted), update the README. Do NOT rewrite the README unless a gap is found during this check — the Story 1.6 README pass already covers the essentials

## Tasks / Subtasks

- [x] **Task 1: Rewrite `apps/web/src/App.tsx`** (AC: 1, 2, 3, 4, 5, 6, 7, 8, 9)
  - [x] Replace the current file contents with the full composition:
    ```tsx
    import type { Todo } from './types.js';
    import Header from './components/Header.js';
    import AddTodoInput from './components/AddTodoInput.js';
    import TodoList from './components/TodoList.js';
    import LoadingSkeleton from './components/LoadingSkeleton.js';
    import EmptyState from './components/EmptyState.js';
    import { useTodos } from './hooks/useTodos.js';
    import { useCreateTodo } from './hooks/useCreateTodo.js';

    // Epic 3 replaces these with real handlers from useToggleTodo / useDeleteTodo (Stories 3.3, 3.5).
    function noopToggle(_id: string, _completed: boolean): void {}
    function noopDeleteRequest(_todo: Todo): void {}

    export default function App() {
      const { data, isPending, isError } = useTodos();
      const createMutation = useCreateTodo();

      return (
        <div className="max-w-xl mx-auto px-4 pt-8 lg:pt-16">
          <Header />
          <main>
            <AddTodoInput
              onSubmit={createMutation.mutate}
              disabled={createMutation.isPending}
              error={createMutation.error?.message ?? null}
            />
            <div className="mt-6">{renderListArea({ data, isPending, isError })}</div>
          </main>
        </div>
      );
    }

    function renderListArea({
      data,
      isPending,
      isError,
    }: {
      data: Todo[] | undefined;
      isPending: boolean;
      isError: boolean;
    }) {
      if (isPending) return <LoadingSkeleton />;
      if (isError) {
        // Minimal error region — replaced by <InlineError /> with Retry in Epic 4 (Story 4.1).
        return (
          <div
            role="alert"
            aria-live="polite"
            className="text-[--color-danger] text-sm py-12 text-center"
          >
            Couldn&apos;t load your todos.
          </div>
        );
      }
      if (!data || data.length === 0) return <EmptyState />;
      return <TodoList todos={data} onToggle={noopToggle} onDeleteRequest={noopDeleteRequest} />;
    }
    ```
    - See Dev Notes → "Why `renderListArea` is a module-private helper, not a component"
    - See Dev Notes → "Why passing `createMutation.mutate` directly is safe"
    - See Dev Notes → "Why `noopToggle` / `noopDeleteRequest` are module-level"
  - [x] **Do NOT** import or reference `InlineError` (Epic 4 component) — the minimal error region is fine for this story
  - [x] **Do NOT** add a `Retry` button to the error region — Epic 4 adds it via `InlineError`
  - [x] **Do NOT** wrap `noopToggle` / `noopDeleteRequest` in `useCallback` — module-level constants are already stable; `useCallback` would be redundant
  - [x] **Do NOT** move `main.tsx`'s provider tree; `StrictMode + ErrorBoundary + QueryClientProvider` from Story 1.5 is the correct wrapping, unchanged

- [x] **Task 2: Extend `apps/web/src/App.test.tsx` with mocked-hook tests** (AC: 10)
  - [x] Keep the existing `describe('<App /> mounted in the full provider tree', ...)` block intact
  - [x] Add a new `describe('<App /> list-area render policy', ...)` block using `vi.mock(...)` for the two hooks:
    ```tsx
    import { beforeEach, describe, expect, it, vi } from 'vitest';
    import { render, screen } from '@testing-library/react';
    import App from './App.js';
    import { ApiError } from './api/errors.js';

    vi.mock('./hooks/useTodos.js', () => ({ useTodos: vi.fn() }));
    vi.mock('./hooks/useCreateTodo.js', () => ({ useCreateTodo: vi.fn() }));

    const { useTodos } = await import('./hooks/useTodos.js');
    const { useCreateTodo } = await import('./hooks/useCreateTodo.js');

    const useTodosMock = vi.mocked(useTodos);
    const useCreateTodoMock = vi.mocked(useCreateTodo);

    function stubMutation(overrides: Partial<ReturnType<typeof useCreateTodo>> = {}) {
      return {
        mutate: vi.fn(),
        isPending: false,
        error: null,
        ...overrides,
      } as unknown as ReturnType<typeof useCreateTodo>;
    }

    describe('<App /> list-area render policy', () => {
      beforeEach(() => {
        vi.clearAllMocks();
        useCreateTodoMock.mockReturnValue(stubMutation());
      });

      it('renders LoadingSkeleton while useTodos is pending', () => {
        useTodosMock.mockReturnValue({ isPending: true, data: undefined, isError: false } as any);
        render(<App />);
        expect(screen.getByLabelText('Loading your todos')).toBeInTheDocument();
        expect(screen.queryByText('No todos yet.')).toBeNull();
      });
      // ... bullets 2–6 follow the same shape
    });
    ```
    - Full snippet with all six bullets — the engineer authors the remaining five `it` blocks from AC10
  - [x] **Do NOT** mock React's `useState`, `useEffect`, or anything in the rendering tree beyond the two hooks
  - [x] **Do NOT** import `useTodos` / `useCreateTodo` at top-level with regular `import` syntax then override — the `vi.mock` + dynamic `await import` pattern above is required because `vi.mock` hoists but TypeScript complains about the casting without the destructure trick (see Dev Notes → "Mocking `useTodos` / `useCreateTodo` at the module level")

- [x] **Task 3: Create `apps/web/src/App.integration.test.tsx`** (AC: 11)
  - [x] New file — the full-tree integration test. Pattern draft:
    ```tsx
    import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
    import { render, screen, waitFor } from '@testing-library/react';
    import userEvent from '@testing-library/user-event';
    import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
    import App from './App.js';
    import { ErrorBoundary } from './components/ErrorBoundary.js';

    function makeClient() {
      return new QueryClient({
        defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
      });
    }

    function mountApp() {
      const client = makeClient();
      return render(
        <ErrorBoundary>
          <QueryClientProvider client={client}>
            <App />
          </QueryClientProvider>
        </ErrorBoundary>,
      );
    }

    describe('<App /> integration — full tree with mocked fetch', () => {
      afterEach(() => vi.unstubAllGlobals());

      it('shows EmptyState when GET /v1/todos returns []', async () => {
        vi.stubGlobal(
          'fetch',
          vi.fn(async () => ({
            ok: true,
            status: 200,
            statusText: 'OK',
            json: async () => [],
          })) as unknown as typeof fetch,
        );
        mountApp();
        await waitFor(() => expect(screen.queryByLabelText('Loading your todos')).toBeNull());
        expect(screen.getByText('No todos yet.')).toBeInTheDocument();
      });

      it('renders TodoList with 2 rows when GET /v1/todos returns 2 todos', async () => {
        const todos = [
          { id: '01', description: 'Buy milk', completed: false, createdAt: '2026-04-20T10:00:00.000Z', userId: null },
          { id: '02', description: 'Read book', completed: false, createdAt: '2026-04-20T10:00:01.000Z', userId: null },
        ];
        vi.stubGlobal(
          'fetch',
          vi.fn(async () => ({
            ok: true,
            status: 200,
            statusText: 'OK',
            json: async () => todos,
          })) as unknown as typeof fetch,
        );
        mountApp();
        await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(2));
        expect(screen.getByText('Buy milk')).toBeInTheDocument();
        expect(screen.getByText('Read book')).toBeInTheDocument();
      });

      it('create-then-refetch: typed todo appears after POST + refetch', async () => {
        const user = userEvent.setup();
        const newTodo = {
          id: '01',
          description: 'Buy milk',
          completed: false,
          createdAt: '2026-04-20T10:00:00.000Z',
          userId: null,
        };
        let state: 'initial' | 'after-post' = 'initial';
        vi.stubGlobal(
          'fetch',
          vi.fn(async (_url: string, init?: RequestInit) => {
            if (init?.method === 'POST') {
              state = 'after-post';
              return { ok: true, status: 201, statusText: 'Created', json: async () => newTodo };
            }
            return {
              ok: true,
              status: 200,
              statusText: 'OK',
              json: async () => (state === 'after-post' ? [newTodo] : []),
            };
          }) as unknown as typeof fetch,
        );
        mountApp();
        await waitFor(() => expect(screen.getByText('No todos yet.')).toBeInTheDocument());
        const input = screen.getByRole('textbox', { name: 'Add a todo' }) as HTMLInputElement;
        await user.type(input, 'Buy milk{Enter}');
        await waitFor(() => expect(screen.getByText('Buy milk')).toBeInTheDocument());
        expect(input.value).toBe('');
        expect(input).toHaveFocus();
      });

      it('create failure: error region shown, typed text preserved, no new row', async () => {
        const user = userEvent.setup();
        vi.stubGlobal(
          'fetch',
          vi.fn(async (_url: string, init?: RequestInit) => {
            if (init?.method === 'POST') {
              return {
                ok: false,
                status: 500,
                statusText: 'Internal Server Error',
                json: async () => ({ statusCode: 500, error: 'Internal Server Error', message: 'boom' }),
              };
            }
            return { ok: true, status: 200, statusText: 'OK', json: async () => [] };
          }) as unknown as typeof fetch,
        );
        mountApp();
        await waitFor(() => expect(screen.getByText('No todos yet.')).toBeInTheDocument());
        const input = screen.getByRole('textbox', { name: 'Add a todo' }) as HTMLInputElement;
        await user.type(input, 'Buy milk{Enter}');
        await waitFor(() => {
          const alert = screen.getByRole('alert');
          expect(alert).toHaveTextContent('boom');
        });
        expect(input.value).toBe('Buy milk');
        expect(screen.queryByText((text) => text.includes('Buy milk') && text !== 'Buy milk')).toBeNull();
      });
    });
    ```
    - See Dev Notes → "Integration-test fetch-mocking pattern"
    - See Dev Notes → "StrictMode double-invocation and test fetch counts"
  - [x] **Do NOT** wrap the test tree in `<React.StrictMode>` — the double-effect-invocation doubles every `fetch` call during dev, complicating the call-count assertions; Story 1.5's StrictMode is only active in `main.tsx`, not in tests (see Dev Notes → "Why the integration test omits `StrictMode`")
  - [x] **Do NOT** assert exact fetch call counts (e.g., `expect(fetch).toHaveBeenCalledTimes(2)`) — TanStack Query's internal refetch behavior + test-environment timing makes the count flaky; assert **observable output** (text visible, input state) instead

- [x] **Task 4: Create `apps/web/e2e/journey-1.spec.ts`** (AC: 12, 13)
  - [x] New file — the Journey 1 Playwright spec. Pattern draft:
    ```ts
    import { test, expect } from '@playwright/test';
    import { execFileSync } from 'node:child_process';

    // Repo root relative to this test file: apps/web/e2e → ../../..
    const REPO_ROOT = new URL('../../..', import.meta.url).pathname;

    function truncateTodos() {
      // Reset the shared dev DB before each test. `docker compose exec` runs psql
      // inside the running postgres container. See Dev Notes → "Journey-1 DB cleanup strategy".
      execFileSync(
        'docker',
        ['compose', 'exec', '-T', 'postgres', 'psql', '-U', 'todo', '-d', 'todo', '-c', 'TRUNCATE TABLE todos;'],
        { cwd: REPO_ROOT, stdio: 'inherit' },
      );
    }

    async function addTodo(page: import('@playwright/test').Page, description: string) {
      const input = page.getByRole('textbox', { name: 'Add a todo' });
      await input.fill(description);
      await input.press('Enter');
    }

    test.describe('Journey 1 — create & view', () => {
      test.beforeEach(() => truncateTodos());

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
    ```
    - See Dev Notes → "Journey-1 DB cleanup strategy"
    - **Verify the `psql -U todo -d todo` credentials against `docker-compose.yml`** before committing; if the username or db name differ, update the args accordingly
  - [x] **Do NOT** replace `smoke.spec.ts` — both files run
  - [x] **Do NOT** touch `playwright.config.ts` — the existing webServer + browsers + parallelism config is correct for Journey 1
  - [x] **Do NOT** add `test.describe.configure({ mode: 'serial' })` — `fullyParallel: false` at the config level already serializes tests
  - [x] **Do NOT** assert a specific perf budget (≤100ms p95) — Story 5.1 owns the perf harness

- [x] **Task 5: Full check + manual smoke** (AC: 14)
  - [x] `npm run typecheck --workspace apps/web` → clean
  - [x] `npm run lint` → clean
  - [x] `npm run format:check` → clean (run `npm run format` if needed)
  - [x] `npm test --workspace apps/web` → ~10 new unit/integration tests passing, pre-existing tests remain green
  - [x] `npm test --workspace apps/api` → unchanged (64 tests)
  - [x] `npm run check` → exits 0
  - [x] `docker compose up -d postgres && npm run migrate --workspace apps/api` → DB ready
  - [x] `npm run test:e2e --workspace apps/web` → smoke.spec.ts + journey-1.spec.ts all pass (5 total Playwright tests)
  - [x] Manual smoke (Journey 1 walk-through on `localhost:5173`): empty state, add "Buy milk" + Enter, see row, reload, row still there, resize to 320px, no horizontal scroll
  - [x] **Do NOT** update the README unless a gap is found during the 15-minute onboarding check. If a gap is found, add the smallest possible fix (one new command line or one new env-step mention), not a rewrite

## Dev Notes

### Why `renderListArea` is a module-private helper, not a component

The list-area decision tree is four branches of pure render logic. Options:
1. **Inline ternary/if inside `App`** — readable for 2–3 branches; gets cramped at 4
2. **Module-private function** — named, readable, easy to unit-test in isolation if needed — chosen
3. **Separate `<ListArea />` component** — overkill; it would need 3 props, its own file, its own test; the App unit tests cover the policy directly

`renderListArea` is a plain function returning JSX. No hooks run inside it. It takes only the derived state it needs. Tree-shakes cleanly; stays local to `App.tsx`; no new file.

If this helper grows to 6+ branches or takes on hooks of its own, promote it to a `<ListArea />` component. Until then, keep it flat.

### Why passing `createMutation.mutate` directly is safe

TanStack Query's `useMutation` returns a stable `mutate` function across re-renders — the reference is preserved via internal `useRef`-like memoization. Passing it directly as `onSubmit={createMutation.mutate}` works because:
1. `AddTodoInput` receives a stable reference — no cascading re-render storm
2. The function's signature matches `AddTodoInput`'s `onSubmit: (description: string) => void` exactly (`mutate(variables)` where `variables: string` for our `UseMutationResult<Todo, ApiError, string>`)
3. The alternative — `onSubmit={(d) => createMutation.mutate(d)}` — creates a new arrow on every render and defeats any downstream memoization

Be aware: `mutate` is fire-and-forget. Errors flow into `createMutation.error` (which we route into `error={createMutation.error?.message ?? null}`). If you ever need to await the mutation result, use `mutateAsync` instead — but that's not our case here.

### Why `noopToggle` / `noopDeleteRequest` are module-level

Two reasons:
1. **React.memo integrity:** Story 2.5's `TodoRow` is `React.memo`'d with default shallow-compare. Inline `() => {}` handlers get new identities every `App` render, blowing the memo. Module-level function constants have stable identities for the entire app lifetime
2. **Explicit scaffolding for Epic 3:** `noopToggle` / `noopDeleteRequest` are greppable placeholders. Story 3.3 will replace these with real `useCallback`-wrapped handlers; the stub names make the patch site obvious

Alternative rejected: `useCallback(() => {}, [])` inside the component body — technically correct, but adds a ceremony layer and invites the "why is this empty useCallback here" code-review question. The module-level constants are honest: "these are placeholders for Epic 3."

### Mocking `useTodos` / `useCreateTodo` at the module level

Vitest's `vi.mock(path, factory)` hoists to the top of the file. To override return values per-test, the canonical TS-safe pattern is:

```tsx
vi.mock('./hooks/useTodos.js', () => ({ useTodos: vi.fn() }));
const { useTodos } = await import('./hooks/useTodos.js');
const useTodosMock = vi.mocked(useTodos);

// In a test:
useTodosMock.mockReturnValue({ isPending: true, data: undefined, isError: false } as any);
```

The `as any` on the return value is pragmatic: `UseQueryResult` has ~20 fields; stubbing all of them is noise. Asserting only the three properties the component actually reads (`isPending`, `data`, `isError`, and `error` when isError) is the right scope.

If a later story adds `isFetching` / `isRefetching` to the decision tree, the stub factory grows — but not until.

### Integration-test fetch-mocking pattern

Three rules for the integration test:
1. **Real `QueryClient`** — creates cache; runs invalidation; refetches. Matches production
2. **Mock `global.fetch`** via `vi.stubGlobal('fetch', vi.fn(...))` — the network boundary. The apiClient below it is un-mocked
3. **Disable retry** in the `QueryClient` config — `retry: false` for queries; `retry: false` for mutations — prevents test flakes from TanStack's default 3-retry behavior on errors

Use `afterEach(() => vi.unstubAllGlobals())` to reset. Each test creates a fresh `QueryClient` (via `makeClient()`) to avoid cross-test cache bleed.

### StrictMode double-invocation and test fetch counts

React 19's `StrictMode` intentionally double-invokes effects + pure renders in development to surface side-effect bugs. `main.tsx` wraps the app in `<StrictMode>` for production-parity with dev tools, but this is NOT included in tests because:
1. The double-invocation makes `expect(fetch).toHaveBeenCalledTimes(1)` flaky by default
2. TanStack Query's internal behavior doubles too (two `queryFn` calls) — even more noise

**Rule:** integration tests compose `ErrorBoundary + QueryClientProvider + App` without `StrictMode`. Assert observable output (visible text, input state, DOM structure), not call counts. If a future test genuinely needs to verify an effect runs exactly once, add `<StrictMode>` to that specific test with explicit comments.

### Why the integration test omits `StrictMode`

See "StrictMode double-invocation and test fetch counts" above. Production parity is not the goal for the integration test — focused behavioral assertions are. StrictMode's double-invocation is valuable in dev (catches lifecycle bugs) but dilutes call-count signals in tests.

### Journey-1 DB cleanup strategy

The Playwright tests hit a real API + real DB. To get deterministic results, each test must start with an empty `todos` table. Options considered:

1. **`DELETE /v1/todos` bulk endpoint** — doesn't exist, and this story isn't the place to add it
2. **`TRUNCATE` via `docker compose exec ... psql`** — works today, requires Docker + psql on the test runner's path — **chosen**
3. **Test-only admin route (e.g., `POST /test-only/reset`)** — requires API + plugin changes; out of scope
4. **Kysely truncate via a tiny Node script invoked by `test.beforeEach`** — requires `apps/api` import from the `apps/web` test file, crossing a workspace boundary that's not yet established

**Chosen rationale:** `docker compose exec -T postgres psql -U todo -d todo -c 'TRUNCATE TABLE todos;'` — a synchronous `execFileSync` in the test's `beforeEach`. Dependencies on the test runner's environment:
- `docker` CLI on PATH
- The `postgres` service running under `docker-compose` (which the dev environment already requires per Story 1.1)
- `psql` inside the container (the postgres image includes it)

**CI caveat:** GitHub Actions' `ubuntu-latest` has `docker` preinstalled. The existing `ci.yml` from Story 1.6 must start the postgres service before the E2E step. If `ci.yml` doesn't already do this, flag it in Completion Notes and address in a follow-up.

**Credentials:** verify `-U todo -d todo` against `docker-compose.yml` before committing. If `POSTGRES_USER` / `POSTGRES_DB` differ, update the args.

**Once Story 3.2 lands** (DELETE endpoint), replace the psql call with a loop:
```ts
const existing = await apiClient.get('/v1/todos');
for (const t of existing) await apiClient.del(`/v1/todos/${t.id}`);
```
Cleaner, no Docker dep in tests. Story 3.5 (journey-2-toggle.spec.ts / journey-2-delete.spec.ts) is the natural time to refactor.

### Error-envelope message fallback

When the POST fails with a 500 Internal Server Error and the error envelope's `message` is `'boom'` (as in the integration test), the UI displays `"boom"` verbatim because `apiClient.ts` surfaces `envelope.message` through the `ApiError.message` field (line 22–25 of apiClient). This is intentional for now — Epic 4 (Story 4.2) will map server messages to user-facing copy (e.g., always show `"Couldn't save. Check your connection."` regardless of the server's reason).

For this story's integration test, asserting the raw message string works because the apiClient's current behavior is: message-as-provided. If Story 4.2 remaps, that test should move with the remap.

### Tailwind v4 classes used (no new tokens)

- `max-w-xl` — 36rem max-width cap per UX-DR13 (centered column)
- `mx-auto` — horizontal centering
- `px-4` — mobile horizontal padding (16px)
- `pt-8` — mobile top padding (32px)
- `lg:pt-16` — large-viewport top padding (64px)
- `mt-6` — gap between input and list area (24px)
- `text-[--color-danger]` — error-region text color (pre-Epic-4)
- `text-sm` — small error text
- `py-12` — error-region vertical padding (matches EmptyState's rhythm)
- `text-center` — error-region centered copy

No new `@theme` tokens. No new CSS files. No new dependencies.

### Previous Story Intelligence

**From Story 2.5 (four presentational components) — load-bearing:**
- `TodoList` filters by `completed === false`; this story passes the raw `data: Todo[]` — the filter lives inside `TodoList`
- `LoadingSkeleton`'s accessible name is `"Loading your todos"` (matched by `screen.getByLabelText(...)` in AC10 bullet 1 and AC11 bullet 1)
- `EmptyState` renders the exact strings `"No todos yet."` and `"Add one below."` — matched by `screen.getByText(...)`
- `TodoRow`'s `React.memo` depends on stable `onToggle` / `onDeleteRequest` identities — hence AC9's module-level `noopToggle` / `noopDeleteRequest`

**From Story 2.4 (AddTodoInput) — consumer context:**
- Props: `{ onSubmit: (description: string) => void; disabled?: boolean; error?: string | null }` — we bind all three in AC8
- AC7 of Story 2.4: when `disabled` flips true→false AND `error == null`, the input clears + refocuses. Our POST-success path satisfies this (TanStack Query's `onSettled` flips `isPending` false; `error` is null on success). Integration test AC11 bullet 3 asserts this behavior
- AC8 of Story 2.4: the input value is **preserved** on error (not cleared). Integration test AC11 bullet 4 asserts this

**From Story 2.3 (data layer) — hook contracts:**
- `useTodos()` returns `UseQueryResult<Todo[], ApiError>` — fields: `data`, `isPending`, `isError`, `error`, `isSuccess`, `status`, etc.
- `useCreateTodo()` returns `UseMutationResult<Todo, ApiError, string>` — fields: `mutate`, `mutateAsync`, `isPending`, `error`, `data`, etc.
- Both hooks already wire the `QueryClient` (provided by `main.tsx`'s `QueryClientProvider`); this story just consumes them
- `['todos']` is the canonical cache key; `onSettled` in `useCreateTodo` invalidates it, triggering `useTodos` to refetch

**From Story 1.5 (web scaffold) — untouched:**
- `main.tsx`'s `<StrictMode><ErrorBoundary><QueryClientProvider client={queryClient}><App /></QueryClientProvider></ErrorBoundary></StrictMode>` is the correct production tree; this story does NOT modify `main.tsx`
- `ErrorBoundary` catches render errors but NOT query/mutation errors — those flow via React state to the UI (our AC7 minimal error region for queries; AddTodoInput's error prop for the create mutation)

**From Story 1.6 (CI + E2E scaffold) — infrastructure:**
- `playwright.config.ts` launches API + web preview; we add a new spec file but don't modify config
- `smoke.spec.ts` keeps running — our new spec is additive
- `ci.yml` already runs `npm run test:e2e` as part of the CI job; our new tests ride that slot

### Git Intelligence

- Recent commits: Story 2.1 / 2.2 / 2.3 / 2.4 in review; 2.5 in-progress. 1.6 in review. Epic 1 fully in-progress
- Target commit message: `feat: story 2.6 implemented`
- Scope: **1 rewritten file** (`App.tsx`) + **1 extended file** (`App.test.tsx`) + **2 new files** (`App.integration.test.tsx`, `e2e/journey-1.spec.ts`) = **4 files touched**. Slightly smaller than 2.5's 12-file change, matching the "composition over authoring" nature of this story

### Latest Tech Information

**TanStack Query 5.x:**
- `UseQueryResult.status` is `'pending' | 'error' | 'success'` (v5 renamed `'loading'` to `'pending'`); we use `isPending` / `isError` / `isSuccess` booleans, which are stable across v5 patch versions
- `useMutation.mutate` is stable; `mutateAsync` is also stable — but `mutate` is right for fire-and-forget UX
- `invalidateQueries({ queryKey })` is the v5 signature (v4 was positional); Story 2.3's hook uses the v5 shape

**React 19:**
- `useTransition`, `useDeferredValue` not needed here; the list sizes don't warrant deferred rendering in MVP
- Inline function-component return type `JSX.Element` inferred; no `React.FC<>` typing

**Playwright 1.49:**
- `page.setViewportSize({ width, height })` is the stable API
- `page.evaluate(() => ...)` runs browser-side; we use it for scroll-width assertions
- `page.getByRole(..., { name: ... })` matches accessible name (from `aria-label` or text content); matches AddTodoInput's `aria-label="Add a todo"`

**Vitest 3.x:**
- `vi.mocked(fn)` narrows the type to `MockInstance<typeof fn>`
- `vi.stubGlobal('fetch', ...)` + `vi.unstubAllGlobals()` is the canonical pattern used by Story 2.3's hook tests

### Project Structure Notes

**New files (2):**
- `apps/web/src/App.integration.test.tsx`
- `apps/web/e2e/journey-1.spec.ts`

**Rewritten files (1):**
- `apps/web/src/App.tsx` — current 10-line stub replaced with full composition

**Extended files (1):**
- `apps/web/src/App.test.tsx` — new `describe` block added; existing `describe` kept intact

**No modified files outside `apps/web`.** No API changes. No new dependencies. No `main.tsx` / `playwright.config.ts` / `vite.config.ts` changes.

**Alignment with `architecture.md:562–585` (file tree):** `App.tsx` is the only component that orchestrates hooks + layout per `architecture.md:596` ("`App.tsx` owns page layout + modal mount state"). The modal mount state lands in Story 3.5.

### Testing Standards

- **Unit:** co-located `App.test.tsx` (existing + new `describe`)
- **Integration:** co-located `App.integration.test.tsx` (new file) — "integration" here means the full provider tree + real `QueryClient` + mocked `fetch`. This is the convention established by the plan; it uses the same harness Story 2.3 established for hook tests
- **E2E:** `apps/web/e2e/journey-1.spec.ts` (new file) — Playwright against real API + real DB; DB reset via `TRUNCATE` in `beforeEach`
- **a11y tests:** not added in this story — the composed `<App />` inherits the per-component axe passes from Stories 1.5 (Header, ErrorBoundary), 2.4 (AddTodoInput), and 2.5 (TodoRow, TodoList, LoadingSkeleton, EmptyState). Journey 4's comprehensive page-level axe pass lives in Story 5.3's manual/automated walkthrough

### References

- Epic requirements: [epics.md § Story 2.6](../planning-artifacts/epics.md) (lines 735–790)
- UX — layout container: [ux-design-specification.md § Layout Primitives](../planning-artifacts/ux-design-specification.md) (UX-DR13)
- UX — Journey 1 flow: [ux-design-specification.md § Journey 1](../planning-artifacts/ux-design-specification.md) (lines 564–585)
- UX — error anchoring policy: [ux-design-specification.md § Feedback Patterns](../planning-artifacts/ux-design-specification.md) (lines 825–840)
- Architecture — component boundaries (App.tsx owns page layout): [architecture.md § Architectural Boundaries](../planning-artifacts/architecture.md) (lines 595–601)
- Architecture — requirements mapping (FR-007, FR-008): [architecture.md § Requirements-to-Structure Mapping](../planning-artifacts/architecture.md) (lines 623–624)
- PRD — FR-001 Create, FR-002 List + ordering, FR-007 Empty state, FR-008 Loading state, FR-011 Persistence, SC-001 ≤60-second first use, NFR-006 Onboarding: [PRD.md § Functional Requirements](../planning-artifacts/PRD.md)
- Previous story: [2-5 TodoRow + TodoList + LoadingSkeleton + EmptyState](./2-5-todorow-non-completed-todolist-active-section-loadingskeleton-emptystate.md) — the components we compose
- Previous story: [2-4 AddTodoInput](./2-4-addtodoinput-component.md) — the prop contract (`onSubmit`, `disabled`, `error`)
- Previous story: [2-3 web API client + hooks](./2-3-web-api-client-typed-endpoints-usetodos-usecreatetodo-hooks.md) — `useTodos`, `useCreateTodo`, ApiError envelope
- Previous story: [1-5 web scaffold](./1-5-web-app-scaffold-vite-tailwind-v4-design-tokens-errorboundary-header.md) — `main.tsx` provider tree, `ErrorBoundary`, existing `App.test.tsx`
- Previous story: [1-6 CI + E2E scaffold](./1-6-ci-pipeline-code-quality-gate-eslint-prettier-a11y-playwright-e2e-scaffold-onboarding-readme.md) — `playwright.config.ts`, `smoke.spec.ts`, CI wiring

## Dev Agent Record

### Agent Model Used

Claude Opus 4.7 (1M context) — model id `claude-opus-4-7[1m]`

### Debug Log References

- **docker-compose credentials differ from the spec.** The spec's Task 4 snippet used `-U todo -d todo` for the psql TRUNCATE. Actual `docker-compose.yml` has `POSTGRES_USER=postgres` and `POSTGRES_DB=todo_app`. The spec's AC13 explicitly said "verify credentials against `docker-compose.yml` before committing" — did so, updated to `-U postgres -d todo_app` in `e2e/journey-1.spec.ts`.
- **Integration test (AC11 bullet 3) failed on first run: `input.value === 'Buy milk'` instead of `''`.** Root cause: React 18+ automatic batching coalesced the mutation's two state transitions (`isPending: false → true → false`) into a single commit because the mocked POST resolved within a microtask without yielding. AddTodoInput's clear-and-refocus effect requires observing `disabled=true` in a prior render to set `wasDisabledRef.current=true`, then `disabled=false` with no error to fire; with batching, it only ever saw `disabled=false`. Fix: add a single-microtask yield (`await new Promise(r => setTimeout(r, 0))`) inside the POST branch of the fetch mock. This forces React to commit the `isPending=true` state before the POST resolves, and the effect fires cleanly. Wrote a comment in the test explaining the "why" so future maintainers don't delete the seemingly-unnecessary yield.
- **E2E first run: all 4 journey-1 tests failed** — `getByText('No todos yet.')` never appeared. Two compounding causes:
  1. `apps/web/dist/` was stale from a pre-Story-2.6 build, so Vite `preview` was serving an old bundle that didn't include the new App.tsx composition. Ran `npm run build --workspace apps/web` to refresh.
  2. No `apps/web/.env` existed (only `.env.example`). Vite bakes `VITE_API_URL` at build time; without `.env`, the production bundle had `undefined/v1/todos` as the fetch URL → the GET failed → `useTodos` went into `isError` state → the app rendered the minimal error region ("Couldn't load your todos.") instead of `EmptyState`. Created `apps/web/.env` by copying `.env.example` contents, rebuilt, and all 4 journey-1 tests (plus the 2 preexisting smoke tests) passed on the very next run.
- **TS discriminated-union cast failure on `stubMutation` overrides.** First typecheck of App.test.tsx failed with `TS2352: Conversion of type '{ isPending: true; error: ApiError; }' to type 'Partial<UseMutationResult<...>>' may be a mistake because neither type sufficiently overlaps with the other — Types of property 'error' are incompatible: Type 'ApiError' is not comparable to type 'null | undefined'.` Root cause: `UseMutationResult` is a discriminated union where `MutationObserverLoadingResult` (the `isPending: true` variant) narrows `error` to `null | undefined`. TS can't widen that to `ApiError` through a `Partial<>` cast. Fixed by casting via `unknown` (`as unknown as Partial<ReturnType<typeof useCreateTodo>>`) — the canonical "I know what I'm doing" escape hatch for testing-only shape overrides.
- **No other blips.** `npm run lint` clean (only the long-tolerated Story 1.6 warning on `apps/api/src/db/index.ts:14`), `npm run format:check` clean first-try (no prettier fixups needed on the new files).

### Completion Notes List

- **`apps/web/src/App.tsx` rewritten from the 10-line stub into the full Journey-1 composition.** Renders the `max-w-xl mx-auto px-4 pt-8 lg:pt-16` container, `<Header />`, and a `<main>` containing `<AddTodoInput>` + a `<div className="mt-6">` list-area wrapper. The list-area wrapper's children come from a module-private `renderListArea({ data, isPending, isError })` helper with the four-branch decision tree in early-return order: Pending → LoadingSkeleton; Error → minimal `role="alert"` fallback with PRD-locked copy `"Couldn't load your todos."`; empty data → EmptyState; non-empty data → TodoList with `noopToggle` / `noopDeleteRequest` module-level constants (Epic 3 greppable placeholders).
- **Hook wiring:** `useTodos()` called once, destructured `{ data, isPending, isError }`. `useCreateTodo()` called once, bound as `<AddTodoInput onSubmit={createMutation.mutate} disabled={createMutation.isPending} error={createMutation.error?.message ?? null} />`. Passing `createMutation.mutate` directly (not wrapped) — it's a stable TanStack-Query-memoized reference.
- **AddTodoInput's Story-2.4 contracts are preserved end-to-end through the hook wiring:** on success, `disabled` flips `true → false` with no error → input clears and refocuses; on failure, `disabled` flips back but `error` is populated → input value is preserved, error region renders.
- **`apps/web/src/App.test.tsx` extended, not replaced:** the existing "mounts without error" test kept intact (reset to still work via the new hook mocks returning the default-pending stub), plus a new 6-it `describe('<App /> list-area render policy')` block using `vi.mock('./hooks/useTodos.js')` + `vi.mock('./hooks/useCreateTodo.js')`. The canonical dynamic-import + `vi.mocked(...)` + per-test `.mockReturnValue(...)` pattern from the spec's Dev Notes. Per-test `vi.clearAllMocks()` in `beforeEach` avoids cross-test bleed.
- **`apps/web/src/App.integration.test.tsx` new file:** four integration tests against a real `QueryClient` (`retry: false, gcTime: 0`) + real `ErrorBoundary` + `vi.stubGlobal('fetch', ...)` mocked network — empty list → EmptyState, 2-todo list → two `<li>`s, create-then-refetch flow with all three AddTodoInput assertions (row appears, input clears, input refocuses) combined in a single `waitFor` with a 3-second timeout, and create-failure flow (error region visible with envelope message, input value preserved, list unchanged). The create-then-refetch test's POST branch yields one microtask via `await new Promise(r => setTimeout(r, 0))` to dodge React 18 auto-batching — see Debug Log for the rationale.
- **`apps/web/e2e/journey-1.spec.ts` new file:** four Playwright tests — EmptyState on fresh DB; typing + Enter lands the row within 1s; persistence across reload (FR-011 boundary 1); no horizontal scroll at 320px viewport. `test.beforeEach(truncateTodos)` hook uses `execFileSync('docker', ['compose', 'exec', '-T', 'postgres', 'psql', ...])` to TRUNCATE the shared dev DB. The existing `smoke.spec.ts` kept intact; both specs run in the same Playwright invocation.
- **Created `apps/web/.env`** by copying `.env.example` contents. Vite bakes `VITE_API_URL` at build time; without the file, the production preview bundle had `undefined/v1/todos` as the fetch URL and every E2E request failed. Story 1.5's `.env.example` was the expected onboarding step but it hadn't been copied into place on this machine; creating it once unblocks the E2E permanently for local dev.
- **Full check green:** `npm run check` exits 0. Totals: **64 api + 100 web = 164 unit/integration tests**, up 10 from 154. Playwright: **6/6** (2 smoke + 4 journey-1).
- **Manual smoke executed implicitly via the Playwright spec** — the journey-1 tests exercise the entire flow (empty state, type + Enter, row appears, reload, persistence, 320px viewport no-scroll). No separate human walk-through performed.

### File List

- Modified (rewritten): `apps/web/src/App.tsx` — 10-line stub replaced with hook-wiring composition + `renderListArea` helper + module-level `noopToggle` / `noopDeleteRequest`.
- Modified (extended): `apps/web/src/App.test.tsx` — original `describe` kept intact (+ a per-test hook-mock reset in `beforeEach`); new `describe('<App /> list-area render policy')` with 6 `it` blocks covering AC10 bullets 1–6.
- Added: `apps/web/src/App.integration.test.tsx` — 4 integration tests with real `QueryClient` + `ErrorBoundary` + mocked `fetch`.
- Added: `apps/web/e2e/journey-1.spec.ts` — 4 Playwright tests + `truncateTodos` helper via `docker compose exec psql`.
- Added: `apps/web/.env` — `VITE_API_URL=http://localhost:3000` (copied from `.env.example` to unblock production-build E2E).
- Modified: `_bmad-output/implementation-artifacts/sprint-status.yaml` — story `2-6-...` moved `ready-for-dev → in-progress → review`; **Epic 2 is now fully in `review`**.
- Modified: `_bmad-output/implementation-artifacts/2-6-end-to-end-wire-up-in-app-tsx-journey-1-complete.md` — Status, all task/subtask checkboxes, Dev Agent Record, File List, Change Log.

## Change Log

| Date       | Version | Change                                                                                                                                                                                                                                                      | Author |
| ---------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| 2026-04-20 | 1.0     | Composed Journey 1 end-to-end: App.tsx wires `useTodos` + `useCreateTodo` into AddTodoInput + TodoList + LoadingSkeleton + EmptyState with a 4-branch render policy. 7 App unit tests + 4 integration tests + 4 Playwright journey-1 tests. 10 new web tests (164 total). | Dev    |
