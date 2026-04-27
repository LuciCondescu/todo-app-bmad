# Manual accessibility walkthroughs

Per-release verification of NFR-007 (WCAG 2.1 AA) beyond what `axe-core` covers automatically. The axe-core render tests at `apps/web/test/a11y/*.a11y.test.tsx` plus the keyboard-only Playwright spec at `apps/web/e2e/a11y-keyboard.spec.ts` are the **automated half**. This document is the **manual half** — the assistive-technology + zoom + reduced-motion checks no automated tool can replace.

**Process for issues found:** if any walkthrough item fails, file a follow-up ticket. **Do NOT silently fix the defect inside the walkthrough's own PR** — record the failure in [release-a11y-audit.md](./release-a11y-audit.md), open the ticket, and close it via a separate single-purpose PR. Silent fixes hide the audit signal.

Related docs:
- [`release-a11y-audit.md`](./release-a11y-audit.md) — append-only log of completed walkthroughs.
- [`browser-matrix.md`](./browser-matrix.md) — cross-browser smoke + viewport matrix (Story 5.2).

## Single sources of truth

These are the exact locations any focus / motion / aria contract is implemented. If a walkthrough surfaces a regression, suspect these first:

| Contract                                  | Source                                                   |
| ----------------------------------------- | -------------------------------------------------------- |
| Visible focus ring (2px solid accent + 2px offset) | `apps/web/src/styles/index.css:27-30`           |
| Reduced-motion zero-out                   | `apps/web/src/styles/index.css:33-40`                    |
| Modal centering + transitions             | `apps/web/src/styles/index.css:47-68`                    |
| `<h1>Todos</h1>`                          | `apps/web/src/components/Header.tsx:4`                   |
| AddTodoInput `aria-label="Add a todo"` + auto-focus | `apps/web/src/components/AddTodoInput.tsx:24-26, 53` |
| TodoRow checkbox `aria-label`             | `apps/web/src/components/TodoRow.tsx:12-14`              |
| TodoRow delete-icon `aria-label`          | `apps/web/src/components/TodoRow.tsx:40` (template literal) |
| DeleteTodoModal default focus on Cancel + `aria-describedby` | `apps/web/src/components/DeleteTodoModal.tsx:20-33, 60-61` |
| Modal close → focus restoration to delete icon | `apps/web/src/App.tsx` (`queueMicrotask(() => deleteTriggerRef.current?.focus())`) |
| `InlineError` `role="alert"` + `aria-live="polite"` | `apps/web/src/components/InlineError.tsx`        |

**Pre-walkthrough grep guard.** Run from the repo root; expected output is **zero matches**:

```sh
rg -n "outline-none|outline:\s*none" apps/web/src
```

Any future hit must be paired with an explicit replacement focus style. If the grep returns a hit and the keyboard Playwright spec is still green, treat the spec as the safety net — the regression has not yet bitten an interactive element, but it WILL eventually. Fix the source.

---

## Keyboard-only walkthrough (Chromium desktop)

Prerequisite: a Chrome / Edge / Brave window with the dev server running (`docker compose up -d postgres` + `npm run dev --workspace apps/web`). Use **Tab / Shift+Tab / Enter / Space / Escape** only — DO NOT touch the mouse during this walkthrough.

### Journey 1 — create

- [ ] Navigate to `http://localhost:5173`. **Expected:** `AddTodoInput` is auto-focused on mount; a **2px solid blue outline with 2px offset** is visible around it.
- [ ] Tab once. **Expected:** focus moves to the `Add` button; visible focus ring on the button.
- [ ] Shift+Tab back to the input.
- [ ] Type "buy milk" (no mouse). **Expected:** typing reflects immediately in the field.
- [ ] Press **Enter**. **Expected:** the row "buy milk" appears within 1 second; the input clears AND auto-refocuses (Story 2.4 invariant); the focus ring stays on the input.
- [ ] Press Tab. **Expected:** focus moves to the **first row's checkbox** (NOT the Add button — DOM order is input → Add → list rows).
- [ ] Confirm a visible focus ring on the checkbox.

### Journey 2 — toggle + delete

