# Story 3.4: `TodoRow` completed state + `TodoList` completed section + `App.tsx` sectioning

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want checking a todo's checkbox to strike it through, fade it to 60% opacity, and move it to the Completed section — instantly,
So that completion feels like a satisfying, reinforcing gesture while remaining accessible.

## Acceptance Criteria

**AC1 — `--color-completed-fg` design token added to `apps/web/src/styles/index.css`**
- **Given** the `@theme` block in `apps/web/src/styles/index.css` currently declares seven color tokens (`--color-bg`, `--color-surface`, `--color-fg`, `--color-fg-muted`, `--color-border`, `--color-accent`, `--color-danger`) and a font stack (Story 1.5)
- **When** the engineer inspects the file
- **Then** an eighth color token is added:
  ```css
  --color-completed-fg: rgb(26 26 26 / 0.6);
  ```
  — the literal `#1A1A1A` at 60% opacity, expressed in modern `rgb()` with space-separated channels + alpha (the Tailwind v4 idiom; `rgba(26, 26, 26, 0.6)` is legacy but accepted)
- **And** the token is declared **before** `--font-sans` to keep color tokens grouped (the existing file order is color → font; preserve it)
- **And** the existing `@media (prefers-reduced-motion: reduce)` rule at lines 30–37 is **NOT modified** — it already disables all CSS transitions globally; the completed-state transition from AC2 inherits this behavior for free
- **And** the `@layer base` block is **NOT modified** — no global color change is needed; `--color-completed-fg` is consumed only by `TodoRow` (AC2)
- **And** Tailwind v4's automatic utility generation exposes the token as `text-[--color-completed-fg]` (arbitrary-value syntax) — usable but NOT consumed by `TodoRow` (AC2 uses `opacity-60` + `line-through` utilities instead; see Dev Notes → "Why `opacity-60` instead of `text-[--color-completed-fg]`")
- **And** the token is documented in a trailing comment:
  ```css
  /* #1A1A1A at 60% opacity over #FAFAFA → effective contrast ≥4.5:1 (WCAG AA). FR-006 / NFR-007. */
  ```
  — surfaces the contrast rationale at the token definition site; reviewers do not need to hunt through UX spec to verify the choice

**AC2 — `TodoRow` renders completed state with strike-through + 60% opacity + transition**
- **Given** `apps/web/src/components/TodoRow.tsx` currently renders the same markup for both completed and active todos (the description `<span>` carries only `flex-1 text-base break-words`; the checkbox `aria-label` already flips between "Mark complete" / "Mark incomplete" — Story 2.5)
- **When** `todo.completed === true`
- **Then** the description `<span>` (`flex-1 text-base break-words`) gains two additional classes:
  ```
  line-through opacity-60
  ```
  and one transition utility applied **unconditionally** (so the transition runs in both directions — incomplete→complete AND complete→incomplete):
  ```
  transition-[opacity,text-decoration-color] duration-200 ease-out
  ```
  The final `className` for the description span is (when active / completed respectively):
  ```
  flex-1 text-base break-words transition-[opacity,text-decoration-color] duration-200 ease-out
  flex-1 text-base break-words transition-[opacity,text-decoration-color] duration-200 ease-out line-through opacity-60
  ```
- **And** the transition property string uses Tailwind v4's arbitrary-value syntax `transition-[opacity,text-decoration-color]` — no space between the comma-separated properties (Tailwind parses this as a single custom value)
- **And** the transition applies to both **`opacity`** AND **`text-decoration-color`** — `text-decoration-color` fades the strike-through line along with the text color; `opacity` fades the text itself. Both transitioning together produce the UX-spec-described "single visual gesture" (ux-design-specification.md line 403)
- **And** under `prefers-reduced-motion: reduce`, the transition is instant — the existing global rule in `styles/index.css:30-37` forces `transition-duration: 0ms !important`, overriding the `duration-200` utility. No additional CSS rule needed
- **And** the checkbox continues to render as a native `<input type="checkbox">` with `checked={todo.completed}` (the existing Story 2.5 behavior) — no custom checkbox component, no CSS-generated checkmark glyph; the browser's default check UI is what renders in the checked state
- **And** the checkbox's `aria-label` continues to read `"Mark incomplete: {description}"` when completed and `"Mark complete: {description}"` when active (existing Story 2.5 behavior — AC is restated here because it's a FR-006 invariant, not a deliverable change)
- **And** `TodoRow` remains wrapped in `React.memo` (existing Story 2.5 export is `export default memo(TodoRowImpl)`) — do NOT change the export; do NOT add a custom comparator. The default shallow comparator on `{ todo, onToggle, onDeleteRequest, isMutating }` is correct for the section-move + toggle flow
- **And** the `isMutating` prop's existing behavior is untouched — it continues to disable the checkbox + delete button and set `aria-busy="true"` on the wrapper (used by the `useToggleTodo` mutation's `isPending` in Epic 4's error flow; not used in Story 3.4 but left in place)

**AC3 — `TodoList` renders both Active and Completed sections**
- **Given** `apps/web/src/components/TodoList.tsx` currently renders a single `<ul>` containing only active todos (filters `t => !t.completed`) and drops completed todos entirely (Story 2.5)
- **When** the engineer inspects the file
- **Then** the component renders up to **two** `<ul>` groups:
  - **Active section (always rendered, even when empty):** a `<ul>` containing all `todos.filter(t => !t.completed)` — in received order — each rendered as a `<TodoRow key={todo.id} ...>`
  - **Completed section (rendered only when at least one `completed === true` row exists):** an `mt-6` separator followed by a `<h2 className="text-sm text-[--color-fg-muted] mb-2">Completed</h2>`, then a `<ul>` containing all `todos.filter(t => t.completed)` — in received order — with the same `key={todo.id}` pattern
- **And** the Completed section's label uses `<h2>` (semantic heading, screen-reader discoverable as a landmark), text `"Completed"`, class `text-sm text-[--color-fg-muted] mb-2` (matches UX spec line 484: "lightweight label, `text-sm text-[var(--color-fg-muted)]`, no line/border")
- **And** there is **no visual line/border** between the sections — only the `mt-6` vertical gap + the label. Do NOT add `border-t`, `border-b`, or `<hr>`
- **And** the Active `<ul>` is rendered even when all todos are completed (it renders as an empty `<ul>` — a decision documented in Dev Notes → "Why the Active `<ul>` is always rendered"); the Completed `<ul>` is NOT rendered when no todos are completed (conditional on the filter being non-empty)
- **And** each `<TodoRow>` in both sections uses `key={todo.id}` — React's reconciler matches rows by key across re-renders; when a row's `completed` flag flips, React **moves** the row's DOM node from one `<ul>` to the other and reuses the same component instance, preserving internal state and enabling the CSS transition to run (see Dev Notes → "Why stable keys across sections matter for the transition")
- **And** `TodoList`'s props signature is **unchanged** from Story 2.5: `{ todos: Todo[]; onToggle: (id, completed) => void; onDeleteRequest: (todo) => void }` — the parent (`App.tsx`) owns the toggle wire-up; `TodoList` stays purely presentational
- **And** the component does **NOT** call any hook (no `useMemo`, no `useCallback`) — filtering a small array (~1–100 todos typical, ≥50 tested at Journey 4) is trivial; premature memoization violates `architecture.md:234` ("`derived state is useMemo'd only when profiling shows it matters`")

**AC4 — `App.tsx` wires `useToggleTodo` into the list via a stable handler**
- **Given** `apps/web/src/App.tsx` currently passes `noopToggle` (a no-op) to `<TodoList>` with a comment: `// Epic 3 replaces these with real handlers from useToggleTodo / useDeleteTodo (Stories 3.3, 3.5).`
- **When** the engineer inspects the file
- **Then** the import block gains:
  ```ts
  import { useCallback } from 'react';
  import { useToggleTodo } from './hooks/useToggleTodo.js';
  ```
