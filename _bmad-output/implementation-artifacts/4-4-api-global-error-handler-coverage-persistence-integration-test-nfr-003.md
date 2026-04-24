# Story 4.4: API global error handler coverage + persistence integration test (NFR-003)

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want the API's global error handler and persistence contract verified by integration tests,
so that NFR-003 (zero loss across refresh/close/restart) and NFR-004 (error resilience) are proven, not assumed.

**Scope boundary (critical):** This is an API-side story. The web workspace is untouched. The story adds two NEW API integration test files + extends unit-level error-handler tests where specific gaps exist + verifies the CI pipeline actually runs these tests against a real Postgres service container.

**Dependency note:** This story is independent of Stories 4.1/4.2/4.3 (those are web-side). It can land in parallel with or ahead of the web-side work. However, the full NFR-004 coverage claim in AC11 requires 4.2 and 4.3 to have landed in some form — AC11 is a coverage-matrix verification, not new code.

## Acceptance Criteria

### Error-handler coverage via real routes

1. **AC1 — `apps/api/test/integration.errors.test.ts` exists and runs against a real Postgres.**
   **Given** a new file at `apps/api/test/integration.errors.test.ts`,
   **When** `npm test --workspace @todo-app/api` runs,
   **Then** the file boots a Fastify app via `buildApp()`, runs `migrateLatest(app.db)` in `beforeAll`, truncates `todos` in `beforeEach`, closes the app in `afterAll` — exactly the pattern used by `contract.todos.test.ts`,
   **And** the file contains all test cases enumerated in AC2–AC6.

2. **AC2 — `PATCH /v1/todos/<non-existent-id>` → 404 via real todosRepo path.**
   **Given** a freshly-migrated empty `todos` table,
   **When** the test injects `PATCH /v1/todos/00000000-0000-7000-8000-000000000000` with a valid body `{ completed: true }`,
   **Then** the response is `404` with envelope `{ statusCode: 404, error: 'Not Found', message: "Todo 00000000-0000-7000-8000-000000000000 not found" }`,
   **And** the message matches the literal `NotFoundError` text thrown by `todosRepo.update` (`apps/api/src/repositories/todosRepo.ts:55-56`) — this proves the real-route error path trips the global handler end-to-end.

