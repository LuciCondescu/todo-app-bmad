# Story 2.5: `TodoRow` (non-completed) + `TodoList` (active section) + `LoadingSkeleton` + `EmptyState`

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want the todo list to render active items, a loading skeleton during the initial fetch, and an empty state when there are none,
So that the list area always shows the right thing and never flashes from empty to content (FR-002, FR-007, FR-008).

## Acceptance Criteria

This story delivers **four presentational components** and their accompanying unit + a11y tests. Nothing is wired into `App.tsx` in this story — that is Story 2.6's job. All four components are **pure, side-effect-free**, never call `fetch` / `useQuery` / `localStorage`, and consume data only via props (architecture boundary — `architecture.md:597`, `ux-design-specification.md:846`).

### `TodoRow` — `apps/web/src/components/TodoRow.tsx`

**AC1 — Component file, default export, and props**
- **Given** `apps/web/src/components/TodoRow.tsx` exists
- **When** the engineer inspects it
- **Then** it exports a **default** component `TodoRow` wrapped in `React.memo(...)` (see Dev Notes → "Why `React.memo` and how to test the memo bail-out")
- **And** its props TypeScript interface is:
  ```ts
  interface TodoRowProps {
    todo: Todo;                                      // from apps/web/src/types.ts
    onToggle: (id: string, completed: boolean) => void;
    onDeleteRequest: (todo: Todo) => void;
    isMutating?: boolean;
  }
  ```
  — imported type: `import type { Todo } from '../types.js';` (note the `.js` ESM specifier — Story 2.3 convention; see Dev Notes → "Why `.js` imports in a `.ts` file")
- **And** the component returns a single `<li>` root element (not a `<div>` — TodoList uses `<ul>`)
- **And** completed-state styling (strike-through, 60% opacity, section-move) is explicitly NOT implemented — deferred to Story 3.4. The component renders identically regardless of `todo.completed` value in this story's scope (only the checkbox `checked` + `aria-label` switch; no visual strike-through / opacity)

**AC2 — DOM structure: flex row with three children**
- **Given** the component renders
- **When** the engineer inspects the DOM
- **Then** the `<li>` has classes `flex items-center gap-3 py-3 md:py-4 px-2 border-b border-[--color-border]`
- **And** the `<li>` contains exactly three direct children in this order:
  1. A `<span>` (the checkbox wrapper — not `<label>`, see Dev Notes → "Why the checkbox wrapper is `<span>`, not `<label>`"): classes `inline-flex items-center justify-center min-w-[44px] min-h-[44px]`. It contains a single native `<input type="checkbox">`.
  2. A `<span>` (the description): classes `flex-1 text-base break-words`. Text content is `todo.description`.
  3. A `<button>` (delete trigger): `type="button"` (explicit — prevents browsers defaulting to `submit` inside any future form ancestor), classes `inline-flex items-center justify-center min-w-[44px] min-h-[44px] text-[--color-fg-muted] rounded-md`. It contains a single SVG glyph (see AC5)
- **And** the `<li>` has NO `onClick` handler at the root level (avoids swallowing click events meant for the checkbox or button)

**AC3 — Checkbox: native `<input>`, `aria-label`, and `onChange` wiring**
- **Given** the checkbox element
- **When** the engineer inspects it
- **Then** it is `<input type="checkbox">` (native — not a styled `<div>`, per `ux-design-specification.md:300` "Native `<input type="checkbox">` … non-negotiable")
- **And** its `checked` prop (JSX) is set to `todo.completed` — i.e., the checkbox is a **controlled** input whose truth is the `todo.completed` prop
- **And** its `aria-label` is exactly the string `"Mark complete: ${todo.description}"` when `todo.completed === false` and exactly `"Mark incomplete: ${todo.description}"` when `todo.completed === true` (no trailing period; `${...}` is the literal description with no truncation)
- **And** it has `onChange={(e) => onToggle(todo.id, e.target.checked)}` — i.e., the handler forwards the **desired** `completed` state (what the user is asking for), not the current state. See Dev Notes → "Why `onChange` forwards `e.target.checked`"
- **And** when `isMutating === true`, the checkbox has `disabled` set AND the wrapper has `aria-busy="true"` (UX spec line 768 — `pointer-events: none` is achieved by `disabled` on the native input)
- **And** the checkbox has NO custom styling beyond native + focus from the global `:focus-visible` rule (UX-DR1, `styles/index.css:24`)