- **And** the module-scope `noopToggle` function is **removed** (replaced by the real handler); the `noopDeleteRequest` stays for now (Story 3.5's scope)
- **And** inside `App()` (after `useTodos` and `useCreateTodo`), the toggle mutation is consumed via destructure to keep the reference-stable `mutate` in scope:
  ```ts
  const { mutate: toggleMutate } = useToggleTodo();
  const handleToggle = useCallback(
    (id: string, completed: boolean) => toggleMutate({ id, completed }),
    [toggleMutate],
  );
  ```
- **And** the `<TodoList>` invocation passes `handleToggle` instead of `noopToggle`:
  ```tsx
  <TodoList todos={data} onToggle={handleToggle} onDeleteRequest={noopDeleteRequest} />
  ```
  — `onDeleteRequest` continues to use `noopDeleteRequest` (Story 3.5 replaces it)
- **And** the `useCallback` dependency array is `[toggleMutate]` — TanStack Query v5 guarantees `mutation.mutate` is a **stable reference** across renders (memoized internally by `useMutation`), so `handleToggle` is computed once and remains stable; this is the key to `TodoRow`'s `React.memo` not bailing out on every App render (see Dev Notes → "Why `handleToggle` must be stable (memo bailout)")
- **And** the `renderListArea` helper function's signature is unchanged — it still takes `{ data, isPending, isError }`; the onToggle / onDeleteRequest plumbing stays at the `App()` top level (passed as props through `renderListArea`'s return). The cleanest refactor of `renderListArea` is to accept the handlers as additional params, OR to inline the list-or-empty logic into `App()` and delete `renderListArea` entirely. See Task 4's guidance on both options
- **And** the comment `// Epic 3 replaces these with real handlers from useToggleTodo / useDeleteTodo (Stories 3.3, 3.5).` is **updated** to `// Epic 3: delete handler comes in Story 3.5.` (removes the reference to Story 3.3 now that it's wired) OR replaced outright; either is fine as long as the stale reference is removed

**AC5 — Toggle behavior observed end-to-end in the App integration test**
- **Given** `apps/web/src/App.integration.test.tsx` currently covers the create flows (empty state, list with 2 rows, create-then-refetch, create-failure) using `vi.stubGlobal('fetch', ...)` — Story 2.6
- **When** the engineer extends the file
- **Then** three new `it(...)` blocks are appended (or nested in a new `describe('<App /> toggle integration — ...')` block if preferred; grouping is a style choice):
  1. **Toggle active→completed renders optimistically** — `fetch` mock returns 2 active todos on initial GET, then `{ ok: true, status: 200, json: async () => ({...firstTodo, completed: true}) }` on PATCH, then `[{...firstTodo, completed: true}, secondTodo]` on the invalidation refetch. Mount the app. Click the first row's checkbox. Assert:
     - **Before `waitFor`:** the cache reflects the optimistic toggle (the clicked row now appears in the Completed section). Use `screen.getAllByRole('list')` to select the two `<ul>`s (or `getAllByRole('listitem')` and check section ancestry)
     - **After `waitFor(() => expect(...).toHaveTextContent('Completed'))`:** the Completed section is visible with the clicked row's description
     - The PATCH fetch was called with `/v1/todos/<first-id>` and `body: JSON.stringify({ completed: true })`
  2. **Toggle completed→active moves the row back** — initial GET returns `[{...todo, completed: true}]`; PATCH mock returns `{...todo, completed: false}`; invalidation refetch returns `[{...todo, completed: false}]`. Click the checkbox in the Completed section. Assert the row moves to the Active section and the PATCH body is `{ completed: false }`
  3. **Toggle failure reverts to prior state** — initial GET returns `[{...firstTodo, completed: false}]`; PATCH mock returns `{ ok: false, status: 500, statusText: 'Internal Server Error', json: async () => ({ statusCode: 500, error: 'Internal Server Error', message: 'boom' }) }`; invalidation refetch returns the ORIGINAL list `[{...firstTodo, completed: false}]`. Click the checkbox. Assert:
     - (Optionally) mid-flight the row moves to Completed (optimistic)
     - After settle, the row is back in the Active section (authoritative refetch + onError restore)
     - No inline error is shown yet — FR-010 error UI lands in Epic 4 (this test just confirms the revert, NOT the error surface)
- **And** the tests use the existing `mountApp()` helper from the file — do NOT duplicate `makeClient()`
- **And** the tests use the existing `vi.stubGlobal('fetch', fetchFn)` pattern (consistent with the rest of the file). **Note:** this story's hook tests (`useToggleTodo.test.tsx` in Story 3.3) mock `api.todos` at module boundary, but this **integration** test layer mocks `fetch` — the two strategies coexist. Integration tests are meant to exercise the full stack (fetch → apiClient → api.todos → hook → component); mocking at the top of that stack would bypass exactly what it's meant to cover
- **And** the tests do NOT import `useToggleTodo` or `api.todos` directly — assert behavior via the rendered DOM (section membership, text content) to keep the integration surface honest

**AC6 — axe-core a11y coverage for completed-row contrast and a mixed-list scenario**
- **Given** `apps/web/test/a11y/TodoRow.a11y.test.tsx` already covers `activeTodo` + `isMutating` + `completedTodo` cases (Story 2.5) — aria-label flip works; no existing assertion fails on the new visual (strike-through + opacity don't introduce new a11y concerns)
- **Given** `apps/web/test/a11y/TodoList.a11y.test.tsx` already covers 2 active todos + empty list — but does NOT cover a mixed-section list
- **When** the engineer updates the a11y tests
- **Then** `apps/web/test/a11y/TodoList.a11y.test.tsx` gains a third `it(...)` block:
  ```tsx
  it('mixed active + completed todos — zero axe-core violations (FR-006 / NFR-007 contrast)', async () => {
    const todos = [
      makeTodo({ description: 'Active todo' }),
      makeTodo({ description: 'Completed todo', completed: true }),
    ];
    const { container } = render(<TodoList todos={todos} onToggle={noop} onDeleteRequest={noop} />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
  ```
- **And** axe-core's `color-contrast` rule (enabled by default in the axe config) reports zero violations on the completed row's description text — the effective rendering `#1A1A1A` at 60% opacity over `#FAFAFA` is `~6.8:1` effective contrast (UX spec line 435), well above WCAG AA's `4.5:1` requirement. If axe reports a contrast violation here, the computed opacity or background did not match the spec (investigate the Tailwind utility output OR the testing-library jsdom's default background)
- **And** `apps/web/test/a11y/TodoRow.a11y.test.tsx` is **not modified** — the existing "completed todo (aria-label flips) — zero axe-core violations" test at line 40–48 already exercises the completed state and will continue to pass with the new `line-through opacity-60` classes (axe's rules are concerned with contrast/semantics, not text decoration)
- **And** the `color-contrast` rule is NOT explicitly enabled via `axe({ rules: { 'color-contrast': { enabled: true } } })` — axe-core's default config enables it; the default call `await axe(container)` uses it. Explicit rule config is an anti-pattern (drifts from axe's evolving defaults)

**AC7 — E2E spec `apps/web/e2e/journey-2-toggle.spec.ts` covers the toggle journey**
- **Given** `apps/web/e2e/journey-1.spec.ts` establishes the E2E test pattern: `truncateTodos()` via `docker compose exec psql` in `beforeEach`, `page.goto('/')`, and interaction via `page.getByRole(...)` (Story 2.6)
- **When** the engineer creates the new file
- **Then** it follows the Journey 1 structural pattern (import `test` / `expect` / `type Page` from `@playwright/test`; `REPO_ROOT` constant; `truncateTodos()` helper; `test.describe(...)` + `test.beforeEach(...)` blocks). The helper functions may be factored into a shared module if the engineer prefers, but inline duplication across Journey 1 / Journey 2 is the pattern Story 2.6 left behind — prefer inline for consistency; do not refactor Journey 1 in this story
- **And** rows are seeded via the UI (same approach as Journey 1 — `addTodo(page, 'x')` helper) since the API endpoints POST + PATCH are both expected to be running (the dev server proxies to the same Fastify instance). An alternative is seeding via a direct `fetch` call in the test, bypassing the UI; both are valid but UI-seeding exercises more of the real stack
- **And** the test cases cover the epic's Journey 2 E2E scenarios (epics.md line 1008–1012):
  1. **Setup: 3 active todos visible** — call `addTodo` three times; assert 3 list items visible in what's semantically the Active section (the only `<ul>` at that point — no Completed section yet)
  2. **Click first checkbox → row appears in Completed section within 300ms with strike-through + 60% opacity** — click the first checkbox by its aria-label; `await expect(page.getByRole('heading', { name: 'Completed' })).toBeVisible({ timeout: 300 })`; assert the toggled row is visible in the Completed section via `page.locator('ul').nth(1).getByText('<description>')` or equivalent; assert `opacity: 0.6` via `expect(locator).toHaveCSS('opacity', '0.6')` and `text-decoration-line: line-through` via `expect(locator).toHaveCSS('text-decoration-line', 'line-through')`
  3. **Reload → row remains in Completed section** — `await page.reload()`; re-assert the row is in the Completed section. This confirms the API-side persistence (FR-011) AND the React-side section-assignment on fresh mount
  4. **Re-click the same checkbox → row returns to Active section** — click the checkbox (now labeled "Mark incomplete: ..."); assert the Completed section disappears (or the row moves out) within 300ms
  5. **320px viewport: toggle works, no horizontal scroll** — `await page.setViewportSize({ width: 320, height: 800 })`; run step 2's basic assertion; then assert `document.documentElement.scrollWidth <= window.innerWidth` (same pattern as Journey 1)
- **And** assertions on `opacity` and `text-decoration-line` use `toHaveCSS(property, value)` — Playwright's computed-style assertion. The `line-through` Tailwind utility produces `text-decoration-line: line-through` in the computed styles; `opacity-60` produces `opacity: 0.6`. These are the exact string values the assertion expects
- **And** the 300ms timeout on the optimistic-render assertion is intentional: "within 300ms" is the epic AC; under normal CI load the optimistic DOM update is synchronous (≤16ms) — 300ms is a generous ceiling that absorbs Playwright's actionability delays and React commit batching
- **And** the E2E does NOT assert anything about the PATCH network request (no `page.waitForRequest`) — the test's concern is the user-facing contract (section move, visual state, persistence). Network-level coverage lives in the API contract tests (Story 3.1's contract test)