3. **AC3 — `DELETE /v1/todos/<non-existent-id>` → 404 via real route path.**
   **Given** the same empty table,
   **When** the test injects `DELETE /v1/todos/00000000-0000-7000-8000-000000000000`,
   **Then** the response is `404` with envelope `{ statusCode: 404, error: 'Not Found', message: "Todo 00000000-0000-7000-8000-000000000000 not found" }` — this validates the `affected === 0` guard in `apps/api/src/routes/todos.ts:77-80` that throws the `NotFoundError` from the route (NOT the repo — DELETE's 404 path is route-layer, not repo-layer; the two 404 paths are structurally different and both deserve a real-route test).

4. **AC4 — `POST /v1/todos` with TypeBox-invalid body → 400, no stack trace, no raw error object leaked.**
   **Given** the same empty table,
   **When** the test injects `POST /v1/todos` with each of these invalid bodies: (a) missing `description`, (b) `{ description: '' }`, (c) `{ description: 'x'.repeat(501) }`, (d) `{ description: 'ok', extra: 'field' }`,
   **Then** each response is `400` with envelope `{ statusCode: 400, error: 'Bad Request', message: <some structured string> }`,
   **And** the response body contains NO `stack` property, NO `stack trace` substring, and NO reference to an Ajv/TypeBox internal class name (regex check: body as JSON string must not match `/stack|Ajv|TypeBox/i` for any of the four cases).

5. **AC5 — Real Postgres `23505` constraint violation → 409 with safe message (no leakage).**
   **Given** the `todos` primary-key constraint is in place (from `apps/api/src/db/migrations/*`),
   **When** the test registers a test-only route via `buildApp({ registerTestRoutes })` that inserts the SAME id twice via `app.db.insertInto('todos')` within one request (guaranteed 23505),
   **Then** GET-ing that test route returns `409` with envelope `{ statusCode: 409, error: 'Conflict', message: 'Conflict — the request violates a database constraint.' }`,
   **And** the response body's JSON text contains NO mention of `todos_pkey`, NO mention of the conflicting id, NO `duplicate key` phrase, NO `detail` field (regex check on the serialized response: must not match `/todos_pkey|duplicate key|detail/i`).
   **Note:** This proves the `isPgError` + `code.startsWith('23')` branch at `apps/api/src/plugins/error-handler.ts:30-36` fires for a REAL pg-driver error (not just a synthetic `Object.assign(new Error, { code: '23505' })` like the existing `plugins.integration.test.ts:141` covers). Keep that existing synthetic test — it's orthogonal coverage. This AC adds runtime-driver proof on top.

6. **AC6 — Generic `Error` thrown in a test route → 500 generic envelope AND full error captured in pino log.**
   **Given** a test-only route registered via `registerTestRoutes` that throws `new Error('synthetic-boom-<random>')` with a unique marker in the message,
   **When** the test injects `GET` against that route,
   **Then** the response is `500` with envelope `{ statusCode: 500, error: 'Internal Server Error', message: 'Internal server error' }`,
   **And** the response body's JSON text does NOT contain the `'synthetic-boom-*'` marker (generic message discipline),
   **And** a `vi.spyOn(app.log, 'error')` set up BEFORE the inject call has been called at least once with a payload whose `err` field is the original `Error` instance carrying the unique marker (verifies the pino log record contains the original error — explicitly required by the AC beyond what `plugins.integration.test.ts:163-180` currently asserts).

### Persistence integration

7. **AC7 — `apps/api/test/integration.persistence.test.ts` exists and proves app-close/rebuild preserves data.**
   **Given** a new file at `apps/api/test/integration.persistence.test.ts`,
   **When** the test runs (locally against the docker-compose Postgres OR in CI against the `services.postgres` container),
   **Then** the test:
   - Calls `buildApp()` → `migrateLatest(app.db)` → `truncateTodos(app.db)` in `beforeEach` style to produce a known-empty start.
   - Creates three todos via three `POST /v1/todos` inject calls, capturing the full response body for each: `{ id, description, completed, createdAt, userId }`.
   - Calls `app.close()` on the first instance — simulating a server process stop (drops the DB pool; the underlying Postgres data in the `pg-data` volume is unchanged).
   - Builds a NEW `buildApp()` instance (pointed at the same `DATABASE_URL`).
   - Issues `GET /v1/todos` on the fresh instance.
   - Asserts the response status is `200` and contains EXACTLY three items.
   - Asserts each returned item's `{ id, description, completed, createdAt, userId }` equals the captured pre-close values BY DEEP EQUALITY — not by containment. If Postgres reformats a timestamp or Kysely rounds a microsecond, the test must fail.
   - Asserts the returned order matches the pre-close insertion order (they were all `completed: false`, so FR-002's `completed ASC, createdAt ASC` ordering is a stable `createdAt ASC`).

8. **AC8 — The persistence test does NOT `skipIf(CI === 'true')`.**
   **Given** the similar file `apps/api/test/db.persistence.test.ts:17` uses `describe.skipIf(process.env.CI === 'true')` to avoid the docker-compose-restart dependency,
   **When** `integration.persistence.test.ts` is authored,
   **Then** it MUST run on CI (no `skipIf`) — the app-close/rebuild pattern has no docker dependency and MUST execute against the GitHub service-container Postgres. A `describe` or `it` that inadvertently skips on CI fails this AC.

### CI pipeline enforcement

9. **AC9 — CI runs both integration files against `services.postgres` with a healthcheck gate.**
   **Given** the existing `.github/workflows/ci.yml` already declares `services.postgres` with `options: --health-cmd "pg_isready -U postgres -d todo_app"` (lines 15–22 of the current file),
   **When** the CI run reaches the `Unit + a11y tests` step (`npm test`),
   **Then** both `integration.errors.test.ts` and `integration.persistence.test.ts` execute AND pass,
   **And** the run fails fast if Postgres is unreachable — Vitest must PROPAGATE the `DATABASE_URL`-missing / `ECONNREFUSED` error as a test failure, NOT silently skip.
   **Verification:** the story's Task 3 below adds a manual sanity check (temporarily break the postgres service to verify red-path behavior, then revert) — or at minimum documents in PR description that the author ran `CI=true DATABASE_URL=postgresql://bogus-host:0000/nope npm test --workspace @todo-app/api` locally and observed fast-fail.

10. **AC10 — Manual smoke for the `pg-data` named-volume contract (documented, not automated).**
    **Given** the UX spec / epic AC calls for verifying `docker compose down` (no `-v`) + `docker compose up -d postgres` + `GET /v1/todos` preserves todos (NFR-003 boundary 3: server restart),
    **When** the implementer runs the following sequence locally:
    1. `docker compose up -d postgres`
    2. `npm run migrate --workspace apps/api`
    3. `npm run dev --workspace apps/api` (in one terminal)
    4. `curl -X POST http://localhost:3000/v1/todos -H 'content-type: application/json' -d '{"description":"persist me"}'` — capture the returned id
    5. Kill the api dev server (Ctrl-C)
    6. `docker compose down` (NO `-v` flag — preserves the `pg-data` named volume)
    7. `docker compose up -d postgres`
    8. `npm run dev --workspace apps/api` (restart)
    9. `curl http://localhost:3000/v1/todos`
    **Then** the response contains the todo created at step 4 with identical fields,
    **And** the implementer records the observation in the story's **Completion Notes List** with the captured id and timestamps. This is a manual-gate AC — it is NOT an automated test in this story, and `integration.delete.persistence.test.ts` + `db.persistence.test.ts` already cover orthogonal slices.

### Coverage matrix verification

11. **AC11 — After this story, the NFR-004 coverage matrix is complete.**
    **Given** the full test suite (api + web) after Stories 4.1–4.4 land,
    **When** a coverage-matrix audit is performed (manual walk-through, documented in **Completion Notes List**),
    **Then** every CRUD verb has at least ONE happy-path contract test AND at least ONE fault-injection test — specifically:
    - POST (create) — happy: `contract.todos.test.ts`; fault (web-side): `App.integration.test.tsx` create-failure test from Story 4.2; fault (api-side): this story's `integration.errors.test.ts` AC4 (TypeBox validation 400 coverage).
    - GET (list) — happy: `contract.todos.test.ts`; fault: not applicable (list cannot 404; AC5 of this story proves the Postgres-connection-loss path via 23xxx surrogate).
    - PATCH (toggle) — happy: `contract.todos.test.ts`; fault (web-side): `App.integration.test.tsx` toggle-failure test + Playwright `journey-3-toggle-fail.spec.ts` from Story 4.3; fault (api-side): this story's AC2 (404).
    - DELETE (delete) — happy: `contract.todos.test.ts`; fault (web-side): `App.integration.test.tsx` delete-failure test + Playwright `journey-3-delete-fail.spec.ts` from Story 4.3; fault (api-side): this story's AC3 (404).
    - Every fault-injection test asserts the error envelope shape AND (where applicable) that no data was lost or corrupted (the web-side tests check input preservation + revert; the api-side tests check envelope structure + no-leakage).

### Gates + scope

12. **AC12 — All gates green; diff stays scoped.**
    **When** `npm run typecheck && npm test && npm run build` run in the `@todo-app/api` workspace (plus the full root `npm test` if run),
    **Then** all pass. The diff lists exactly:
    - **New:** `apps/api/test/integration.errors.test.ts`
    - **New:** `apps/api/test/integration.persistence.test.ts`
    - **Modified (if needed):** `apps/api/src/plugins/error-handler.test.ts` OR a new test section inline — ONLY if AC6's logger-capture pattern requires a unit-level example the dev prefers to extract. Treat this as optional; skip if the integration test's logger capture is sufficient.
    - **Modified:** `_bmad-output/implementation-artifacts/sprint-status.yaml` (status transition — happens outside the story diff via `code-review`).
    - **Modified:** this story file's **File List** + **Completion Notes List**.
    - **NOT modified:** `apps/api/src/plugins/error-handler.ts`, `apps/api/src/routes/todos.ts`, `apps/api/src/repositories/todosRepo.ts`, any migration, any web file, `.github/workflows/ci.yml` (CI already has the right shape — no workflow edits needed; just verify per AC9).

## Tasks / Subtasks

### Error-handler coverage

- [ ] **Task 1 — Create `integration.errors.test.ts` (AC: 1, 2, 3, 4, 5, 6)**
  - [ ] Create `apps/api/test/integration.errors.test.ts`.
  - [ ] Top-of-file: mirror `contract.todos.test.ts` imports (`beforeAll`, `afterAll`, `beforeEach`, `describe`, `expect`, `it` from vitest; `buildApp` from `../src/app.js`; `migrateLatest`, `truncateTodos` from `./setup.js`; `FastifyInstance` type from fastify).
  - [ ] Lifecycle:
    ```ts
    let app: FastifyInstance;
    beforeAll(async () => {
      app = await buildApp({
        registerTestRoutes: async (testApp) => {
          testApp.get('/__explode/pg-duplicate', async () => {
            const id = '01927f00-0000-7000-8000-000000c0ffee';
            await app.db.insertInto('todos')
              .values({ id, description: 'A', completed: false, userId: null })
              .execute();
            await app.db.insertInto('todos')
              .values({ id, description: 'B', completed: false, userId: null })
              .execute(); // 23505 PRIMARY KEY violation
          });
          testApp.get('/__explode/generic', async () => {
            throw new Error('synthetic-boom-4-4');
          });
        },
      });
      await migrateLatest(app.db);
    });
    afterAll(async () => { await app.close(); });
    beforeEach(async () => { await truncateTodos(app.db); });
    ```
  - [ ] **AC2 — PATCH 404 via real route:**
    ```ts
    it('PATCH /v1/todos/<non-existent-uuid> → 404 with NotFoundError envelope', async () => {
      const missing = '00000000-0000-7000-8000-000000000000';
      const res = await app.inject({
        method: 'PATCH',
        url: `/v1/todos/${missing}`,
        payload: { completed: true },
      });
      expect(res.statusCode).toBe(404);
      expect(res.json()).toEqual({
        statusCode: 404,
        error: 'Not Found',
        message: `Todo ${missing} not found`,
      });
    });
    ```
  - [ ] **AC3 — DELETE 404 via real route:** Mirror AC2 with method `DELETE` and same assertion shape.
  - [ ] **AC4 — POST 400 with no leakage:** use `it.each` for the four payloads listed in AC4. Assert statusCode 400, envelope shape, AND `JSON.stringify(body)` does NOT match `/stack|Ajv|TypeBox/i`.
  - [ ] **AC5 — Real pg 23505 via test route:**
    ```ts
    it('real Postgres 23505 (PK violation) → 409 with safe message, no leakage', async () => {
      const res = await app.inject({ method: 'GET', url: '/__explode/pg-duplicate' });
      expect(res.statusCode).toBe(409);
      expect(res.json()).toEqual({
        statusCode: 409,
        error: 'Conflict',
        message: 'Conflict — the request violates a database constraint.',
      });
      const raw = res.body;
      expect(raw).not.toMatch(/todos_pkey/i);
      expect(raw).not.toMatch(/duplicate key/i);
      expect(raw).not.toMatch(/\bdetail\b/i);
      expect(raw).not.toMatch(/0+-0000-7000-8000-000000c0ffee/);
    });
    ```
  - [ ] **AC6 — Generic 500 with logger capture:**
    ```ts
    it('generic Error thrown in a test route → 500 generic envelope; pino logger receives the original error', async () => {
      const logSpy = vi.spyOn(app.log, 'error');
      const res = await app.inject({ method: 'GET', url: '/__explode/generic' });
      expect(res.statusCode).toBe(500);
      expect(res.json()).toEqual({
        statusCode: 500,
        error: 'Internal Server Error',
        message: 'Internal server error',
      });
      expect(res.body).not.toContain('synthetic-boom-4-4');
      const matchingCall = logSpy.mock.calls.find(([arg]) => {
        return typeof arg === 'object'
          && arg !== null
          && arg.err instanceof Error
          && arg.err.message === 'synthetic-boom-4-4';
      });
      expect(matchingCall, 'expected pino to receive the original Error via { err }').toBeDefined();
      logSpy.mockRestore();
    });
    ```
    — import `vi` alongside the other vitest hooks at the top of the file.
  - [ ] Do NOT test the 400 / 404 / 409 / 500 mapping through synthetic `__explode` routes that merely mock pg shapes — that coverage already lives in `plugins.integration.test.ts`. This story's value-add is REAL-ROUTE + REAL-PG coverage plus logger verification.

### Persistence across app close + rebuild

- [ ] **Task 2 — Create `integration.persistence.test.ts` (AC: 7, 8)**
  - [ ] Create `apps/api/test/integration.persistence.test.ts`.
  - [ ] Imports: vitest hooks, `buildApp` from `../src/app.js`, `migrateLatest`, `truncateTodos` from `./setup.js`. No `FastifyInstance` type needed in the outer scope; it's a per-test-local variable.
  - [ ] Test shape (do not use a shared `app` in `beforeAll` — the whole point is a close + rebuild cycle within one `it`):
    ```ts
    describe('app close + rebuild preserves todos (FR-011 / NFR-003 boundary 2)', () => {
      it('3 todos created via POST survive app.close() + fresh buildApp() with identical shape and order', async () => {
        // Phase 1: build, migrate, truncate.
        const first = await buildApp();
        try {
          await migrateLatest(first.db);
          await truncateTodos(first.db);

          const created: Array<{ id: string; description: string; completed: boolean; createdAt: string; userId: null }> = [];
          for (const description of ['First todo', 'Second todo', 'Third todo']) {
            const res = await first.inject({ method: 'POST', url: '/v1/todos', payload: { description } });
            expect(res.statusCode).toBe(201);
            created.push(res.json());
          }

          expect(created).toHaveLength(3);
        } finally {
          await first.close();
        }

        // Phase 2: fresh app instance, same DATABASE_URL (implicit via env).
        const second = await buildApp();
        try {
          const res = await second.inject({ method: 'GET', url: '/v1/todos' });
          expect(res.statusCode).toBe(200);
          const listed = res.json() as Array<unknown>;
          expect(listed).toHaveLength(3);
          // Deep-equality assertion — the spread is intentional to avoid order-keyed implicit assumptions.
          expect(listed).toEqual(
            expect.arrayContaining(created.map((t) => expect.objectContaining(t))),
          );
          // Order assertion — FR-002 is completed ASC, createdAt ASC; all three have completed=false,
          // so insertion order is the expected order.
          expect((listed as Array<{ description: string }>).map((t) => t.description)).toEqual([
            'First todo',
            'Second todo',
            'Third todo',
          ]);
        } finally {
          await second.close();
        }
      });
    });
    ```
  - [ ] Verify the capture (`const created = res.json()`) carries ALL five fields: `id`, `description`, `completed`, `createdAt`, `userId`. Use `expect(created[0]).toEqual(expect.objectContaining({ id: expect.any(String), description: 'First todo', completed: false, createdAt: expect.any(String), userId: null }))` as an additional guard before the close.
  - [ ] **Critical:** NO `describe.skipIf(process.env.CI === 'true')`. The `db.persistence.test.ts` skip is CI-specific because docker-compose isn't available there; this test has no docker dependency and MUST run in CI.

### CI enforcement + manual smoke

- [ ] **Task 3 — Verify CI enforcement (AC: 9)**
  - [ ] Read `.github/workflows/ci.yml` and confirm ALL of:
    - `services.postgres` is declared with `image: postgres:16-alpine` and a `--health-cmd pg_isready` options block.
    - `env.DATABASE_URL` is set to the in-CI postgres URL at the job level.
    - `npm run migrate --workspace apps/api` runs BEFORE `npm test`.
    - `npm test` is a root-level script that runs all workspaces (sanity-check: open `/Users/lucicondescu/work/training/aine/todo-app/package.json` at the repo root to confirm).
  - [ ] Do NOT edit `ci.yml`. The current shape is correct — this task is verification, not modification. If anything seems off, escalate via a PR comment rather than silently patching.
  - [ ] Red-path sanity (local, optional but strongly recommended): run `DATABASE_URL=postgresql://bogus:bogus@127.0.0.1:9999/nope npm test --workspace @todo-app/api` and confirm the new integration files fail FAST (ECONNREFUSED or similar connection error) rather than skipping.

- [ ] **Task 4 — Manual docker-compose-down smoke (AC: 10)**
  - [ ] Run the sequence enumerated in AC10 (steps 1–9) locally.
  - [ ] Record in **Completion Notes List**: (a) the POST response id, (b) the timestamp at step 5 (Ctrl-C) and step 8 (restart), (c) confirmation that the GET at step 9 returned the todo with identical fields.
  - [ ] If the manual smoke fails — the todo disappears — DO NOT file a bug silently. The pg-data volume binding is a load-bearing NFR-003 contract; a failure here is an epic-level blocker.

### Coverage + gates

- [ ] **Task 5 — Coverage-matrix walkthrough (AC: 11)**
  - [ ] Walk the matrix in AC11 one row at a time, opening each referenced test file and confirming the assertion exists.
  - [ ] Record the walkthrough in **Completion Notes List** as a short table (verb × happy × api-fault × web-fault).
  - [ ] Flag in **Completion Notes List** any row where the referenced test doesn't yet exist because the upstream story (4.2 or 4.3) hasn't landed — that's a coverage gap owned by the OTHER story, NOT this one. Do NOT write placeholder tests here for missing 4.2/4.3 coverage.

- [ ] **Task 6 — Verify gates (AC: 12)**
  - [ ] `npm run typecheck --workspace @todo-app/api` → pass.
  - [ ] `npm test --workspace @todo-app/api` → all pre-existing + 2 new integration files pass.
  - [ ] `npm run build --workspace @todo-app/api` → pass (this workspace has no build step today beyond typecheck; if `build` is unavailable, skip — capture note in Completion Notes List).
  - [ ] Root-level `npm test` → all workspaces pass.
  - [ ] `git diff --stat` lists exactly the files in AC12's enumeration. In particular: NO changes to `apps/api/src/`, `apps/web/`, or `.github/`.

- [ ] **Task 7 — Story hygiene**
  - [ ] Update **Dev Agent Record → File List** with actual paths.
  - [ ] Fill **Completion Notes List** with: AC10 smoke observation (id + timestamps), AC11 matrix walkthrough, any deviations.
  - [ ] Run `code-review` to move the story to `review`.

## Dev Notes

### Why `integration.errors.test.ts` coexists with `plugins.integration.test.ts` (and doesn't duplicate it)

- `plugins.integration.test.ts:122-181` already round-trips `NotFoundError`, pg-23505 (synthetic), and generic-Error through `buildApp()` via `registerTestRoutes` — but it uses SYNTHETIC error shapes (`Object.assign(new Error(...), { code: '23505', detail: '...' })`) for the pg branch and doesn't verify the pino log payload for the 500 branch.
- Story 4.4's `integration.errors.test.ts` adds DIFFERENT evidence:
  - Real-route 404 via `todosRepo.update` (AC2) and the DELETE route's `affected === 0` guard (AC3).
  - Real-DB 23505 via a double-insert that forces the pg driver to surface an error with the actual `.code` field populated by the pg client library (AC5).
  - Explicit pino-logger capture that asserts the original `Error` instance reached the log stream (AC6).
- Do NOT delete any tests in `plugins.integration.test.ts`. Complementary coverage is not redundant.

### Why pg 23505 is tested via double-insert (not crafted migration conflict)

- The epic AC offers two options: "forced via a crafted migration conflict or a direct repo call." The crafted-migration path requires editing migrations, risking real-schema drift for test purposes — a net negative.
- A double-insert with a fixed id inside one request is self-contained, reversible (truncate after), and deterministic. The pg driver's 23505 error shape is exactly what the handler's `isPgError(error) && error.code.startsWith('23')` check needs.
- The fixed id used in Task 1 (`01927f00-0000-7000-8000-000000c0ffee`) is UUID-v7-shaped but does NOT clash with any existing fixture — the truncate-before-each step ensures cleanliness.

### Why `vi.spyOn(app.log, 'error')` is the right logger-capture primitive

- pino's output is a Node `Writable` stream. Replacing it after buildApp would require reaching into the Fastify instance's internals and re-initializing pino — fragile and version-coupled.
- `vi.spyOn` against the exposed `app.log.error` method is the idiomatic Fastify + vitest pattern (already used in `error-handler.test.ts:80`). It captures the call signature, including the `{ err: Error }` object that the handler passes.
- The `find(([arg]) => arg.err instanceof Error && ...)` pattern in Task 1's AC6 sketch is deliberately shape-tolerant: pino's call signature is `log.error(obj, msg)` where `obj` may have an `err` field OR may be the error directly (pino de-serializes `Error` under the `err` key by convention, and the handler at `apps/api/src/plugins/error-handler.ts:38` writes `{ err: error }`).
- Always `mockRestore()` the spy at end-of-test to avoid polluting later cases if the file grows.

### Why `integration.persistence.test.ts` does NOT reuse `beforeAll` / shared app

- The whole contract under test is *"a FRESH `buildApp()` instance, pointed at the same DATABASE_URL, reads the prior instance's writes."* A shared `app` in `beforeAll` obscures the close/rebuild boundary — the test becomes ambiguous about whether the second read is served from the same pg connection pool or a truly new one.
- Each `it` block builds, migrates, truncates, creates, closes, rebuilds, reads, and closes. That's explicit and auditable.
- The try/finally blocks ensure `app.close()` runs even if a mid-test assertion fails — otherwise a Kysely pool leak accumulates across runs and slows subsequent tests.

### Why NO `skipIf(CI === 'true')` on this story's persistence test

- `db.persistence.test.ts` skips on CI because it runs `docker compose restart postgres` via child-process — that command doesn't exist on the GitHub runner (CI uses a service container, not docker-compose).
- `integration.persistence.test.ts` has NO docker dependency. It opens two Fastify apps against the same `DATABASE_URL`. On CI, `DATABASE_URL` is set by the job env to the services.postgres container — both `buildApp` calls point there. The close+rebuild cycle is 100% in-process.
- If a future refactor adds docker shelling to this file, the `skipIf` becomes valid; until then, running on CI is the whole point.

### Why the manual `docker compose down` smoke is NOT automated here

- AC10 is boundary 3 of NFR-003 ("Postgres container recreated, volume preserved"). Automating it requires shelling out to `docker compose` from a test — brittle, slow (`down` + `up` takes ~5–10s per run), and redundant with `db.persistence.test.ts:33-60` which already exercises the container-restart-via-docker-compose path.
- What `db.persistence.test.ts` does NOT prove: that `docker compose down` (stop + REMOVE container, not just restart) preserves the `pg-data` volume. The distinction matters — `down` removes the container AND any associated anonymous volumes, but leaves NAMED volumes like `pg-data` intact. This is a one-line docker-compose.yml promise that's easy to break and hard to detect.
- The manual smoke surfaces that regression once per story — acceptable MVP discipline. Revisit automation in Epic 5 if needed.

### Previous Story Intelligence

**From Story 1.4 (global error handler) — load-bearing:**
- `apps/api/src/plugins/error-handler.ts` is the single mapping function. Four branches: validation → 400, `NotFoundError` → 404, pg `23xxx` → 409 safe, else → 500 logged. This story does NOT modify the handler; it proves its behavior end-to-end.
- `error-handler.test.ts` already has unit-level coverage for all four branches. The integration test adds the end-to-end binding.

**From Story 2.1 (TypeBox schemas + create route) — directly consumed:**
- TypeBox validation is active at the route layer; AC4's four invalid-body cases trip the Fastify validator, which the global handler maps to 400. This means NO need for a test-only throwing route for the 400 case — use the real `POST /v1/todos`.

**From Story 3.1 (update route + NotFoundError path) — directly consumed:**
- `todosRepo.update` throws `NotFoundError` when the row doesn't exist. AC2 exercises this path.

**From Story 3.2 (delete route + route-layer NotFoundError) — directly consumed:**
- The DELETE route explicitly throws `NotFoundError` after checking `affected === 0`. AC3 exercises this. Note the architectural asymmetry: update's NotFoundError is repo-layer; delete's is route-layer. Both reach the global handler identically — the integration test proves that.

**From Story 1.3 (Kysely + migrations + `pg-data` volume) — load-bearing:**
- The `todos` primary-key constraint is defined in `apps/api/src/db/migrations/*`. AC5's double-insert relies on that PK being enforced. If a future migration drops the PK (it shouldn't), AC5 fails loudly — which is the right behavior.
- The `pg-data` named volume is defined in `docker-compose.yml`. AC10's manual smoke verifies this binding.

**From Story 3.5 (`integration.delete.persistence.test.ts`) — adjacent, not duplicated:**
- That file tests: insert 2 todos → DELETE one → close app → rebuild → GET returns only the kept one.
- This story's `integration.persistence.test.ts` tests: insert 3 via POST → close → rebuild → GET returns all 3 with identical shape + order.
- Distinct shapes; keep both.

**From Story 1.6 (CI pipeline) — verification only:**
- `.github/workflows/ci.yml` is already wired for the right shape (postgres service, migrate step, vitest run). Task 3 verifies; does not edit.

### Git Intelligence

- Recent commit rhythm (most-recent-first): `feat: story 3.4 implemented`, `feat: story 3.3 implemented`, etc. Use `feat: story 4.4 implemented`.
- File-scope discipline — Story 4.4 touches EXACTLY these files:
  1. `apps/api/test/integration.errors.test.ts` (NEW)
  2. `apps/api/test/integration.persistence.test.ts` (NEW)
  3. `_bmad-output/implementation-artifacts/sprint-status.yaml` (status transition — handled by `create-story` + dev-story)
  4. `_bmad-output/implementation-artifacts/4-4-api-global-error-handler-coverage-persistence-integration-test-nfr-003.md` (this file's File List + Completion Notes sections)
- `git diff --stat` at the end of implementation should match exactly. NO edits to `src/` files in either workspace; NO edits to `ci.yml` or `docker-compose.yml`.
- **No new dependencies.** Vitest, Fastify, Kysely, pg, uuid, `@fastify/env`, and everything the test harness needs is already installed (see `apps/api/package.json`).
- **No migration changes.** **No runtime-code changes.**

### Latest Tech Information

- **Fastify 5 `buildApp({ registerTestRoutes })`:** the hook is already in place at `apps/api/src/app.ts:24,73-75`. It runs AFTER plugins + error-handler are registered but BEFORE the real `/v1` routes — test routes therefore inherit the error handler and can throw at will.
- **Vitest `vi.spyOn` on async method chains:** the spy works on the synchronous call-signature of `app.log.error(obj, msg?)`. pino's logger is sync-writing to its destination by default, so the spy captures the call immediately on each `log.error(...)` invocation.
- **Kysely + pg error shape (23505):** when a unique-constraint-violating insert runs, the pg node client throws an error with `code: '23505'`, `constraint: 'todos_pkey'`, `detail: 'Key (id)=(...) already exists.'`, and a stringified `message` that includes `duplicate key value violates unique constraint "todos_pkey"`. The handler only reads `.code` — no other field is inspected. The AC's no-leakage assertion reads the serialized envelope body to prove NONE of the sensitive fields round-trip to the client.
- **UUID v7 format in test fixtures:** the fixed id used for the double-insert (`01927f00-0000-7000-8000-000000c0ffee`) is UUID-v7-SHAPED but is a synthetic value, not time-derived. It passes the format check (`/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i`) so the PATCH route's TypeBox param validation accepts it for AC2. Any UUID-v7-shaped string works; this particular one was chosen for memorable hex-grep-ability (`c0ffee`).

### Project Structure Notes

**New (2 test files):** `integration.errors.test.ts` + `integration.persistence.test.ts` in `apps/api/test/`. Placement aligns with `architecture.md:534-539` (integration tests live in the app's `test/` folder).

**Alignment with `architecture.md:626-628` (FR-010 / FR-011 requirement-to-test mapping):**
- FR-010 inline error + retry — "integration.errors.test.ts (API) + component test (web)". This story delivers the API half.
- FR-011 persistence — "integration.persistence.test.ts". This story delivers the file named in the mapping table.

**Alignment with `architecture.md:637` (NFR-004 verification location):** `plugins/error-handler.ts` + `integration.errors.test.ts`. This story fills in the second half.

**No new infrastructure.** Reuse `buildApp`, `migrateLatest`, `truncateTodos`, and `getTestDbUrl` from the existing `test/setup.ts`.

### Testing Standards

- **Integration (API):** Two new files under `apps/api/test/`. Both consume `buildApp()` + real Postgres + real migrations. Both MUST run in CI against `services.postgres`.
- **Unit (API):** No new unit tests required. `error-handler.test.ts` already covers the mapping function; Story 4.4's logger-capture assertion lands in the integration test (AC6) to prove the END-TO-END wiring, not just the mapping-function shape.
- **E2E (Playwright):** None. User-visible fault recovery is covered by Stories 4.2 + 4.3; this story's integration coverage is the API-side backstop (epic AC reiterates this explicitly).
- **Lifecycle hygiene:** each `it` in `integration.persistence.test.ts` builds and closes its own apps (no shared `app` in `beforeAll`). `integration.errors.test.ts` uses the shared `app` with per-test truncate, matching `contract.todos.test.ts`.
- **No snapshot tests.** Continue the project's explicit-assertion discipline.
- **Coverage target:** every branch in `error-handler.ts` hit by at least one integration test. The generic-500 branch is covered by AC6; AC5 covers the pg-23xxx branch; AC2/AC3 cover the `NotFoundError` branch via real routes; AC4 covers the validation branch via TypeBox. The handler's four branches = four test scenarios in `integration.errors.test.ts`.

### References

- Epic requirements: `_bmad-output/planning-artifacts/epics.md` § Story 4.4 (lines 1284–1340)
- Architecture — Error handling process pattern: `_bmad-output/planning-artifacts/architecture.md` § Process Patterns → Error handling (lines 398–411)
- Architecture — Requirements-to-Structure Mapping (FR-010, FR-011): `_bmad-output/planning-artifacts/architecture.md` § Requirements-to-Structure Mapping (lines 626–628)
- Architecture — NFR-003 / NFR-004 verification locations: `_bmad-output/planning-artifacts/architecture.md` § Non-Functional Requirements (lines 636–638)
- Architecture — Project structure (test placement): `_bmad-output/planning-artifacts/architecture.md` § Project Structure (lines 534–539)
- PRD — FR-010 (inline error + retry), FR-011 (persistence), NFR-003 (durability), NFR-004 (error resilience): `_bmad-output/planning-artifacts/PRD.md`
- Global error handler implementation: `apps/api/src/plugins/error-handler.ts`
- Existing unit-level handler tests: `apps/api/src/plugins/error-handler.test.ts`
- Existing integration handler tests (synthetic routes + buildApp): `apps/api/test/plugins.integration.test.ts:122-181`
- `NotFoundError` definition: `apps/api/src/errors/index.ts`
- todosRepo update/remove paths that throw `NotFoundError`: `apps/api/src/repositories/todosRepo.ts:43-57` and `apps/api/src/routes/todos.ts:77-80`
- Existing `buildApp` + `registerTestRoutes` hook: `apps/api/src/app.ts:21-86`
- Existing test-setup helpers (`migrateLatest`, `truncateTodos`, `getTestDbUrl`): `apps/api/test/setup.ts`
- Existing DELETE-close-rebuild pattern (adjacent, not duplicated): `apps/api/test/integration.delete.persistence.test.ts`
- Existing docker-restart pattern (CI-skipped, orthogonal): `apps/api/test/db.persistence.test.ts`
- CI workflow: `.github/workflows/ci.yml` (services.postgres + migrate step)
- Previous story — `integration.delete.persistence.test.ts` pattern source: `./3-5-deletetodomodal-component-app-tsx-delete-flow-journey-2-complete.md`
- Previous story — web-side fault coverage (for AC11 matrix): `./4-2-create-failure-flow-addtodoinput-inline-error-with-preserved-input-retry.md`
- Previous story — web-side fault coverage (for AC11 matrix): `./4-3-toggle-failure-row-anchored-error-delete-failure-modal-anchored-error.md`

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
