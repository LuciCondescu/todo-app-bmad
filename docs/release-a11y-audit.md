# Release accessibility audit — append-only log

Each completed manual walkthrough recorded per the checklists in [`manual-accessibility.md`](./manual-accessibility.md) lands as one row in the table below.

**Append-only discipline.** Do not edit prior rows. If a follow-up surfaces after sign-off (e.g., "I forgot to link this ticket"), append a new row referencing the prior date in the *issues found* column. Git log is the ultimate source of truth, but the table is the at-a-glance view.

A column with `—` means *not run this audit* (typically: screen-reader walkthroughs require AT hardware not always available). A column with `n/a` means *not applicable to this audit*.

| Date       | Tester           | Browser + AT versions                                                  | Keyboard-only | macOS VO | iOS VO | NVDA   | Issues found                                                                 | Sign-off |
|------------|------------------|------------------------------------------------------------------------|---------------|----------|--------|--------|------------------------------------------------------------------------------|----------|
| 2026-04-27 | @lucicondescu    | Chromium (Playwright build) + macOS Sequoia 15.x; structural audit only — no live browser | ⚠ partial¹     | —        | —      | —      | Finding-1: row-remount-on-toggle detaches focused checkbox (Story 3.4 / 5.3 keyboard cost) — needs follow-up ticket | N (Story 5.3 land only — full pre-release audit owed before MVP ship) |

¹ **Initial audit (structural + automated).** Coverage:

- `apps/web/e2e/a11y-keyboard.spec.ts` runs keyboard-only Journey 1 against Chromium with focus-ring assertions at 5 checkpoints — input on mount, Add button on first Tab, row checkbox on Tab, delete icon on Tab (without preceding toggle), Cancel inside the modal — passing in ~400ms.
- Grep guard `rg -n "outline-none|outline:\s*none" apps/web/src` → zero matches.
- Single-source-of-truth file references in [`manual-accessibility.md`](./manual-accessibility.md) cross-checked against current code (focus-visible at `index.css:27-30`, reduced-motion at `index.css:33-40`, all aria-labels resolve).
- Modal focus-trap + Escape-restoration verified via the Playwright spec (steps 11–15: Cancel default-focused, Tab → Delete, Shift+Tab → Cancel, Escape → focus restored to the delete icon).

**Finding-1 (open):** Story-3.4's row-remount-on-toggle (a row moving from Active to Completed unmounts and re-mounts in the new section) detaches the keyboard-focused checkbox node. Subsequent Tab presses fall back to body and re-enter at the document top. This is a real keyboard-UX cost: a screen-reader / keyboard user toggling a row loses their place in the focus chain. The Playwright spec at `apps/web/e2e/a11y-keyboard.spec.ts` documents this finding inline and intentionally omits the Space-toggle step (covered by manual Journey 2 walkthrough instead). **Recommended ticket:** "a11y: preserve keyboard focus across row-remount on toggle" — investigate `useEffect` post-toggle re-focus or restructuring `TodoList` to avoid the unmount on toggle. Out of scope for Story 5.3 per the anti-pattern rule.

**Owed before MVP ship (NOT gated by Story 5.3 land):**
- Manual keyboard walkthrough Journeys 2 + 3 (full clicking-with-keyboard scenarios) — requires a real browser session.
- 200% zoom smoke (Chrome + Firefox + Safari).
- `prefers-reduced-motion` smoke (macOS or Windows).
- macOS VoiceOver + Safari walkthrough (3 journeys).
- iOS VoiceOver + Safari walkthrough on a physical iOS 15+ device (3 journeys + viewport check).
- Optional: NVDA + Firefox / Chrome on Windows.

---

## How to add a row

1. Run the relevant checklists in [`manual-accessibility.md`](./manual-accessibility.md).
2. Append a row above this section (most-recent at top of the table — append to the bottom of *the table* for convention; the most-recent row is whichever row has the latest date). For sortability, ISO dates (`YYYY-MM-DD`) only.
3. Fill in pass/fail per section column. Use ✅ pass / ❌ fail / `—` not run.
4. *Issues found* column: list ticket links (e.g., `#42 — focus ring missing on InlineError Retry button`) or write `—` if none.
5. *Sign-off* column: `Y` if you assert the audit gates this release; `N` if blocking on follow-up tickets or if the audit is partial.

If a follow-up correction is needed for a prior row, **do not edit that row** — append a new row with today's date and reference the prior date in *issues found*.
