# Story 4.1: `InlineError` component

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want any failed action to show me a clear, accessible error with a way to retry,
so that I can recover without losing work and without confusion about what went wrong.

**Scope boundary (critical):** This story delivers ONLY the presentational `InlineError` component + its co-located unit test + its a11y render test. It does **NOT** wire `InlineError` into `AddTodoInput`, `TodoRow`, `DeleteTodoModal`, or `App.tsx` — those wire-ups belong to Stories 4.2 and 4.3. Do not edit those files in this story.

## Acceptance Criteria

1. **AC1 — Component file, props, and layout.**
   **Given** the `InlineError` component at `apps/web/src/components/InlineError.tsx`,
   **When** the engineer inspects the file,
   **Then** the component accepts props `{ message: string, onRetry?: () => void, isRetrying?: boolean }`,
   **And** it renders a flex row: `[icon + message]` on the left, `[Retry button]` on the right,
   **And** the icon is a 16×16 decorative SVG with `aria-hidden="true"`,
   **And** the wrapper applies `rounded-md`, `px-3`, `py-3`, background `#fef2f2`, 1px border `#fecaca`, text `#991b1b`.

2. **AC2 — Screen-reader announcement + verbatim message.**
   **Given** the rendered output,
   **When** the component mounts,
   **Then** the wrapper has `role="alert"` and `aria-live="polite"`,
   **And** the message text renders verbatim from the `message` prop — no template injection, no newline stripping, no truncation.

3. **AC3 — Retry button when `onRetry` is provided.**
   **Given** `onRetry` is provided,
   **When** the Retry button renders,
   **Then** it is styled as the Secondary variant at 36px height (documented inline exception to the global 44px rule — inline errors are never the first focus after navigation, per UX spec button-hierarchy rules),
   **And** it reads exactly `"Retry"`,
   **And** clicking it calls `onRetry()` exactly once.
   **When** `isRetrying` is `true`,
   **Then** the Retry button is `disabled` **and** has `aria-busy="true"`.

4. **AC4 — No Retry button when `onRetry` is omitted.**
   **Given** `onRetry` is not provided,
   **When** the component renders,
   **Then** no Retry button is rendered (error remains visible until the parent unmounts the component; there is no Dismiss affordance in MVP).

5. **AC5 — Co-located unit tests green (Vitest).**
   **Given** `apps/web/src/components/InlineError.test.tsx`,
   **When** `npm test --workspace @todo-app/web` runs,
   **Then** all of the following assertions pass:
   - `<InlineError message="X" />` renders the message "X" verbatim, and NO Retry button exists in the rendered output.
   - `<InlineError message="X" onRetry={fn} />` renders a Retry button with label exactly `"Retry"`; clicking it calls `fn` exactly once.
   - `<InlineError message="X" onRetry={fn} isRetrying />` renders the Retry button as `disabled` with `aria-busy="true"`.
   - The wrapper element has `role="alert"` and `aria-live="polite"`.
   - The icon `<svg>` has `aria-hidden="true"` and is a 16×16 SVG.
   - The Retry button's computed `min-height` is 36px (the documented inline-error exception).
   - Newline characters inside the message are preserved (not stripped) — sanity-check against template-string injection.

6. **AC6 — Axe a11y test green.**
   **Given** the a11y test at `apps/web/test/a11y/InlineError.a11y.test.tsx`,
   **When** the test runs,
   **Then** it renders `<InlineError message="Couldn't save. Check your connection." onRetry={() => {}} />` and asserts `axe` reports zero violations,
   **And** the axe `color-contrast` rule explicitly passes for `#991b1b` text on `#fef2f2` background.

