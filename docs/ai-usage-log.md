# AI Usage Log — Todo App

A running log of AI-assisted work on this training project. **Voice is mine throughout** — I am the author; the AI is called "Claude", "the AI", or "the agent". The log records what I observed, asked for, and decided, not the AI's internal experience.

---

## Guidelines for future entries

Keep these in mind when I write (or ask the AI to draft) a new entry:

1. **First person = me, not the AI.** If I write "I pinned `kysely@^0.27.0`", that means I did it. If the AI did it, I write "Claude pinned…" or "the AI chose…". Never let the AI write "I" to refer to itself in this file.
2. **Only log what I observed directly.** If I didn't witness a behaviour, I don't record it as fact. Ask the AI to surface what it actually did, then verify before committing.
3. **"Limitations Encountered" = human-caught only.** The AI's own mid-session self-corrections (a typecheck error it fixed, a failing test it diagnosed) belong under **Debugging with AI**, not here. Limitations are things *I* had to catch — gaps in its thinking, bad defaults, missing checks, or assumptions that would have shipped broken without human review.
4. **"Debugging with AI" = the loop I watched.** Record the signal I gave (short error message, one-line observation), how the AI diagnosed, and what it changed. This is where the AI's strength usually shows up.
5. **Brevity over comprehensiveness.** A 2-line entry is fine for a short session. Don't pad categories that didn't apply — write "n/a" and move on.
6. **Dates in `YYYY-MM-DD`.** Most recent entry first, above older ones.
7. **When drafting an entry with the AI:** tell it the voice is mine, have it list facts under each category, and I edit before committing. Don't let the AI fabricate observations I didn't make (e.g., don't assume I was "satisfied" or that I "chose" something — only record decisions I actually made).
8. **Self-corrections are not failures.** If the AI wrote a broken test, ran it, saw the failure, and fixed it in the same turn — that's normal dev loop behaviour, not a limitation. A limitation is an issue that persists past the AI's self-check and only surfaces under *my* scrutiny.

---

## Entry template

```
### YYYY-MM-DD — <short session title>

**Context:** <what I was trying to accomplish>
**Model / mode:** <e.g., Claude Opus 4.7 (1M context) via Claude Code>
**Command / skill:** <slash command, if any>

**Agent usage**
- What I asked the AI to do:
- Prompts that worked best:
- Sub-agents spawned (if any):

**MCP server usage**
- Servers invoked:
- What they unlocked:

**Test generation**
- Tests the AI wrote / designed:
- Gaps or misses I noticed:

**Debugging with AI**
- Issues I surfaced:
- How the AI diagnosed + what it changed:

**Limitations encountered** *(what I caught that the AI missed on its own)*
- Where it fell short:
- Where my judgement was load-bearing:
```

---

## Entries (most recent first)

### 2026-04-18 — Story 1.5 implementation + manual code review (`/bmad-dev-story`)

**Context:** I ran `/bmad-dev-story` to implement Story 1.5 end-to-end (new `apps/web/` workspace: Vite 7 + React 19 + Tailwind v4 with `@theme` design tokens + TanStack Query 5 provider + class-based `ErrorBoundary` + static `Header`). I reviewed the change manually and approved it.
**Model / mode:** Claude Opus 4.7 (1M context) via Claude Code.
**Command / skill:** `/bmad-dev-story`.

**Agent usage**
- What I asked the AI to do: execute the 9 tasks in the Story 1.5 spec — hand-author `apps/web/` workspace files (no interactive `npm create vite`), install React 19 + Vite 7 + Tailwind v4 + TanStack Query 5 + Vitest 3 + Testing Library v16, wire the CSS-first design tokens with `@theme`, set up the focus ring + reduced-motion rule, author Header + ErrorBoundary + App components with co-located unit tests, build a full-tree integration test and a computed-style token test, run typecheck + tests + a `build` smoke + a live dev-server smoke.
- Prompts that worked best: `/bmad-dev-story` alone drove the whole run — no mid-session prompts needed. Claude correctly picked up 1.5 after I'd approved 1.4, transitioned sprint-status.yaml accordingly, and held tight scope (no API client, no hooks, no axe-core, no Playwright, no `tailwind.config.js`).
- Sub-agents spawned: none.

**MCP server usage**
- None. Local tools + `npm` covered everything.

**Test generation**
- Tests the AI wrote (4 test files, 8 tests total; all passing under jsdom + Vitest 3):
  - `src/components/Header.test.tsx` — 2 tests: single `<h1>` with anchored regex `/^Todos$/`; heading contained inside `<header>` landmark (both use accessibility-first role queries).
  - `src/components/ErrorBoundary.test.tsx` — 3 tests: children render on happy path; fallback `<p>Something went wrong.</p>` renders when child throws on mount; `console.error` was called with the actual thrown `Error` instance (scanning `mock.calls` to survive React dev-mode's extra error log).
  - `src/App.test.tsx` — 1 integration test: full `<ErrorBoundary><QueryClientProvider><App /></…></…>` tree mounts; heading + banner + main landmarks present.
  - `src/styles/theme.test.tsx` — rewritten from the spec's original (see Limitations below); 2 tests covering `:root` custom-property readback + inline `var()` preservation.
- Gaps I noticed: no visual/regression test for the focus-ring (deferred to Playwright in 1.6); no assertion that the built CSS bundle actually contains the hex values (relied on manual `grep` against `dist/`); no test that StrictMode's double-invocation of `componentDidCatch` behaves as documented (spec called this out as a potential regression trigger but didn't write a test).

**Debugging with AI**
- **jsdom 26 doesn't resolve `var(--x)` through `getComputedStyle(el).color`** — first test run failed with `expected 'var(--color-fg)' to be 'rgb(26, 26, 26)'`. The spec's Dev Notes claimed jsdom supports this; it doesn't. Claude confirmed the jsdom version (26.1.0), inspected the source for any custom-property helpers (none present), and rewrote the assertion to read `getComputedStyle(document.documentElement).getPropertyValue('--color-fg')` + verify inline `style.color` preserves the `var()` reference. Same contract (tokens reach the DOM + import pipeline works), different API. One diagnostic pass, no back-and-forth.
- **Vite dev-server startup inside `apps/api` CWD** — an early invocation used `npm run dev --workspace apps/api` from an `apps/api/` CWD, which npm rejected with "No workspaces found". Claude dropped the `--workspace` flag and ran `npm run dev` directly (matching the CWD-sensitive workspace resolution). Trivial but illustrates the CWD gotcha when the shell state is sticky between sessions.

**Limitations encountered** *(what I caught in manual review that Claude missed on its own)*
- **Spec contained a factually-wrong premise about jsdom's `getComputedStyle`.** Claude's first implementation followed the Dev Notes verbatim; the failure surfaced the lie only at test-run time. Claude recovered quickly, but the pattern worth remembering: Dev Notes reference code snippets are authored at spec-time and can drift against the current runtime (env-schema in 1.4; jsdom in 1.5). Typecheck + test-run are the actual ground truth, not the spec.
- **`index.html` favicon link in Task 2 contradicted the scope-discipline section.** The Task 2 snippet included `<link rel="icon" href="/vite.svg" />` but the scope-discipline section explicitly said no `public/vite.svg`. Claude caught the contradiction at write-time and omitted the link; if Claude had followed the task snippet literally, we'd have shipped a 404 on every page load. Lesson: when story sections disagree, scope-discipline tends to be the more conservative / correct reading — but this requires reading BOTH sections, not just the task checklist.
- **DevTools-driven verification steps in Task 9 can't be automated from a CLI session.** "Open DevTools → Rendering → emulate prefers-reduced-motion" is a human-in-the-loop step; Claude correctly reported that it verified what it could (curl-based HTML/CSS smoke, `grep` of the built bundle, test suite) and left the DevTools checks as manual pre-merge work. Worth keeping in mind for future stories with browser-behavior ACs: document explicitly that the CLI-only smoke doesn't cover them.

---

### 2026-04-18 — Story 1.4 implementation + manual code review (`/bmad-dev-story`)

**Context:** I ran `/bmad-dev-story` to implement Story 1.4 end-to-end (Fastify plugin stack — cors/helmet/rate-limit/swagger/swagger-ui — `/v1` prefix mount with an empty `todosRoutes` placeholder, root global error handler with 400/404/409/500 branches, and a TypeBox `ErrorResponseSchema` registered via `app.addSchema`). I reviewed the change manually and approved it.
**Model / mode:** Claude Opus 4.7 (1M context) via Claude Code.
**Command / skill:** `/bmad-dev-story`.

**Agent usage**
- What I asked the AI to do: execute the 11 tasks in the Story 1.4 spec — install 8 new runtime deps, extend the env schema with `format: 'uri'` (closing the two deferred items from 1.2/1.3), author `src/schemas/errors.ts` + `src/errors/index.ts`, author 5 `fastify-plugin`-wrapped modules under `src/plugins/`, stub `src/routes/todos.ts`, wire everything into `buildApp` in the mandated order, extend `BuildAppOptions` with a test-only `registerTestRoutes` hook, update `app.test.ts`, add `test/plugins.integration.test.ts`, run typecheck + tests + live smoke.
- Prompts that worked best: `/bmad-dev-story` alone drove the whole run — spec was tight enough that no extra steering was needed. My single mid-session nudge was "add the coverage folder to gitignore" once I noticed `?? coverage/` in git status; a follow-up "git still wants to add them" was enough for Claude to spot that the files were already in the index and reach for `git restore --staged` rather than just editing the ignore file.
- Sub-agents spawned: none.

**MCP server usage**
- None. Local tools + `npm` + `docker compose` + `curl` covered everything.

**Test generation**
- Tests the AI wrote (15 new across 2 files; 30/30 pass total):
  - `src/plugins/error-handler.test.ts` — 4 unit tests against a throwaway `Fastify({ logger: false })` instance covering the 400/404/409/500 branches, including an explicit assertion that the 23505 safe message leaks no constraint name, column, or value.
  - `test/plugins.integration.test.ts` — 11 integration tests exercising the full `buildApp` chain: CORS preflight header, helmet defaults (with an explicit negative check that `content-security-policy` is absent), rate-limit `x-ratelimit-*` headers, `/docs` HTML marker, `/docs/json` shape (including `components.schemas.ErrorResponse`), `POST /v1/todos → 404` envelope, `/healthz` regression, unknown-route default 404, and three `__explode/*` routes injected via `registerTestRoutes` to round-trip NotFoundError / 23xxx / generic errors through the live handler.
  - `src/app.test.ts` — extended with a combined `hasRoute` check (`/healthz`, `/docs`, `!/v1/todos`), an ajv-formats URI-validation fail-fast test (`CORS_ORIGIN='not a uri'` must reject build), and two envelope tests.
- Gaps I noticed (acceptable for MVP): no test that actually exhausts the 300/min rate limit (skipped intentionally per spec — flaky in parallel CI); no assertion on helmet's exact header *values*; no test that `contentSecurityPolicy: false` was specifically the mechanism (only the absence of the CSP header end-to-end).

**Debugging with AI**
- **env-schema's `ajv` option shape didn't match the spec.** The Story 1.4 Dev Notes proposed `ajv: { customOptions: {}, plugins: [addFormats] }`, but TypeScript rejected it. Claude pulled up `env-schema`'s actual `EnvSchemaOpt` type (`Ajv | { customOptions(ajv): Ajv }`), read `chooseAjvInstance` in the source to confirm, and refactored to `ajv: { customOptions: (ajv) => { addFormats(ajv); return ajv; } }` — which is the shape env-schema v6 actually supports. No back-and-forth, one diagnosis.
- **`ajv-formats` default import was typed as non-callable under NodeNext.** Runtime `node --input-type=module` check confirmed the ESM namespace exposes the function at `.default`; Claude switched to `import * as addFormatsModule` + a one-line `as unknown as { default: ... }` cast. Typecheck clean, runtime verified.
- **`/docs/json` showed the ErrorResponse schema under `def-0` instead of its `$id`.** First integration-test run caught it. Claude traced it to `@fastify/swagger` v9's default `refResolver.buildLocalReference` returning `def-${i}`, and overrode it to return `json.$id` when present. `/docs/json` then listed `components.schemas.ErrorResponse` under the correct key — verified both in the integration test and live via `curl`.

**Limitations encountered** *(what I caught in manual review that Claude missed on its own)*
- **`coverage/` was committable because it was already staged.** Earlier sessions had run `git add`-style operations that picked up `apps/api/coverage/` into the index. Claude added `coverage/` to the root `.gitignore` but didn't notice that the files were already tracked (`A` in `git status`), so gitignore had no effect. I had to prompt "git still wants to add them" for Claude to reach for `git restore --staged`. The meta-lesson: when adding a pattern to `.gitignore`, always also check whether matching paths are already in the index — gitignore only affects *new* tracking, not already-added files.
- **Story 1.4 Dev Notes contained a factually wrong API shape for env-schema.** The spec described an `ajv.plugins: [addFormats]` option that doesn't exist in env-schema v6 (and never has). Claude noticed the TS error immediately, but if a human had copied the spec verbatim in a rush they'd have shipped a broken registration. Takeaway for future BMad specs: reference snippets in Dev Notes aren't authoritative — always let typecheck + runtime confirm the wiring rather than trusting the spec as gospel.

---

### 2026-04-18 — Story 1.3 implementation + manual code review (`/bmad-dev-story`)

**Context:** I ran `/bmad-dev-story` to implement Story 1.3 end-to-end (Kysely DB layer + `todos` migration + `/healthz` DB probe + tests + verification). I then did a manual code review and approved it after two rounds of feedback.
**Model / mode:** Claude Opus 4.7 (1M context) via Claude Code.
**Command / skill:** `/bmad-dev-story`.

**Agent usage**
- What I asked the AI to do: implement the 12 tasks in the Story 1.3 spec — install deps, author the DB layer (`src/db/{schema,index,migrate,migrations/*}.ts`), wire `app.db` + `onClose` hook into `buildApp`, upgrade `/healthz` with the `SELECT 1` probe, write the unit + integration test suite, run typecheck, run tests, run migrations, smoke `/healthz` live against a running/stopped/restarted Postgres, and update the story file.
- Prompts that worked best: `/bmad-dev-story` with no extra prompt did the whole thing autonomously — the story spec from the previous session was dense enough to drive the implementation without clarification rounds. Mid-session, my one-line cue "I cannot add the tests with coverage. a dependency is missing" was enough for Claude to diagnose (missing `@vitest/coverage-v8`) and fix without me pasting the error.
- Sub-agents spawned: none.

**MCP server usage**
- None. Local file tools + `npm` + `docker compose` + `curl` covered everything.

**Test generation**
- Tests the AI wrote (12 total across 5 files, all passing):
  - `src/app.test.ts` — 4 unit tests (route registration, healthz ok via `DummyDriver`, healthz degraded via custom `ThrowingDriver`, fail-fast on missing `DATABASE_URL`).
  - `src/db/index.test.ts` — 1 unit test (`CamelCasePlugin` compile-time check, no DB needed).
  - `test/db.migration.test.ts` — 4 integration tests (columns + types + nullability via `information_schema`, index via `pg_indexes`, `varchar(500)` length, idempotency).
  - `test/db.persistence.test.ts` — 1 integration test, local-only (insert → `docker compose restart postgres` → poll reconnect → re-query).
  - `test/health.integration.test.ts` — 2 integration tests (ok path via real `buildApp()`; degraded induced via `app.db.destroy()`).
- Gaps I noticed (still present after review): no test for the migration `down()` rollback path, no test for the `--reset` flag's non-local-URL guard (covered by manual smoke only), no runtime assertion that the Fastify `onClose` hook actually fires `db.destroy()` (relying on "vitest doesn't hang" as the signal).

**Debugging with AI**
- **"I cannot add the tests with coverage. a dependency is missing"** → Claude diagnosed `@vitest/coverage-v8` missing (Vitest 3.x ships coverage support as a separate package), installed `^3.2.4` matching the installed `vitest@3.2.4`, confirmed `npm audit` still clean. One exchange, no rework.
- **"health.ts is not covered by unit tests"** → Claude agreed the 100% in the coverage report was integration-only and built a `DummyDriver`-backed real `Kysely` for the ok-path unit test and a custom `ThrowingDriver` (implementing Kysely's `Driver` interface) for the degraded-path unit test. Unit-only run now reports `routes/health.ts` at 100% with no Postgres needed. 12/12 tests pass.

**Limitations encountered** *(what I caught in manual review that Claude missed on its own)*
- **Missing `@vitest/coverage-v8` dev dep.** Claude implemented the full test suite and declared the story done without ever running or considering coverage. The pattern worth remembering: "tests pass" is not the same as "tests pass AND coverage is measurable". For future test-heavy stories, I should either ask Claude up-front to sanity-check `--coverage` or add it to the story's verification checklist.
- **Misleading `routes/health.ts` coverage report.** Claude reported `health.ts` at 100% as a win without noticing the number was dependency-ridden — the 100% held *only because the integration tests were running*, which require live Postgres. Anyone running `vitest src/` alone would see 0%. The meta-lesson: a coverage percentage can lie silently when a file is reached only through integration tests — always check what the unit-only run looks like if probes or routes have been moved across the unit-vs-integration boundary.

---

### 2026-04-18 — Story 1.3 story-creation (`/bmad-create-story`)

**Context:** I ran the BMad create-story workflow to produce a dev-ready spec for Story 1.3 (Kysely DB layer + `todos` migration + `/healthz` DB probe).
**Model / mode:** Claude Opus 4.7 (1M context) via Claude Code.
**Command / skill:** `/bmad-help` → `/bmad-create-story`.

**Agent usage**
- What I asked the AI to do: auto-discover the next backlog story from `sprint-status.yaml`, cross-reference the epic + architecture + PRD + Story 1.2's implementation and review findings, inspect the live `apps/api/` state, and draft a comprehensive story file with tasks, ACs, reference shapes, scope-discipline notes, test strategy, and a pre-review verification checklist. Then bump `sprint-status.yaml` to `ready-for-dev`.
- Prompts that worked best: `/bmad-create-story` ran end-to-end from a single invocation — no extra clarification needed. The preceding `/bmad-help` gave me a situational read ("you're in Phase 4 Implementation, 1.2 is done, 1.3 is next") with reasoning, which let me jump straight to the next action.
- Sub-agents spawned: none. The work was Read/Grep/Edit-heavy with a clear target artifact — main context was more efficient than parallel agents.

**MCP server usage**
- None. Claude stuck to local file tools; external MCPs (Linear, Notion, Atlassian, etc.) weren't relevant for a local-only training project.

**Test generation**
- Tests designed in the spec (the dev-story session wrote the actual code):
  - 4 unit tests in `src/app.test.ts` (stub-DB-based — this approach later needed revision during implementation).
  - 1 unit test in `src/db/index.test.ts` for the CamelCasePlugin via Kysely's `.compile()`.
  - 2 integration tests for migration (schema + idempotency).
  - 1 CI-conditional test for `docker compose restart` durability.
  - 2 integration tests for `/healthz` ok + degraded against a real `buildApp()`.
- Gaps I noticed in the spec: no test for the migration `down()` rollback, no formal test for the `--reset` flag's non-local-URL guard, no test for `onClose` hook firing `db.destroy()`. I didn't ask Claude to add these — they were acceptable gaps for an MVP story.

**Debugging with AI**
- n/a — spec-only session, no code executed.

**Limitations encountered** *(what I caught at the time)*
- n/a — I did not review the spec before running `/bmad-dev-story` against it. No issues surfaced during this session on my side.
