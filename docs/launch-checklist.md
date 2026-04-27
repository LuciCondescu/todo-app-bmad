# MVP launch-quality checklist

The single pre-release go/no-go document for the todo-app MVP. Walk the table top-to-bottom; flip `🟡 PENDING` rows to `🟢 GO` or `🔴 NO-GO` based on current evidence. The overall verdict at the top flips to `🟢 GO` only when every row is `🟢 GO` or `N/A` and every linked artifact has been re-verified for this release cycle.

**Overall verdict:** 🟡 PENDING

This is a SINGLE-INSTANCE document — there is one table, updated in place as the MVP moves toward release. Old cell states are not preserved in the doc itself; git log is the history. (Compare with [`release-a11y-audit.md`](./release-a11y-audit.md), which is append-only by release.)

## Pre-release gates

| Gate | Status | Evidence (link) | Sign-off (initials + date) |
|---|---|---|---|
| All 12 FR contract tests green (Epics 1–3) | 🟡 PENDING | [`apps/api/test/contract.todos.test.ts`](../apps/api/test/contract.todos.test.ts) + web component / integration tests under [`apps/web/src/**/*.test.{ts,tsx}`](../apps/web/src) and [`apps/web/test/`](../apps/web/test) | — |
| All 7 NFR integration tests green (Epics 1, 4, 5) | 🟡 PENDING | [`apps/api/test/integration.errors.test.ts`](../apps/api/test/integration.errors.test.ts) · [`integration.persistence.test.ts`](../apps/api/test/integration.persistence.test.ts) · [`plugins.integration.test.ts`](../apps/api/test/plugins.integration.test.ts) · [`apps/web/test/perf/journey4.perf.test.tsx`](../apps/web/test/perf/journey4.perf.test.tsx) · [`apps/web/test/responsive/responsive.test.tsx`](../apps/web/test/responsive/responsive.test.tsx) | — |
| SC-001 — ≤60-second first-use | 🟡 PENDING | [Story 2.6](../_bmad-output/implementation-artifacts/2-6-end-to-end-wire-up-in-app-tsx-journey-1-complete.md) Completion Notes (unmoderated smoke) OR formal n=5 usability test if done | — |
| SC-002 — persistence across three boundaries | 🟡 PENDING | [`integration.persistence.test.ts`](../apps/api/test/integration.persistence.test.ts) · [`integration.delete.persistence.test.ts`](../apps/api/test/integration.delete.persistence.test.ts) · [`db.persistence.test.ts`](../apps/api/test/db.persistence.test.ts) + Story 4.4's manual `docker compose down (no -v)` smoke recorded in [its Completion Notes](../_bmad-output/implementation-artifacts/4-4-api-global-error-handler-coverage-persistence-integration-test-nfr-003.md) | — |
| SC-003 — UI p95 ≤100ms + API p95 ≤200ms | 🟡 PENDING | [`apps/web/test/perf/journey4.perf.test.tsx`](../apps/web/test/perf/journey4.perf.test.tsx) latest run + [perf README](../apps/web/test/perf/README.md) — note: jsdom thresholds are calibrated; PRD-grade SC-003 ALSO requires the manual Chrome DevTools Performance panel pass on a real 2022 mid-tier laptop per `PRD.md:41` | — |
| SC-004 — responsive + browser matrix | 🟡 PENDING | [`apps/web/e2e/browser-matrix.spec.ts`](../apps/web/e2e/browser-matrix.spec.ts) + [`docs/browser-matrix.md`](./browser-matrix.md) latest run table (Story 5.2 land recorded the 12/12 chromium+firefox+webkit pass) | — |
| NFR-006 — onboarding ≤15 min verified | 🟡 PENDING | [Story 1.6](../_bmad-output/implementation-artifacts/1-6-ci-pipeline-code-quality-gate-eslint-prettier-a11y-playwright-e2e-scaffold-onboarding-readme.md) Completion Notes — fresh-clone trial result | — |
| NFR-007 — WCAG 2.1 AA verified | 🟡 PENDING | Three sub-pieces of evidence below | — |
| &nbsp;&nbsp;&nbsp;↳ axe-core in CI green | 🟢 GO | [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) `Unit + a11y tests` step + 11 component a11y test files at [`apps/web/test/a11y/`](../apps/web/test/a11y) | LC 2026-04-27 |
| &nbsp;&nbsp;&nbsp;↳ contrast audit green | 🟢 GO | [`docs/contrast-audit.md`](./contrast-audit.md) — all 7 token pairs pass thresholds (Story 5.4 land 2026-04-27) | LC 2026-04-27 |
| &nbsp;&nbsp;&nbsp;↳ keyboard + VoiceOver walkthroughs green | 🟡 PENDING | [`docs/release-a11y-audit.md`](./release-a11y-audit.md) latest row — Story 5.3 lands the audit ritual; full pre-MVP-ship walkthrough (Journey 2/3 keyboard, 200% zoom, prefers-reduced-motion, macOS VO, iOS VO) is owed before ship | — |
| No known critical defects open | 🟡 PENDING | Issue tracker filter (e.g., `is:open label:critical`) — no GitHub-issue labels are configured at MVP authoring time; **Finding-1** from Story 5.3 (row-remount-on-toggle detaches keyboard focus) is the one open a11y finding pending a follow-up ticket | — |

