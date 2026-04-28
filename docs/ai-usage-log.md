# AI Usage Log — Todo App

## Entries (most recent first)

### 2026-04-28 — CI green-up after first PR push

**Context:** First push to a PR with branch protection. Each push surfaced a new CI failure; I fed Claude one error at a time over seven rounds until CI was clean.

**What I asked the AI to do:** For each CI failure I pasted the failing test name plus a short snippet of error output and asked "what's wrong, fix it." Claude diagnosed and verified locally before each push.

**Limitations encountered:**
- **Two misdiagnoses in a row on the same failure.** A "list item not found" assertion failed in CI. Claude pattern-matched it to a slow-CI/jsdom timing issue and bumped timeouts — twice — which created a second timeout failure to chase. The real cause was a missing env var that turned the API URL into the literal string `"undefined/v1/todos"`. Only after I asked for a local repro did the real cause surface. Lesson: when an "element doesn't exist" error appears, "wait longer" should be the *last* hypothesis, not the first. Reproducing the failure locally — including the *absence* of env files — would have caught it on the first round.
- **Untracked file in CI.** Claude created a new helper file, ran a local check that read it directly off the working tree, and called it done. Local checks don't tell you what's *staged*. I had to push a broken commit to surface this. For any change that creates a new file, the done-checklist needs an explicit "is this in `git status` as `A` rather than `??`" item.
- **Defensive timeout bumps left in after the root cause was found.** The bumps from the misdiagnosed rounds stayed in even after we identified the env var as the actual cause. Defensible as belt-and-suspenders, but worth being honest about: they're symptom-chasing artifacts, not real performance constraints.

---

### 2026-04-27 — Contrast audit + launch checklist

**Context:** Pure tests + documentation work. WCAG contrast helper plus a token-pair audit and a release checklist.

**Limitations encountered:** None this session.

---

### 2026-04-27 — Manual accessibility audit doc

**Context:** Documentation plus one keyboard-only Playwright spec.

**Limitations encountered:** None. Worth recording: the keyboard walkthrough surfaced a real focus-management regression (focus is lost when a row re-mounts on toggle). Claude correctly filed it as a follow-up rather than silently patching it inside an audit-scoped change.

---

### 2026-04-27 — Cross-browser test matrix

**Context:** Responsive layout regression test plus a Playwright matrix across Chromium, Firefox, and WebKit.