7. **AC7 — Does not touch other components or app wiring.**
   **Given** the Story 4.1 diff,
   **When** the engineer inspects changed files,
   **Then** the diff adds exactly `InlineError.tsx`, `InlineError.test.tsx`, `InlineError.a11y.test.tsx` (and this story's sprint-status update),
   **And** it does NOT modify `AddTodoInput.tsx`, `TodoRow.tsx`, `DeleteTodoModal.tsx`, `App.tsx`, or any hook.

8. **AC8 — Existing suites stay green.**
   **When** `npm run typecheck`, `npm run lint`, `npm test` run in `@todo-app/web`,
   **Then** all pass with no new warnings. Existing `AddTodoInput.a11y.test.tsx` error-state assertion continues to pass because Story 4.1 does not touch `AddTodoInput` (the real-`InlineError` swap happens in Story 4.2).

## Tasks / Subtasks

- [x] **Task 1 — Create `InlineError.tsx` (AC: 1, 2, 3, 4)**
  - [x] Create `apps/web/src/components/InlineError.tsx`.
  - [x] Define the props interface exactly as `{ message: string; onRetry?: () => void; isRetrying?: boolean }`. Use an interface or `type` alias; project convention prefers `type` unless extension is needed.
  - [x] Default export a function component named `InlineError`.
  - [x] Render a root element (`<div>` is fine) with `role="alert"`, `aria-live="polite"`, and classes `flex items-start gap-3 rounded-md px-3 py-3 border text-sm` plus the AC-locked color literals using Tailwind arbitrary values: `bg-[#fef2f2] border-[#fecaca] text-[#991b1b]`.
  - [x] Left cluster: an inline `<svg>` at 16×16 with `aria-hidden="true"` + a `<span>` (or text node) holding `{message}`. Use a simple alert glyph (triangle-with-exclamation or circle-with-exclamation); `stroke="currentColor"`; no `fill` (inherits `text-[#991b1b]`).
  - [x] Render `{message}` verbatim — interpolate the prop directly (`{message}`), do **NOT** run `.replace()` / `.trim()` / `.split()` on it. Use `white-space: pre-wrap` on the message span if preservation of newlines matters for rendering (`className="whitespace-pre-wrap"`). React auto-escapes interpolated strings, which satisfies "no template injection."
  - [x] Right cluster: conditionally render a `<button type="button">` only when `onRetry` is provided. Wrap the condition as `onRetry ? <button … /> : null`.
  - [x] Button classes: Secondary variant at 36px height — `min-h-[36px] px-4 rounded-md border border-[--color-border] bg-[--color-surface] text-[--color-fg] text-sm font-medium disabled:opacity-60 disabled:cursor-not-allowed`.
  - [x] Button attributes: `type="button"`, `onClick={onRetry}`, `disabled={isRetrying ?? false}`, `aria-busy={isRetrying ? 'true' : undefined}`. Label is the literal string `Retry`.
  - [x] Do **not** introduce internal state. No `useState`, no `useEffect`. `isRetrying` is the single source of truth from the parent.

- [x] **Task 2 — Unit test co-located (AC: 5)**
  - [x] Create `apps/web/src/components/InlineError.test.tsx`.
  - [x] Import: `import { describe, expect, it, vi } from 'vitest';`, `import { render, screen } from '@testing-library/react';`, `import userEvent from '@testing-library/user-event';`, `import InlineError from './InlineError.js';` (note the `.js` extension — matches project convention, see `EmptyState.test.tsx`).
  - [x] Test: message-only render → Retry button absent. Use `screen.queryByRole('button', { name: /retry/i })` and assert `toBeNull()`.
  - [x] Test: `onRetry` provided → Retry button present with accessible name "Retry"; click fires `fn` exactly once. Use `userEvent.setup()` and `await user.click(...)`.
  - [x] Test: `isRetrying` true → Retry button has `disabled` attribute and `aria-busy="true"`.
  - [x] Test: wrapper has `role="alert"` and `aria-live="polite"`. Query with `screen.getByRole('alert')`.
  - [x] Test: the icon `<svg>` has `aria-hidden="true"`, `width="16"`, `height="16"`. Select via `container.querySelector('svg')`.
  - [x] Test: Retry button has `min-h-[36px]` class applied. Simplest assertion: `toHaveClass('min-h-[36px]')` — Tailwind v4 keeps the arbitrary-value class verbatim, matching the `min-h-[44px]` assertion pattern used in `DeleteTodoModal.test.tsx`.
  - [x] Test: newline preservation — render `<InlineError message={'line 1\nline 2'} />`, find the text node, assert it contains the literal `\n`. Avoid `toHaveTextContent(/line 1\s+line 2/)`; prefer `textContent` direct read.

- [x] **Task 3 — A11y render test (AC: 6)**
  - [x] Create `apps/web/test/a11y/InlineError.a11y.test.tsx`.
  - [x] Mirror the structure of `EmptyState.a11y.test.tsx`: single `describe('<InlineError /> accessibility', ...)` with a single `it('zero axe-core violations', async () => { ... })`.
  - [x] Render `<InlineError message="Couldn't save. Check your connection." onRetry={() => {}} />`.
  - [x] `const results = await axe(container);` then `expect(results).toHaveNoViolations();`.
  - [x] To guarantee the `color-contrast` rule is exercised (jsdom's computed-style defaults to transparent; axe may skip), enable it explicitly via `axe(container, { rules: { 'color-contrast': { enabled: true } } })` **OR** add a second test that asserts `results.violations` contains no entry with `id === 'color-contrast'`. Choose whichever yields a green, deterministic run in jsdom; document the chosen approach briefly in a comment inside the test file.
  - [x] Add a **second** `it(...)` block for the no-Retry case: `<InlineError message="X" />` with no `onRetry` → zero violations (parity with the `AddTodoInput.a11y.test.tsx` triple — default, submitting, error).

- [x] **Task 4 — Verify gates (AC: 8)**
  - [x] Run `npm run typecheck --workspace @todo-app/web` → pass.
  - [x] Run `npm run lint --workspace @todo-app/web` → pass, no new warnings.
  - [x] Run `npm test --workspace @todo-app/web` → all existing + 3 new test files pass.
  - [x] Run `npm run build --workspace @todo-app/web` → pass (catches any residual TS / import-extension issues).
  - [x] Confirm no edits were made to `AddTodoInput.tsx`, `TodoRow.tsx`, `DeleteTodoModal.tsx`, `App.tsx`, `App.integration.test.tsx`, or any hook — `git diff --stat` should list only the three new files.

- [x] **Task 5 — Story hygiene**
  - [x] Update the **Dev Agent Record → File List** section of this story with the three new file paths.
  - [x] Update **Completion Notes List** with any deviation from the plan (expected: none).
  - [x] On completion, run the `code-review` workflow to move this story to `review`.

## Dev Notes

### Why specific hex literals (`#fef2f2`, `#fecaca`, `#991b1b`) — not CSS-var tokens

- The UX spec (`ux-design-specification.md`, InlineError section) and the epic AC both lock these three values. They are the soft-error palette (Tailwind red-50 / red-200 / red-800); the existing `@theme` tokens only carry `--color-danger: #dc2626`, which is the *full-intensity* danger hue used for the Delete button. Using `--color-danger` here would fail the visual AC and the color-contrast math baked into the story.
- Adding three new `--color-error-*` tokens for a single-use component is over-engineering in MVP. Inline arbitrary Tailwind values (`bg-[#fef2f2]`) are acceptable here because:
  1. The values are AC-locked and visible in the component file (easy audit).
  2. No other component will reuse them in MVP — Stories 4.2 and 4.3 render the same `InlineError` component, not new surfaces with these colors.
- If a future epic adds a second error surface, promote the three literals to `@theme` tokens in `styles/index.css` at that point.

### Why the 36px Retry button is an exception, not a bug

- The UX spec's global button-hierarchy rule says every button is ≥44×44px (iOS HIG tap target). The same spec explicitly carves out: *"Exception: compact buttons inside `InlineError` at 36px, which are always inline and never the first focus after a navigation."*
- The Retry button is always paired with the failure site (below `AddTodoInput`, inline with a row, inside a modal body) and never becomes the first focus on page load. A screen-reader user reaches it via the alert announcement or Tab sequence from the failure-adjacent control.
- Implement this literally with `min-h-[36px]` — do not reach for the 44px pattern used elsewhere.

### Why no `severity` prop in MVP

- The UX spec mentions `severity?: 'error'` as a future-proofing hook, but the epic AC for Story 4.1 explicitly defines the prop set as `{ message, onRetry?, isRetrying? }`. Adding `severity` would be gold-plating, would require branching styles that are not yet defined (no warning palette exists), and would need matching test coverage — none of which belongs in MVP. Omit it.

### Why the component is stateless

- `InlineError` is purely presentational. The parent (in Stories 4.2 and 4.3) owns error state, mutation state, and retry dispatch. The parent passes `isRetrying` from `mutation.isPending` and unmounts the component (by switching `error` back to `null`) on success.
- Adding internal state would create two sources of truth and guarantee a desync between the visual spinner and the underlying mutation. The Story 3.3 optimistic-factory design already demonstrated this risk — reuse that discipline here.

### Why `aria-live="polite"` AND `role="alert"`

- `role="alert"` implies `aria-live="assertive"` on most screen readers, which interrupts the current utterance. That is too aggressive for an inline error the user may not yet be looking at (e.g., a delete failure while focus is in the modal). Explicitly setting `aria-live="polite"` defers the announcement until the user pauses — a better UX match for "the row reverted, here's why."
- Axe does not flag the combination as a violation; it is a deliberate override documented in the UX spec. The a11y test confirms zero violations either way.

### Import extension convention (`.js` in TS source)

- The project uses ESM-style `.js` extensions in relative imports even though source is `.tsx` (see every existing `*.test.tsx` in `apps/web/src/components/`). This is a TypeScript + Vite + vitest ESM requirement, not a typo. Follow it: `import InlineError from './InlineError.js';` — never `'./InlineError'` or `'./InlineError.tsx'`.

### Previous Story Intelligence

**From Story 3.5 (`DeleteTodoModal`) — component-authoring conventions:**
- Default-exported function component, one component per file, co-located `*.test.tsx`, separate `test/a11y/*.a11y.test.tsx`. Mirror this shape.
- `useId()` is the correct primitive for `aria-labelledby` / `aria-describedby`; `InlineError` does not need it (no title to label), but the pattern is in the codebase if Story 4.2/4.3 wants to pair the message with a programmatic description later.
- The `HTMLDialogElement` polyfill in `test/setup.ts` is unrelated to `InlineError` — no action needed here. `vitest-axe` matchers are already registered via `setup.ts`.

**From Story 2.5 / Story 2.4 (`TodoRow` / `AddTodoInput`) — consumer expectations:**
- `AddTodoInput` already renders a minimal inline-error region (a `<p role="alert" aria-live="polite">`). Story 4.2 will replace that with `<InlineError />`. For Story 4.1, **do not** edit `AddTodoInput`; the `AddTodoInput.a11y.test.tsx` "error state — zero axe-core violations" case must keep passing against the current minimal markup.
- `TodoRow` currently has no error region. Story 4.3 adds that below the row content, inside the same `<li>`.

**From Story 1.5 (design tokens + prefers-reduced-motion):**
- `--color-border`, `--color-surface`, `--color-fg` are already defined in `styles/index.css` (`@theme` block, lines 3–18). Use these for the Secondary-variant Retry button.
- The global `@media (prefers-reduced-motion: reduce)` rule (lines 33–40) already disables transitions — `InlineError` has no animations to guard, but any future hover transition will inherit the rule for free.

**From Story 3.3 (`useOptimisticTodoMutation` factory):**
- `mutation.isPending` is the parent's source of truth for `isRetrying`. When Stories 4.2/4.3 wire `InlineError` in, they will pass `isRetrying={mutation.isPending}`. The component must treat it as a pure boolean — no optimistic local state, no retry cooldown, no timers.

### Git Intelligence

- Recent commit rhythm (latest first): `feat: story 3.4 implemented`, `feat: story 3.3 implemented`, `feat: story 3.2 implemented`, `feat: story 3.1 implemented`, `feat: story 2.6 implemented`. Commit this story the same way: `feat: story 4.1 implemented`.
- File-scope discipline for Story 4.1 — exactly these additions:
  1. `apps/web/src/components/InlineError.tsx` (NEW)
  2. `apps/web/src/components/InlineError.test.tsx` (NEW)
  3. `apps/web/test/a11y/InlineError.a11y.test.tsx` (NEW)
  4. `_bmad-output/implementation-artifacts/sprint-status.yaml` (status transition — handled by the `create-story` workflow + dev-story on completion)
- **No new dependencies.** React 19, `@testing-library/react`, `@testing-library/user-event`, `vitest`, `vitest-axe`, `axe-core` are all already in `apps/web/package.json`.

### Latest Tech Information

- **vitest-axe 0.1.0**: the empty `dist/extend-expect.js` quirk is already handled in `test/setup.ts` via an explicit `expect.extend(matchers)`. No additional setup needed.
- **axe-core 4.10.x `color-contrast` rule in jsdom**: jsdom does not compute real styles for CSS arbitrary values in all contexts. If the rule flags false-negatives or is skipped in the default run, pass `axe(container, { rules: { 'color-contrast': { enabled: true } } })`. The rule's contrast math is static: `#991b1b` (relative luminance ~0.083) on `#fef2f2` (~0.957) → contrast ratio ≈ 10.4, comfortably above AA's 4.5 threshold. Any color-contrast violation reported in test output indicates a palette drift — treat it as a real fail.
- **React 19** — no compiler-level hazards for a stateless component. Prefer a named function declaration for the default export (consistent with every other component in the repo).
- **Tailwind v4 arbitrary values**: `bg-[#fef2f2]`, `border-[#fecaca]`, `text-[#991b1b]`, `min-h-[36px]` all compile at dev and build time. The project does not use `tailwind.config.js`; `@theme` in `index.css` is the extension point. Do not add one for this story.

### Project Structure Notes

- The `apps/web/src/components/` folder already contains every sibling (`AddTodoInput`, `DeleteTodoModal`, `EmptyState`, `ErrorBoundary`, `Header`, `LoadingSkeleton`, `TodoList`, `TodoRow`). Placing `InlineError.tsx` there completes the MVP component inventory per `architecture.md:568–571`.
- No barrel / index file exists (and none should be introduced). Consumers import by path: `import InlineError from './InlineError.js';` within the components folder, or `import InlineError from '../components/InlineError.js';` from elsewhere.
- The a11y test path `apps/web/test/a11y/InlineError.a11y.test.tsx` aligns with the existing pattern — `test/a11y/*.a11y.test.tsx` is scanned by vitest via the workspace-level config; no `vitest.config.ts` edit is needed.

### Testing Standards

- **Unit (component):** `InlineError.test.tsx` co-located, exercises each prop permutation in isolation. Follow the `EmptyState.test.tsx` / `DeleteTodoModal.test.tsx` shape — `describe('<InlineError />', () => { it(...) })`, one assertion per `it` block where practical.
- **A11y:** `InlineError.a11y.test.tsx` under `test/a11y/`, uses `vitest-axe` via the already-registered matchers. Two `it` blocks: with Retry, without Retry.
- **No integration tests in this story.** The integration assertions for create-fail / toggle-fail / delete-fail flows belong to Stories 4.2 and 4.3.
- **No E2E in this story.** Journey 3 Playwright specs are authored alongside the wire-up in Stories 4.2 and 4.3.
- **Coverage expectation:** `InlineError.tsx` at 100% statement + branch coverage from the unit tests above (it is a small, branch-heavy component — the Retry conditional is the only branch).
- **No snapshot tests.** Assert the specific props/attributes/classes that the AC locks; snapshots drift silently.

### References

- Epic requirements: `_bmad-output/planning-artifacts/epics.md` § Story 4.1 (lines 1102–1152)
- UX spec — InlineError component contract: `_bmad-output/planning-artifacts/ux-design-specification.md` § Component 8 `InlineError` (lines 825–840)
- UX spec — Button hierarchy + 36px InlineError exception: `_bmad-output/planning-artifacts/ux-design-specification.md` § Button Hierarchy (lines 877–893)
- UX spec — Feedback patterns (error = inline at failure site + Retry): `_bmad-output/planning-artifacts/ux-design-specification.md` § Feedback Patterns (lines 895–910)
- UX spec — Color tokens + contrast audit: `_bmad-output/planning-artifacts/ux-design-specification.md` § Color System (lines 416–443)
- Architecture — Frontend decisions (TanStack Query, Tailwind v4, axe-core in Vitest): `_bmad-output/planning-artifacts/architecture.md` § Frontend Architecture (lines 224–240)
- Architecture — Error-handling discipline (inline at failure site, shared `InlineError`, locked copy): `_bmad-output/planning-artifacts/architecture.md` § Process Patterns → Error handling (lines 398–411)
- Architecture — Project structure (`components/InlineError.tsx` placement): `_bmad-output/planning-artifacts/architecture.md` § Complete Project Directory Structure (line 570)
- Architecture — Enforcement guidelines (#7: axe render test per component): `_bmad-output/planning-artifacts/architecture.md` § Enforcement Guidelines (lines 419–433)
- Architecture — FR-010 mapping: `_bmad-output/planning-artifacts/architecture.md` § Requirements-to-Structure Mapping (line 626)
- PRD — FR-010 (inline error + retry) and NFR-004 (error resilience): `_bmad-output/planning-artifacts/PRD.md`
- Previous story — Component authoring + a11y test conventions: `./3-5-deletetodomodal-component-app-tsx-delete-flow-journey-2-complete.md`
- Previous story — Consumer of `InlineError` (Story 4.2 will swap the current minimal error region): `./2-4-addtodoinput-component.md`
- Previous story — `useOptimisticTodoMutation` factory (source of `isRetrying` in downstream stories): `./3-3-useoptimistictodomutation-factory-usetoggletodo-usedeletetodo-hooks.md`
- Design-tokens reference (`--color-border`, `--color-surface`, `--color-fg`, `--color-danger`): `apps/web/src/styles/index.css:3-18`

## Dev Agent Record

### Agent Model Used

claude-opus-4-7 (1M context)

### Debug Log References

- `npx vitest run src/components/InlineError.test.tsx` → 7/7 pass (GREEN phase).
- `npx vitest run test/a11y/InlineError.a11y.test.tsx` → 2/2 pass. jsdom emits `HTMLCanvasElement.prototype.getContext` "not implemented" stderr warnings because axe-core probes canvas for color-contrast ligature detection — this is informational, not a violation, and matches the behavior seen in sibling a11y tests (`EmptyState.a11y.test.tsx` etc.).
- `npm run typecheck --workspace @todo-app/web` → pass.
- `npm run lint` (root) → 0 errors, 1 pre-existing warning in `apps/api/src/db/index.ts` (unrelated to this story).
- `npm run format:check` → clean.
- `npm test --workspace @todo-app/web` → 28 files / 146 tests pass (3 new files + 25 pre-existing, zero regressions).
- `npm run build --workspace @todo-app/web` → built in ~450ms (Tailwind arbitrary values compile cleanly).

### Completion Notes List

- Implementation followed the story spec verbatim — no deviations from the plan.
- AC-locked palette literals used inline via Tailwind arbitrary values (`bg-[#fef2f2]`, `border-[#fecaca]`, `text-[#991b1b]`); no `@theme` tokens were added, per Dev Notes rationale (single-use surface in MVP).
- 36px Retry button implemented via `min-h-[36px]` (documented inline exception to the global 44px tap-target rule).
- Component is stateless — no `useState` / `useEffect`. Parent owns `isRetrying`.
- `aria-live="polite"` explicitly set alongside `role="alert"` to override the default assertive announcement (deferred UX match for inline errors).
- For AC6, the `color-contrast` rule is explicitly enabled via `axe(container, { rules: { 'color-contrast': { enabled: true } } })`. Both renders (with and without Retry) report zero violations. An in-file comment documents the choice and the static contrast math (`#991b1b` on `#fef2f2` ≈ 10.4:1).
- File-scope discipline verified: `git status` shows only the 3 new files under `apps/web/` plus this story's status flip and the sprint-status transition. No edits to `AddTodoInput.tsx`, `TodoRow.tsx`, `DeleteTodoModal.tsx`, `App.tsx`, or any hook.

### File List

- `apps/web/src/components/InlineError.tsx` (new)
- `apps/web/src/components/InlineError.test.tsx` (new)
- `apps/web/test/a11y/InlineError.a11y.test.tsx` (new)
- `_bmad-output/implementation-artifacts/4-1-inlineerror-component.md` (status: ready-for-dev → in-progress → review; tasks checked off; Dev Agent Record filled in)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (story 4.1 status: ready-for-dev → in-progress → review)

### Change Log

- 2026-04-24 — Story 4.1 implemented. Added `InlineError` component (presentational only), co-located unit tests (7), and a11y render tests (2). No integration, no E2E, no hook wire-up — those belong to Stories 4.2 / 4.3 per the scope boundary.