## Status legend

- 🟢 **GO** — evidence exists AND has been re-verified for this release cycle.
- 🔴 **NO-GO** — gate has failed or has a known blocker; the Evidence cell must cite the specific blocker (link to ticket, failing test, or artifact).
- 🟡 **PENDING** — evidence may exist, but has NOT been re-verified for this release cycle. A `PENDING` row at sign-off time is a `NO-GO` for release.
- **N/A** — gate does not apply to this release (justify in the Evidence cell).

Plain-text alternatives (`GO` / `NO-GO` / `PENDING` / `N/A`) are equally acceptable; emoji are used here for at-a-glance scannability in rendered Markdown.

## Usage

1. Walk the table top-to-bottom each release. Run the cited tests, open the cited docs, and re-verify each gate.
2. Update the `Status` column based on current evidence — update the `Sign-off` cell with your initials + ISO date when you flip a row to `🟢 GO`.
3. Update the **Overall verdict** marker at the top only when every row is `🟢 GO` or `N/A` AND the artifacts in the Evidence cells have been re-verified during the current release cycle.
4. `🔴 NO-GO` MUST cite the specific blocker — a ticket link, a failing test name, or a docs-row that reads `❌ fail`.
5. Do NOT preemptively flip a `🟡 PENDING` row to `🟢 GO` based on "the test was green when the upstream story landed." Re-verify per release.

This document is updated in place per release. Git log is the history; the table represents the current release decision.

## Notes for the first-release walkthrough

- Three rows depend on Story 5.x artifacts that landed in 2026-04-27: SC-003 (Story 5.1), SC-004 (Story 5.2), and the keyboard/VO sub-row of NFR-007 (Story 5.3). The artifacts are linked above; re-verification at release time means rerunning `npm test`, `npm run test:e2e`, `npm run test:browsers`, and the `docs/manual-accessibility.md` keyboard walkthrough on a fresh clone.
- The contrast-audit gate landed `🟢 GO` at Story 5.4 authoring time because the test passes deterministically on every run; this gate only flips to `🟡 PENDING` if the `@theme` block changes (the test is the safety net — a regression there would fail CI).
- The "No known critical defects open" gate currently sits `🟡 PENDING` because no issue tracker labels are configured at MVP authoring. **Finding-1** from Story 5.3 is the one open a11y finding (row-remount-on-toggle detaches keyboard focus) — not a release blocker on its own, but worth filing before MVP ship so the audit trail is complete.