**Limitations encountered:** None. Claude probed an assumption from the spec (a `getComputedStyle` claim that didn't actually hold in jsdom) before committing to it, and pivoted to class-presence assertions cleanly.

---

### 2026-04-27 — Performance regression harness

**Context:** A perf harness gating UI and API timings, plus a 50-todo seed fixture.

**Limitations encountered:** None this session. The spec contained two contradictory instructions about modifying the API workspace (one task allowed minimal changes, another forbade all changes). Claude noticed the conflict, picked the more-specific instruction, and surfaced the deviation in completion notes rather than silently picking one.

---

### 2026-04-27 — API global error-handler test coverage

**Context:** Pure verification work — adding tests, no source changes.

**Limitations encountered:** None. One operational note: the manual smoke step required `docker compose down` against a 3-day-old container. I let Claude execute the down/up cycle without explicit pre-confirmation since the action was bounded (no `-v` flag, named volume preserves data) and explicitly required by the task. If a future destructive step goes beyond "stop-and-restart-named-volume", I'd want Claude to pause and confirm.

---

### 2026-04-27 — Toggle + delete failure flows

**Context:** Wiring an inline-error component into the toggle and delete UI paths plus matching Playwright specs.

**Limitations encountered:** None — cleanest implementation run of the project. Worth noting: this was the first time the E2E suite was actually executed against a live stack as part of the implementation session rather than deferred to "human pre-merge check". After the audit fiasco below, I made this non-optional.

---

### 2026-04-24 — E2E suite audit + test-infra debt paydown

**Context:** Immediately after I'd written "I'll run E2E before merging" in my notes for three sessions in a row without ever doing it, I prompted: *"there are many e2e tests that are failing"*. This forced an honest E2E run. **12 of 18 tests failed on first attempt.** ~45 minutes of debugging took us from 12 failures to 0; final state was 18/18 passing on two consecutive runs.

**Limitations encountered (the big one):**
- **I had been treating "E2E not run" as "deferred by design" rather than "actual work I'm not doing".** My previous entries explicitly framed this as acceptable workflow latency. **That framing was wrong.** When I actually ran the suite, three distinct classes of real bugs had accumulated, undiscovered because the "pre-merge E2E run" was never actually happening:
  - Two specs used `page.getByLabelText(...)` — that's a React Testing Library API, not Playwright. Both specs threw `TypeError` on the first call. Neither had ever been executed.
  - A `getByRole('button', { name: 'Delete' })` resolved to two buttons (modal confirm + row icon) and hit Playwright's strict-mode violation. Required scoping to the dialog.
  - I had a bogus `getByText('Buy milk')` assertion against an input value — `getByText` matches text nodes, not input values. It never could have matched. The assertion right before it (`toHaveValue`) covered the intent already.
- **Parallel-worker DB race plus zombie POST commits.** Real test-infrastructure issue, fixed with `workers: 1`, double-truncate with a drain window, no-cache headers, and one local retry.
- **Cumulative "only-caught-by-real-browser" count is now 5** across the project. The test layers (in-process server injection, fetch mocking, jsdom) are genuinely thorough but cannot catch CSS-generation bugs, browser-cache behavior, process-lifecycle races, or "does Playwright even have this method" errors. Going forward: E2E runs are non-optional for any UI-touching change.

**Lesson:** Framing it as "human pre-merge check" was just a polite way of never running it.

---

### 2026-04-24 — Inline error wiring (create flow)

**Context:** Wiring the inline-error component into the create-todo input plus a Playwright spec for the create-failure flow.

**Limitations encountered:** None during the implementation itself. But I did NOT execute the new Playwright spec in-session. The spec compiled but had not been run against a live stack. This is what eventually triggered the E2E audit above.

---

### 2026-04-24 — Inline error component

**Context:** Brand-new presentational component with co-located unit and accessibility tests. Strict scope: no app wiring this session.

**Limitations encountered:** None. No manual browser smoke for this story by design — the component had no consumer yet.

---

### 2026-04-24 — Delete confirmation modal — manual smoke catches two CSS bugs

**Context:** Native `<dialog>` modal for delete confirmation plus supporting state in the App. After Claude marked the work ready for review, I ran a manual browser smoke and found two compounding CSS bugs.

**Limitations encountered (manual smoke surfaced two real bugs):**

I ran the app in the browser and the delete modal had only the Cancel button visible and was pinned to the top-left corner. Two distinct CSS issues masquerading as one visual bug:

1. **Modal positioning broken.** A native `<dialog>` opened via `.showModal()` is centered by the browser's UA stylesheet via `margin: auto`. Tailwind v4's preflight applies `margin: 0` to all elements — which strips the centering. Fix: explicit `position: fixed; inset: 0; margin: auto` to outspecify preflight.

2. **Delete button invisible (white-on-white).** The button used `bg-[--color-danger]` which compiled to `background-color: --color-danger;` — invalid CSS, silently discarded by browsers. **Tailwind v4's square-bracket syntax does NOT auto-wrap CSS variables in `var()`.** The correct form is `bg-[var(--color-danger)]` or the v4 shorthand `bg-(--color-danger)`. **This bug had been shipping project-wide for ~10 stories** — every component using `[--color-*]` somewhere had silently-wrong CSS, but most uses were for text colors where the inherited fallback color "looked close enough" so nobody noticed. The Delete button was the first time we used the broken pattern for a *background*, where the fallback (no background at all) was finally visually obvious.

**Bigger lesson:** The test infrastructure (vitest + fetch mocking + jsdom) is fundamentally blind to CSS-correctness bugs. axe catches accessibility, E2E catches behavior, but between them there's no layer that catches "the generated CSS is invalid and silently discarded." Ten-plus story-level test runs all came up green with this bug live in the running app. Manual smoke is the only thing that catches this class of bug, and it has been routinely skipped.

---

### 2026-04-24 — Toggle UI — manual smoke catches CORS bug

**Context:** Wiring the toggle mutation into the row UI. After Claude marked it ready for review, I ran a manual browser smoke.

**Limitations encountered:**
- **CORS bug latent for two stories.** I clicked a checkbox in the browser and got a CORS error in devtools — toggle didn't work at all. Tight signal: *"I cannot mark a todo as complete. I get a cors error."* Claude traced it: the CORS plugin's default `methods` list is `GET,HEAD,POST` — PATCH and DELETE are NOT in it. The two prior sessions that added PATCH and DELETE routes shipped without updating the CORS config. **Every PATCH and DELETE has actually been CORS-blocked in real browsers since those routes landed.** None of the tests caught it because in-process server injection bypasses CORS, and the web tests mock `fetch` globally so there's no network stack. One-line fix in the CORS plugin config. Same shape as the Tailwind bug above: certain integration bugs only manifest in a real browser hitting a real server.

---

### 2026-04-24 — Optimistic mutation hooks

**Context:** Web-side hooks for toggle and delete mutations. No UI wiring.

**Limitations encountered:** None this session.

---

### 2026-04-24 — DELETE endpoint

**Context:** API-only — DELETE handler, repo function, contract tests.

**Limitations encountered:** None this session.

---

### 2026-04-24 — PATCH endpoint

**Context:** API-only — PATCH handler, repo function, contract tests.

**Limitations encountered:**
- **Out-of-scope file change wasn't surfaced clearly enough.** The session declared 8 source files in scope. To make the contract tests pass, Claude had to flip an AJV config option in a 9th file (`app.ts`) — which was correct (the test required that behavior) and Claude did note the deviation in completion notes. But the deviation was buried; if I hadn't been watching the review summary I'd have missed it in the diff. For future sessions: when scope deviates from the declared file list, the deviation should be named in the summary headline, not buried in completion notes.

---

### 2026-04-20 — Final wiring + first-journey E2E + .env onboarding gap

**Context:** Wired the App together with all hooks and components, plus a Playwright spec for the full create journey.

**Limitations encountered:**
- **`.env` gap is a real onboarding failure.** When I went to run E2E, the production bundle had an undefined API URL because `apps/web/.env` didn't exist (only `.env.example`). Vite bakes env vars at build time. The README is supposed to cover this but either doesn't or is easy to skip. From a "new engineer reaches the first working journey within 15 minutes" standpoint, this IS the kind of rough edge a fresh clone hits. Action item: audit the README against "can I run E2E from a fresh clone." Every project step so far has assumed `.env` exists; none of them install it.

---

### 2026-04-20 — Presentational components (rows, list, skeleton, empty state)

**Context:** Four new components with co-located tests and accessibility smokes.

**Limitations encountered:** None substantive.

---

### 2026-04-20 — Add-todo input component

**Context:** Form input with focus management, error display, and disabled-state handling.

**Limitations encountered:** None. The spec contained an internal contradiction — a code snippet showing CSS classes that wouldn't produce the layout described in the prose around it — which Claude caught at write-time before any test failed.

---

### 2026-04-20 — Web data layer (API client, query hooks)

**Context:** Type-only re-exports from the API workspace, fetch-based API client, TanStack Query hooks.

**Limitations encountered:** None this session.

---

### 2026-04-20 — GET /v1/todos

**Context:** API-only — list endpoint with deterministic ordering.

**Limitations encountered:** None this session.

---

### 2026-04-20 — POST /v1/todos + repo unit-test coverage push

**Context:** First real CRUD endpoint — schemas, repo function, contract tests.

**Limitations encountered:**
- **The repo unit test never invoked the function it was supposedly testing.** The original test file only compiled a hand-built SQL query at the Kysely layer and asserted the SQL shape. **It didn't import the repo at all.** Behavioral properties of the repo (trim, UUID generation, the exact insert payload, ISO serialization) were covered only by the real-Postgres contract test. Unit-only coverage of the file was effectively 0%, not "reasonable." Claude had followed the spec's notes literally — the spec said "don't try to spy on UUID generation; don't invoke create expecting a return because the dummy driver returns []." But that was a lazy out. A custom test driver that captures the compiled query and returns a pre-seeded row unlocks the full test surface without needing a live database. My single-sentence push — *"the todoRepo is not covered by unit tests"* — was enough for Claude to author the right driver and write proper behavior tests.

**Meta-lesson:** When a spec's test-strategy section explicitly forbids exercising a function through a unit test, that forbiddance is often a lazy cop-out. Reach for a custom driver / matcher / stub before accepting "can't unit-test this."

---

### 2026-04-20 — Lint + format + CI + Playwright + onboarding README

**Context:** Toolchain setup — ESLint flat config, Prettier, Playwright (Chromium-only), GitHub Actions, README rewrite.

**Limitations encountered:**
- **Pre-existing unused `eslint-disable` directive left in place.** The new lint config flagged a directive that was added before any lint config existed. Claude held scope discipline (the session said no source changes) and flagged it as a deviation rather than silently fixing. Correct call, but it means a future cleanup needs to remember the dead directive. Worth tracking in a deferred-work note.
- **The "onboarding within 15 minutes" goal is unverifiable from a CLI session.** Claude correctly reported "cannot run from this session" rather than claiming the goal was met. Same shape as a few other sessions: some success criteria require a human with a fresh clone and a stopwatch. Worth keeping an explicit "manual pre-merge" checklist so these don't slip through.

---

### 2026-04-18 — Web workspace bootstrap (Vite + React + Tailwind + TanStack)

**Context:** New web workspace with theme tokens, error boundary, header.

**Limitations encountered:** None this session.

---

### 2026-04-18 — Fastify plugin stack + error envelope

**Context:** CORS, helmet, rate-limit, swagger plugins; global error handler with branched error envelopes.

**Limitations encountered:**
- **`coverage/` was committable because it was already staged from earlier sessions.** Claude added `coverage/` to `.gitignore` but didn't notice that the files were already tracked (`A` in `git status`), so gitignore had no effect. I had to prompt *"git still wants to add them"* for Claude to reach for `git restore --staged`. **Meta-lesson:** when adding a pattern to `.gitignore`, always check whether matching paths are already in the index. Gitignore only affects *new* tracking, not already-added files.

---

### 2026-04-18 — DB layer + migrations + healthz probe

**Context:** Kysely setup, todos table migration, /healthz with live DB probe.

**Limitations encountered:**
- **Tests passed but coverage was uninstallable.** Claude implemented the test suite and declared the work done without ever running or considering coverage. I had to prompt *"I cannot add the tests with coverage. a dependency is missing"* to surface a missing `@vitest/coverage-v8` dep (Vitest 3.x ships coverage support as a separate package). For test-heavy work going forward: I should either ask up front to sanity-check `--coverage` or add it to a verification checklist.
- **Misleading 100% coverage report on `routes/health.ts`.** Claude reported the file at 100% covered, but the number held *only because the integration tests were running* — which require live Postgres. Anyone running unit tests alone would see 0%. A coverage percentage can lie silently when a file is reached only through integration tests. My single-sentence push — *"health.ts is not covered by unit tests"* — was enough for Claude to build a custom test driver that hit the unit-only path. Always check what unit-only coverage looks like if probes or routes have moved across the unit-vs-integration boundary.