**AC4 — Delete button: `<button>`, `aria-label`, `onClick` wiring**
- **Given** the delete button element
- **When** the engineer inspects it
- **Then** it is a real `<button type="button">` (not a `<span>` with `onClick`, not an `<a>`)
- **And** its `aria-label` is exactly `"Delete todo: ${todo.description}"` (no trailing period)
- **And** it has `onClick={() => onDeleteRequest(todo)}` — forwards the full `todo` object (Story 3.5's `DeleteTodoModal` needs the description for its title)
- **And** when `isMutating === true`, the button has `disabled` set (UX spec line 768 "delete icon subtly disabled")
- **And** the `<button>` wraps an inline `<svg>` icon with `aria-hidden="true"` (decorative — the button's `aria-label` carries the meaning) — see AC5

**AC5 — Delete SVG glyph (inline, decorative)**
- **Given** the delete button's `<svg>` child
- **When** the engineer inspects it
- **Then** it is an inline `<svg>` (not an `<img>`, not a background-image) with:
  - `aria-hidden="true"` (decorative)
  - `viewBox="0 0 24 24"`
  - `width="18"` `height="18"` (attributes; Tailwind classes `w-[18px] h-[18px]` work too but attribute form matches other stock icons and avoids CSS-loading timing issues in jsdom)
  - `fill="none"` `stroke="currentColor"` `stroke-width="2"` `stroke-linecap="round"` `stroke-linejoin="round"` (standard 24-grid outline convention — currentColor makes it inherit the button's `text-[--color-fg-muted]`)
  - The path data is a conventional trash-can glyph. A known-good snippet (Heroicons v2 `trash` path, hand-authored — no library import):
    ```tsx
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
    ```
- **And** the SVG is NOT imported from a third-party icon library (no `lucide-react`, no `heroicons` package — MVP constraint; hand-inline matches the Header's no-library approach from Story 1.5)

**AC6 — `React.memo` wrap + named function before memo**
- **Given** the file's export structure
- **When** the engineer inspects it
- **Then** the component is authored as a named inner function and then wrapped:
  ```ts
  function TodoRowImpl(props: TodoRowProps) { /* ... */ }
  export default React.memo(TodoRowImpl);
  ```
  — the named inner function gives `screen.debug()` / React DevTools a clear display name. See Dev Notes → "Why `React.memo` and how to test the memo bail-out"
- **And** **no custom `areEqual`** comparator is supplied — the default shallow-equality comparator is correct because our props are: `todo` (object identity from TanStack Query — stable across re-renders when the list doesn't change), `onToggle` / `onDeleteRequest` (parent wraps in `useCallback` in Story 2.6; until then, test-site passes stable refs), `isMutating` (primitive). Adding a custom comparator would hide the **parent-side** bug of passing new function identities every render — we want memo to correctly bail when the parent behaves, and correctly re-render when it doesn't
- **And** completed-state computation (`line-through`, opacity) lives as a **class string** in this story with `completed === true` wiring **deferred to Story 3.4** — no premature introduction of a `clsx` helper or state-dispatching object; a simple conditional-class ternary is not needed in this story because visual state is identical in both branches

### `TodoList` — `apps/web/src/components/TodoList.tsx`

**AC7 — Component file, default export, and props**
- **Given** `apps/web/src/components/TodoList.tsx` exists
- **When** the engineer inspects it
- **Then** it exports a **default** component `TodoList` (not wrapped in memo — only `TodoRow` is memo'd per `ux-design-specification.md:847`)
- **And** its props interface is:
  ```ts
  interface TodoListProps {
    todos: Todo[];
    onToggle: (id: string, completed: boolean) => void;
    onDeleteRequest: (todo: Todo) => void;
  }
  ```
- **And** it never calls `fetch`, `useQuery`, `localStorage`, or any TanStack Query hook (architecture boundary — `architecture.md:597`, UX spec `ux-design-specification.md:754`)

**AC8 — Active-section-only rendering**
- **Given** `TodoList` receives `todos: Todo[]` with a mix of `completed: true` and `completed: false`
- **When** the component renders
- **Then** it renders exactly one `<ul>` element
- **And** the `<ul>` contains one `<TodoRow />` for each todo where `todo.completed === false`, in the received order (filter-then-render — see Dev Notes → "Active filter: `.filter()` then render, not `.map()` + conditional return null")
- **And** each `<TodoRow />` has `key={todo.id}` (stable key for React reconciliation — UX spec `ux-design-specification.md:658`)
- **And** NO Completed section `<ul>` and NO "Completed" heading is rendered (both deferred to Story 3.4 — this story's scope is Active only)
- **And** if every `todo.completed === true` (zero active rows), the `<ul>` renders empty (an empty `<ul>` is legal; the parent in Story 2.6 decides to show `<EmptyState />` only when **both** sections would be empty — but for this story, that policy lives in the parent, not in `TodoList`)

**AC9 — List container classes and semantics**
- **Given** the `<ul>` element
- **When** the engineer inspects its classes
- **Then** classes are `list-none` (native `<ul>` has bullets we need to remove for our row design; Tailwind 4's preflight zeroes list-style but `list-none` is belt-and-suspenders for any host-page context leak)
- **And** there are NO ARIA roles added to the `<ul>` (native `<ul>` implicit role is correct — `ux-design-specification.md:756` "no ARIA needed for a native list")
- **And** the `<ul>` has NO explicit spacing utilities beyond what `TodoRow` supplies via `border-b` (the rows' `border-b` creates the dividers; no gap or margin on the `ul` itself)

### `LoadingSkeleton` — `apps/web/src/components/LoadingSkeleton.tsx`

**AC10 — Component file, default export, and props (optional `rows`)**
- **Given** `apps/web/src/components/LoadingSkeleton.tsx` exists
- **When** the engineer inspects it
- **Then** it exports a **default** component `LoadingSkeleton`
- **And** its props interface is:
  ```ts
  interface LoadingSkeletonProps {
    rows?: number;
  }
  ```
  — defaulted at the destructure site: `function LoadingSkeleton({ rows = 3 }: LoadingSkeletonProps) { ... }` (Story 2.4 convention — don't use `defaultProps`, which is deprecated for function components in React 19)
- **And** `rows` is clamped at the parameter level to integer ≥1; out-of-range values (`0`, negative, non-integer) are NOT supported — **do not add runtime validation** (see the root guidelines: don't validate internal code paths; this is an app-internal component, not a public surface)

**AC11 — DOM structure: `rows` placeholder rows + visually-hidden label**
- **Given** the component renders with `rows={3}` (default)
- **When** the engineer inspects the DOM
- **Then** the root is a `<div>` (not a `<ul>` — this is a placeholder visual, not semantic list content; see Dev Notes → "Why LoadingSkeleton is a `<div>`, not a `<ul>`")
- **And** the root has classes `animate-pulse` (Tailwind's built-in pulse utility — a 2s ease-in-out infinite opacity-to-50% animation)
- **And** the root has these ARIA attributes: `aria-busy="true"`, `aria-live="polite"`, `aria-label="Loading your todos"` (the `aria-label` is the accessible name; there is NO visible "Loading…" text — the per-row visual is the visual, the `aria-label` is the announcement)
- **And** the root contains exactly `rows` child `<div>` elements, each representing one placeholder row with:
  - Classes `flex items-center gap-3 py-3 md:py-4 px-2 border-b border-[--color-border]` (matches `TodoRow` layout)
  - Three placeholder children in this order:
    1. A `<div>` circle: `w-5 h-5 rounded-full bg-[--color-border]`, wrapped in a 44×44 wrapper (`inline-flex items-center justify-center min-w-[44px] min-h-[44px]`) to match TodoRow's checkbox wrapper
    2. A `<div>` rectangle (description placeholder): `flex-1 h-4 rounded bg-[--color-border]`
    3. A `<div>` square (delete placeholder): `w-[18px] h-[18px] rounded bg-[--color-border]`, wrapped in a 44×44 wrapper to match TodoRow's delete button

**AC12 — Visually-hidden accessible name + reduced-motion honored**
- **Given** the root `<div>`
- **When** a screen reader queries the accessible name
- **Then** it announces `"Loading your todos"` (via `aria-label` on the live region — no visible text needed; this is the simpler approach vs. a visually-hidden `<span>` child)
- **And** the live region's `aria-busy="true"` + `aria-live="polite"` pair is set. `aria-live="polite"` is preferred over `"assertive"` per UX spec (quiet announcement, one utterance, not interrupt)
- **And** the `animate-pulse` animation respects `prefers-reduced-motion: reduce` via the global rule in `styles/index.css:30–37` (which zeros all `animation-duration`) — **no per-component override needed**; this AC is satisfied by relying on the Story 1.5 global rule (see Dev Notes → "How reduced-motion is inherited, not re-implemented")
- **And** the placeholder `<div>`s have NO text content — they are purely visual; screen readers ignore them (`aria-busy` on an ancestor tells AT "not-yet-ready", and the placeholders have no accessible name)

### `EmptyState` — `apps/web/src/components/EmptyState.tsx`

**AC13 — Component file, default export, and no props**
- **Given** `apps/web/src/components/EmptyState.tsx` exists
- **When** the engineer inspects it
- **Then** it exports a **default** component `EmptyState` with NO props (`function EmptyState() { ... }`)
- **And** it takes zero props because the copy is PRD-locked (`ux-design-specification.md:808–810`) and there is no variant (no "error empty", no "filter empty" in MVP) — see Dev Notes → "EmptyState has no props on purpose"

**AC14 — DOM structure: centered block with SVG, primary copy, sub-copy**
- **Given** the component renders
- **When** the engineer inspects the DOM
- **Then** the root is a `<div>` with classes `flex flex-col items-center text-center py-12`
- **And** the root contains exactly three children in this order:
  1. An inline `<svg>` with `aria-hidden="true"`, `viewBox="0 0 64 64"`, `width="64"`, `height="64"`, `fill="none"`, `stroke="currentColor"`, classes `text-[--color-fg-muted] opacity-70`. The SVG is a minimal line-drawing (three gently-stacked horizontal lines or a similarly abstract "list-is-empty" motif — see the exact snippet below)
  2. A `<p>` with text `"No todos yet."` (exact string — PRD-locked), classes `text-base mt-6`
  3. A `<p>` with text `"Add one below."` (exact string — PRD-locked), classes `text-sm text-[--color-fg-muted] mt-1`
- **And** there are NO buttons, NO `<a>` links, NO CTAs inside `EmptyState` (the `AddTodoInput` sits above it and is the CTA — UX spec `ux-design-specification.md:813`)
- **And** the component has NO internal state, NO hooks, NO effects — it is a pure function of zero arguments returning static JSX

**AC15 — Abstract line-drawing SVG contents (exact snippet)**
- **Given** the component's `<svg>` child
- **When** the engineer inspects its inner markup
- **Then** it contains exactly three `<line>` elements forming stacked horizontal strokes within the `64×64` viewBox, rendered as:
  ```tsx
  <svg
    aria-hidden="true"
    viewBox="0 0 64 64"
    width="64"
    height="64"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    className="text-[--color-fg-muted] opacity-70"
  >
    <line x1="16" y1="24" x2="48" y2="24" />
    <line x1="16" y1="32" x2="48" y2="32" />
    <line x1="16" y1="40" x2="40" y2="40" />
  </svg>
  ```
- **And** the SVG has no fill (all `stroke` only — line-drawing, per UX spec `ux-design-specification.md:706`)
- **And** the SVG is inline (not a separate file in `apps/web/src/assets/` — MVP keeps it inline; architecture `architecture.md:687` says assets folder "if introduced" but we don't need it yet)
- **And** the SVG styling uses `text-[--color-fg-muted]` (which cascades to `currentColor` on stroke) + `opacity-70` (UX spec `ux-design-specification.md:706` — "`fg-muted` at opacity 0.7")

### Unit tests

**AC16 — `apps/web/src/components/TodoRow.test.tsx`**
- **Given** `@testing-library/react` + `@testing-library/user-event` + a `renderRow` helper
- **When** the engineer runs `npm test --workspace apps/web`
- **Then** the tests assert (each `it` reflects one acceptance bullet):
  1. Renders `<li>` root with flex row layout classes (`flex items-center gap-3 py-3`, `border-b`). Assert via `container.querySelector('li')` + `toHaveClass(...)`
  2. Checkbox has `aria-label="Mark complete: Buy milk"` when `todo.completed === false` and `aria-label="Mark incomplete: Buy milk"` when `todo.completed === true`
  3. Delete button has `aria-label="Delete todo: Buy milk"`
  4. Clicking the checkbox calls `onToggle(todo.id, true)` once when `todo.completed === false` (`e.target.checked` transitions false→true)
  5. Clicking the checkbox calls `onToggle(todo.id, false)` once when `todo.completed === true` (transitions true→false)
  6. Clicking the delete button calls `onDeleteRequest(todo)` once with the **full todo object** (not just the id)
  7. `isMutating={true}` sets the checkbox `disabled` and the checkbox wrapper's `aria-busy="true"`; the delete button is also `disabled`
  8. Checkbox wrapper computed dimensions are ≥44×44 — asserted via `toHaveClass('min-w-[44px]')` + `toHaveClass('min-h-[44px]')` (jsdom doesn't compute real dimensions; class-based assertion is the pragmatic proxy; real-device dimensions verified in Story 5.3 manual checklist)
  9. Delete button computed dimensions ≥44×44 — same class-based assertion
  10. **React.memo wrap + default comparator:** use the structural-assertion pattern from Dev Notes → "How to test bail-out". Assert `TodoRow.$$typeof === Symbol.for('react.memo')` AND that no custom `compare` function is attached. This proves — by construction with React's documented semantics — that the component bails on shallow-equal props
  11. Completed styling (strike-through / opacity) is NOT applied in this story: assert `todo.completed === true` renders the description `<span>` **without** any `line-through` or `opacity-60` class (no premature Story 3.4 leakage)
- **And** the file imports `render` + `screen` from `@testing-library/react` and `userEvent` from `@testing-library/user-event`, and imports the component via `import TodoRow from './TodoRow.js';` (note `.js` ESM specifier)
- **And** the `renderRow` helper provides sensible defaults:
  ```tsx
  function renderRow(overrides: Partial<React.ComponentProps<typeof TodoRow>> = {}) {
    const todo: Todo = {
      id: '01-test-uuid',
      description: 'Buy milk',
      completed: false,
      userId: null,
      createdAt: '2026-04-20T12:00:00.000Z',
    };
    const props = {
      todo,
      onToggle: vi.fn(),
      onDeleteRequest: vi.fn(),
      ...overrides,
    };
    const result = render(<TodoRow {...props} />);
    return { ...result, ...props };
  }
  ```

**AC17 — `apps/web/src/components/TodoList.test.tsx`**
- **Given** the harness
- **When** the engineer runs `npm test --workspace apps/web`
- **Then** the tests assert:
  1. Renders `<ul>` with exactly N `<li>` children when receiving N active todos
  2. Receiving a mix of `completed: true` and `completed: false` renders ONLY the `completed: false` rows (active section only)
  3. Order is preserved: pass `[todoB, todoA, todoC]` (all active); assert the rendered `<li>` descriptions appear in that exact order (`.toHaveTextContent` probe by index via `within`)
  4. Each rendered `<li>` corresponds to a row with the correct `aria-label` on its checkbox (verifies React is wiring the correct `todo` to each row — caught key-collision bugs if any)
  5. Empty list (`todos={[]}`): renders an empty `<ul>` (no children, no `EmptyState` — that's the parent's job)
  6. All-completed list: renders an empty `<ul>` (no active rows; Completed section deferred)
  7. **Props forwarding:** clicking the checkbox on the first `<TodoRow />` calls the `onToggle` prop **passed to `TodoList`** with `(todos[0].id, true)` — verifies the prop chain TodoList → TodoRow is intact
- **And** completed-section assertions (the "Completed" heading, the `mt-6` separator) are **explicitly deferred to Story 3.4** and must NOT be asserted here (premature coupling)

**AC18 — `apps/web/src/components/LoadingSkeleton.test.tsx`**
- **Given** the harness
- **When** the engineer runs `npm test --workspace apps/web`
- **Then** the tests assert:
  1. Default-props render: 3 placeholder rows (`container.querySelectorAll(':scope > div > div').length === 3` — inner rows; assert the count of first-level row children under the pulse wrapper)
  2. `rows={4}` renders 4 placeholder rows; `rows={1}` renders 1
  3. Root `<div>` has `aria-busy="true"`, `aria-live="polite"`, and `aria-label="Loading your todos"` — queried via `screen.getByLabelText('Loading your todos')` (the `aria-label` surfaces as the accessible name)
  4. Root `<div>` has class `animate-pulse`
  5. Each placeholder row has the TodoRow-matching classes (`flex items-center gap-3 py-3`, `border-b`) — one spot-check assertion per unique class; exhaustive class matching is unnecessary noise
  6. Component contains NO `<button>`, NO `<input>`, and NO live interactive elements — assert `container.querySelector('button, input, a')` is `null` (it's a visual placeholder only)

**AC19 — `apps/web/src/components/EmptyState.test.tsx`**
- **Given** the harness
- **When** the engineer runs `npm test --workspace apps/web`
- **Then** the tests assert:
  1. Renders the exact string `"No todos yet."` as a `<p>` with `text-base` class
  2. Renders the exact string `"Add one below."` as a `<p>` with `text-sm` and `text-[--color-fg-muted]` classes
  3. Renders an `<svg>` with `aria-hidden="true"` attribute (decorative)
  4. Root `<div>` is centered (`flex flex-col items-center text-center py-12`)
  5. Contains NO `<button>`, NO `<a>`, NO interactive elements — assert `container.querySelector('button, a, input')` is `null` (UX spec `ux-design-specification.md:813` forbids CTAs inside EmptyState)
  6. Takes no props: `<EmptyState />` with no props compiles and renders (this is a compile-time guarantee via TS; a runtime render assertion is a cheap regression guard)

### Accessibility tests (axe-core)

**AC20 — `apps/web/test/a11y/TodoRow.a11y.test.tsx`**
- **Given** the a11y harness from Story 1.6 (`vitest-axe` + global `expect.extend(matchers)` in `apps/web/test/setup.ts`)
- **When** the engineer runs `npm test --workspace apps/web`
- **Then** the file asserts **three** variants, zero axe violations for each:
  1. Default state: `<TodoRow todo={activeStub} onToggle={noop} onDeleteRequest={noop} />`
  2. Mutating state: `isMutating={true}` added
  3. Completed-`todo` state (checkbox `aria-label` flips; no visual strike-through yet) — this catches any rule-impacting combination early, even though Story 3.4 is the full completed-state pass
- **And** the test wraps each `<TodoRow />` in a `<ul>` for axe to see correct `<li>` parent context (`<li>` outside `<ul>` is a valid HTML5 warning axe may flag; the wrapper avoids the false positive):
  ```tsx
  const { container } = render(
    <ul>
      <TodoRow {...props} />
    </ul>,
  );
  ```

**AC21 — `apps/web/test/a11y/TodoList.a11y.test.tsx`**
- **Given** the a11y harness
- **When** the engineer runs `npm test --workspace apps/web`
- **Then** the file asserts **two** variants, zero axe violations for each:
  1. With 2 active todos
  2. With an empty list (`todos={[]}`) — verifies an empty `<ul>` is a11y-clean
- **And** the file does NOT test the Completed section (deferred to Story 3.4's update of this same file — this story creates the scaffold, 3.4 extends the cases)

**AC22 — `apps/web/test/a11y/LoadingSkeleton.a11y.test.tsx`**
- **Given** the a11y harness
- **When** the engineer runs `npm test --workspace apps/web`
- **Then** the file asserts **one** variant, zero axe violations:
  1. Default-props render (`<LoadingSkeleton />`) — the single live-region-plus-visual-placeholder combo
- **And** the test does NOT assert `rows={4}` or other counts (axe behavior is count-invariant; covering one is sufficient)

**AC23 — `apps/web/test/a11y/EmptyState.a11y.test.tsx`**
- **Given** the a11y harness
- **When** the engineer runs `npm test --workspace apps/web`
- **Then** the file asserts **one** variant, zero axe violations:
  1. `<EmptyState />` with no props
- **And** the test follows the exact pattern of `apps/web/test/a11y/Header.a11y.test.tsx` (Story 1.6) — same imports, same structure, one `it` block

### Full check

**AC24 — `npm run check` exits 0; all test counts grow as expected**
- **Given** all source + test files are in place
- **When** the engineer runs the following (in order):
  1. `npm run typecheck --workspace apps/web` — exits 0; no new type errors
  2. `npm run lint` — exits 0; no new `jsx-a11y` or `react` warnings
  3. `npm run format:check` — exits 0 (or run `npm run format` to normalize)
  4. `npm test --workspace apps/web` — exits 0; **new** test counts:
     - `TodoRow.test.tsx` ~11 tests
     - `TodoList.test.tsx` ~7 tests
     - `LoadingSkeleton.test.tsx` ~6 tests
     - `EmptyState.test.tsx` ~6 tests
     - `TodoRow.a11y.test.tsx` 3 tests
     - `TodoList.a11y.test.tsx` 2 tests
     - `LoadingSkeleton.a11y.test.tsx` 1 test
     - `EmptyState.a11y.test.tsx` 1 test
     - **Total new: ~37**; **pre-existing web tests** (post-2.4 landing: Header unit + a11y, ErrorBoundary unit, App unit, AddTodoInput unit + a11y, useTodos, useCreateTodo) should remain passing and total must increase monotonically
  5. `npm test --workspace apps/api` — regression check; **no API changes** in this story, must still pass unchanged (96 tests per sprint-status note)
  6. `npm run check` — aggregate passes
- **And** NO `App.tsx` modifications are made in this story — `App.tsx` remains `<><Header /><main /></>` exactly as today; Story 2.6 wires the new components into `App.tsx`
- **And** NO Playwright E2E run is required (the Story 1.6 smoke still passes unmodified since `App.tsx` is untouched)
- **And** manual smoke: `docker compose up -d postgres` + `npm run dev`, navigate to `http://localhost:5173`, verify the app still renders the Header (the new components are NOT visible yet; they are authored, tested, but un-wired — this is expected)

## Tasks / Subtasks

- [x] **Task 1: Create `TodoRow` component** (AC: 1, 2, 3, 4, 5, 6)
  - [x] Author `apps/web/src/components/TodoRow.tsx`:
    ```tsx
    import { memo } from 'react';
    import type { Todo } from '../types.js';

    interface TodoRowProps {
      todo: Todo;
      onToggle: (id: string, completed: boolean) => void;
      onDeleteRequest: (todo: Todo) => void;
      isMutating?: boolean;
    }

    function TodoRowImpl({ todo, onToggle, onDeleteRequest, isMutating = false }: TodoRowProps) {
      const checkboxLabel = todo.completed
        ? `Mark incomplete: ${todo.description}`
        : `Mark complete: ${todo.description}`;

      return (
        <li className="flex items-center gap-3 py-3 md:py-4 px-2 border-b border-[--color-border]">
          <span
            className="inline-flex items-center justify-center min-w-[44px] min-h-[44px]"
            aria-busy={isMutating ? 'true' : undefined}
          >
            <input
              type="checkbox"
              checked={todo.completed}
              disabled={isMutating}
              aria-label={checkboxLabel}
              onChange={(e) => onToggle(todo.id, e.target.checked)}
            />
          </span>
          <span className="flex-1 text-base break-words">{todo.description}</span>
          <button
            type="button"
            disabled={isMutating}
            aria-label={`Delete todo: ${todo.description}`}
            onClick={() => onDeleteRequest(todo)}
            className="inline-flex items-center justify-center min-w-[44px] min-h-[44px] text-[--color-fg-muted] rounded-md"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              width="18"
              height="18"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 6h18" />
              <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
              <path d="M10 11v6" />
              <path d="M14 11v6" />
            </svg>
          </button>
        </li>
      );
    }

    export default memo(TodoRowImpl);
    ```
    - See Dev Notes → "Why `React.memo` and how to test the memo bail-out"
    - See Dev Notes → "Why the checkbox wrapper is `<span>`, not `<label>`"
    - See Dev Notes → "Why `onChange` forwards `e.target.checked`"
  - [x] **Do NOT** add completed-state strike-through / opacity classes (Story 3.4)
  - [x] **Do NOT** wire InlineError / error props (Story 4.3)
  - [x] **Do NOT** import an icon library (e.g., `lucide-react`, `@heroicons/react`) — the inline SVG is the MVP contract
  - [x] **Do NOT** add a custom `areEqual` comparator to `memo(...)` — default shallow-equality is correct (see AC6)

- [x] **Task 2: Create `TodoList` component** (AC: 7, 8, 9)
  - [x] Author `apps/web/src/components/TodoList.tsx`:
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
      return (
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
      );
    }
    ```
  - [x] **Do NOT** render the Completed section in this story. Story 3.4 will add a second `<ul>` + `<h2>Completed</h2>` + `mt-6` separator
  - [x] **Do NOT** add `useMemo` around the `.filter()` — the list is small (MVP target ≤50 todos per Journey 4); the React.memo on `TodoRow` handles the neighbor-rerender concern. Premature memoization is a code-review smell

- [x] **Task 3: Create `LoadingSkeleton` component** (AC: 10, 11, 12)
  - [x] Author `apps/web/src/components/LoadingSkeleton.tsx`:
    ```tsx
    interface LoadingSkeletonProps {
      rows?: number;
    }

    export default function LoadingSkeleton({ rows = 3 }: LoadingSkeletonProps) {
      return (
        <div
          className="animate-pulse"
          aria-busy="true"
          aria-live="polite"
          aria-label="Loading your todos"
        >
          {Array.from({ length: rows }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-3 py-3 md:py-4 px-2 border-b border-[--color-border]"
            >
              <span className="inline-flex items-center justify-center min-w-[44px] min-h-[44px]">
                <div className="w-5 h-5 rounded-full bg-[--color-border]" />
              </span>
              <div className="flex-1 h-4 rounded bg-[--color-border]" />
              <span className="inline-flex items-center justify-center min-w-[44px] min-h-[44px]">
                <div className="w-[18px] h-[18px] rounded bg-[--color-border]" />
              </span>
            </div>
          ))}
        </div>
      );
    }
    ```
    - See Dev Notes → "Why LoadingSkeleton is a `<div>`, not a `<ul>`"
    - See Dev Notes → "How reduced-motion is inherited, not re-implemented"
  - [x] **Do NOT** add a visible "Loading…" text node. The `aria-label` is the accessible name; visual loading is the pulsing placeholder rows
  - [x] **Do NOT** add a `useReducedMotion` hook — global CSS rule from Story 1.5 handles it
  - [x] **Do NOT** add runtime validation on `rows` (no clamping, no throw) — it's an internal prop

- [x] **Task 4: Create `EmptyState` component** (AC: 13, 14, 15)
  - [x] Author `apps/web/src/components/EmptyState.tsx`:
    ```tsx
    export default function EmptyState() {
      return (
        <div className="flex flex-col items-center text-center py-12">
          <svg
            aria-hidden="true"
            viewBox="0 0 64 64"
            width="64"
            height="64"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            className="text-[--color-fg-muted] opacity-70"
          >
            <line x1="16" y1="24" x2="48" y2="24" />
            <line x1="16" y1="32" x2="48" y2="32" />
            <line x1="16" y1="40" x2="40" y2="40" />
          </svg>
          <p className="text-base mt-6">No todos yet.</p>
          <p className="text-sm text-[--color-fg-muted] mt-1">Add one below.</p>
        </div>
      );
    }
    ```
  - [x] **Do NOT** add a CTA button (UX spec `ux-design-specification.md:813` — the `AddTodoInput` above is the CTA)
  - [x] **Do NOT** externalize the SVG to `apps/web/src/assets/` — MVP keeps it inline
  - [x] **Do NOT** add props; the component is zero-prop by design

- [x] **Task 5: Write `TodoRow` unit tests** (AC: 16)
  - [x] Author `apps/web/src/components/TodoRow.test.tsx` using the `renderRow` helper pattern (see AC16)
  - [x] For the React.memo bail-out test, use a `vi.fn()` wrapper pattern (see Dev Notes → "How to count render invocations")
  - [x] **Do NOT** test the inline SVG's exact path data — test presence + `aria-hidden="true"`, not pixel-perfect rendering

- [x] **Task 6: Write `TodoList` unit tests** (AC: 17)
  - [x] Author `apps/web/src/components/TodoList.test.tsx`
  - [x] Use a minimal `makeTodo(overrides)` factory for creating test `Todo` fixtures (see Dev Notes → "Test fixture factory for Todo")
  - [x] **Do NOT** test the Completed section (Story 3.4's scope)

- [x] **Task 7: Write `LoadingSkeleton` unit tests** (AC: 18)
  - [x] Author `apps/web/src/components/LoadingSkeleton.test.tsx`
  - [x] Use `container.querySelectorAll('[class*="border-b"]')` or a `data-testid` if needed to count placeholder rows; aim for low-friction selectors (the structural `:scope > div > div` works given the exact DOM — if the internal structure changes, the test moves with it)
  - [x] **Do NOT** assert the animation itself (jsdom doesn't run CSS animations). Asserting the `animate-pulse` class is the proxy

- [x] **Task 8: Write `EmptyState` unit tests** (AC: 19)
  - [x] Author `apps/web/src/components/EmptyState.test.tsx`
  - [x] Use `screen.getByText('No todos yet.')` + `screen.getByText('Add one below.')` for the text assertions
  - [x] **Do NOT** assert the SVG's geometry; assert `aria-hidden="true"` + presence

- [x] **Task 9: Write axe-core a11y tests** (AC: 20, 21, 22, 23)
  - [x] Author `apps/web/test/a11y/TodoRow.a11y.test.tsx` with three `it` blocks (default, mutating, completed) and the `<ul>` wrapper
  - [x] Author `apps/web/test/a11y/TodoList.a11y.test.tsx` with two `it` blocks (2 todos, empty)
  - [x] Author `apps/web/test/a11y/LoadingSkeleton.a11y.test.tsx` with one `it` block
  - [x] Author `apps/web/test/a11y/EmptyState.a11y.test.tsx` with one `it` block
  - [x] All four files follow the **exact** Story 1.6 `Header.a11y.test.tsx` pattern: `describe(...)` → `it(...)` → `render(...)` → `axe(container)` → `expect(results).toHaveNoViolations()`
  - [x] **Do NOT** add `it.skip` or interactive axe tests; render-time axe is the CI gate

- [x] **Task 10: Full check + manual smoke** (AC: 24)
  - [x] `npm run typecheck --workspace apps/web` → clean
  - [x] `npm run lint` → clean
  - [x] `npm run format:check` → clean (run `npm run format` if needed)
  - [x] `npm test --workspace apps/web` → expect ~37 new tests passing, pre-existing tests still pass
  - [x] `npm test --workspace apps/api` → unchanged (96 tests)
  - [x] `npm run check` → exits 0
  - [x] Manual smoke: `docker compose up -d postgres && npm run dev`, open `http://localhost:5173`, verify the page renders (only Header visible — the new components are un-wired; that's expected)
  - [x] **Do NOT** run `npm run test:e2e` (Story 1.6 E2E still passes since `App.tsx` is untouched)
  - [x] **Do NOT** modify `App.tsx`, `main.tsx`, or any hook — this story is components + tests only

## Dev Notes

### Why `React.memo` and how to test the memo bail-out

**Why memo:** Journey 4 (NFR-001 p95 ≤100ms under 50 todos with rapid interactions — `epics.md:658`) requires that toggling one row does NOT cause its 49 siblings to re-render. `TodoList` will (in Story 3.3) pass `onToggle` / `onDeleteRequest` that change identity across the optimistic-update lifecycle; without `React.memo`, every optimistic update re-renders every row.

**How to author:** wrap the inner named function at the default export:
```ts
function TodoRowImpl(props: TodoRowProps) { /* ... */ }
export default memo(TodoRowImpl);
```
React DevTools will show `TodoRowImpl` (the inner name) wrapped in a `Memo` boundary.

**How to test bail-out** (AC16 bullet 10): **DOM-identity alone is NOT a valid proof** — React's reconciler reuses DOM nodes whenever `type` + `key` are stable, regardless of memo. The reliable cheap proof is a **structural assertion on the default export's `$$typeof` symbol**, combined with a negative assertion that no custom comparator was attached. This is sufficient because `memo(fn)` with no second argument is documented to use the built-in shallow-compare.

```tsx
import TodoRow from './TodoRow.js';

it('is wrapped in React.memo with default shallow comparator', () => {
  // A memo-wrapped component has $$typeof === Symbol.for('react.memo') in React 19.
  expect((TodoRow as unknown as { $$typeof: symbol }).$$typeof).toBe(
    Symbol.for('react.memo'),
  );
  // Default comparator path: memo's internal `compare` is `null` when no
  // second argument was passed; we assert the field is not a function.
  expect(typeof (TodoRow as unknown as { compare?: unknown }).compare).not.toBe(
    'function',
  );
});
```

**Why this is sufficient:** React's documented semantics guarantee that `memo(fn)` with no comparator uses `Object.is` shallow-compare across all props. Asserting the component is memo-wrapped AND has no custom comparator proves the bail-out behavior by construction. The heavier alternative — module-mocking the component to count render invocations — works but pollutes the whole test file and breaks the sibling behavioral tests. The structural proof is the right trade.

**If a deeper behavioral test is wanted later** (not required for this story's AC): Story 5.1's Journey 4 performance harness (`apps/web/test/perf/journey4.perf.test.tsx`) will measure end-to-end toggle latency with 50 rows; if memo silently regressed, the perf test will notice through p95 drift. That is the true backstop.

### Why the checkbox wrapper is `<span>`, not `<label>`

A `<label>` wrapping an `<input>` makes the whole label clickable — tapping any part of the label toggles the checkbox. That sounds desirable, but:
1. The checkbox wrapper is 44×44 (tap target), intentionally larger than the 20×20 visual glyph. A `<label>` would make the padding region act as an input toggle — and that padding region **overlaps with the flex-gap**, turning innocent whitespace clicks into accidental toggles.
2. The description text is rendered as a sibling `<span>` (not inside the wrapper). If we used `<label>`, extending it to wrap the description would be the next "improvement" — and then clicking anywhere on the row toggles, which conflicts with potential future row-level interactions (no such interactions in MVP, but the boundary is cleaner to establish now).
3. `aria-label` on the `<input>` provides the accessible name; the `<label>` isn't needed for a11y.

**Result:** `<span>` wrapper with the 44×44 min-size, and the native `<input>` inside. Clicks outside the native input's hit-box do nothing (the `<span>` has no `onClick`). This is the conservative, explicit behavior.

### Why `onChange` forwards `e.target.checked`

The checkbox's `onChange` handler receives an event whose `e.target.checked` is the **new, desired** state (what the user just clicked to). Forwarding `e.target.checked` makes `onToggle(id, desired)` a clean request to move the row to that state. Story 3.3's optimistic-update factory will consume exactly this `(id, completed)` shape.

**Alternative rejected:** `onToggle(id, !todo.completed)` — computes the inverse locally. Equivalent for a well-controlled checkbox, but forwarding the event value is the more honest mirror of the user's action and more robust against any future (hypothetical) indeterminate-state checkbox scenario.

### Active filter: `.filter()` then render, not `.map()` + conditional return null

```ts
// DO
todos.filter(t => !t.completed).map(t => <TodoRow key={t.id} todo={t} ... />)

// DON'T
todos.map(t => t.completed ? null : <TodoRow key={t.id} todo={t} ... />)
```

React's reconciler traverses all `null` slots in the render output; more importantly, the `key` sequence gets holes (good reconciliation), but the **visual density** of the code misleads reviewers into thinking "this row is rendered conditionally" when actually it's always in the render tree just hidden. `.filter()` is explicit: rows that don't match aren't in the render output. Story 3.4 will switch to two passes (one filter for active, one for completed) — same pattern, cleanly extended.

### Why LoadingSkeleton is a `<div>`, not a `<ul>`

The skeleton is a visual placeholder, not a semantic list. Using `<ul>` / `<li>` would announce "list with 3 items" to screen readers — misleading while the real list is still loading. The `<div>` + `aria-live="polite"` + `aria-busy="true"` + `aria-label="Loading your todos"` communicates the right thing: "something is loading; announce when done." When the real `<TodoList>` replaces the skeleton, the live region's transition is what AT perceives, not "list with 3 items turned into list with N items."

### How reduced-motion is inherited, not re-implemented

`apps/web/src/styles/index.css:30–37` defines:
```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    transition-duration: 0ms !important;
    animation-duration: 0ms !important;
  }
}
```

This zeros `animation-duration` on **every** element, including Tailwind's `animate-pulse`. The skeleton inherits this automatically — do not add a `useReducedMotion` hook or a `motion-safe:` / `motion-reduce:` variant. One global rule; every component benefits.

### EmptyState has no props on purpose

MVP has one empty state: "no todos, first visit or post-delete." PRD-locked copy (`ux-design-specification.md:808–810`). There is no:
- "Your filter returned no results" (no filters)
- "You've completed everything!" (no celebratory variant)
- "Error loading" (that's the `ErrorBoundary` from Story 1.5)

If a future epic introduces a filter feature, adding a `message?: string` prop is a five-line change. Until then, zero props keeps the component auditable — "this component can't surprise me."

### How to count render invocations

Don't. See "How to test bail-out" above for the structural-assertion alternative. Counting renders via an in-component side-effect would require polluting production code; mocking the module works but breaks sibling tests; the structural check on `$$typeof` + the absence of a custom comparator is the right level of ceremony for MVP and what this story asserts.

If a reviewer insists on a behavioral counter test, the cleanest approach is the module-mock pattern with `vi.mock('./TodoRow.js', ...)` in a separate test file (so sibling tests are unaffected) — but this is not required by the AC.

### Test fixture factory for Todo

For `TodoList.test.tsx` (and any future test needing multiple todos), use a tiny factory:

```tsx
function makeTodo(overrides: Partial<Todo> = {}): Todo {
  return {
    id: `t-${Math.random().toString(36).slice(2, 10)}`,
    description: 'Buy milk',
    completed: false,
    userId: null,
    createdAt: '2026-04-20T12:00:00.000Z',
    ...overrides,
  };
}

// Usage:
const active = makeTodo({ description: 'Active' });
const done = makeTodo({ description: 'Done', completed: true });
render(<TodoList todos={[active, done]} onToggle={noop} onDeleteRequest={noop} />);
```

Do NOT extract this to a shared test util until a third consumer appears. Two consumers and you duplicate; three and you extract.

### Why `.js` imports in a `.ts` file

TypeScript 5.6 with `moduleResolution: Bundler` + `module: ESNext` + `type: "module"` in `package.json` requires `.js` extension specifiers in source imports — TS resolves `'./TodoRow.js'` to the `TodoRow.ts` or `TodoRow.tsx` source at build time, and Vite / Vitest follow the same rule. Omitting the extension works at dev time but breaks some build topologies. Story 2.3 established the convention (`import { api } from '../api/todos.js'`); keep it.

### Tailwind v4 classes used + token mapping

All arbitrary-value classes pull from the `@theme` tokens in `apps/web/src/styles/index.css`:

| Class | CSS variable | Value |
|---|---|---|
| `border-[--color-border]` | `--color-border` | `#e5e5e5` |
| `text-[--color-fg-muted]` | `--color-fg-muted` | `#737373` |
| `bg-[--color-border]` | `--color-border` | `#e5e5e5` |

Stock Tailwind classes: `flex`, `items-center`, `gap-3`, `py-3`, `md:py-4`, `px-2`, `border-b`, `min-w-[44px]`, `min-h-[44px]`, `flex-1`, `text-base`, `break-words`, `inline-flex`, `justify-center`, `rounded-md`, `rounded-full`, `rounded`, `animate-pulse`, `list-none`, `flex-col`, `text-center`, `py-12`, `opacity-70`, `mt-6`, `mt-1`, `text-sm`, `w-5`, `h-5`, `w-[18px]`, `h-[18px]`, `h-4`.

No new `@theme` tokens are added in this story. No new global CSS is added. No new dependencies.

### Previous Story Intelligence

**From Story 1.5 (web scaffold) — load-bearing:**
- `apps/web/src/styles/index.css` defines `@theme` tokens and the `:focus-visible` global rule — consumed by all four new components via arbitrary-value classes and native `<input>` / `<button>` focus inheritance
- `prefers-reduced-motion: reduce` global rule (`index.css:30–37`) zeros animations — `LoadingSkeleton`'s `animate-pulse` is muted automatically; do not re-implement per-component
- `ErrorBoundary` wraps `<App />` in `main.tsx` — render errors in any of our four new components fall through to the boundary's generic UI. This story does not participate in error-handling flow (those are Epic 4); render errors go to the boundary

**From Story 1.6 (CI + a11y gate) — load-bearing:**
- `vitest-axe@0.1.0` + manual `expect.extend(matchers)` in `apps/web/test/setup.ts` — every a11y test file imports `axe` from `vitest-axe` and calls `expect(results).toHaveNoViolations()`
- `jsx-a11y/control-has-associated-label` is forced to `error` severity — our `<input aria-label="...">` and `<button aria-label="...">` both satisfy this
- Prettier: `singleQuote`, `semi`, `trailingComma: 'all'`, `printWidth: 100` — matches new files
- Story 1.6 `apps/web/test/a11y/Header.a11y.test.tsx` is the **canonical pattern** — copy its structure for the four new a11y test files

**From Story 2.3 (data layer) — consumer context:**
- `Todo` type is imported from `apps/web/src/types.ts` which re-exports from `@todo-app/api/schemas/todo` — our components consume this type
- `useTodos` + `useCreateTodo` exist but are NOT imported by any of the four new components (presentational boundary — architecture `architecture.md:597`). Wiring happens in Story 2.6's `App.tsx` pass
- `MAX_DESCRIPTION_LENGTH` in `apps/web/src/lib/constants.ts` (unused by this story — `TodoRow` renders whatever the API returns; trimming / max length is enforced on write, in Story 2.4's `AddTodoInput` + Story 2.1's `todosRepo.create`)

**From Story 2.4 (AddTodoInput) — ready-for-dev, expected to land before 2.5 implementation starts:**
- `AddTodoInput.tsx` establishes the **component + unit + a11y** three-file pattern. Story 2.5 replicates this pattern four times (one per new component)
- The `disabled:opacity-60 disabled:cursor-not-allowed` pattern from 2.4's AC9 is **not reused** here — our disabled states use `disabled` on the native `<input>` / `<button>`; visual treatment is minimal (relying on native disabled rendering + `aria-busy`); Epic 4 may add visual polish
- The `role="alert"` error-region pattern from 2.4's AC8 is **not used** here — none of our four components surface errors in this story (Story 4.3 adds InlineError to `TodoRow`)
- **If Story 2.4 has not landed when 2.5 is implemented:** 2.5 is independent of 2.4 at the code level (no shared module) — you can implement 2.5 first. The test count in AC24 is computed as-if 2.4 has landed (AddTodoInput tests exist); if 2.4 has not landed, adjust expectations down accordingly and flag in Completion Notes

### Git Intelligence

- Recent commits (Story 1.1 through 2.3 implemented; 1.6 + 2.1 + 2.2 + 2.3 in review; 2.4 ready-for-dev): the convention is `feat: story X.Y implemented` on the squash-merge or direct commit
- Target commit message for this story: `feat: story 2.5 implemented`
- Scope: **8 new files** (4 components + 4 unit tests co-located — wait, unit tests are in `src/components/*.test.tsx` co-located — so 4 component files + 4 co-located unit test files = 8) + **4 new a11y test files** under `apps/web/test/a11y/` = **12 new files** total. Pattern matches Story 2.4's 3-files-per-component norm applied four times
- `App.tsx`, `main.tsx`, hooks, API client — all untouched by this story

### Latest Tech Information

**React 19:**
- `memo` is imported from `'react'` (not from `'react/memo'` or elsewhere) — standard import
- No `React.FC<>` typing — function component signature is `({ prop }: Props) => JSX.Element` implicit
- `useState`, `useEffect`, `useRef` from `'react'` — Story 2.4 pattern; not used in any of this story's four new components (all four are stateless)

**Tailwind CSS v4:**
- `animate-pulse` is a built-in utility; the `@theme` block in `index.css` doesn't need to declare it
- `list-none` is built-in; no need to add it to `@theme`
- Arbitrary value syntax `bg-[--color-border]`, `text-[--color-fg-muted]` resolves the `@theme` CSS variable at build time (Story 2.4 Dev Notes established this as the convention over Tailwind v4's auto-generated `bg-border` utilities — more robust)

**`@testing-library/react@16` + `@testing-library/user-event@14`:**
- `userEvent.setup()` per test — Story 2.4 convention
- `screen.getByLabelText('Loading your todos')` matches elements with `aria-label` OR associated `<label>`  — works for the skeleton's live-region label

**`vitest-axe@0.1.0`:**
- One import per test file: `import { axe } from 'vitest-axe'` + `expect(results).toHaveNoViolations()`
- The matcher registration (`expect.extend(matchers)`) is already done once in `apps/web/test/setup.ts` — no per-test setup

### Project Structure Notes

**New files (12):**
- `apps/web/src/components/TodoRow.tsx`
- `apps/web/src/components/TodoRow.test.tsx`
- `apps/web/src/components/TodoList.tsx`
- `apps/web/src/components/TodoList.test.tsx`
- `apps/web/src/components/LoadingSkeleton.tsx`
- `apps/web/src/components/LoadingSkeleton.test.tsx`
- `apps/web/src/components/EmptyState.tsx`
- `apps/web/src/components/EmptyState.test.tsx`
- `apps/web/test/a11y/TodoRow.a11y.test.tsx`
- `apps/web/test/a11y/TodoList.a11y.test.tsx`
- `apps/web/test/a11y/LoadingSkeleton.a11y.test.tsx`
- `apps/web/test/a11y/EmptyState.a11y.test.tsx`

**Modified files:** NONE — `App.tsx`, `main.tsx`, existing hooks / types / constants / styles are untouched.

**No new dependencies.** All required libs (`react`, `@testing-library/react`, `@testing-library/user-event`, `vitest-axe`) are installed per Stories 1.5 + 1.6.

**Structural alignment with `architecture.md` (lines 562–585):** all four components land in `apps/web/src/components/` with the exact filenames the architecture specifies.

### Testing Standards

- **Unit:** co-located `*.test.tsx` next to the component (Story 2.4 convention)
- **a11y:** `apps/web/test/a11y/*.a11y.test.tsx` (Story 1.6 convention)
- **No integration tests** in this story — composition with `useTodos` happens in Story 2.6
- **No E2E tests** in this story — Journey 1 E2E is Story 2.6's scope
- **`userEvent.setup()` per-test**, not per-file — Story 2.4 precedent
- **No test utilities extracted** — two or fewer consumers means inline factories / helpers

### References

- Epic requirements: [epics.md § Story 2.5](../planning-artifacts/epics.md) (lines 673–733)
- Epic cross-story spec: [epics.md § Story 2.6 acceptance criteria](../planning-artifacts/epics.md) (lines 735–790) — establishes the parent's render policy (LoadingSkeleton vs. EmptyState vs. TodoList) that this story's components will satisfy
- Epic cross-story spec: [epics.md § Story 3.4 acceptance criteria](../planning-artifacts/epics.md) (lines 949–1013) — the future extension of TodoRow + TodoList for the Completed section; do NOT pre-implement
- UX — TodoRow spec: [ux-design-specification.md § TodoRow](../planning-artifacts/ux-design-specification.md) (lines 758–776)
- UX — TodoList spec: [ux-design-specification.md § TodoList](../planning-artifacts/ux-design-specification.md) (lines 748–756)
- UX — LoadingSkeleton spec: [ux-design-specification.md § LoadingSkeleton](../planning-artifacts/ux-design-specification.md) (lines 815–823)
- UX — EmptyState spec: [ux-design-specification.md § EmptyState](../planning-artifacts/ux-design-specification.md) (lines 802–813)
- UX — Component Implementation Strategy: [ux-design-specification.md § Component Implementation Strategy](../planning-artifacts/ux-design-specification.md) (lines 842–851) — "Memoize only TodoRow"; "Props, not contexts"
- UX — Accessibility requirements: [ux-design-specification.md § Accessibility](../planning-artifacts/ux-design-specification.md) (lines 989–1091) — `aria-live` policies, tap targets, live regions
- Architecture — Component Boundaries (web): [architecture.md § Architectural Boundaries](../planning-artifacts/architecture.md) (lines 595–601) — `TodoList` purely presentational; no `fetch` in components
- Architecture — File tree: [architecture.md § File Tree](../planning-artifacts/architecture.md) (lines 562–585) — canonical file locations
- Architecture — FR mapping: [architecture.md § Requirements-to-Structure Mapping](../planning-artifacts/architecture.md) (lines 613–628) — FR-002 / FR-006 / FR-007 / FR-008 locations
- PRD — FR-002 List + ordering, FR-006 Completed styling, FR-007 Empty state, FR-008 Loading state: [PRD.md § Functional Requirements](../planning-artifacts/PRD.md)
- PRD — NFR-001 UI p95 ≤100ms, NFR-007 WCAG 2.1 AA: [PRD.md § Non-Functional Requirements](../planning-artifacts/PRD.md)
- Previous story: [2-4 AddTodoInput](./2-4-addtodoinput-component.md) — component + unit test + a11y test pattern; Tailwind arbitrary-value convention; `userEvent.setup()` convention
- Previous story: [2-3 web API client + hooks](./2-3-web-api-client-typed-endpoints-usetodos-usecreatetodo-hooks.md) — `Todo` type import path; `.js` ESM specifier convention
- Previous story: [1-6 CI + a11y gate](./1-6-ci-pipeline-code-quality-gate-eslint-prettier-a11y-playwright-e2e-scaffold-onboarding-readme.md) — `vitest-axe` setup, `jsx-a11y` ESLint rules, `Header.a11y.test.tsx` canonical pattern
- Previous story: [1-5 web scaffold](./1-5-web-app-scaffold-vite-tailwind-v4-design-tokens-errorboundary-header.md) — `@theme` tokens, global `:focus-visible`, `prefers-reduced-motion` rule, `ErrorBoundary` placement

## Dev Agent Record

### Agent Model Used

Claude Opus 4.7 (1M context) — model id `claude-opus-4-7[1m]`

### Debug Log References

- **LoadingSkeleton axe failure on first run**: the spec's DOM used a bare `<div>` with `aria-label="Loading your todos"` + `aria-busy="true"` + `aria-live="polite"`, but no `role`. axe's `aria-prohibited-attr` rule rejects `aria-label` on an element whose role doesn't accept an accessible name. Added `role="status"` — the semantically-correct role for a non-modal live region announcing progress — and axe cleared. This also makes `aria-live="polite"` technically redundant (status has implicit `aria-live="polite"` and `aria-atomic="true"`), but keeping it explicit matches the spec's intent and costs nothing.
- **LoadingSkeleton selector bug**: first unit-test run of the row-count assertions failed with `6 !== 3`, `2 !== 1`, etc. Root cause: `container.querySelectorAll(':scope > div > div')` matches every grandchild `<div>`, which includes both the N placeholder rows **and** the description-rectangle `<div>` inside each row (because each row contains one middle `<div class="flex-1 h-4 ..." />`). Fixed by extracting a `getPlaceholderRows(container)` helper that walks `container.firstElementChild.children` and filters tag `'div'` — that's the direct-children-only semantics I actually wanted. `:scope >` would have worked too if I'd anchored it at the skeleton root rather than the RTL container.
- **Prettier auto-formatted 4 files** (TodoList.tsx, TodoList.test.tsx, TodoRow.test.tsx, TodoList.a11y.test.tsx): collapsed some multi-line JSX onto single lines where they fit under the 100-char `printWidth`. One `prettier --write` pass fixed it; behavior unchanged.
- **No other blips**: typecheck clean first-try, lint clean first-try (only the pre-existing Story 1.6 warning on `apps/api/src/db/index.ts:14` remains, untouched), 33 of 40 new unit/a11y tests passed on the very first invocation (7 had the two issues above, both recovered in 2 minutes).

### Completion Notes List

- **Four presentational components landed, all pure — no hooks, no fetch, no context consumers.**
- `apps/web/src/components/TodoRow.tsx`: default-exported `memo(TodoRowImpl)` with an inner named function for DevTools ergonomics. No custom `areEqual` comparator — default shallow compare is what we want (so parent-side identity regressions surface as real re-renders, not silent bail-out). Completed-state styling (`line-through`, `opacity-60`) deliberately NOT added — explicitly deferred to Story 3.4. Only the checkbox `checked` + `aria-label` switch based on `todo.completed`.
- `apps/web/src/components/TodoList.tsx`: filter-then-map, not map-with-conditional-null. Single `<ul className="list-none">`, one `<TodoRow>` per active todo with `key={todo.id}`. No Completed section, no `useMemo` around the filter (list is ≤50, `TodoRow` is memo'd, premature optimization).
- `apps/web/src/components/LoadingSkeleton.tsx`: `animate-pulse` live region with `role="status"` (addition vs spec — needed by axe), `aria-busy="true"`, `aria-live="polite"`, `aria-label="Loading your todos"`. N placeholder rows (default 3), each dimensioned to match a real `TodoRow` (44×44 wrapper on both sides, rectangle in the middle). No `useReducedMotion` hook — Story 1.5's global `@media (prefers-reduced-motion: reduce)` rule zeros the pulse automatically.
- `apps/web/src/components/EmptyState.tsx`: zero-prop default export. Centered flex-column block, inline 64×64 line-drawing SVG with `aria-hidden="true"`, two `<p>` nodes with PRD-locked copy ("No todos yet." + "Add one below."). No CTA button — the `AddTodoInput` above is the CTA (UX spec line 813).
- **Unit tests (4 files, 33 tests):** `TodoRow.test.tsx` 12; `TodoList.test.tsx` 7; `LoadingSkeleton.test.tsx` 8; `EmptyState.test.tsx` 6. The React.memo bail-out test uses the structural assertion pattern (AC16 bullet 10): `TodoRow.$$typeof === Symbol.for('react.memo')` + `typeof compare !== 'function'` — proves by construction that the default shallow-compare path is active, no DOM-identity counting needed.
- **A11y tests (4 files, 7 tests):** `TodoRow.a11y.test.tsx` 3 variants (default / mutating / completed) with `<ul>` wrapper so axe sees valid `<li>` parent context; `TodoList.a11y.test.tsx` 2 variants (2 active todos / empty); `LoadingSkeleton.a11y.test.tsx` 1 variant; `EmptyState.a11y.test.tsx` 1 variant. Same pattern as Story 1.6's `Header.a11y.test.tsx`.
- **Full check green:** `npm run check` exits 0. Totals: **64 api + 90 web = 154 tests pass**, up 40 from 114. No regressions. Pre-existing lint warning from Story 1.6 (`apps/api/src/db/index.ts:14`) remains untouched per scope discipline.
- **Manual smoke:** the Vite dev server serves `/` with status 200 and `#root` is present. The new components are NOT wired into `App.tsx` — that's explicitly Story 2.6's scope. Only `<Header />` is visible in the browser today, which matches the spec.

### File List

- Added: `apps/web/src/components/TodoRow.tsx` — `memo`-wrapped presentational row.
- Added: `apps/web/src/components/TodoRow.test.tsx` — 12 unit tests.
- Added: `apps/web/src/components/TodoList.tsx` — active-section-only list.
- Added: `apps/web/src/components/TodoList.test.tsx` — 7 unit tests.
- Added: `apps/web/src/components/LoadingSkeleton.tsx` — `role="status"` live region with N placeholder rows.
- Added: `apps/web/src/components/LoadingSkeleton.test.tsx` — 8 unit tests.
- Added: `apps/web/src/components/EmptyState.tsx` — zero-prop empty-state block.
- Added: `apps/web/src/components/EmptyState.test.tsx` — 6 unit tests.
- Added: `apps/web/test/a11y/TodoRow.a11y.test.tsx` — 3 axe-core variants.
- Added: `apps/web/test/a11y/TodoList.a11y.test.tsx` — 2 axe-core variants.
- Added: `apps/web/test/a11y/LoadingSkeleton.a11y.test.tsx` — 1 axe-core variant.
- Added: `apps/web/test/a11y/EmptyState.a11y.test.tsx` — 1 axe-core variant.
- Modified: `_bmad-output/implementation-artifacts/sprint-status.yaml` — story `2-5-...` moved `ready-for-dev → in-progress → review`.
- Modified: `_bmad-output/implementation-artifacts/2-5-todorow-non-completed-todolist-active-section-loadingskeleton-emptystate.md` — Status, all task/subtask checkboxes, Dev Agent Record, File List, Change Log.

## Change Log

| Date       | Version | Change                                                                                                                                                                                                                                           | Author |
| ---------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| 2026-04-20 | 1.0     | Implemented four presentational components (`TodoRow`, `TodoList`, `LoadingSkeleton`, `EmptyState`) with unit + a11y tests. Added `role="status"` on `LoadingSkeleton` to satisfy axe's `aria-prohibited-attr` rule. 40 new tests (154 total). | Dev    |