- [ ] (Continuing from Journey 1.) Press **Space** with the checkbox focused. **Expected:** the row's checkbox becomes checked; the row optimistically moves into the **Completed** section under a `Completed` heading; the strike-through + 60% opacity styling applies. Focus stays on the checkbox (now in the new section).
- [ ] Press Tab. **Expected:** focus moves to the **delete icon** of the same row; visible focus ring on the trash icon.
- [ ] Press **Enter** on the delete icon. **Expected:** the modal opens; **Cancel** is the initially focused button (Story 3.5 contract); visible focus ring on Cancel.
- [ ] Press Tab inside the modal. **Expected:** focus moves to the **Delete** button — and ONLY between Cancel ↔ Delete. Tab + Tab + Tab should NOT escape to the page content behind the modal.
- [ ] Press Shift+Tab. **Expected:** focus returns to Cancel.
- [ ] Press **Escape**. **Expected:** the modal closes; focus **returns** to the delete icon that opened it (Story 3.5 focus-restoration contract).
- [ ] Re-open the modal with Enter on the delete icon. Press Tab to Delete. Press Enter on Delete. **Expected:** the row is removed; the modal closes; focus returns to a sensible landing element (the delete icon's old position is gone — focus may fall to body, which is acceptable per the App.tsx focus-restoration comment).
- [ ] Re-open the modal on a different row. Click **Cancel** with Enter. **Expected:** modal closes; row stays; focus returns to the delete icon.

### Journey 3 — error recovery

- [ ] Use browser DevTools → Network → Throttling: enable "Offline" (or kill the API dev server temporarily). Type a description and Enter. **Expected:** an `InlineError` appears below the input with the locked copy `"Couldn't save. Check your connection."`; input retains the typed text; a Retry button is part of the alert region.
- [ ] Tab to the Retry button (it should be reachable). Visible focus ring.
- [ ] Restore the network. Press Enter on Retry. **Expected:** the row is created; the alert region disappears; input clears + refocuses.
- [ ] Repeat the network kill for a toggle: focus a row's checkbox, Space, **Expected:** row reverts; an `InlineError` appears below the row in the same `<li>`; the row retains its current state. Tab reaches the in-row Retry; Enter on Retry succeeds when the network returns.
- [ ] Repeat for delete: focus a delete icon, Enter, modal opens; Tab to Delete (with the network killed); Enter. **Expected:** modal stays open; body replaced by `InlineError`; the Delete button label flips to **Retry**; Cancel stays enabled. Tab cycles between Cancel ↔ Retry. Escape works. Cancel works.

### 200% browser zoom smoke

Run in **Chrome, Firefox, and Safari** (the matrix declared in `browser-matrix.md`):

- [ ] Set browser zoom to 200% (`Ctrl+Plus` / `Cmd+Plus` until 200%).
- [ ] Reload the app. **Expected:** layout doesn't break; nothing is clipped or overflowing horizontally; the root container (`max-w-xl`) stays centered.
- [ ] All tap targets remain visually located where they were at 100%.
- [ ] Adding a todo, toggling, opening + closing the modal — each still works without horizontal scroll.

### `prefers-reduced-motion` verification

- [ ] Enable `prefers-reduced-motion: reduce` at the OS level.
  - macOS: System Settings → Accessibility → Display → "Reduce motion" ON.
  - Windows: Settings → Accessibility → Visual effects → "Animation effects" OFF.
  - Linux GNOME: Settings → Accessibility → "Enable animations" OFF.
- [ ] Reload the app.
- [ ] Toggle a row. **Expected:** the strike-through + opacity change is **instant** — no 200ms fade.
- [ ] Open the delete modal. **Expected:** the modal appears **instantly** — no 150ms scale + opacity transition; backdrop fade is also instant.
- [ ] Close the modal. **Expected:** instant.
- [ ] Functional outcomes are identical to the animated path; the only difference is the absence of motion. If you see residual motion, the global `@media (prefers-reduced-motion: reduce)` rule at `apps/web/src/styles/index.css:33-40` has regressed — that's a bug, file a ticket.

---

## macOS VoiceOver + Safari walkthrough

Requirements: macOS Sonoma (or later) + Safari + VoiceOver. Toggle VoiceOver with `Cmd+F5`. Use the VO Rotor (`VO+U`) and item navigation (`VO+Right` / `VO+Left`).

VO phrasing varies slightly across macOS versions (Sonoma vs Sequoia vs later). **Acceptance is: the ARIA role + name + state are all announced. Exact word order may differ.**

### Journey 1 — create

- [ ] Page load. **Expected announcement:** "Todos, heading level 1" (from `<h1>Todos</h1>`).
- [ ] VO+Right to the AddTodoInput. **Expected:** **"Add a todo, edit text"** — from the input's `aria-label="Add a todo"`.
- [ ] Type "buy milk" + Return. **Expected:** the new row is announced as **"Mark complete: buy milk, checkbox, not checked"** when VO lands on it (after VO+Right cycles).

### Journey 2 — toggle + delete

- [ ] VO+Right to the row's checkbox; VO+Space (or Space) to toggle. **Expected:** announcement transitions to **"Mark incomplete: buy milk, checkbox, checked"** — the `aria-label` flips per `TodoRow.tsx:12-14`.
- [ ] VO+Right to the delete icon. **Expected:** **"Delete todo: buy milk, button"**.
- [ ] VO+Space to activate. Modal opens. **Expected:** **"Delete this todo?, dialog"** announced as a dialog landmark; the body **"This cannot be undone."** is read from the `aria-describedby` association at `DeleteTodoModal.tsx:60-61`.
- [ ] Inside the modal, VO+Right cycles between the Cancel and Delete buttons; the dialog's focus-trap honors VO's item navigation (the rotor should NOT escape to the page-content landmark behind the modal).
- [ ] Press Escape (or VO+Esc). **Expected:** modal closes; VO returns focus to the delete icon (announces "Delete todo: buy milk, button" again).

### Journey 3 — error recovery

- [ ] Trigger a create-failure (kill the API or use DevTools offline). **Expected:** when the `InlineError` appears below the input, VO announces it via the **`role="alert"` + `aria-live="polite"`** wrapper. The locked copy `"Couldn't save. Check your connection."` is read aloud.
- [ ] Same expectation for toggle-failure (announcement targets the row's `<li>` alert region) and delete-failure (announcement targets the modal's body, which has been replaced by the `InlineError`).
- [ ] VO+Right to the Retry button; VO+Space to retry. **Expected:** on success, the alert region is unmounted; VO does not re-announce a stale error.

---

## iOS VoiceOver + Safari walkthrough (iOS 15+ device)

**Requires a physical iOS 15+ device. iOS Simulator is NOT an acceptable proxy for VO testing — the accessibility model differs.**

Toggle VoiceOver via Settings → Accessibility → VoiceOver → ON, or via the side-button triple-click shortcut.

### Journey 1 — create

- [ ] Open the deployed app (or `http://<dev-machine-ip>:5173` over LAN). **Expected:** single-finger right-swipe walks forward through interactive elements in DOM order: `<h1>` heading → input → Add button.
- [ ] Double-tap on `AddTodoInput`. **Expected:** edit mode activates; on-screen keyboard appears; **no auto-zoom** (the input's font-size is 16px — `apps/web/src/components/AddTodoInput.tsx:55`'s `text-base` token; iOS Safari refuses to zoom inputs ≥ 16px).
- [ ] Type "buy milk", press Return. **Expected:** row appears; right-swipe walks past the input + Add to reach the new row's checkbox.

### Journey 2 — toggle + delete

- [ ] Double-tap on the focused checkbox. **Expected:** toggles (same announcement-flip semantics as macOS VO).
- [ ] Right-swipe to the delete icon; double-tap. **Expected:** modal opens; VO rotor confirms the modal's `aria-modal` focus scope is honored (right-swipe inside the modal cycles Cancel ↔ Delete only — does not walk out to background page content).

### Journey 3 — error recovery

- [ ] Same shape as macOS VO; the locked-copy alerts are announced via the `role="alert"` regions.

### Modal dismissal + viewport

- [ ] Two-finger Z-gesture (VO's "Escape" equivalent) closes the modal.
- [ ] At 320×568 (iPhone SE baseline) or 375×667 (iPhone SE 2nd gen): **no horizontal scroll, no content clipping, no overlapping interactive elements**. The Story 5.2 `browser-matrix.spec.ts` already gates 320px no-h-scroll structurally; this manual pass adds the touch-target verification.

---

## NVDA + Firefox/Chrome (Windows, optional)

*Optional — run when Windows test resource is available.* Same three-journey breakdown; expected announcement shape is similar to VO but phrasing differs.

### Journey 1

- [ ] Page load → "Todos, heading level 1".
- [ ] Tab to input → "Add a todo, edit".
- [ ] Type + Enter → row created and announced when navigation lands on it.

### Journey 2

- [ ] Toggle with Space → state-flip announcement.
- [ ] Enter on delete icon → modal announced as dialog with body content.

### Journey 3

- [ ] Failure path → `role="alert"` triggers immediate NVDA announcement of the locked copy. Retry button reachable + activatable.

---

## After the walkthrough

Record results in [`release-a11y-audit.md`](./release-a11y-audit.md):

1. Append a new row with the date, your GitHub handle, browser + AT versions, pass/fail per section, and links to any tickets opened.
2. Don't edit prior rows. If a previously-signed-off audit needs a correction, append a new row referencing the prior date.
3. If any item failed, the release is **blocked on the follow-up ticket(s)** unless a release-engineer override is recorded in the same row.
