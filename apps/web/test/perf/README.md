# Journey-4 perf harness

A jsdom-based regression-guard for the toggle / create / delete CRUD
interactions on a 50-todo list. Gates two NFRs as Vitest assertions:

| NFR     | Threshold                                       | PRD reference                                       |
| ------- | ----------------------------------------------- | --------------------------------------------------- |
| NFR-001 | UI p95 ≤ 100ms per interaction batch            | `_bmad-output/planning-artifacts/PRD.md:149`        |
| NFR-002 | API p95 ≤ 200ms per interaction batch           | `_bmad-output/planning-artifacts/PRD.md:150`        |
| —       | Cumulative-degradation: 40th ≤ 2× 1st           | Story 5.1 AC10                                      |

Architecture references:
- Journey-4 perf decision (`React.memo` on `TodoRow` + key-stable list): `_bmad-output/planning-artifacts/architecture.md:238`
- NFR-001 / NFR-002 verification location: `_bmad-output/planning-artifacts/architecture.md:634-635`
- Test file placement: `_bmad-output/planning-artifacts/architecture.md:584`

## Running locally

```sh
docker compose up -d postgres                # required: real Postgres for the seed
npm test --workspace @todo-app/web           # runs perf alongside everything else
# OR, just the perf harness:
npm test --workspace @todo-app/web -- test/perf/journey4.perf.test.tsx
```

The seed fixture loads `DATABASE_URL` from `apps/api/.env`; CI sets it via the
`services.postgres` container declared in `.github/workflows/ci.yml`. The
harness completes in roughly 2–3 seconds locally; well under the 60-second
budget that Story 5.1 Task 7 enforces.

## What "failing" means

A perf regression in this harness is almost always one of:

- **An unmemoed component**, especially `TodoRow.tsx` (Story 2.5 wraps it in
  `React.memo`; if a future change adds a non-stable prop reference at the
  parent layer, every row re-renders on every list update).
- **A new O(n²) render loop** — e.g., a nested `.map()` inside `TodoList.tsx`
  or a hook that synchronously walks the full list on every state change.
- **A hook that over-invalidates** — e.g., a new `queryClient.invalidateQueries`
  on every mutation settle that should be scoped narrower.
- **A leaked subscription** — TanStack Query subscribers, custom event listeners,
  or `MutationObserver` instances that aren't cleaned up will surface in the
  cumulative-degradation test (40th interaction ≤ 2× 1st).

First three files to suspect when the harness goes red:

1. `apps/web/src/components/TodoRow.tsx`
2. `apps/web/src/components/TodoList.tsx`
3. `apps/web/src/App.tsx` and any new hook under `apps/web/src/hooks/`

## jsdom caveat

**Timings are indicative, not truth.** jsdom emulates the DOM in JavaScript;
React commits + DOM mutations cost significantly more than they do in a real
browser. The thresholds in `journey4.perf.test.tsx` are calibrated for jsdom
overhead — see the `UI_P95_MS` / `API_P95_MS` / `INITIAL_RENDER_MS` constants
at the top of that file.

Formal SC-003 validation (the actual NFR-001 / NFR-002 commitment) uses the
**Chrome DevTools Performance panel on a real mid-tier 2022 laptop** per
PRD line 41. Run it manually before any release that touches the rendering
or hook layer. The harness here catches catastrophic regressions; the manual
check measures real-browser p95.

## Tuning thresholds

If the jsdom baseline becomes flaky on a slower CI runner, the thresholds in
`journey4.perf.test.tsx` can be relaxed (e.g., 250ms UI / 300ms API → 350ms /
400ms) **without changing the PRD commitment**. The harness is a CI gate, not
a PRD assertion; the document of record stays the PRD.

The constants are at the top of the file with one-line rationale comments.
Update them in-place; do not introduce a config file for what should remain
a single number under one comment.

## Optional E2E (`e2e/journey-4-perf.spec.ts`)

**Not implemented in Story 5.1.** The jsdom harness covers the regression-guard
intent (Dev Notes argued an E2E perf spec adds value only when calibrated on
a known-stable real-hardware machine, which this project does not have). If a
team later wants real-browser timing, scaffold under `apps/web/e2e/`, exclude
from the default `npm run test:e2e` via a `testIgnore` glob in
`playwright.config.ts`, and add a `test:perf:e2e` script to
`apps/web/package.json`.