## Tasks / Subtasks

- [ ] **Task 1: Add `--color-completed-fg` token to `apps/web/src/styles/index.css`** (AC: 1)
  - [ ] Insert the new token inside the existing `@theme { ... }` block, between `--color-danger` and `--font-sans`:
    ```css
      --color-danger: #dc2626;
      --color-completed-fg: rgb(26 26 26 / 0.6); /* #1A1A1A at 60% opacity over #FAFAFA → effective ≥4.5:1 (WCAG AA). FR-006 / NFR-007. */

      --font-sans:
    ```
  - [ ] **Do NOT** add a new `@layer base` rule or apply the token globally — the token is a design-system value; consumption is handled at the component level (but in this story, `TodoRow` uses `opacity-60` directly; see AC2 rationale)
  - [ ] **Do NOT** remove any existing token or modify the `@media (prefers-reduced-motion: reduce)` rule at lines 30–37 — both stay untouched
  - [ ] **Do NOT** use the legacy `rgba(26, 26, 26, 0.6)` syntax — Tailwind v4's style guide prefers the modern `rgb(channels / alpha)` form (CSS Colors Module Level 4). Both compile identically, but the modern form is the idiom across the `@theme` block

- [ ] **Task 2: Extend `TodoRow` with completed-state styling** (AC: 2)
  - [ ] Modify `apps/web/src/components/TodoRow.tsx`:
    - In the description `<span>` at line 30, change the single className to a computed expression:
      ```tsx
      <span
        className={[
          'flex-1 text-base break-words',
          'transition-[opacity,text-decoration-color] duration-200 ease-out',
          todo.completed ? 'line-through opacity-60' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {todo.description}
      </span>
      ```
    - Alternatively, use `clsx` if the project has it installed (check `apps/web/package.json`). **It does NOT** (verified — no `clsx` dep in Story 1.5 / 2.x stack), so the array + filter + join pattern above is the lowest-dependency approach; OR use a template literal:
      ```tsx
      <span
        className={`flex-1 text-base break-words transition-[opacity,text-decoration-color] duration-200 ease-out${
          todo.completed ? ' line-through opacity-60' : ''
        }`}
      >
      ```
      Template-literal form is terser; prefer it unless the component gains more conditional classes later
  - [ ] **Why the transition utility is unconditional:** a conditional `transition-*` class means the transition only applies in ONE direction (e.g., when going from no-transition to line-through, the in-state doesn't animate). An unconditional transition means both directions animate. This matches the UX spec: "symmetric reverse transition" (line 406)
  - [ ] **Why `opacity-60` and not `text-[--color-completed-fg]`:** see Dev Notes → "Why `opacity-60` instead of `text-[--color-completed-fg]`"
  - [ ] **Why `transition-[opacity,text-decoration-color]` is the right custom value:** Tailwind v4 accepts comma-separated CSS property names inside `transition-[...]`. Using `transition-all` would transition ALL properties (layout-shifting properties like `flex-basis` could jank); restricting to the two properties that visually change avoids accidental layout animations
  - [ ] **Do NOT** apply `opacity-60` to the `<li>` root — that would fade the checkbox AND the delete button, making them visually inactive. The opacity only applies to the description span
  - [ ] **Do NOT** add a `style={{ textDecorationColor: 'var(--color-completed-fg)' }}` inline style — the strike-through color defaults to the text's computed color; when the text is already at 60% opacity, the strike-through inherits it. No manual override needed
  - [ ] **Do NOT** change the checkbox's `aria-label` logic (it already flips between "Mark complete: ..." and "Mark incomplete: ..." per Story 2.5) — the AC2 text restating the aria-label requirement is describing an invariant, not a new behavior

- [ ] **Task 3: Extend `TodoList` with Completed section rendering** (AC: 3)
  - [ ] Replace `apps/web/src/components/TodoList.tsx` body:
    ```tsx
    import type { Todo } from '../types.js';
    import TodoRow from './TodoRow.js';

    interface TodoListProps {
      todos: Todo[];
      onToggle: (id: string, completed: boolean) => void;
      onDeleteRequest: (todo: Todo) => void;
    }

    export default function TodoList({ todos, onToggle, onDeleteRequest }: TodoListProps) {
      const activeTodos = todos.filter((t) => !t.completed);
      const completedTodos = todos.filter((t) => t.completed);

      return (
        <div>
          <ul className="list-none">
            {activeTodos.map((todo) => (
              <TodoRow
                key={todo.id}
                todo={todo}
                onToggle={onToggle}
                onDeleteRequest={onDeleteRequest}
              />
            ))}
          </ul>

          {completedTodos.length > 0 && (
            <section className="mt-6">
              <h2 className="text-sm text-[--color-fg-muted] mb-2">Completed</h2>
              <ul className="list-none">
                {completedTodos.map((todo) => (
                  <TodoRow
                    key={todo.id}
                    todo={todo}
                    onToggle={onToggle}
                    onDeleteRequest={onDeleteRequest}
                  />
                ))}
              </ul>
            </section>
          )}
        </div>
      );
    }
    ```
  - [ ] **Why wrap the two lists in a `<div>` root (not a fragment):** React fragments do render multiple children, but a semantic container is friendlier to future styling (e.g., a wrapper `max-w-xl` if the section grows). The `<div>` has no visual impact (no classes) and costs nothing. A fragment would also work — choose either; the `<div>` is the Story-2.5-alignment choice (its original `<ul>` was the root)
  - [ ] **Why the Completed `<h2>` not `<h3>`:** there is currently no `<h2>` in the app (Header is `<h1 />`; Epic 4 may introduce `<h2>` for inline errors). Going `<h1>` → `<h2>` is the correct semantic hierarchy. A `<h3>` would skip a level
  - [ ] **Why `<section>` wraps the Completed group:** HTML5 `<section>` denotes a logical content grouping; it gives screen-reader users a navigable landmark ("Completed, 3 items"). A bare `<div>` works but loses the semantic benefit. Native `<section>` requires an accessible name — the `<h2>Completed</h2>` inside provides one automatically via `aria-labelledby` implicit linkage
  - [ ] **Why `activeTodos` `<ul>` is ALWAYS rendered** (even when empty): see Dev Notes → "Why the Active `<ul>` is always rendered". Removing the empty `<ul>` on the all-completed case would make the component render a completely different tree shape depending on input, which could cause DOM-diff surprises during the toggle animation (removing-and-re-inserting the `<ul>` loses row identity and breaks the transition)
  - [ ] **Why `completedTodos.length > 0` not just `completedTodos.length`:** both are truthy-checks, but `> 0` documents intent. `.length` alone reads as a boolean coercion of an integer — easy to misread as "is this defined"
  - [ ] **Why `key={todo.id}` on BOTH sections (not per-section composite keys):** React's reconciler uses the `key` to match nodes across renders. If a row moves from the Active `<ul>` to the Completed `<ul>`, React SHOULD see it as "remove from list A, insert into list B" — a DOM node REPLACEMENT, which would not preserve animation state. **However**, because both `<ul>`s are sibling children of the same parent `<div>`, and React's reconciler only matches keys within the same parent's children list, the row *does* get unmounted + remounted at the DOM level. The animation still works because `TodoRow` is `React.memo`'d and receives the same `todo` prop across renders — the NEW TodoRow instance's `transition-[opacity,text-decoration-color]` starts with the completed state's ending values (line-through + 60% opacity), appearing "already there" with no transition. See Dev Notes → "Why stable keys across sections matter for the transition"
  - [ ] **Do NOT** wrap the two `<ul>`s in a flexbox column with animation libraries (e.g., framer-motion) — MVP uses CSS-only transitions (architecture.md:238). The row re-mount is an accepted quirk; the visual outcome (row "snaps" to the Completed section with its completed styling) is acceptable and UX-approved (ux-design-specification.md line 403 says "row reorders into the Completed section" — does not mandate an FLIP-style animation)
  - [ ] **Do NOT** sort either list — the epic says "in received order". The API guarantees active-ASC-then-completed-ASC order (Story 2.2), so the two filter-in-order slices are already correct
  - [ ] **Do NOT** pass `completedTodos` / `activeTodos` as pre-computed props down to a subcomponent — keep the filtering in `TodoList` to preserve the current props signature

- [ ] **Task 4: Wire `useToggleTodo` into `App.tsx`** (AC: 4)
  - [ ] Update imports:
    ```ts
    import { useCallback } from 'react';
    import type { Todo } from './types.js';
    import Header from './components/Header.js';
    import AddTodoInput from './components/AddTodoInput.js';
    import TodoList from './components/TodoList.js';
    import LoadingSkeleton from './components/LoadingSkeleton.js';
    import EmptyState from './components/EmptyState.js';
    import { useTodos } from './hooks/useTodos.js';
    import { useCreateTodo } from './hooks/useCreateTodo.js';
    import { useToggleTodo } from './hooks/useToggleTodo.js';
    ```
  - [ ] Remove the module-scope `noopToggle` function. Keep `noopDeleteRequest` for now (Story 3.5's scope).
  - [ ] Update the comment immediately above the noop function(s): replace the current comment with `// Epic 3: delete handler comes in Story 3.5.`
  - [ ] Inside `App()`, add after the existing `const createMutation = useCreateTodo();` line:
    ```ts
    const { mutate: toggleMutate } = useToggleTodo();
    const handleToggle = useCallback(
      (id: string, completed: boolean) => toggleMutate({ id, completed }),
      [toggleMutate],
    );
    ```
  - [ ] Decide between two refactor shapes for `renderListArea`:
    - **Option A (chosen — simpler):** pass `onToggle` and `onDeleteRequest` through `renderListArea`'s params:
      ```tsx
      return (
        <div className="max-w-xl mx-auto px-4 pt-8 lg:pt-16">
          <Header />
          <main>
            <AddTodoInput
              onSubmit={createMutation.mutate}
              disabled={createMutation.isPending}
              error={createMutation.error?.message ?? null}
            />
            <div className="mt-6">
              {renderListArea({
                data,
                isPending,
                isError,
                onToggle: handleToggle,
                onDeleteRequest: noopDeleteRequest,
              })}
            </div>
          </main>
        </div>
      );

      function renderListArea({
        data,
        isPending,
        isError,
        onToggle,
        onDeleteRequest,
      }: {
        data: Todo[] | undefined;
        isPending: boolean;
        isError: boolean;
        onToggle: (id: string, completed: boolean) => void;
        onDeleteRequest: (todo: Todo) => void;
      }) {
        if (isPending) return <LoadingSkeleton />;
        if (isError) {
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
        return <TodoList todos={data} onToggle={onToggle} onDeleteRequest={onDeleteRequest} />;
      }
      ```
    - **Option B (rejected — unless simpler):** inline the list-or-empty branching into `App()` and delete `renderListArea`. Pros: one function, less plumbing. Cons: `App()` becomes ~35 lines vs ~20 — pushes beyond a glance. Stick with Option A
  - [ ] **Why `const { mutate: toggleMutate } = useToggleTodo()`:** destructuring pins the stable `mutate` reference to a local variable; the full `toggleMutation` object would include transient fields (`isPending`, `error`) which aren't needed by `App.tsx` for this story (they're for Epic 4's inline-error). Destructuring narrows the dependency surface
  - [ ] **Why `useCallback([toggleMutate])` dep array:** TanStack v5's `mutation.mutate` is stable across renders (memoized by `useMutation`). The dep list exists for React's exhaustive-deps lint rule; the `useCallback` never actually re-computes under normal operation. Leaving the dep array empty (`[]`) would violate exhaustive-deps
  - [ ] **Why NOT `handleToggle = (id, completed) => toggleMutate({id, completed})` without useCallback:** without the memo, `handleToggle` gets a new identity every App render. That new identity flows into `<TodoList>` → `<TodoRow>`. `TodoRow` is `React.memo`'d with shallow comparison: a new `onToggle` identity always fails the check → memo bails out → every row re-renders on every App state change (including typing into `AddTodoInput`). At 50 todos (Journey 4 perf target), this is a measurable re-render cost
  - [ ] **Do NOT** add a second `useCallback` for `onDeleteRequest` — `noopDeleteRequest` is declared at module scope, so its identity is already stable. Story 3.5 will replace it with `useDeleteTodo`-derived handler and apply the same `useCallback` pattern
  - [ ] **Do NOT** import `UpdateTodoInput` in `App.tsx` — `handleToggle` takes `(id, completed)` and constructs the `{ completed }` object inline before passing to `toggleMutate`. Importing the type would be dead code at this layer (TodoRow/TodoList are the only callers, and they use `(id, completed)` without knowing the hook's shape)
  - [ ] **Do NOT** wire delete here — Story 3.5's scope. Touching it expands this PR and risks conflicts

- [ ] **Task 5: Update `TodoRow.test.tsx` for the new completed-state styling** (AC: 2)
  - [ ] Remove the deferred test at lines 107–113:
    ```ts
    it('completed=true does NOT add line-through or opacity-60 classes (deferred to Story 3.4)', ...);
    ```
    (delete the entire `it` block)
  - [ ] Add new test cases in its place (inside the same `describe('<TodoRow />')` block):
    ```ts
    it('applies line-through and opacity-60 classes to the description when completed=true', () => {
      const { container } = renderRow({ todo: { completed: true } as Todo });
      const desc = container.querySelector('span.flex-1');
      expect(desc).not.toBeNull();
      expect(desc).toHaveClass('line-through');
      expect(desc).toHaveClass('opacity-60');
    });

    it('does NOT apply line-through or opacity-60 when completed=false', () => {
      const { container } = renderRow({ todo: { completed: false } as Todo });
      const desc = container.querySelector('span.flex-1');
      expect(desc).not.toHaveClass('line-through');
      expect(desc).not.toHaveClass('opacity-60');
    });

    it('applies transition utility unconditionally (for symmetric in-and-out animation)', () => {
      const { container: activeContainer } = renderRow({ todo: { completed: false } as Todo });
      const activeDesc = activeContainer.querySelector('span.flex-1');
      expect(activeDesc).toHaveClass('transition-[opacity,text-decoration-color]');
      expect(activeDesc).toHaveClass('duration-200');
      expect(activeDesc).toHaveClass('ease-out');

      const { container: completedContainer } = renderRow({ todo: { completed: true } as Todo });
      const completedDesc = completedContainer.querySelector('span.flex-1');
      expect(completedDesc).toHaveClass('transition-[opacity,text-decoration-color]');
    });
    ```
  - [ ] **Why three tests:** one per AC2 invariant (completed styling applied; unaffected when active; transition always present). Three tight assertions are more debuggable than one mega-test
  - [ ] **Why `toHaveClass('transition-[opacity,text-decoration-color]')` with the literal bracket string:** the Tailwind v4 arbitrary-value class name includes the brackets and comma literally in the DOM's `className` string. React's className string match is literal; the test must match the exact class literal
  - [ ] **Do NOT** test the computed CSS (`getComputedStyle(desc).opacity`) — jsdom does NOT apply CSS styles from external stylesheets (Tailwind's generated CSS). The test would read `opacity: ''` (empty string) regardless of the class. Assert class presence; computed-style coverage lives in E2E (Task 9) which runs in a real browser
  - [ ] **Do NOT** add a new test for the checkbox `aria-label` logic — it's already covered (lines 40–48)

- [ ] **Task 6: Update `TodoList.test.tsx` for Completed section rendering** (AC: 3)
  - [ ] Modify the existing "all-completed list renders an empty <ul> (no Completed section — Story 3.4)" test at lines 77–86 to assert the NEW behavior (Completed section is rendered):
    ```ts
    it('all-completed list renders the Completed section with its label', () => {
      const todos = [
        makeTodo({ description: 'Done X', completed: true }),
        makeTodo({ description: 'Done Y', completed: true }),
      ];
      const { container } = render(<TodoList todos={todos} onToggle={noop} onDeleteRequest={noop} />);
      expect(container.querySelectorAll('ul')).toHaveLength(2); // empty Active + non-empty Completed
      expect(screen.getByRole('heading', { level: 2, name: 'Completed' })).toBeInTheDocument();
      expect(screen.getByText('Done X')).toBeInTheDocument();
      expect(screen.getByText('Done Y')).toBeInTheDocument();
    });
    ```
  - [ ] Modify the existing "filters out completed todos" test at lines 28–41 — the new behavior is that completed todos appear in the Completed section, not that they're filtered out entirely:
    ```ts
    it('splits mixed todos into Active <ul> and Completed <ul> sections (received order)', () => {
      const todos = [
        makeTodo({ description: 'Active A', completed: false }),
        makeTodo({ description: 'Done X', completed: true }),
        makeTodo({ description: 'Active B', completed: false }),
        makeTodo({ description: 'Done Y', completed: true }),
      ];
      const { container } = render(<TodoList todos={todos} onToggle={noop} onDeleteRequest={noop} />);

      const lists = container.querySelectorAll('ul');
      expect(lists).toHaveLength(2);

      // Active <ul> (first) has 2 items: Active A, Active B (received order)
      const activeItems = Array.from(lists[0]!.querySelectorAll('li'));
      expect(activeItems.map((li) => li.textContent)).toEqual(
        expect.arrayContaining([
          expect.stringContaining('Active A'),
          expect.stringContaining('Active B'),
        ]),
      );
      expect(activeItems[0]?.textContent).toContain('Active A');
      expect(activeItems[1]?.textContent).toContain('Active B');

      // Completed <ul> (second) has 2 items: Done X, Done Y (received order)
      const completedItems = Array.from(lists[1]!.querySelectorAll('li'));
      expect(completedItems[0]?.textContent).toContain('Done X');
      expect(completedItems[1]?.textContent).toContain('Done Y');
    });
    ```
  - [ ] Modify the "renders a <ul> with one <li> per active todo" test at lines 21–26 to be slightly more permissive (the component may render 1 or 2 `<ul>`s depending on the presence of completed rows):
    ```ts
    it('renders a single Active <ul> with one <li> per active todo (no Completed section if all active)', () => {
      const todos = [makeTodo({ description: 'A' }), makeTodo({ description: 'B' })];
      const { container } = render(<TodoList todos={todos} onToggle={noop} onDeleteRequest={noop} />);
      expect(container.querySelectorAll('ul')).toHaveLength(1);
      expect(container.querySelectorAll('li')).toHaveLength(2);
      expect(screen.queryByRole('heading', { level: 2, name: 'Completed' })).toBeNull();
    });
    ```
  - [ ] Keep the "preserves the received order of active todos" test (lines 43–62) as-is — it's all-active; the test still passes
  - [ ] Keep the "each row exposes the correct checkbox aria-label" test (lines 64–69) — still valid
  - [ ] Keep the "empty list renders an empty <ul>" test (lines 71–75) — still valid (one `<ul>`, zero `<li>`s)
  - [ ] Keep the "forwards onToggle from TodoList → TodoRow with (id, desired) correctly" test (lines 88–96) — still valid
  - [ ] Add a new test: stable keys across sections preserve row identity on toggle:
    ```ts
    it('uses key={todo.id} on all rows in both sections (React reconciliation)', () => {
      const todos = [
        makeTodo({ id: 'aaa', description: 'Active', completed: false }),
        makeTodo({ id: 'bbb', description: 'Done', completed: true }),
      ];
      const { container } = render(<TodoList todos={todos} onToggle={noop} onDeleteRequest={noop} />);
      // Assert that both list items render — the key presence itself is a React-internal
      // detail not readable from DOM, but if keys collided or were missing, React would
      // warn via the console (silent under test by default) and duplicate text would appear.
      expect(screen.getByText('Active')).toBeInTheDocument();
      expect(screen.getByText('Done')).toBeInTheDocument();
      // Section membership: Active in first <ul>, Done in second
      const lists = container.querySelectorAll('ul');
      expect(lists[0]!.textContent).toContain('Active');
      expect(lists[0]!.textContent).not.toContain('Done');
      expect(lists[1]!.textContent).toContain('Done');
      expect(lists[1]!.textContent).not.toContain('Active');
    });
    ```
  - [ ] **Why the "all-completed" test asserts 2 `<ul>`s (not 1):** the Active `<ul>` is always rendered (empty when all todos are completed). The spec in AC3 + Dev Notes rationale dictates this. The earlier "empty <ul>" expectation from Story 2.5 was a "deferred to 3.4" placeholder — explicitly reversed here
  - [ ] **Do NOT** remove any existing test — extend and modify in-place. If a test is entirely obsolete (rare — only the "all-completed empty <ul>" case), its assertion intent is absorbed by a replacement test
  - [ ] **Do NOT** assert on `<h2>`'s className specifically — testing the `className` string couples the test to Tailwind utilities. Assert the semantic role (`getByRole('heading', { level: 2 })`) + text instead

- [ ] **Task 7: Wire `useToggleTodo` into `App.tsx` and update `App.integration.test.tsx`** (AC: 4, 5)
  - [ ] Task 4 already covers the `App.tsx` edit; Task 7 covers the integration test
  - [ ] Append three new `it(...)` blocks inside the existing `describe('<App /> integration — full tree with mocked fetch', ...)` block. Guide (full templates):
    ```tsx
    it('toggle active→completed renders optimistically and persists after refetch', async () => {
      const user = userEvent.setup();
      const T1 = {
        id: '01',
        description: 'Buy milk',
        completed: false,
        createdAt: '2026-04-20T10:00:00.000Z',
        userId: null,
      };
      const T2 = {
        id: '02',
        description: 'Read book',
        completed: false,
        createdAt: '2026-04-20T10:00:01.000Z',
        userId: null,
      };
      let patchResolved = false;
      const fetchFn = vi.fn<FetchFn>(async (_url, init) => {
        if (init?.method === 'PATCH') {
          patchResolved = true;
          return {
            ok: true,
            status: 200,
            statusText: 'OK',
            json: async () => ({ ...T1, completed: true }),
          } as unknown as Response;
        }
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () =>
            patchResolved ? [{ ...T1, completed: true }, T2] : [T1, T2],
        } as unknown as Response;
      });
      vi.stubGlobal('fetch', fetchFn);
      mountApp();
      await waitFor(() => expect(screen.getByText('Buy milk')).toBeInTheDocument());

      const firstCheckbox = screen.getByLabelText('Mark complete: Buy milk');
      await user.click(firstCheckbox);

      await waitFor(() =>
        expect(screen.getByRole('heading', { level: 2, name: 'Completed' })).toBeInTheDocument(),
      );
      expect(screen.getByLabelText('Mark incomplete: Buy milk')).toBeInTheDocument();

      const patchCall = fetchFn.mock.calls.find((c) => (c[1] as RequestInit).method === 'PATCH');
      expect(patchCall).toBeDefined();
      expect(patchCall![0]).toContain('/v1/todos/01');
      expect((patchCall![1] as RequestInit).body).toBe(JSON.stringify({ completed: true }));
    });

    it('toggle completed→active moves the row back to the Active section', async () => {
      const user = userEvent.setup();
      const T1 = {
        id: '01',
        description: 'Buy milk',
        completed: true,
        createdAt: '2026-04-20T10:00:00.000Z',
        userId: null,
      };
      let patchResolved = false;
      const fetchFn = vi.fn<FetchFn>(async (_url, init) => {
        if (init?.method === 'PATCH') {
          patchResolved = true;
          return {
            ok: true,
            status: 200,
            statusText: 'OK',
            json: async () => ({ ...T1, completed: false }),
          } as unknown as Response;
        }
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => (patchResolved ? [{ ...T1, completed: false }] : [T1]),
        } as unknown as Response;
      });
      vi.stubGlobal('fetch', fetchFn);
      mountApp();
      await waitFor(() =>
        expect(screen.getByRole('heading', { level: 2, name: 'Completed' })).toBeInTheDocument(),
      );

      const checkbox = screen.getByLabelText('Mark incomplete: Buy milk');
      await user.click(checkbox);

      await waitFor(() => {
        expect(
          screen.queryByRole('heading', { level: 2, name: 'Completed' }),
        ).toBeNull();
      });
      expect(screen.getByLabelText('Mark complete: Buy milk')).toBeInTheDocument();
    });

    it('toggle failure reverts the row to its prior state (invalidation refetch authoritative)', async () => {
      const user = userEvent.setup();
      const T1 = {
        id: '01',
        description: 'Buy milk',
        completed: false,
        createdAt: '2026-04-20T10:00:00.000Z',
        userId: null,
      };
      const fetchFn = vi.fn<FetchFn>(async (_url, init) => {
        if (init?.method === 'PATCH') {
          return {
            ok: false,
            status: 500,
            statusText: 'Internal Server Error',
            json: async () => ({
              statusCode: 500,
              error: 'Internal Server Error',
              message: 'boom',
            }),
          } as unknown as Response;
        }
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => [T1],
        } as unknown as Response;
      });
      vi.stubGlobal('fetch', fetchFn);
      mountApp();
      await waitFor(() => expect(screen.getByText('Buy milk')).toBeInTheDocument());

      const checkbox = screen.getByLabelText('Mark complete: Buy milk');
      await user.click(checkbox);

      // After settle (error + invalidation refetch), the row is back in Active.
      await waitFor(() => {
        expect(
          screen.queryByRole('heading', { level: 2, name: 'Completed' }),
        ).toBeNull();
      });
      expect(screen.getByLabelText('Mark complete: Buy milk')).toBeInTheDocument();
    });
    ```
  - [ ] **Why assert via `screen.getByLabelText('Mark complete|incomplete: ...')`:** the aria-label is the user-facing contract (screen readers read it). Asserting via `role` + `name` uses the accessibility tree, which is exactly what end users (sighted or not) perceive. Asserting via CSS class or section class would be brittle and overly coupled to markup
  - [ ] **Why the happy-path test tracks `patchResolved` state:** after the optimistic cache write, `useToggleTodo` invalidates the cache; TanStack refetches via GET; that refetch should return the NEW authoritative state (`completed: true`) so the final cache matches the optimistic. Without the `patchResolved` flag, the refetch would return the OLD state, which would revert the optimistic write after settle — a non-regression test would fail. The flag simulates server authority correctly
  - [ ] **Why no inline error is asserted in the failure test:** FR-010's inline-error surface lands in Epic 4 (Story 4.3). This story just confirms the cache reverts; the error UX is not yet wired. The `toggleMutation.error` is present in the hook but not rendered anywhere by `App.tsx` in this story
  - [ ] **Do NOT** call `vi.mocked(api.todos.update)` here — this file mocks `fetch`, not `api.todos`. Mixing strategies within the same file would be confusing
  - [ ] **Do NOT** assert `opacity: 0.6` / `text-decoration-line: line-through` via `toHaveStyle(...)` in jsdom — jsdom does not apply Tailwind's generated stylesheet. Computed-style coverage lives in E2E (Task 9)

- [ ] **Task 8: Add mixed-section a11y test to `TodoList.a11y.test.tsx`** (AC: 6)
  - [ ] Append the new `it(...)` block inside the existing `describe('<TodoList /> accessibility')`:
    ```tsx
    it('mixed active + completed todos — zero axe-core violations (FR-006 / NFR-007 contrast)', async () => {
      const todos = [
        makeTodo({ description: 'Active todo' }),
        makeTodo({ description: 'Completed todo', completed: true }),
      ];
      const { container } = render(<TodoList todos={todos} onToggle={noop} onDeleteRequest={noop} />);
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });
    ```
  - [ ] **Why the mixed-list test specifically:** the existing Story 2.5 tests cover "2 active todos" and "empty list". A mixed list exercises the new Completed section rendering (`<h2>`, `<section>` semantics, rows with `line-through opacity-60`). Axe-core checks `color-contrast`, `label`, `aria-valid-attr`, and ~40 other rules by default — any regression in the new section's DOM shape would fail here
  - [ ] **Why this does NOT fail on the 60%-opacity contrast:** axe-core computes effective contrast including inherited `opacity`. The `#1A1A1A at 60% opacity` over `#FAFAFA` is ~6.8:1 effective (UX spec line 435), above WCAG AA's 4.5:1. If axe reports a violation, investigate whether the background was correctly inherited (jsdom defaults to `rgb(0 0 0)` on `<body>` unless Tailwind utilities override it — for this test, the `--color-bg` token should apply via the `@theme` block, but the testing environment may or may not load the stylesheet. See AC6 rationale)
  - [ ] **Do NOT** add explicit rule configuration — the default axe call covers `color-contrast` correctly

- [ ] **Task 9: Create `apps/web/e2e/journey-2-toggle.spec.ts`** (AC: 7)
  - [ ] Create the new E2E file:
    ```ts
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
      await input.fill(description);
      await input.press('Enter');
      // Wait for the row to mount in the Active list before the next interaction.
      await expect(page.getByText(description)).toBeVisible({ timeout: 2_000 });
    }

    test.describe('Journey 2 — toggle complete/incomplete', () => {
      test.beforeEach(() => truncateTodos());

      test('3 seeded todos all render in the Active section', async ({ page }) => {
        await page.goto('/');
        await addTodo(page, 'T1');
        await addTodo(page, 'T2');
        await addTodo(page, 'T3');
        // No Completed heading when all active.
        await expect(
          page.getByRole('heading', { level: 2, name: 'Completed' }),
        ).not.toBeVisible();
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

        // Completed heading appears within 300ms of the click (optimistic update).
        await expect(
          page.getByRole('heading', { level: 2, name: 'Completed' }),
        ).toBeVisible({ timeout: 300 });

        // The toggled row is now in the Completed section.
        const completedSection = page.getByRole('region').filter({ has: page.getByText('Completed') });
        // The above region-based locator may need adjustment based on how <section>
        // resolves via Playwright's accessible-name inference. Fallback locator:
        // `page.locator('section').filter({ has: page.locator('h2', { hasText: 'Completed' }) })`
        const completedRow = page.getByText('T1');
        await expect(completedRow).toBeVisible();

        // Computed CSS assertions — the description span inside the completed row.
        // The description is nested: section > ul > li > span.flex-1 (the text node).
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
        await expect(
          page.getByRole('heading', { level: 2, name: 'Completed' }),
        ).toBeVisible({ timeout: 300 });

        await page.reload();
        await expect(
          page.getByRole('heading', { level: 2, name: 'Completed' }),
        ).toBeVisible();
        // The row is in the Completed section post-reload.
        await expect(page.getByLabelText('Mark incomplete: Persist me')).toBeVisible();
      });

      test('re-clicking the checkbox returns the row to Active', async ({ page }) => {
        await page.goto('/');
        await addTodo(page, 'Reversible');
        await page.getByLabelText('Mark complete: Reversible').click();
        await expect(
          page.getByRole('heading', { level: 2, name: 'Completed' }),
        ).toBeVisible({ timeout: 300 });

        await page.getByLabelText('Mark incomplete: Reversible').click();
        await expect(
          page.getByRole('heading', { level: 2, name: 'Completed' }),
        ).not.toBeVisible({ timeout: 300 });
        await expect(page.getByLabelText('Mark complete: Reversible')).toBeVisible();
      });

      test('toggle works at 320px viewport with no horizontal scroll (FR-009)', async ({ page }) => {
        await page.setViewportSize({ width: 320, height: 800 });
        await page.goto('/');
        await addTodo(page, 'Narrow');
        await page.getByLabelText('Mark complete: Narrow').click();
        await expect(
          page.getByRole('heading', { level: 2, name: 'Completed' }),
        ).toBeVisible({ timeout: 300 });

        const widths = await page.evaluate(() => ({
          doc: document.documentElement.scrollWidth,
          win: window.innerWidth,
        }));
        expect(widths.doc).toBeLessThanOrEqual(widths.win);
      });
    });
    ```
  - [ ] **Why the completed-row locator goes through `section > h2` then `li > span.flex-1`:** Playwright has no semantic "Completed section" role until the `<section>` landmark is confirmed by accessible-name inference. The composite locator (filter by heading) is resilient to future changes in the heading level / text
  - [ ] **Why `toHaveCSS('opacity', '0.6')` expects `'0.6'` as a string:** Playwright's `toHaveCSS` serializes computed-style values to strings. `0.6` is the JS numeric but `getComputedStyle(...).opacity` returns `'0.6'` as a string. Use the string in the assertion
  - [ ] **Why the 300ms timeout on the Completed-heading assertion:** the optimistic DOM update is synchronous; 300ms is a generous ceiling that absorbs Playwright's actionability wait (~50ms) + React commit batching (~16ms) + test-environment jitter. Setting timeout:100 would flake under CI load; 1000 would under-test the "instant" requirement
  - [ ] **Why each test uses its own `addTodo`:** `test.beforeEach(truncateTodos)` clears the table; tests run in isolation. Seeding via UI exercises the full stack; seeding via API-direct-fetch is faster but bypasses the AddTodoInput behavior (an acceptable optimization if the UI-seed path flakes — in MVP, prefer UI-seed for realism)
  - [ ] **Do NOT** combine multiple scenarios into one test — Playwright's test isolation + parallel-runner benefits degrade if tests depend on each other's state. Each `test(...)` is independent
  - [ ] **Do NOT** add any `await page.waitForRequest('**/v1/todos/*', { method: 'PATCH' })` assertions — the user-facing contract is what the test covers; network timing is an implementation detail. Story 3.1's contract tests lock the PATCH wire format

- [ ] **Task 10: Run the full check script and finalize** (AC: 1–7)
  - [ ] `npm run typecheck` — clean across both workspaces
  - [ ] `npm run lint` — clean (pre-existing `apps/api/src/db/index.ts:14` warning stays; out of scope)
  - [ ] `npm run format:check` — clean; run `npm run format` if needed
  - [ ] `npm test` — all suites pass:
    - api: unchanged (no API code touched)
    - web: updated `TodoRow.test.tsx`, updated `TodoList.test.tsx`, updated `App.integration.test.tsx`, updated `TodoList.a11y.test.tsx`; target: no regressions in untouched suites
  - [ ] `npm run test:e2e --workspace apps/web` — `journey-1.spec.ts` + new `journey-2-toggle.spec.ts` both pass against a running dev DB. Requires `docker compose up -d postgres` + `npm run dev` at the repo root in a separate shell (the Playwright config typically auto-starts the dev server; verify `apps/web/playwright.config.ts`)
  - [ ] `npm run check` — exits 0
  - [ ] **Manual smoke** (strongly recommended for this story): `npm run dev` at repo root. Open http://localhost:5173. Add a todo, check its checkbox. Verify:
    - Row fades to 60% opacity with strike-through within ~200ms
    - Row moves to a "Completed" section below the Active section
    - Un-checking moves it back
    - `prefers-reduced-motion` (OS setting on macOS: System Settings → Accessibility → Display → Reduce Motion) makes the transition instant
  - [ ] **Do NOT** push to `main` — CI picks up PR
  - [ ] **Do NOT** touch `apps/api/` — API is complete for toggling (Story 3.1 delivered PATCH)
  - [ ] **Do NOT** wire delete — Story 3.5
  - [ ] **Do NOT** add an inline-error component or UI — Epic 4 (Story 4.1) delivers `InlineError`; Story 4.3 wires it into the toggle failure path

## Dev Notes

### Why `opacity-60` instead of `text-[--color-completed-fg]`

The UX spec declares `--color-completed-fg` as `#1A1A1A at 60% opacity over #FAFAFA`. Two implementation paths:

**Path A (chosen): `className="... line-through opacity-60"`**
- Browser computes: text `color: #1A1A1A` (inherited); element `opacity: 0.6` cascades to children (including the strike-through line AND the text).
- Visual result: text and strike-through both at 60% opacity. Hit the UX target.
- Implementation cost: two Tailwind utilities. Zero custom CSS.
- Transitioning: `opacity` is a natively animatable CSS property; `text-decoration-color` is too. Both listed in the transition utility.

**Path B (rejected): `className="... line-through text-[--color-completed-fg]"`**
- Browser computes: text `color: rgb(26 26 26 / 0.6)` (no separate opacity channel on the element); strike-through inherits this color.
- Visual result: text and strike-through at ~60% color. Effectively identical to Path A.
- Implementation cost: custom color + same strike-through utility.
- Transitioning: to animate from opaque → 60% in Path B, we'd need to transition `color` — but the active → completed transition is "#1A1A1A → rgb(26 26 26 / 0.6)" which is just the alpha channel. Browsers handle `color` transitions fine. But: this couples the text color to a specific token, breaking "completed" into a color identity — it loses the "this text is faded out" visual grammar.

Path A is the Tailwind-idiomatic and visually-correct choice. The `--color-completed-fg` token is added to `index.css` (Task 1) for design-system completeness and for future use (e.g., if an icon inside the row needs the same fade), but the `TodoRow` component does not consume it directly.

### Why stable keys across sections matter for the transition

React's reconciler matches elements across re-renders by `key`. Within a single parent, moving an element preserves its DOM node and component instance. **Across different parents** (e.g., Active `<ul>` → Completed `<ul>` as separate children of `<div>`), the element is unmounted from the old parent and freshly mounted into the new one.

Consequence for animation:
- If we kept both rows in a **single** `<ul>` (flat list, no section grouping), the move would preserve the row's DOM node → the `transition-[opacity,text-decoration-color]` CSS would smoothly animate the opacity and strike-through from active-state to completed-state over 200ms.
- With two separate `<ul>`s, the row is re-mounted in the new section → the new instance starts at the completed-state CSS values (opacity: 0.6, line-through present) from mount time → the transition has no "before" state to animate from → the row appears "already completed" instantly.

This is a UX compromise. The alternatives:
1. **Flat list with CSS-sort** — use `order: N` CSS property on flex children to visually reorder without DOM reparenting. Breaks semantic reading order (screen readers still read DOM order, not visual). Rejected.
2. **Single `<ul>` with a visual "Completed" divider row** — inserts a divider `<li>` mid-list. Semantically weird (a heading inside a list). Rejected.
3. **Animation library (framer-motion)** — FLIP animations preserve visual continuity across DOM reparenting. Adds a dependency; violates "no animation library in MVP" (architecture.md:238). Rejected.

**The chosen design:** two semantic `<ul>`s; re-mount on section change; the CSS transition still runs for **in-place** toggles (active row's checkbox flipped while it's still in the Active section's list — until the section-assignment logic re-filters and the row moves to the Completed list on the next render). In practice, the "move" is a single render-cycle event — the user clicks, React commits, the row is in its new section. The CSS transition runs on the description span's opacity and strike-through, not on the row's position. Position change is instantaneous.

This is what the UX spec describes: "the checkbox flips checked, the text picks up strike-through, the row fades to 60% opacity, and the row reorders into the Completed section" (line 403). "Reorders" ≠ "animates-to-the-new-position". The fade + strike-through animate; the reordering is a layout commit.

### Why the Active `<ul>` is always rendered

An all-completed list produces:
- **Rendered:** Active `<ul></ul>` (empty) + Completed section (non-empty).

Alternative: conditionally render the Active `<ul>` only when `activeTodos.length > 0`:
- **Rendered:** Completed section only.

Trade-offs:
- **Always-render wins on React stability.** Removing and re-inserting the Active `<ul>` across toggles means the Completed section's DOM position shifts (by one sibling). React's reconciler handles this fine, but CSS-level transitions that might be applied to the sections (e.g., a future "fade-in-completed-section" effect) would stutter.
- **Always-render wins on accessibility.** Screen readers iterate sibling elements; a consistent structure is easier to narrate.
- **Conditional-render wins on DOM cleanliness.** An empty `<ul>` is mildly unusual markup; some linters may flag it.

The DOM-cleanliness tradeoff is mild, and the React-stability tradeoff is mildly real but never load-bearing in MVP. Always-render is the simpler, more-predictable default. Do NOT add an `aria-hidden="true"` to the empty `<ul>` — an empty list IS navigable by screen readers (they announce "list, 0 items"), which correctly conveys "you have no active todos".

### Why `handleToggle` must be stable (memo bailout)

`TodoRow` is `React.memo`'d with the default shallow comparator (Story 2.5). The memo checks `prevProps.onToggle === nextProps.onToggle`. If `App.tsx` passes a fresh arrow function on every render (`onToggle={(id, c) => toggleMutate({id, completed: c})}`):
- `prevProps.onToggle !== nextProps.onToggle` — identity changed.
- Memo bails out; all rows re-render.

With 50 todos (Journey 4 target), re-rendering all rows on every App state change (e.g., typing into `AddTodoInput` triggers `createMutation.isPending` to flip, re-rendering `App`) is a perceptible cost. `useCallback` pins `handleToggle` to a stable identity; memo holds; only rows whose `todo` prop changed re-render.

This is the same pattern `architecture.md:238` prescribes for Journey 4 perf: "Key-stable list + `React.memo` on Todo row + stable prop identities".

Alternative considered: propagate `toggleMutate` directly through `TodoList` to `TodoRow` and let `TodoRow` construct the `{id, completed}` argument. This shrinks the prop chain but couples `TodoRow` to `useToggleTodo`'s signature (`{id, completed}` object). The current shape — `(id, completed) => void` — is cleaner and keeps `TodoRow` endpoint-agnostic. The `useCallback` wrap at `App.tsx` is the right place to bridge the two shapes.

### Why the integration test uses `vi.stubGlobal('fetch')` (not `vi.mock('api/todos')`)

Two valid mock strategies for React Query + fetch-based hooks:
1. **Mock `fetch`** — hijacks the network layer; exercises apiClient, `api.todos.*`, the hook wiring, and the component together.
2. **Mock `api.todos`** — skips the network layer; exercises only the hook + component.

Story 3.3's **hook unit tests** use strategy 2 (epic-mandated): the unit-test scope is "did the hook compose TanStack correctly" — fetch-level wiring is irrelevant there.

Story 3.4's **integration tests** use strategy 1: the integration-test scope is "does the full stack behave correctly end-to-end" — skipping the network layer would miss regressions in `apiClient.patch` URL construction, JSON body serialization, response parsing, etc. Strategy 1 also consistent with Story 2.6's existing `App.integration.test.tsx` approach.

The two strategies coexist in the same web workspace without friction.

### Previous Story Intelligence

**From Story 3.1 (PATCH API) — load-bearing:**
- PATCH /v1/todos/:id returns the updated Todo (200) — the integration test's PATCH mock returns the same shape.
- 404 on non-existent id returns `Todo <id> not found` (not relevant for this story; the UI doesn't surface ids).
- Contract tests exhaustively cover the wire format — story 3.4 does not re-verify PATCH's contract; it verifies the UI calls PATCH correctly.

**From Story 3.2 (DELETE API) — NOT load-bearing:**
- DELETE is wired via Story 3.5; story 3.4 leaves `noopDeleteRequest` in place. Story 3.2's output is not consumed here.

**From Story 3.3 (`useToggleTodo` / `useDeleteTodo` hooks + factory) — load-bearing:**
- `useToggleTodo` returns `UseMutationResult<Todo, ApiError, {id: string; completed: boolean}, TodoOptimisticContext>`.
- `.mutate({id, completed})` applies optimistic cache update → PATCH → revert on error → invalidate.
- **Dependency:** Story 3.4 cannot land end-to-end until Story 3.3 is merged. Hook tests don't need the factory; integration tests + manual smoke do.

**From Story 2.5 (TodoRow + TodoList + LoadingSkeleton + EmptyState) — directly extended:**
- `TodoRow` markup with native checkbox + 44×44 tap targets + aria-label flipping is in place.
- `TodoList` filters active-only (to be extended with Completed section).
- A11y tests already cover completed state for `TodoRow` (no change needed).
- `memo`-wrapped export + shallow comparator — preserved.

**From Story 2.6 (App.tsx wire-up + Journey 1 E2E) — directly extended:**
- `App.tsx` owns `useTodos` + `useCreateTodo`; Story 3.4 adds `useToggleTodo`.
- `App.integration.test.tsx` sets the `mountApp()` + `vi.stubGlobal('fetch')` pattern — extended here.
- `journey-1.spec.ts` sets the E2E test pattern (`truncateTodos()`, `addTodo(page, ...)`, role-based locators, viewport tests) — mirrored in new `journey-2-toggle.spec.ts`.

**From Story 1.5 (CSS tokens + prefers-reduced-motion) — load-bearing:**
- `@theme` block holds the color tokens; `--color-completed-fg` joins them.
- `@media (prefers-reduced-motion: reduce)` global rule at `index.css:30-37` disables all transitions — no new rule needed.

### Git Intelligence

- Commit rhythm continues: `feat: story 3.4 implemented`.
- **Dependency order:** Story 3.4 depends on Stories 3.1 (PATCH API — merged) and 3.3 (hooks — must be merged before end-to-end smoke). Story 3.2 is orthogonal. If 3.3 isn't merged yet, the `useToggleTodo` import will fail the typecheck — Task 10's `npm run typecheck` will catch it and the story can't land.
- File-scope discipline: Story 3.4 touches exactly these files:
  1. `apps/web/src/styles/index.css` (extended — one token)
  2. `apps/web/src/components/TodoRow.tsx` (extended — description className)
  3. `apps/web/src/components/TodoRow.test.tsx` (updated — one test replaced with three)
  4. `apps/web/src/components/TodoList.tsx` (extended — Completed section)
  5. `apps/web/src/components/TodoList.test.tsx` (updated — mixed-list assertions)
  6. `apps/web/src/App.tsx` (extended — useToggleTodo + useCallback)
  7. `apps/web/src/App.integration.test.tsx` (extended — three new `it` blocks)
  8. `apps/web/test/a11y/TodoList.a11y.test.tsx` (extended — mixed-list case)
  9. `apps/web/e2e/journey-2-toggle.spec.ts` (NEW)
  10. `_bmad-output/implementation-artifacts/sprint-status.yaml` (status transition)
  11. `_bmad-output/implementation-artifacts/3-4-todorow-completed-state-todolist-completed-section-app-tsx-sectioning.md` (this file)
- **No new dependencies.** React, TanStack Query, testing-library, Playwright, axe-core, vitest-axe all already installed.
- **No API changes.** **No migration changes.** **No CI workflow changes.**

### Latest Tech Information

**Tailwind CSS v4 (arbitrary values):**
- `transition-[opacity,text-decoration-color]` — comma-separated property list in arbitrary-value syntax. Emits `transition-property: opacity, text-decoration-color`.
- `opacity-60` — emits `opacity: 0.6`. Discrete 5%-step scale (`opacity-5`, `opacity-10`, ..., `opacity-100`).
- `line-through` — emits `text-decoration-line: line-through`.
- `duration-200 ease-out` — emits `transition-duration: 200ms; transition-timing-function: cubic-bezier(0, 0, 0.2, 1);` (ease-out curve).

**React 19 (`React.memo` + `useCallback`):**
- `React.memo(Component)` — shallow-compares props; bails re-render if props unchanged.
- `useCallback(fn, [deps])` — returns memoized fn; recomputes when deps change. Use for event handlers passed to `memo`'d children.
- React 19's compiler (if enabled) could auto-memoize these — but this project does NOT use the React Compiler (no `react-compiler-runtime` in package.json). Manual `useCallback` is required.

**TanStack Query v5 `mutation.mutate` stability:**
- `mutation.mutate`, `mutation.mutateAsync`, `mutation.reset` are **stable references** across renders (memoized by `useMutation` internally). Dep arrays with `[mutation.mutate]` are safe and effectively equivalent to `[]` but satisfy ESLint's exhaustive-deps.

**Playwright `toHaveCSS` + computed styles:**
- Reads `getComputedStyle(element).<property>`. String comparison.
- For `opacity`, the browser returns `'0.6'` (string). Test expects `'0.6'`.
- For `text-decoration-line`, the browser returns `'line-through'` (for a single decoration); `'underline line-through'` if multiple.
- For `text-decoration-color`, returns `rgb(26, 26, 26)` (no alpha at this level — alpha comes from `opacity` on the element).

### Project Structure Notes

**Extended files (8):**
- `apps/web/src/styles/index.css` — add `--color-completed-fg` token
- `apps/web/src/components/TodoRow.tsx` — conditional completed styling + transition
- `apps/web/src/components/TodoRow.test.tsx` — replace deferred test with three new
- `apps/web/src/components/TodoList.tsx` — Completed section rendering
- `apps/web/src/components/TodoList.test.tsx` — mixed-list assertions
- `apps/web/src/App.tsx` — useToggleTodo wire-up + useCallback
- `apps/web/src/App.integration.test.tsx` — three new toggle-path tests
- `apps/web/test/a11y/TodoList.a11y.test.tsx` — mixed-list a11y case

**New files (1):**
- `apps/web/e2e/journey-2-toggle.spec.ts` — E2E spec

**No API changes.** **No new components.** **No new hooks.**

**Alignment with `architecture.md:234`, `architecture.md:238`:** `React.memo(TodoRow)` + stable-key list + stable callback identities = Journey-4 perf invariants held. Story 3.4 preserves them.

**Alignment with `ux-design-specification.md` lines 403–406:** "single visual gesture (~150–200ms, ease-out)" + "section move" + "symmetric reverse transition" + "prefers-reduced-motion: instant" — all addressed by AC2's styling + transition utilities.

### Testing Standards

- **Unit (component):** co-located `*.test.tsx`. `TodoRow`, `TodoList` tests extended.
- **Integration (app tree):** `App.integration.test.tsx` — fetch-mocked full-tree tests.
- **A11y:** `test/a11y/*.a11y.test.tsx` — axe-core via `vitest-axe`. Mixed-list scenario added.
- **E2E:** `apps/web/e2e/*.spec.ts` — Playwright against a real dev server + docker Postgres.
- **Test types deliberately separated:** unit component tests assert class presence (jsdom doesn't render Tailwind CSS); E2E tests assert computed styles (real browser does). Do NOT duplicate: unit tests do class-presence; E2E does computed-style.
- **Coverage target:** unit ~100% for the new branches; integration covers the three section-membership outcomes (after active, after complete, after error-revert); E2E covers the user-facing journey.
- **No new axe-core rules enabled.** Defaults suffice.

### References

- Epic requirements: [epics.md § Story 3.4](../planning-artifacts/epics.md) (lines 949–1013)
- UX spec — Complete flow (transition, reduced-motion, symmetric reverse): [ux-design-specification.md § Defining Experience](../planning-artifacts/ux-design-specification.md) (lines 399–413)
- UX spec — Color tokens (`--color-completed-fg` rationale): [ux-design-specification.md § Color System](../planning-artifacts/ux-design-specification.md) (lines 420–438)
- UX spec — Spacing (`mt-6` section separator): [ux-design-specification.md § Spacing & Layout Foundation](../planning-artifacts/ux-design-specification.md) (lines 468–496)
- UX spec — Accessibility (prefers-reduced-motion, focus, contrast): [ux-design-specification.md § Accessibility Considerations](../planning-artifacts/ux-design-specification.md) (lines 498–509)
- Architecture — `React.memo` on TodoRow + stable keys (Journey 4 perf): [architecture.md § Frontend Architecture](../planning-artifacts/architecture.md) (lines 237–238)
- Architecture — Web component boundaries (TodoList is presentational): [architecture.md § Component Boundaries](../planning-artifacts/architecture.md) (lines 595–601)
- Architecture — Native HTML + a11y primitives (`<input type="checkbox">`, axe-core): [architecture.md § Frontend Architecture](../planning-artifacts/architecture.md) (line 236)
- PRD — FR-003 (complete toggle), FR-006 (completed styling + WCAG), NFR-007 (WCAG 2.1 AA): [PRD.md § Requirements](../planning-artifacts/PRD.md)
- Previous story: [3-1 UpdateTodoInput + PATCH API](./3-1-updatetodoinput-schema-todosrepo-update-patch-v1-todos-id.md) — PATCH wire format locked
- Previous story: [3-3 useOptimisticTodoMutation + useToggleTodo + useDeleteTodo hooks](./3-3-useoptimistictodomutation-factory-usetoggletodo-usedeletetodo-hooks.md) — direct dependency; `useToggleTodo` consumed here
- Previous story: [2-5 TodoRow + TodoList + LoadingSkeleton + EmptyState](./2-5-todorow-non-completed-todolist-active-section-loadingskeleton-emptystate.md) — components extended; deferred "line-through" test reversed here
- Previous story: [2-6 End-to-end wire-up in App.tsx — Journey 1 complete](./2-6-end-to-end-wire-up-in-app-tsx-journey-1-complete.md) — App integration test file + E2E pattern extended here
- Previous story: [1-5 Web app scaffold — Tailwind v4 + design tokens + ErrorBoundary + Header](./1-5-web-app-scaffold-vite-tailwind-v4-design-tokens-errorboundary-header.md) — `@theme` block + prefers-reduced-motion global rule
- Previous story: [1-6 CI + code-quality gate](./1-6-ci-pipeline-code-quality-gate-eslint-prettier-a11y-playwright-e2e-scaffold-onboarding-readme.md) — `npm run check` aggregate

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
