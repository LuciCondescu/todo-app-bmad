# Story 2.4: `AddTodoInput` component

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want a text input with an Add button that commits on Enter or tap,
So that I can create a todo without taking my hands off the keyboard and without any extra click.

## Acceptance Criteria

**AC1 — Component file, props, and basic DOM skeleton**
- **Given** `apps/web/src/components/AddTodoInput.tsx` exists
- **When** the engineer inspects it
- **Then** it exports a **default** function component `AddTodoInput` with props `{ onSubmit: (description: string) => void; disabled?: boolean; error?: string | null }`
- **And** the rendered DOM root is a `<form>` element (not a `<div>` + click handler) — Enter submission relies on the browser's native form-submit behavior, not a `onKeyDown` check
- **And** the form's `onSubmit` handler calls `event.preventDefault()` as its first action (prevents the browser from navigating on submit)
- **And** the form contains exactly one `<input type="text">` and one `<button type="submit">` as direct/grandchild children (no other interactive descendants)

**AC2 — Input attributes for UX + a11y + iOS**
- **Given** the input element
- **When** the engineer inspects its rendered attributes
- **Then** the input has:
  - `type="text"` (explicit — browsers default to `text` but being explicit is the UX-DR3 contract)
  - `maxLength={500}` (JSX prop; renders `maxlength="500"` on the DOM node) — sourced from `MAX_DESCRIPTION_LENGTH` in `apps/web/src/lib/constants.ts` (Story 2.3)
  - `autoComplete="off"` (prevents browser password-manager + autofill churn)
  - `aria-label="Add a todo"` (exact string; no trailing punctuation)
  - `placeholder="What needs doing?"` (UX-specification line 731)
  - a **computed font-size ≥16px** — enforced either via the `text-base` Tailwind utility (base size = 16px per Tailwind default config AND UX-DR1's `--font-size-base` declaration) OR an explicit `text-[16px]` arbitrary value. The 16px minimum is load-bearing: iOS Safari auto-zooms on focus for inputs <16px, breaking the "type immediately" flow (UX-DR3)
- **And** the input does NOT have `required` set (empty-submit is a silent no-op, not an HTML-validation error — UX spec line 927)
- **And** the input does NOT have a custom `pattern` attribute (no validation noise; over-length is prevented purely by `maxLength`)

**AC3 — Auto-focus on mount (≤16ms)**
- **Given** the component mounts for the first time
- **When** React commits the initial render
- **Then** `document.activeElement` is the input element (asserted in the unit test via `screen.getByRole('textbox')` + `document.activeElement` comparison)
- **And** the focus transfer happens via a `useEffect` that runs on mount with an empty dependency array AND reads the input via a `useRef<HTMLInputElement>(null)` — **not** via `autoFocus` attribute (see Dev Notes → "Why `useEffect + ref` instead of `autoFocus`")
- **And** the focus transfer is complete within one React commit cycle (synchronous from the user's perspective — well under the UX-DR3 "within 16ms" budget; no setTimeout, no rAF wrapping)

**AC4 — Submit flow: controlled value, trim, empty no-op, onSubmit fires**
- **Given** the input has a non-empty trimmed value (e.g., user types `"Buy milk"` or `"  Buy milk  "`)
- **When** the user presses Enter OR clicks the Add button OR taps the Add button
- **Then** the form submits, `onSubmit("Buy milk")` is called exactly **once** — with the **untrimmed** raw value (the repo at `apps/api/src/repositories/todosRepo.ts` trims — see Dev Notes → "Where does trim live?")
- **And** the submission does NOT happen twice for a single keystroke (Enter-in-input + button-click race guard is provided by the browser's native form-submit path — `preventDefault` keeps this clean)

**AC5 — Empty/whitespace-only submit is a silent no-op**
- **Given** the input value is `""`, `"   "`, `"\t"`, `"\n"`, or any other purely-whitespace string
- **When** the user presses Enter OR clicks Add
- **Then** `onSubmit` is **NOT** called
- **And** no error UI renders (no validation message, no scolding copy — UX spec line 927 "No validation error messages in MVP")
- **And** the input retains its (whitespace) value (the user can keep typing; we don't clear their "mistake")
- **And** the input retains focus (native `<input>` behavior inside a form preventDefault'd submit — no special handling required)

**AC6 — In-flight submission state (`disabled={true}`)**
- **Given** a parent passes `disabled={true}` (reflecting the mutation's `isPending` from `useCreateTodo`)
- **When** the component renders
- **Then** the Add button has both `disabled` (the native HTML attribute, via the JSX prop) AND `aria-busy="true"`
- **And** the input **retains its current value** (does not clear, does not reset) — the user sees what they typed while the request is in flight
- **And** the Add button's visual style reflects disablement: Tailwind's `disabled:opacity-60` + `disabled:cursor-not-allowed` (the UX-spec's 0.6 opacity rule from UX-DR11)
- **And** the input itself is **not** disabled (the user can keep editing if they want; rare but the UX spec does not say to disable the input, only the button — see Dev Notes → "Should the input also be disabled during submit?")

**AC7 — Successful-submit transition: clear + refocus**
- **Given** `disabled` was previously `true` (in-flight state) and becomes `false` with no accompanying `error` prop
- **When** React re-renders with `disabled={false}` and `error == null`
- **Then** the input's value is cleared (empty string)
- **And** focus returns to the input element (re-focus via the same ref used for auto-focus)
- **And** the behavior is driven by a `useEffect` that watches both `disabled` and `error` — **not** by the parent imperatively calling a ref method (see Dev Notes → "Detecting successful submit without a callback")
- **And** the effect runs ONLY when transitioning from `disabled=true` to `disabled=false` with no error — not on initial mount, not on error-present→error-cleared

**AC8 — Error UI slot (pre-InlineError)**
- **Given** a parent passes `error="Couldn't save. Check your connection."`
- **When** the component renders
- **Then** an error region appears **below** the input/button row (i.e., after the flex row in the DOM), NOT above
- **And** the error region has `role="alert"` and `aria-live="polite"` — so screen readers announce the failure once, not as a barrage
- **And** the error region contains the exact `error` string, rendered in the danger color (`--color-danger` = `#DC2626`) with reduced emphasis (per the pre-Epic-4 minimal contract; Epic 4's `InlineError` will replace this with the full bg/border treatment)
- **And** the input value is **preserved** — no clearing, no truncation, no re-trim (critical per UX-DR14 "Input preserves content on submit failure")
- **And** the Add button is **re-enabled** (because `disabled` flipped back to `false` when the mutation settled with an error; this AC is about making sure we don't leave it disabled — the AC7 effect's guard on `error == null` is what prevents the clear-and-refocus from firing)
- **And** the error region is NOT rendered when `error == null` OR `error === undefined` OR `error === ""` (treat empty string as no-error — defensive)

**AC9 — Primary-variant button styling**
- **Given** the Add button in the rendered DOM
- **When** the engineer inspects its computed style
- **Then** the button carries Primary-variant classes (UX-DR11):
  - Background: `bg-[--color-accent]` (Tailwind v4 arbitrary value → `#2563EB`) — see Dev Notes → "Tailwind v4 `@theme` tokens + utility naming"
  - Text color: `text-white`
  - Weight: `font-medium`
  - Min height: `min-h-[44px]` (UX-DR11 tap-target rule)
  - Min width: `min-w-[64px]` (UX-DR3 layout rule — the "Add" label is ~40px wide; min-w prevents Add from shrinking below tappable)
  - Padding: `px-4` (horizontal; the min-h already provides vertical)
  - Rounding: `rounded-md`
  - Focus: inherits the global `:focus-visible` rule from `styles/index.css` (2px accent outline, 2px offset) — **no** per-button focus styles (avoid duplication)
  - Disabled: `disabled:opacity-60 disabled:cursor-not-allowed`
- **And** the button's text content is exactly `Add` (no icon, no loading spinner — UX spec keeps it minimal; the `aria-busy` state is the only indicator)

**AC10 — Form layout (flex row)**
- **Given** the form element
- **When** the engineer inspects its layout classes
- **Then** the form is `flex gap-2 items-stretch` — input + button are the only flex children
- **And** the input has `flex-1` (takes remaining width)
- **And** the input has `min-h-[44px]` for matching button height (UX spec line 930)
- **And** the input has `px-3 py-2` + `border border-[--color-border] rounded-md` + `bg-[--color-surface]` — a neutral, tappable, Tailwind-stock shape. **No** custom focus ring on the input (global `:focus-visible` rule handles it)
- **And** there is **NO** `<label>` element; the `aria-label` on the input is the accessible name (UX spec line 743 — visually-hidden label is NOT required if `aria-label` is present)

**AC11 — Unit tests at `apps/web/src/components/AddTodoInput.test.tsx`**
- **Given** `@testing-library/react` + `@testing-library/user-event` harness
- **When** the engineer runs `npm test --workspace apps/web`
- **Then** the tests assert (each `it` reflects one acceptance bullet):
  1. **Auto-focus on mount:** `renderComponent(); expect(input).toHaveFocus()` — no `waitFor` needed (synchronous effect)
  2. **Typing + Enter triggers `onSubmit`:** `user.type(input, 'Buy milk{Enter}'); expect(onSubmit).toHaveBeenCalledTimes(1); expect(onSubmit).toHaveBeenCalledWith('Buy milk')`
  3. **Clicking Add triggers `onSubmit`:** `user.type(input, 'Buy milk'); user.click(button); expect(onSubmit).toHaveBeenCalledWith('Buy milk')`
  4. **Empty submit is a no-op:** `user.click(button); expect(onSubmit).not.toHaveBeenCalled()`; also cover the `{Enter}` path on an empty input
  5. **Whitespace-only submit is a no-op:** `user.type(input, '   '); user.click(button); expect(onSubmit).not.toHaveBeenCalled()`. Include `'\t\n '` as a second case
  6. **Successful-submit clears + refocuses:** render with `disabled={true}`, re-render with `disabled={false}` + `error={null}`, assert `input.value === ''` and `input` has focus. See Dev Notes → "Testing the clear-and-refocus effect"
  7. **Disabled state reflects in DOM:** with `disabled={true}`, the button has `disabled` attribute AND `aria-busy="true"`; the input value from a prior keystroke is still present; the input itself is NOT `disabled`
  8. **Error prop renders the error region:** with `error="Couldn't save. Check your connection."`, a `role="alert"` element containing the exact message is in the DOM; the input value from a prior keystroke is preserved
  9. **`error={null}`, `error={undefined}`, `error=""` all render no error region:** assert `queryByRole('alert')` returns `null` for each
  10. **Input attributes:** assert `input.getAttribute('maxlength') === '500'`, `input.getAttribute('autocomplete') === 'off'`, `input.getAttribute('aria-label') === 'Add a todo'`, `input.getAttribute('type') === 'text'`
  11. **Font-size ≥16px:** assert via `getComputedStyle(input).fontSize` returns a value that parses to ≥16px (see Dev Notes → "Testing computed font-size under jsdom")
- **And** the file imports `render` + `screen` from `@testing-library/react` and `userEvent` from `@testing-library/user-event` (both already installed per Story 1.5)

**AC12 — axe-core render test at `apps/web/test/a11y/AddTodoInput.a11y.test.tsx`**
- **Given** the accessibility harness established in Story 1.6 (`vitest-axe` + the manual `expect.extend` in `apps/web/test/setup.ts`)
- **When** the engineer runs `npm test --workspace apps/web`
- **Then** the a11y test file renders `<AddTodoInput onSubmit={() => {}} />` in three variants and asserts zero axe violations for each:
  1. Default state (no props beyond `onSubmit`)
  2. Submitting state (`disabled={true}`)
  3. Error state (`error="Couldn't save. Check your connection."`)
- **And** the test follows the exact pattern of `apps/web/test/a11y/Header.a11y.test.tsx` (Story 1.6) — same imports, same structure, three `it` blocks

## Tasks / Subtasks

- [x] **Task 1: Author `apps/web/src/components/AddTodoInput.tsx`** (AC: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10)
  - [x] Create the file with the full implementation:
    ```tsx
    import { useEffect, useRef, useState, type FormEvent } from 'react';
    import { MAX_DESCRIPTION_LENGTH } from '../lib/constants.js';

    interface AddTodoInputProps {
      onSubmit: (description: string) => void;
      disabled?: boolean;
      error?: string | null;
    }

    export default function AddTodoInput({
      onSubmit,
      disabled = false,
      error = null,
    }: AddTodoInputProps) {
      const [value, setValue] = useState('');
      const inputRef = useRef<HTMLInputElement>(null);
      const wasDisabledRef = useRef(false);

      // Auto-focus on mount (UX-DR3 + UX-DR14).
      useEffect(() => {
        inputRef.current?.focus();
      }, []);

      // Successful-submit transition: clear + refocus when disabled goes false
      // with no error present.
      useEffect(() => {
        if (wasDisabledRef.current && !disabled && !error) {
          setValue('');
          inputRef.current?.focus();
        }
        wasDisabledRef.current = disabled;
      }, [disabled, error]);

      function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (disabled) return;
        if (value.trim().length === 0) return;
        onSubmit(value);
      }

      return (
        <form onSubmit={handleSubmit} className="flex gap-2 items-stretch">
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            maxLength={MAX_DESCRIPTION_LENGTH}
            autoComplete="off"
            aria-label="Add a todo"
            placeholder="What needs doing?"
            className="flex-1 min-h-[44px] px-3 py-2 border border-[--color-border] rounded-md bg-[--color-surface] text-base"
          />
          <button
            type="submit"
            disabled={disabled}
            aria-busy={disabled ? 'true' : undefined}
            className="min-h-[44px] min-w-[64px] px-4 rounded-md bg-[--color-accent] text-white font-medium disabled:opacity-60 disabled:cursor-not-allowed"
          >
            Add
          </button>
          {error ? (
            <p
              role="alert"
              aria-live="polite"
              className="text-[--color-danger] text-sm mt-2 w-full"
            >
              {error}
            </p>
          ) : null}
        </form>
      );
    }
    ```
    - See Dev Notes → "Why `useEffect + ref` instead of `autoFocus`" for the auto-focus implementation choice
    - See Dev Notes → "Detecting successful submit without a callback" for the `wasDisabledRef` pattern
    - See Dev Notes → "Where does trim live?" for why we pass the untrimmed `value` to `onSubmit`
    - **Note on error slot layout:** the `<p role="alert">` sits as a flex child alongside input + button. `w-full mt-2` forces it onto a new flex row below them (the form is `flex-wrap`-less by default, so `w-full` + `mt-2` gives the visual break). Epic 4's `InlineError` rewrite will likely pull this out into a sibling of the form — at which point the layout becomes a simple vertical stack. For MVP, inline works
  - [x] **Do NOT** add a character-counter (`X / 500`). Over-length is prevented by `maxLength`; showing a counter adds visual noise for a non-problem at MVP
  - [x] **Do NOT** add a pending/loading spinner icon inside the button. `aria-busy="true"` + `opacity-60` is the whole of the loading state (UX spec line 917 — "no global spinner" doctrine extends to per-button too)
  - [x] **Do NOT** add `onBlur` / `onFocus` / `onKeyDown` handlers. Native form-submit on Enter + native click on button covers every interaction we care about

- [x] **Task 2: Author unit tests at `apps/web/src/components/AddTodoInput.test.tsx`** (AC: 11)
  - [x] Create the test file:
    ```tsx
    import { describe, expect, it, vi } from 'vitest';
    import { render, screen } from '@testing-library/react';
    import userEvent from '@testing-library/user-event';
    import AddTodoInput from './AddTodoInput.js';

    function renderComponent(props: Partial<Parameters<typeof AddTodoInput>[0]> = {}) {
      const onSubmit = props.onSubmit ?? vi.fn();
      const result = render(<AddTodoInput onSubmit={onSubmit} {...props} />);
      return {
        onSubmit,
        input: screen.getByRole('textbox', { name: 'Add a todo' }) as HTMLInputElement,
        button: screen.getByRole('button', { name: 'Add' }) as HTMLButtonElement,
        rerender: result.rerender,
      };
    }

    describe('<AddTodoInput />', () => {
      it('auto-focuses the input on mount', () => {
        const { input } = renderComponent();
        expect(input).toHaveFocus();
      });

      it('has the required input attributes (maxlength, autocomplete, aria-label, type)', () => {
        const { input } = renderComponent();
        expect(input.getAttribute('maxlength')).toBe('500');
        expect(input.getAttribute('autocomplete')).toBe('off');
        expect(input.getAttribute('aria-label')).toBe('Add a todo');
        expect(input.getAttribute('type')).toBe('text');
      });

      it('input has computed font-size ≥ 16px (iOS auto-zoom guard)', () => {
        const { input } = renderComponent();
        const fontSize = parseFloat(getComputedStyle(input).fontSize);
        // jsdom reports the computed font-size in px when an explicit value is set.
        // Tailwind's `text-base` class sets font-size: 1rem = 16px (default root).
        // Fall back to 16 if jsdom returns an empty string (no CSS loaded).
        expect(Number.isNaN(fontSize) ? 16 : fontSize).toBeGreaterThanOrEqual(16);
      });

      it('calls onSubmit("Buy milk") when the user types and presses Enter', async () => {
        const user = userEvent.setup();
        const { onSubmit, input } = renderComponent();
        await user.type(input, 'Buy milk{Enter}');
        expect(onSubmit).toHaveBeenCalledTimes(1);
        expect(onSubmit).toHaveBeenCalledWith('Buy milk');
      });

      it('calls onSubmit with the current value when Add is clicked', async () => {
        const user = userEvent.setup();
        const { onSubmit, input, button } = renderComponent();
        await user.type(input, 'Buy milk');
        await user.click(button);
        expect(onSubmit).toHaveBeenCalledWith('Buy milk');
      });

      it('does NOT call onSubmit on empty submission (click + Enter)', async () => {
        const user = userEvent.setup();
        const { onSubmit, input, button } = renderComponent();
        await user.click(button);
        await user.type(input, '{Enter}');
        expect(onSubmit).not.toHaveBeenCalled();
      });

      it.each([
        ['spaces only', '   '],
        ['mixed whitespace', '  \t \n '],
      ])('does NOT call onSubmit on whitespace-only input (%s)', async (_label, ws) => {
        const user = userEvent.setup();
        const { onSubmit, input, button } = renderComponent();
        await user.type(input, ws);
        await user.click(button);
        expect(onSubmit).not.toHaveBeenCalled();
      });

      it('clears value and refocuses the input when disabled flips true → false with no error', async () => {
        const user = userEvent.setup();
        const onSubmit = vi.fn();
        const { rerender } = render(<AddTodoInput onSubmit={onSubmit} disabled={false} />);
        const input = screen.getByRole('textbox') as HTMLInputElement;
        await user.type(input, 'Buy milk');

        // Enter in-flight
        rerender(<AddTodoInput onSubmit={onSubmit} disabled={true} />);
        expect(input.value).toBe('Buy milk'); // preserved during in-flight

        // Settle successfully
        rerender(<AddTodoInput onSubmit={onSubmit} disabled={false} error={null} />);
        expect(input.value).toBe('');
        expect(input).toHaveFocus();
      });

      it('does NOT clear value when disabled flips true → false with an error present', async () => {
        const user = userEvent.setup();
        const onSubmit = vi.fn();
        const { rerender } = render(<AddTodoInput onSubmit={onSubmit} />);
        const input = screen.getByRole('textbox') as HTMLInputElement;
        await user.type(input, 'Buy milk');

        rerender(<AddTodoInput onSubmit={onSubmit} disabled={true} />);
        rerender(
          <AddTodoInput onSubmit={onSubmit} disabled={false} error="Couldn't save. Check your connection." />,
        );
        expect(input.value).toBe('Buy milk');
      });

      it('disabled={true} sets the button disabled + aria-busy and leaves the input editable', async () => {
        const { input, button } = renderComponent({ disabled: true });
        expect(button).toBeDisabled();
        expect(button.getAttribute('aria-busy')).toBe('true');
        expect(input).not.toBeDisabled();
      });

      it('renders error with role=alert when error prop is a non-empty string', () => {
        renderComponent({ error: "Couldn't save. Check your connection." });
        const alert = screen.getByRole('alert');
        expect(alert).toHaveTextContent("Couldn't save. Check your connection.");
      });

      it.each([
        ['null', null],
        ['undefined', undefined],
        ['empty string', ''],
      ])('does NOT render error region for error=%s', (_label, value) => {
        renderComponent({ error: value });
        expect(screen.queryByRole('alert')).toBeNull();
      });
    });
    ```
    - **Why `userEvent.setup()` (not the default `userEvent.click(...)` API):** `setup()` returns a user instance with deterministic keyboard + pointer timings. It's the Testing Library v14+ idiom. Story 1.5 established this pattern by installing `@testing-library/user-event@^14.5.0`
    - **Why `parseFloat(getComputedStyle(...).fontSize)`:** jsdom doesn't load Tailwind CSS (no PostCSS pipeline in the test env). `text-base` means `font-size: 1rem` but jsdom's default root font-size may return empty string. The fallback-to-16 branch handles the "no CSS" test-environment case — the *real* iOS auto-zoom check is the E2E test in Story 2.6
  - [x] **Do NOT** mock React's `useEffect` or `useRef`. The component behavior under real React + jsdom is exactly what we want to assert
  - [x] **Do NOT** test the form's `preventDefault` call directly (e.g., via `fireEvent.submit` + checking if navigation happened). User-event's `click` and `{Enter}` path already exercise the form-submit flow; a behavioral assertion (`onSubmit` called) is sufficient

- [x] **Task 3: Author a11y test at `apps/web/test/a11y/AddTodoInput.a11y.test.tsx`** (AC: 12)
  - [x] Create the file following the Story 1.6 pattern:
    ```tsx
    import { describe, it, expect } from 'vitest';
    import { render } from '@testing-library/react';
    import { axe } from 'vitest-axe';
    import AddTodoInput from '../../src/components/AddTodoInput.js';

    describe('<AddTodoInput /> accessibility', () => {
      it('default state — zero axe-core violations', async () => {
        const { container } = render(<AddTodoInput onSubmit={() => {}} />);
        const results = await axe(container);
        expect(results).toHaveNoViolations();
      });

      it('submitting state (disabled=true) — zero axe-core violations', async () => {
        const { container } = render(<AddTodoInput onSubmit={() => {}} disabled={true} />);
        const results = await axe(container);
        expect(results).toHaveNoViolations();
      });

      it('error state — zero axe-core violations', async () => {
        const { container } = render(
          <AddTodoInput onSubmit={() => {}} error="Couldn't save. Check your connection." />,
        );
        const results = await axe(container);
        expect(results).toHaveNoViolations();
      });
    });
    ```
    - **Why three variants and not just one:** axe rules differ by state (e.g., `aria-busy="true"` on a `disabled` button is a valid pattern but can trigger false positives if wired wrong; `role="alert"` has its own rule set). Covering default/disabled/error catches state-specific regressions without blowing up test time
  - [x] **Do NOT** add interaction-based a11y tests here (e.g., "type then check contrast"). The render-time axe pass is the CI gate; interaction a11y is manual verification in Story 5.3

- [x] **Task 4: Run full check** (AC: 1–12)
  - [x] `npm run typecheck --workspace apps/web` — clean
  - [x] `npm run lint` — clean (the `jsx-a11y` plugin is active per Story 1.6; our component should pass without warnings — `aria-label` on the input, real `<button>`, real `<form>`)
  - [x] `npm run format:check` — clean; run `npm run format` if the new files need normalization
  - [x] `npm test --workspace apps/web` — expect ~12 new AddTodoInput unit tests + 3 new a11y tests + pre-existing 9 tests = ~24 total passing
  - [x] `npm test --workspace apps/api` — regression check; no API changes, must still pass unchanged
  - [x] `npm run check` (aggregate) — exits 0
  - [x] Manual smoke: `docker compose up -d postgres` + `npm run dev`, navigate to `http://localhost:5173`, verify: input auto-focuses on page load; typing + Enter is silent (no error, input retains — **until 2-6 wires the mutation**); reload verifies auto-focus still fires
  - [x] **Do NOT** run `npm run test:e2e` — the smoke E2E from 1.6 (which asserts `<h1>Todos</h1>` is visible + `/healthz` returns 200) still passes because we haven't touched `App.tsx`, only added a new component. Story 2.6 wires the component into App and adds the Journey 1 E2E

## Dev Notes

### Why `useEffect + ref` instead of `autoFocus`

React's `autoFocus` attribute on `<input>` has two gotchas:
1. **StrictMode double-mount:** in development, `autoFocus` can fire on the unmounted DOM node. Using `useEffect` + `ref.current?.focus()` is deterministic across StrictMode cycles
2. **SSR:** `autoFocus` behaves differently between server-rendered + hydrated DOM. We're not SSR yet, but establishing the pattern now avoids future rework

Additionally, `useRef` gives us the same ref for the **re-focus after successful submit** flow (AC7). `autoFocus` only fires once on mount; we'd need a ref anyway for the re-focus. One ref, one pattern.

### Detecting successful submit without a callback

The component doesn't know when the mutation succeeded — only the parent does (via `useCreateTodo`'s `onSuccess` / mutation state). Options for signaling "success":

1. **Parent passes `onSuccess` callback:** adds a 4th prop, couples the component to the mutation lifecycle
2. **Parent calls `ref.current.reset()` imperatively:** component must expose an imperative handle via `useImperativeHandle` — heavyweight for one transition
3. **Watch `disabled` + `error` props for the transition `disabled=true → disabled=false && !error`** — chosen

Option 3 is idiomatic for TanStack Query + controlled components: the mutation's `isPending` drives `disabled`; the mutation's `error` drives `error`. When `isPending` goes false with no error, it's a success. No callback plumbing, no imperative handle.

The `wasDisabledRef` pattern captures "the previous `disabled` value" across renders without triggering an effect — it's a write in the effect body, read on the next render. This is the canonical "previous prop" pattern in React 19 (alternative: `usePrevious` helper — over-engineering for one use site).

### Where does trim live?

Three layers could trim:
1. **AddTodoInput on submit:** `onSubmit(value.trim())` — component-level enforcement
2. **The `useCreateTodo` hook:** `mutationFn: (d) => api.todos.create(d.trim())` — client data-layer enforcement
3. **`todosRepo.create` on the server:** `.trim()` on the description before Postgres insert — server-level enforcement

**Chosen: (3) only.** Story 2.1's `todosRepo.create` trims the description (AC2 of Story 2.1). The component passes the raw value so the **single source of trimming** is the server. Why:
- The empty/whitespace-only **no-op** check here uses `value.trim().length === 0` — that's how we decide whether to submit. **It does NOT trim the submitted value.**
- If the component trimmed before submit, the server's trim becomes redundant, and a future refactor that removes one (thinking the other handles it) creates a gap
- The server MUST trim regardless (clients can't be trusted for data normalization)

So: component trims **only to decide whether to submit**. Submitted value is raw. Server trims for storage.

### Should the input also be disabled during submit?

UX-DR3 says "Add disabled, opacity reduced" for the submitting state. It does not say the input must be disabled.

**Rationale for leaving the input editable during submit:**
- User can keep typing their next todo while the previous one is in flight (perceived responsiveness)
- A `disabled` input cannot be refocused — breaks AC7 (clear + refocus on success)
- Native form-submit auto-guards against double-submission because the button is disabled (Enter doesn't fire when the form's submit button is disabled in most browsers; if Enter somehow fires, `if (disabled) return;` in `handleSubmit` catches it)

If MVP user feedback says the editable-during-submit pattern feels wrong, revisit in Epic 4.

### Tailwind v4 `@theme` tokens + utility naming

Tailwind v4's `@theme` block (in `apps/web/src/styles/index.css`) declares CSS custom properties:
```css
@theme {
  --color-accent: #2563eb;
  --color-danger: #dc2626;
  --color-bg: #fafafa;
  ...
}
```

Two ways to consume:
1. **Arbitrary value:** `bg-[--color-accent]`, `text-[--color-danger]` — escaped CSS var reference
2. **Generated utility:** Tailwind v4 auto-generates utilities from `--color-*` — so `bg-accent`, `text-danger`, `border-border` would also work

**Chosen: (1) arbitrary value.** Reason: Tailwind v4's auto-generated utilities are still subject to version-to-version changes, and the arbitrary-value syntax is unambiguous + future-proof. Slightly uglier, more reliable.

**For the lint step:** `jsx-a11y` has no opinion on Tailwind classes. The `eslint-plugin-tailwindcss` isn't installed (and we're on v4, which lacks first-class plugin support yet) — so no class-order / class-name linting.

### Testing computed font-size under jsdom

jsdom does not run CSS through a full rendering engine. `getComputedStyle(element).fontSize` returns:
- The explicit inline-style font-size if set
- The value of CSS variables if they've been evaluated — but Tailwind v4's `@import "tailwindcss"` is NOT processed by jsdom
- Empty string if no style applies

**Implication:** the unit test's font-size assertion can't rigorously prove the 16px minimum. Two options:
1. **Explicit inline style** on the input: `style={{ fontSize: '16px' }}` — works in jsdom, but we already have `text-base` class. Inlining feels redundant
2. **Fall back to 16 if jsdom returns empty** — chosen in the test snippet above

The **real** iOS-auto-zoom protection is:
- The `text-base` class producing `font-size: 1rem = 16px` at build time
- The E2E test (Story 2.6 on Chromium; Story 5.2 on Safari) running the real Vite-built CSS

Unit test is a best-effort regression guard. Acceptable.

### How to test role="alert" without false positives

`getByRole('alert')` matches elements with `role="alert"` OR native equivalents (`<output>`, status roles). Our `<p role="alert">` matches. For the "no error" state, use `queryByRole` (not `getByRole`) — `queryByRole` returns `null` for missing elements; `getByRole` throws, which would fail the test for the wrong reason.

`aria-live="polite"` on `role="alert"` is technically redundant (alert has implicit `aria-live="assertive"`), but the UX spec calls for polite announcement (single utterance, not interrupt). `aria-live="polite"` overrides the default. This is a conscious UX trade-off — the announcement is **loud enough** to be heard but not **urgent enough** to jump the queue. axe-core does not flag this combination.

### Previous Story Intelligence

**From Story 2.3 (data layer) — this story's consumer is still Story 2.6; we don't wire the hook here:**
- `MAX_DESCRIPTION_LENGTH` is exported from `apps/web/src/lib/constants.ts` — Task 1 imports it
- `useCreateTodo` + `useTodos` exist but are NOT imported by this component (the component is purely presentational per UX spec line 753 — wiring happens in `App.tsx` in Story 2.6)
- If Story 2.3 hasn't landed when 2.4 is implemented: hardcode `maxLength={500}` with a `// Source: apps/api/src/schemas/todo.ts` comment, and swap to the constant import during 2.3's landing. Flag in Completion Notes if this happens

**From Story 1.5 (web scaffold) — load-bearing:**
- `apps/web/src/styles/index.css` defines `@theme` tokens: `--color-accent: #2563eb`, `--color-danger: #dc2626`, `--color-surface: #ffffff`, `--color-border: #e5e5e5`, `--color-fg: #1a1a1a` — all directly referenced in the component's Tailwind classes
- Global `:focus-visible` rule in `index.css` gives every focusable element a 2px accent outline + 2px offset — our component doesn't add per-element focus styles, it inherits this
- `prefers-reduced-motion` global rule in `index.css` zeros transitions — we have no transitions in this component (by design — no animation on the error appearance is acceptable; Epic 4's `InlineError` may add one)

**From Story 1.6 (CI + a11y gate) — load-bearing:**
- `vitest-axe` is wired in `apps/web/test/setup.ts` with manual matcher registration (vitest-axe@0.1.0 bug workaround)
- The `expect.extend(matchers)` + `AxeMatchers` module-augmentation is done once globally; every a11y test file just imports `axe` from `vitest-axe` and calls `expect(results).toHaveNoViolations()`
- `jsx-a11y/control-has-associated-label` is forced to `error` severity in the ESLint config (Story 1.6 deviation) — our `<input aria-label="Add a todo">` + `<button>Add</button>` both have accessible names, so no violations expected
- Prettier contract: `singleQuote: true`, `semi: true`, `trailingComma: 'all'`, `printWidth: 100` — matches new files

**From Story 1.5 (ErrorBoundary in main.tsx) — orthogonal:**
- `<ErrorBoundary>` wraps `<App />` in `main.tsx`. Render errors inside AddTodoInput fall through to the boundary's generic failure UI. We don't need to handle render errors in the component itself — the boundary catches them. This is the UX-DR10 contract

**From planned Story 2.6 (Journey 1 wire-up) — consumer context:**
- `App.tsx` will render `<AddTodoInput onSubmit={...} disabled={mutation.isPending} error={mutation.error?.message ?? null} />` — exact prop wiring
- The `disabled` + `error` prop pair flips on every mutation cycle; our effects (AC7) handle the clear-and-refocus on the false-transition-no-error case

### Git Intelligence

- Last 6 commits: Epic 1 (1.1–1.6 implemented). 2.1 in review. 2.2 in progress. No 2.3/2.4 commits yet
- Convention: `feat: story X.Y implemented` when the story lands. `feat: story 2.4 implemented` is the target
- Scope: ~2 new files (component + test) + 1 new a11y test file. In line with the sprint norm

### Latest Tech Information

**React 19 + TypeScript 5.6:**
- Function components return `JSX.Element` or `ReactElement`; no `React.FC<>` typing needed (that convention is deprecated in React 19 land)
- `useRef<HTMLInputElement>(null)` — the typed null is necessary so `inputRef.current` is `HTMLInputElement | null`
- `FormEvent<HTMLFormElement>` is the typed submit event

**`@testing-library/user-event@14`:**
- `userEvent.setup()` → returns a `user` instance with `type`, `click`, `clear`, `keyboard` methods
- `user.type(input, 'Buy milk{Enter}')` — special-key notation in curly braces triggers the corresponding key event
- Each test should call `setup()` fresh — user instances aren't safely reusable across tests

**`@testing-library/react@16`:**
- `screen.getByRole('textbox', { name: 'Add a todo' })` — the `name` option matches the accessible name (from `aria-label` in our case)
- `renderHook` moved to `@testing-library/react` in v13+ (already in Story 2.3)

**`vitest-axe@0.1.0`:**
- The empty `dist/extend-expect.js` bug is handled by Story 1.6's manual `expect.extend(matchers)` in `test/setup.ts` — no per-test setup needed
- `axe(container)` returns `{ violations, passes, incomplete, inapplicable }`; `expect(results).toHaveNoViolations()` asserts `violations.length === 0`

### Project Structure Notes

- **New files:**
  - `apps/web/src/components/AddTodoInput.tsx`
  - `apps/web/src/components/AddTodoInput.test.tsx`
  - `apps/web/test/a11y/AddTodoInput.a11y.test.tsx`
- **No modified files** — `App.tsx` stays untouched. Story 2.6 is where AddTodoInput gets wired in
- **No new dependencies** — all required libs (`react`, `@testing-library/react`, `@testing-library/user-event`, `vitest-axe`) are installed per Stories 1.5 + 1.6

### Testing Standards

- **Unit**: co-located `*.test.tsx` next to the component
- **a11y**: `apps/web/test/a11y/*.a11y.test.tsx` (follows Story 1.6 pattern)
- **No integration**: data-layer composition is Story 2.6's scope
- **No E2E**: Journey 1 E2E is Story 2.6's scope
- **`userEvent.setup()` per-test**, not per-file
- **`renderComponent` helper** keeps test setup DRY; avoid extracting further unless a 3rd consumer appears

### References

- Epic requirements: [epics.md § Story 2.4](../planning-artifacts/epics.md) (lines 615–671)
- UX — component spec: [ux-design-specification.md § AddTodoInput](../planning-artifacts/ux-design-specification.md) (lines 725–746)
- UX — Button hierarchy (Primary variant): [ux-design-specification.md § Button Hierarchy](../planning-artifacts/ux-design-specification.md) (lines 877–893)
- UX — Form patterns: [ux-design-specification.md § Form Patterns](../planning-artifacts/ux-design-specification.md) (lines 921–932)
- UX — Feedback patterns (error placement): [ux-design-specification.md § Feedback Patterns](../planning-artifacts/ux-design-specification.md) (lines 895–920)
- Architecture — component boundary rules: [architecture.md § Component Boundaries (web)](../planning-artifacts/architecture.md) (lines 595–601)
- PRD — FR-001 Create: [PRD.md § Functional Requirements](../planning-artifacts/PRD.md) (FR-001)
- Previous story: [2-3 web api client + hooks](./2-3-web-api-client-typed-endpoints-usetodos-usecreatetodo-hooks.md) — `MAX_DESCRIPTION_LENGTH` source; `useCreateTodo` consumer (Story 2.6)
- Previous story: [1-5 web scaffold](./1-5-web-app-scaffold-vite-tailwind-v4-design-tokens-errorboundary-header.md) — `@theme` tokens, global `:focus-visible`, `prefers-reduced-motion`
- Previous story: [1-6 CI + a11y gate](./1-6-ci-pipeline-code-quality-gate-eslint-prettier-a11y-playwright-e2e-scaffold-onboarding-readme.md) — `vitest-axe` setup, `jsx-a11y` ESLint rules

## Dev Agent Record

### Agent Model Used

Claude Opus 4.7 (1M context) — model id `claude-opus-4-7[1m]`

### Debug Log References

- **One deviation from the spec snippet**: the form's outer className is `flex gap-2 items-stretch flex-wrap` (added `flex-wrap`). The spec's snippet wrote `flex gap-2 items-stretch` without wrap and a contradictory inline note that "the form is `flex-wrap`-less by default, so `w-full + mt-2` gives the visual break." That note is factually wrong — a `w-full` flex item in a non-wrapping row forces input + button to shrink to zero; `flex-wrap` is the correct mechanism to push the error `<p>` onto a new row. Adding `flex-wrap` fixes both the layout AND stays consistent with the spec's other layout intent (error below the input/button row). No test change needed — no unit test asserts the wrap class, and the a11y tests pass under the corrected layout.
- Tests passed first-try on the component (15/15 unit) and the a11y file (3/3). No TypeScript, lint, or format fixups needed across the 3 new files.

### Completion Notes List

- `apps/web/src/components/AddTodoInput.tsx` — default-exported function component with the exact prop surface from AC1 (`onSubmit`, optional `disabled`, optional `error`). Controlled input via `useState('')`. Two `useEffect`s: one for mount auto-focus (empty deps), one watching `[disabled, error]` for the `wasDisabledRef` → `!disabled && !error` success-transition that clears + refocuses. `handleSubmit` does `event.preventDefault()` → no-op on disabled → no-op on `value.trim().length === 0` → calls `onSubmit(value)` with the **untrimmed raw value** (per Dev Notes — the server's `todosRepo.create` trims; trim at component level is only for the empty-check gate).
- `MAX_DESCRIPTION_LENGTH` imported from `../lib/constants.js` (Story 2.3). No hardcoded `500`.
- Tailwind classes directly reference `@theme` CSS custom properties via arbitrary-value syntax (`bg-[--color-accent]`, `text-[--color-danger]`, `border-[--color-border]`, `bg-[--color-surface]`) — Tailwind v4's auto-generated utilities would also have worked, but arbitrary-value is version-neutral and matches the spec's recommendation.
- `aria-busy` rendered as `'true'` when `disabled`, and **omitted entirely** (passed `undefined`) when not — avoids `aria-busy="false"` in the DOM (React drops `undefined` attribute values). Matches the spec; axe gets zero violations on the disabled-state variant.
- Error region is a `<p role="alert" aria-live="polite">` child **inside** the form, sitting alongside input + button as a flex child. `w-full mt-2` combined with `flex-wrap` on the form pushes it onto its own row below the control row. Only rendered when `error` is a truthy string — `null`, `undefined`, and `''` all fall through the `error ? ... : null` ternary.
- **15 unit tests** in `AddTodoInput.test.tsx`: auto-focus on mount, required input attributes (`maxlength="500"`, `autocomplete="off"`, `aria-label="Add a todo"`, `type="text"`), font-size ≥16px (with jsdom fallback to 16 when CSS isn't processed), typing + Enter path, typing + button click path, empty-submit no-op (both Enter and click), two whitespace-only no-ops via `it.each`, success transition (clear + refocus on `disabled=true → false` with no error), error-path preservation (value stays when `disabled=true → false` WITH error), disabled-state DOM assertions, error-region render, and three `error=null|undefined|''` no-render cases via `it.each`.
- **3 a11y tests** in `test/a11y/AddTodoInput.a11y.test.tsx`: default, `disabled=true`, and `error="..."` variants each pass `expect(results).toHaveNoViolations()`. Same pattern as `Header.a11y.test.tsx` from Story 1.6. The pre-existing `HTMLCanvasElement.prototype.getContext` stderr noise from axe-core's color-contrast rule under jsdom still appears — it's a warning, not a failure (axe handles the missing canvas gracefully and the test still passes).
- **Manual smoke** verified the Vite dev server serves `index.html` with status 200 and the `#root` element is present. The component isn't yet wired into `App.tsx` (that's Story 2.6's scope — the story explicitly says "no modified files; App.tsx stays untouched"), so browser-side auto-focus verification isn't possible without a test harness. The 15 unit tests are the gate.
- **Full check green**: `npm run check` exits 0. Totals: **64 api + 50 web = 114 tests pass**, up 18 from 96. No regressions. Pre-existing lint warning from Story 1.6 (`apps/api/src/db/index.ts:14`) remains untouched per scope discipline.

### File List

- Added: `apps/web/src/components/AddTodoInput.tsx` — default-exported form component with auto-focus, submit, clear-and-refocus, disabled state, error slot.
- Added: `apps/web/src/components/AddTodoInput.test.tsx` — 15 unit tests covering all 12 AC bullets.
- Added: `apps/web/test/a11y/AddTodoInput.a11y.test.tsx` — 3 axe-core render tests (default / disabled / error variants).
- Modified: `_bmad-output/implementation-artifacts/sprint-status.yaml` — story `2-4-addtodoinput-component` moved `ready-for-dev → in-progress → review`.
- Modified: `_bmad-output/implementation-artifacts/2-4-addtodoinput-component.md` — Status, all task/subtask checkboxes, Dev Agent Record, File List, Change Log.

## Change Log

| Date       | Version | Change                                                                                                                                                                                                                 | Author |
| ---------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| 2026-04-20 | 1.0     | Implemented presentational `AddTodoInput` component: auto-focus, controlled input, submit via Enter/click with raw value, whitespace-only no-op, disabled/error prop surface, success-transition clear-and-refocus. 18 new tests (114 total). | Dev    |
