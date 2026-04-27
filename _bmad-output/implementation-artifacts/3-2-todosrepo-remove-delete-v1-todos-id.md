# Story 3.2: `todosRepo.remove` + `DELETE /v1/todos/:id`

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want to delete a todo via the API,
So that confirmed deletions remove the record permanently.

## Acceptance Criteria

**AC1 — `todosRepo.remove(id, db)` exported from `apps/api/src/repositories/todosRepo.ts`**
- **Given** `todosRepo.ts` already exports `create`, `listAll`, and `update` (Stories 2.1, 2.2, 3.1)
- **When** the engineer inspects the file
- **Then** a new `async function remove(id: string, db: Kysely<Database>): Promise<number>` is exported alongside the existing three functions
- **And** it executes a **single** Kysely DELETE statement: `db.deleteFrom('todos').where('id', '=', id).executeTakeFirstOrThrow()`
- **And** it returns `Number(result.numDeletedRows)` — `1` when a row was deleted, `0` when no row matched (non-existent `id`) — Kysely's `DeleteResult.numDeletedRows` is a `bigint`, so it is coerced to `number` at the repo boundary
- **And** it does **NOT** throw `NotFoundError` on zero rows — the epic explicitly specifies the repo returns the affected-row count (`0` or `1`) and the route maps `0 → 404` (see AC2). This is the deliberate contrast to `update` (which throws in the repo) — see Dev Notes → "Why `remove` returns a number but `update` throws"
- **And** it does **NOT** import `NotFoundError` for its own use (the route imports it); the existing `NotFoundError` import at the top of `todosRepo.ts` (added by Story 3.1 for `update`) stays as-is and remains the only caller
- **And** `remove` never imports `Kysely` from `db/index.ts` — `db` is passed in as an argument (same pattern as `create` / `listAll` / `update`)
- **And** `create`, `listAll`, and `update` exports remain untouched

**AC2 — `DELETE /v1/todos/:id` handler registered in `apps/api/src/routes/todos.ts`**
- **Given** `todosRoutes` already registers `POST /todos` (Story 2.1), `GET /todos` (Story 2.2), and `PATCH /todos/:id` (Story 3.1) using `typedApp = app.withTypeProvider<TypeBoxTypeProvider>()`
- **When** the engineer inspects the file
- **Then** the `params: Type.Object({ id: Type.String({ format: 'uuid' }) }, { additionalProperties: false })` literal used in the PATCH route is lifted to a **module-level constant** `TodoIdParamsSchema` declared between the imports and the `todosRoutes` plugin body; the PATCH route is updated to reference it; the new DELETE route references it too — see Dev Notes → "Why the id-params schema is now a module-level constant"
- **And** a new `typedApp.delete('/todos/:id', { schema: { params, response } }, handler)` is added to the **same plugin** — the existing `typedApp` alias is reused (do NOT call `.withTypeProvider` again)
- **And** the route schema is exactly:
  ```ts
  {
    params: TodoIdParamsSchema,
    response: {
      204: Type.Null({ description: 'No Content' }),
      400: { $ref: 'ErrorResponse#' },
      404: { $ref: 'ErrorResponse#' },
    },
  }
  ```
- **And** the handler body is:
  ```ts
  async (request, reply) => {
    const affected = await todosRepo.remove(request.params.id, app.db);
    if (affected === 0) {
      throw new NotFoundError(`Todo ${request.params.id} not found`);
    }
    return reply.status(204).send();
  }
  ```
  — the `NotFoundError` import is added to `routes/todos.ts` (not previously needed there); no try/catch; no inline Kysely query; no body schema (DELETE does not accept a body in MVP)
- **And** on success, the response is `204` with an empty body (see AC3)
- **And** the `/v1` prefix continues to come from `app.register(todosRoutes, { prefix: '/v1' })` in `app.ts`; inside the plugin the path stays `'/todos/:id'`
- **And** the trailing comment `// Handler for DELETE /todos/:id lands in story 3.2.` is **removed** (all four CRUD handlers are now registered)

**AC3 — 204 response semantics on successful DELETE**
- **Given** the DELETE handler from AC2 and an existing row
- **When** a client issues `DELETE /v1/todos/<valid-id>` against an existing row
- **Then** the response status is `204`
- **And** the response body is empty — `res.body` is `''` (Fastify strips any payload on 204; `reply.status(204).send()` with no payload is the idiomatic Fastify 204)
- **And** the `content-length` response header is either `'0'` or absent (Fastify's behavior depends on the underlying HTTP lib; both are acceptable 204 semantics per RFC 7230 — the contract test asserts "empty body or content-length 0", not one specific header)
- **And** the response does **NOT** include a JSON body (no `application/json` body, no `{}`) — a 204 body would violate RFC 7230 §3.3.2
- **And** Fastify's response serializer (`fast-json-stringify`) is **not** invoked on 204 (no body, no serialization) — declaring `204: Type.Null({ description: 'No Content' })` is purely for OpenAPI documentation, not runtime validation

**AC4 — Validation failures return `400` via the global error handler**
- **Given** the `params` schema `TodoIdParamsSchema` from AC2
- **When** a client issues `DELETE /v1/todos/not-a-uuid` (path param fails `format: 'uuid'`)
- **Then** the response is `400` with `{ statusCode: 400, error: 'Bad Request', message: <AJV detail> }` — identical envelope and code path as PATCH's 400 (`plugins/error-handler.ts:14-20` maps `error.validation` → 400)
- **And** the route handler runs **before** `todosRepo.remove` is invoked — no DB query is issued on the 400 path (the AJV validation hook runs ahead of the handler)
- **And** there is **no** `body` schema on the DELETE route — the HTTP spec allows DELETE to carry a body but semantics are undefined; Fastify without a body schema accepts any body (or none) and ignores it. A request `DELETE /v1/todos/<valid-id>` with a body `{ "x": 1 }` returns `204` (valid path param, body ignored) — intentional, documented in Dev Notes → "Why DELETE has no body schema"
- **And** no bespoke try/catch is added in the route — all 400 paths go through the existing global error handler

**AC5 — Non-existent id returns `404` with `Todo <id> not found` via the global error handler**
- **Given** a valid UUID shape that does not match any row (e.g., `00000000-0000-0000-0000-000000000000`)
- **When** a client issues `DELETE /v1/todos/00000000-0000-0000-0000-000000000000`
- **Then** `todosRepo.remove` runs the DELETE, `executeTakeFirstOrThrow` returns `{ numDeletedRows: 0n }`, the repo returns `0`, the route's `if (affected === 0)` branch throws `new NotFoundError('Todo 00000000-0000-0000-0000-000000000000 not found')`
- **And** the global error handler maps `NotFoundError` → `{ statusCode: 404, error: 'Not Found', message: 'Todo 00000000-0000-0000-0000-000000000000 not found' }` (already verified by `plugins/error-handler.test.ts:36-51` and re-exercised end-to-end by Story 3.1's PATCH 404 contract test — this story adds the DELETE 404 round-trip in AC6)
- **And** the 404 message echoes the **path param** `id` verbatim — same rule as PATCH (FR-010: user-facing error clarity); `${request.params.id}` in the `NotFoundError` constructor expansion must not be masked or sanitized (the id already passed `format: 'uuid'` validation, so it is not an injection vector)
- **And** the route handler does NOT construct a different message template (e.g., `Todo ${id} already gone` or `Record not found`) — the `Todo ${id} not found` string is a versioned contract asserted in AC6

**AC6 — Contract test at `apps/api/test/contract.todos.test.ts` extended with `DELETE /v1/todos/:id` block**
- **Given** the contract test file already contains `describe('POST /v1/todos — contract', ...)`, `describe('GET /v1/todos — contract', ...)`, and `describe('PATCH /v1/todos/:id — contract', ...)` blocks
- **When** the engineer extends the file
- **Then** a new `describe('DELETE /v1/todos/:id — contract', () => { ... })` block is added **at the end of the file**; it **reuses** the existing module-level `beforeAll(buildApp + migrateLatest)` / `afterAll(app.close)` / `beforeEach(truncateTodos)` lifecycle — do NOT open a second `FastifyInstance`
- **And** seeding happens via direct Kysely insert (not via `todosRepo.create` and not via the POST route) — same idiom as the PATCH block (`contract.todos.test.ts:237-246`)
- **And** the block asserts:
  1. **Happy path: `DELETE /v1/todos/<existing-id>` returns 204** — `expect(res.statusCode).toBe(204)`
  2. **Empty body on 204** — `expect(res.body).toBe('')` (Fastify's `res.body` is the raw response body string; an empty string is the exact expectation for 204 — no `null`, no `undefined`, no `{}`)
  3. **Content-length signals no body** — `expect(res.headers['content-length']).toMatch(/^(0|)$/)` OR `expect(['0', undefined]).toContain(res.headers['content-length'])` — either `'0'` or absent satisfies the 204 contract; the test must accept both to avoid coupling to Fastify/Node version internals
  4. **Row deleted from Postgres** — after the DELETE, a direct Kysely `selectFrom('todos').where('id', '=', id).executeTakeFirst()` returns `undefined` (FR-011 persistence guard at the DELETE boundary)
  5. **GET list excludes deleted row** — after the DELETE, `GET /v1/todos` body does not contain the deleted `id` (end-to-end view-layer confirmation; complements the direct-Kysely check because it exercises both layers)
  6. **Invalid path param (`format: 'uuid'` violated) → 400** — `DELETE /v1/todos/not-a-uuid` returns `400` with `{ statusCode: 400, error: 'Bad Request' }`
  7. **Non-existent id → 404 with exact id-echoing message** — `DELETE /v1/todos/00000000-0000-0000-0000-000000000000` returns `404` with body `{ statusCode: 404, error: 'Not Found', message: 'Todo 00000000-0000-0000-0000-000000000000 not found' }` — use `toEqual(...)` not `toMatchObject(...)` so the **exact** message is asserted (the template string is the contract)
  8. **Second DELETE of the same id → 404** — delete a row once (returns 204), then DELETE the same id again → `404` + same id-echoing message (proves the hard-delete is permanent and idempotency is NOT provided — this is a deliberate contract, not a gap)
  9. **Body on DELETE is ignored (does NOT produce 400)** — `DELETE /v1/todos/<existing-id>` with a JSON body `{ "x": 1 }` still returns `204` (documents that DELETE has no body schema — see AC4 and Dev Notes → "Why DELETE has no body schema")
- **And** the `/docs/json` route does NOT need a new assertion for DELETE — no new TypeBox schema was registered (the 204/400/404 all use primitives or existing `$ref: 'ErrorResponse#'`), so `components.schemas` is unchanged. The DELETE operation still appears in `paths./v1/todos/{id}.delete` automatically via Fastify's swagger plugin (verified by a manual Swagger UI spot-check, not a dedicated test assertion)
- **And** tests run against **real Postgres** via the `migrateLatest` + `truncateTodos` helpers from `apps/api/test/setup.ts` — no mocks, no DummyDriver (DummyDriver lives in the co-located unit tests)

**AC7 — Unit tests for `todosRepo.remove` in `apps/api/src/repositories/todosRepo.test.ts`**
- **Given** co-located unit tests already cover `create`, `listAll`, and `update` via `DummyDriver` + `SeedingDriver` helpers
- **When** `npm test --workspace apps/api` runs
- **Then** `todosRepo.test.ts` adds two new `describe` blocks:
  1. **`todosRepo.remove — compiled DELETE shape (DummyDriver)`** — compiles `db.deleteFrom('todos').where('id', '=', 'some-id')` via `DummyDriver` and asserts:
     - `compiled.sql` matches `/delete\s+from\s+"todos"/i`
     - `compiled.sql` matches `/where\s+"id"\s+=/i`
     - `compiled.sql` does **NOT** match `/returning/i` (remove does not use RETURNING — we read `numDeletedRows` from the driver result, not from row data)
     - `compiled.parameters` equals `['some-id']` (one parameter, the id; ordering is deterministic)
  2. **`todosRepo.remove — behavior (SeedingDriver happy path + zero-rows)`** — uses the existing `SeedingDriver` pattern from the file, with a key adaptation: DELETE's `executeTakeFirstOrThrow()` consumes a `DeleteResult` (`{ numDeletedRows: bigint }`), not a row. Two cases:
     - **one-row case:** override the driver's `executeQuery` to return `{ rows: [], numAffectedRows: 1n, numChangedRows: 1n }` (this is the shape Kysely's Postgres driver uses to populate `DeleteResult.numDeletedRows`) OR return `{ rows: [{ numDeletedRows: 1n } as unknown as R] }` if the simpler shape works against Kysely 0.28.x's DeleteResult-building path. **If** the Kysely version in use populates `DeleteResult` from `numAffectedRows` on the `QueryResult`, use that field; **otherwise** seed `rows: [{ numDeletedRows: 1n }]` (verify at test-write time which shape Kysely consumes — see Dev Notes → "How Kysely builds `DeleteResult` from the driver's `QueryResult`"). Assert `await todosRepo.remove('existing-id', db)` resolves to `1` (a `number`, not a `bigint`; verify with `typeof result === 'number'`)
     - **zero-rows case:** override the driver to return `{ rows: [], numAffectedRows: 0n, numChangedRows: 0n }` (or the equivalent shape). Assert `await todosRepo.remove('ghost-id', db)` resolves to `0` — explicitly **does not** throw (contrast with `update`'s zero-rows case which DOES throw)
- **And** tests import the existing `createDummyDb()` and `createSeedingDb(...)` helpers from the top of the file (no new helpers needed)
- **And** the `numDeletedRows` bigint → number coercion is **asserted** in the happy-path test — the repo's return type is `Promise<number>`, not `Promise<bigint>`; a regression that returns the raw bigint would fail the `expect(result).toBe(1)` assertion (because `1n !== 1`) AND the `typeof result === 'number'` assertion
- **And** `NotFoundError` is **not** imported in the `remove` tests (the repo does not throw it) — the existing `NotFoundError` import at the top of the file stays for the `update` tests; do not add a stray reference to it in the `remove` describe blocks

**AC8 — Regression assertion in `apps/api/src/app.test.ts`**
- **Given** `src/app.test.ts:71-81` asserts `POST /v1/todos`, `GET /v1/todos`, `PATCH /v1/todos/:id` are registered (plus `/healthz`, `/docs`) via `app.hasRoute(...)`
- **When** the engineer updates this file
- **Then** the `registers the ... routes` test gains one new assertion:
  ```ts
  expect(app.hasRoute({ method: 'DELETE', url: '/v1/todos/:id' })).toBe(true);
  ```
  immediately after the existing PATCH assertion
- **And** the test's title is updated to `registers the /healthz, /docs, POST /v1/todos, GET /v1/todos, PATCH /v1/todos/:id, and DELETE /v1/todos/:id routes`
- **And** no other `app.test.ts` cases require changes (DummyDriver-backed happy-path assertions for POST/GET are orthogonal to the DELETE path; DELETE behavior is exercised against real Postgres in the contract test, not here)
- **And** `test/plugins.integration.test.ts` is **not** modified — it covers cross-plugin wiring; none of that changes for DELETE

**AC9 — Delete-survives-app-restart integration test at `apps/api/test/integration.delete.persistence.test.ts`**
- **Given** the epic AC specifies "Given a row is deleted and the server is restarted, When `GET /v1/todos` is called after restart, Then the deleted row does NOT appear" — this is the FR-011 / NFR-003 durability contract at the DELETE boundary
- **Given** the existing `test/db.persistence.test.ts` covers the **Postgres** restart path (docker compose restart; skipped in CI); the epic's "server restart" language here means the **app** restart path (Fastify `app.close()` → `buildApp()` rebuild against the same Postgres + `pg-data` volume) — see Dev Notes → "What `server is restarted` means in this AC"
- **When** the engineer creates the new file
- **Then** the file follows the existing integration-test lifecycle:
  ```ts
  // Module-level: no beforeAll; each `it` builds, exercises, closes.
  import { afterEach, describe, expect, it } from 'vitest';
  import type { FastifyInstance } from 'fastify';
  import { buildApp } from '../src/app.js';
  import { migrateLatest, truncateTodos } from './setup.js';

  describe('DELETE /v1/todos/:id — persistence across app restart', () => {
    let app: FastifyInstance | undefined;

    afterEach(async () => {
      if (app) {
        await app.close();
        app = undefined;
      }
    });

    it('a deleted row does not reappear after app close + rebuild (FR-011 / NFR-003)', async () => {
      // --- Arrange: build app, run migrations, truncate, seed two rows ---
      app = await buildApp();
      await migrateLatest(app.db);
      await truncateTodos(app.db);

      const KEEP = '01927f00-0000-7000-8000-0000000000d1';
      const DELETE_ME = '01927f00-0000-7000-8000-0000000000d2';

      await app.db
        .insertInto('todos')
        .values([
          { id: KEEP, description: 'Keep me', completed: false, userId: null },
          { id: DELETE_ME, description: 'Delete me', completed: false, userId: null },
        ])
        .execute();

      // --- Act 1: delete one row via the API ---
      const delRes = await app.inject({ method: 'DELETE', url: `/v1/todos/${DELETE_ME}` });
      expect(delRes.statusCode).toBe(204);

      // --- Act 2: close the app, rebuild a fresh instance against the same DB ---
      await app.close();
      app = await buildApp();

      // --- Assert: GET list on the new app does not include the deleted row ---
      const listRes = await app.inject({ method: 'GET', url: '/v1/todos' });
      expect(listRes.statusCode).toBe(200);
      const body = listRes.json() as Array<{ id: string }>;
      const ids = body.map((t) => t.id);
      expect(ids).toContain(KEEP);
      expect(ids).not.toContain(DELETE_ME);
    });
  });
  ```
- **And** the test uses `await app.close()` then `buildApp()` to simulate "server restart" — the `pg-data` volume (on disk) preserves the delete across the app's connection pool teardown; a successful rebuild of a new app reads the same committed state
- **And** the test does **NOT** run migrations a second time (the fresh app connects to an already-migrated DB); `migrateLatest` is idempotent but redundant on the rebuild
- **And** the test does **NOT** need `docker compose restart postgres` — data durability across the app boundary (the concern AC9 targets) does not require a DB-process restart; that is the `db.persistence.test.ts` concern
- **And** per-test isolation is handled by `truncateTodos` before seeding (NOT in `beforeEach` — this file has only one test; local truncation is explicit)

## Tasks / Subtasks

- [x] **Task 1: Extend `apps/api/src/repositories/todosRepo.ts` with `remove`** (AC: 1)
  - [x] Append to the existing file (preserve `create`, `listAll`, `update` verbatim; keep all existing imports):
    ```ts
    export async function remove(id: string, db: Kysely<Database>): Promise<number> {
      const result = await db
        .deleteFrom('todos')
        .where('id', '=', id)
        .executeTakeFirstOrThrow();
      return Number(result.numDeletedRows);
    }
    ```
  - [x] **Why `.executeTakeFirstOrThrow()`:** a DELETE in Kysely's Postgres dialect always produces exactly one `DeleteResult`; `.executeTakeFirstOrThrow()` surfaces a driver-level bug (no result at all) as a thrown error rather than silently returning `undefined`. `.execute()` returning an array and taking `[0]` is equivalent but costs an array allocation. `.executeTakeFirst()` would force an `if (!result)` guard for a case that doesn't occur in Postgres.
  - [x] **Why `Number(result.numDeletedRows)`:** Kysely exposes `numDeletedRows` as a `bigint` (Postgres returns `int8` for affected-row counts). Callers expect a plain `number` (route does `affected === 0`; `0 === 0n` is `false` in strict equality). The range of affected rows is trivially within `Number.MAX_SAFE_INTEGER` for a by-id delete, so the coercion is lossless and safe.
  - [x] **Why no `NotFoundError` thrown here:** the epic's explicit shape is "repo returns count, route maps to NotFoundError". See Dev Notes → "Why `remove` returns a number but `update` throws".
  - [x] **Do NOT** wrap the delete in a transaction — a single DELETE is atomic in Postgres by default (same rule as `create` and `update`).
  - [x] **Do NOT** add a `.returningAll()` clause — `remove`'s return value is the affected-row count, not row data. Adding `.returningAll()` is a free query but wastes bandwidth and noises the compiled SQL assertion (AC7 case 1 asserts `/returning/` does NOT appear).
  - [x] **Do NOT** add a `findById(id)` call before the delete — one-statement deletion + zero-rows handling is the race-free idiom (same rationale as Story 3.1 `update`; Dev Notes → "Why one DELETE + zero-rows check is the right pattern").
  - [x] **Do NOT** extract a shared `rowToTodo(row)` helper now — `remove` doesn't serialize a `Todo`; it returns a count. The deferred helper extraction (tracked in `deferred-work.md` per Story 3.1's Dev Notes) remains deferred.

- [x] **Task 2: Add `DELETE /v1/todos/:id` handler in `apps/api/src/routes/todos.ts`** (AC: 2)
  - [x] Extend the imports at the top:
    ```ts
    import { NotFoundError } from '../errors/index.js';
    ```
    (`CreateTodoInputSchema`, `TodoSchema`, `UpdateTodoInputSchema`, `Type`, `FastifyPluginAsync`, `TypeBoxTypeProvider`, `todosRepo` are already imported)
  - [x] Lift the id-params schema to a module-level constant, declared **above** `todosRoutes`:
    ```ts
    const TodoIdParamsSchema = Type.Object(
      { id: Type.String({ format: 'uuid' }) },
      { additionalProperties: false },
    );
    ```
  - [x] Update the PATCH route to reference `TodoIdParamsSchema` instead of the inline `Type.Object(...)` literal:
    ```ts
    typedApp.patch(
      '/todos/:id',
      {
        schema: {
          params: TodoIdParamsSchema, // ← was: Type.Object({ id: Type.String({ format: 'uuid' }) }, { additionalProperties: false })
          body: UpdateTodoInputSchema,
          response: {
            200: TodoSchema,
            400: { $ref: 'ErrorResponse#' },
            404: { $ref: 'ErrorResponse#' },
          },
        },
      },
      async (request) => {
        return todosRepo.update(request.params.id, request.body, app.db);
      },
    );
    ```
    — pure refactor; no behavioral change. PATCH's existing contract tests (Story 3.1 AC6) continue to pass.
  - [x] Add the DELETE handler immediately after the PATCH block and **remove** the trailing comment line:
    ```ts
    typedApp.delete(
      '/todos/:id',
      {
        schema: {
          params: TodoIdParamsSchema,
          response: {
            204: Type.Null({ description: 'No Content' }),
            400: { $ref: 'ErrorResponse#' },
            404: { $ref: 'ErrorResponse#' },
          },
        },
      },
      async (request, reply) => {
        const affected = await todosRepo.remove(request.params.id, app.db);
        if (affected === 0) {
          throw new NotFoundError(`Todo ${request.params.id} not found`);
        }
        return reply.status(204).send();
      },
    );
    ```
  - [x] Delete the line `// Handler for DELETE /todos/:id lands in story 3.2.` — it is now obsolete (the DELETE handler exists directly above).
  - [x] **Why `return reply.status(204).send()` and not `reply.code(204); return null;`:** Fastify's `reply.status(204).send()` (or `reply.code(204).send()`) explicitly terminates the response with no body and no serializer invocation. Returning `null` from the handler would ask `fast-json-stringify` to serialize `null` against `Type.Null()` — legal, but then Fastify would emit `null` as a 3-byte body, violating RFC 7230 §3.3.2 (204 MUST NOT have a body). The `reply.send()` path short-circuits the serializer.
  - [x] **Why `return reply.status(204).send()` and not just `reply.status(204).send()`:** returning the reply signals to Fastify's async-handler contract that the handler is complete. Without the return, Fastify may interpret the promise resolution (to `undefined`) as a request to send `undefined` on top of the already-sent 204 — a second `.send()` call produces a FST_ERR_REP_ALREADY_SENT warning. Always `return reply.send(...)` from async Fastify handlers that terminate via `reply`.
  - [x] **Why `NotFoundError` is thrown in the route, not returned as a 404 directly via `reply.code(404).send(...)`:** the global error handler owns all non-200 responses. Bypassing it to call `reply.code(404).send({ ... })` duplicates the envelope construction and drifts from the PATCH 404 path (which throws). Consistency matters for both contract tests AND future error-handler changes (e.g., adding a trace-id field).
  - [x] **Why `TodoIdParamsSchema` is a module-level constant (not per-route inline):** Story 3.1's Dev Notes flagged "lifting the params schema into a shared constant in that story (premature DRY in this one)". Story 3.2 is that story. PATCH + DELETE + any future `/todos/:id`-scoped route (e.g., `GET /v1/todos/:id` if post-MVP) all want the same `{ id: uuid, additionalProperties: false }` shape; one declaration, three references.
  - [x] **Why `TodoIdParamsSchema` lives in `routes/todos.ts` and not `schemas/todo.ts`:** the schemas file holds domain-level TypeBox schemas (the `Todo` resource + its input variants). Path-param schemas are route-level concerns — they exist only because routes have `:id` slots. Keeping them in the routes file also means the schema is NOT `addSchema`-registered in the swagger plugin (no `$id`), which is correct — path params are not reusable components in OpenAPI's sense (they inline under `paths.*.parameters`).
  - [x] **Why no `body` schema on DELETE:** the MVP contract accepts `DELETE /v1/todos/:id` with no body. HTTP allows DELETE to carry a body but its semantics are undefined (RFC 7231 §4.3.5). Declaring `body: Type.Null()` or `body: Type.Undefined()` would add `400` paths for clients that happen to send an empty `{}` — strictly unnecessary, and UI/API-client authors (Story 3.3 `useDeleteTodo`) would have to ensure no body is sent. Easier: no body schema = body is ignored. The contract test asserts this explicitly (AC6 case 9).
  - [x] **Do NOT** add `reply.type('application/json')` on the 204 path — there's no body; content-type is meaningless. Fastify omits the header on 204.
  - [x] **Do NOT** add a `try/catch` around `todosRepo.remove(...)` — the global error handler maps `NotFoundError` → 404 (`plugins/error-handler.ts:22-28`). Catching in the route either swallows (bad) or re-throws (pointless).
  - [x] **Do NOT** accept optimistic-UI assumptions in this story's route (e.g., "maybe the client already removed the row from its cache — return 204 on 404 so the UI stays consistent"). That is an anti-pattern: the server should tell the truth. Optimistic-UI revert-on-failure (Story 3.3) is a web-side concern; the API must still 404 on a real miss. FR-010's inline-error surface depends on 404 truthfulness.

- [x] **Task 3: Extend unit tests in `apps/api/src/repositories/todosRepo.test.ts`** (AC: 7)
  - [x] Add a new compiled-SQL describe block after the existing `todosRepo.update — compiled UPDATE shape (DummyDriver)` block:
    ```ts
    describe('todosRepo.remove — compiled DELETE shape (DummyDriver)', () => {
      it('compiles to DELETE FROM "todos" WHERE "id" = $1 with no RETURNING clause', () => {
        const db = createDummyDb();
        const compiled = db.deleteFrom('todos').where('id', '=', 'some-id').compile();

        expect(compiled.sql).toMatch(/delete\s+from\s+"todos"/i);
        expect(compiled.sql).toMatch(/where\s+"id"\s+=/i);
        expect(compiled.sql).not.toMatch(/returning/i);
        expect(compiled.parameters).toEqual(['some-id']);
      });
    });
    ```
  - [x] Add a behavior describe block after the compiled-SQL block. **Before writing:** run a quick REPL-style check (or inspect `node_modules/kysely/dist/esm/query-builder/delete-result.js`) to confirm whether Kysely 0.28.x builds `DeleteResult.numDeletedRows` from `QueryResult.numAffectedRows` (the common Postgres path) or from an inline row (`rows: [{ numDeletedRows }]`). The existing `SeedingDriver.executeQuery` returns `{ rows: [seedRow as R] }` — for DELETE it must return the driver-level affected-row count. In Kysely's postgres adapter, the driver returns `{ rows: [], numAffectedRows: <bigint> }` and `DeleteResult.numDeletedRows` is populated from `numAffectedRows`. Pattern:
    ```ts
    describe('todosRepo.remove — behavior (SeedingDriver)', () => {
      function createDeleteResultDb(numAffectedRows: bigint): Kysely<Database> {
        const driver = new SeedingDriver({});
        driver.acquireConnection = async () => ({
          executeQuery: async () => ({ rows: [], numAffectedRows }),
          // eslint-disable-next-line require-yield -- interface contract
          streamQuery: async function* () {
            throw new Error('unused');
          },
        });
        return new Kysely<Database>({
          dialect: {
            createAdapter: () => new PostgresAdapter(),
            createDriver: () => driver,
            createIntrospector: (innerDb) => new PostgresIntrospector(innerDb),
            createQueryCompiler: () => new PostgresQueryCompiler(),
          },
          plugins: [new CamelCasePlugin()],
        });
      }

      it('returns 1 when one row is deleted (bigint → number coercion)', async () => {
        const db = createDeleteResultDb(1n);
        const affected = await todosRepo.remove('existing-id', db);
        expect(affected).toBe(1);
        expect(typeof affected).toBe('number'); // guard against bigint regression
      });

      it('returns 0 when no rows match (non-existent id) — does NOT throw', async () => {
        const db = createDeleteResultDb(0n);
        const affected = await todosRepo.remove('ghost-id', db);
        expect(affected).toBe(0);
        expect(typeof affected).toBe('number');
      });
    });
    ```
  - [x] **Why `{ rows: [], numAffectedRows: Xn }` as the driver shape:** this matches what Kysely's postgres adapter receives from `pg` when running a plain DELETE (no RETURNING) — the protocol returns "command complete" with `DELETE N`, which `pg` surfaces as `rowCount: N`, which Kysely maps into `QueryResult.numAffectedRows: bigint`. Kysely's delete query builder then exposes it as `DeleteResult.numDeletedRows`. If `numAffectedRows` on the driver result is falsy/missing, Kysely may fall back to `rows.length` — that behavior is version-specific and fragile to rely on. The explicit `numAffectedRows` is the stable contract.
  - [x] **Why the happy-path test asserts `typeof affected === 'number'`:** regression-guards the `Number(result.numDeletedRows)` coercion. A sloppy refactor that returned `result.numDeletedRows` directly would leak a `bigint`, which would pass `expect(affected).toBe(1n)` if the test asserted `1n` — but the repo's contract is `number`. The explicit `typeof` check is cheap and catches this class of regression.
  - [x] **Why the zero-rows test asserts `toBe(0)` AND does NOT use `.rejects`:** this is the key behavioral difference from `update`. `update`'s zero-rows test uses `.rejects.toThrow(NotFoundError)` because `update` throws. `remove` does NOT throw on zero rows — it returns `0`. Writing `.rejects.toThrow(...)` here would be a serious logic error (the test would fail because no promise rejection occurs).
  - [x] **Do NOT** import `NotFoundError` into the `remove` test blocks — the existing import at line 15 of `todosRepo.test.ts` stays for `update` tests. Adding a second import would be flagged by ESLint's `no-duplicate-imports`. Removing it would break `update` tests. Leave it alone.
  - [x] **Do NOT** add an integration test (real Postgres) here — this file is the unit layer. Real-DB assertions live in `test/contract.todos.test.ts` (Task 4) and `test/integration.delete.persistence.test.ts` (Task 5).

- [x] **Task 4: Extend contract test at `apps/api/test/contract.todos.test.ts`** (AC: 6)
  - [x] Add a new `describe('DELETE /v1/todos/:id — contract', () => { ... })` block **at the end of the file** (after `PATCH /v1/todos/:id — contract`). Reuse the module-level `app`, `beforeAll`, `afterAll`, `beforeEach` — do NOT duplicate them.
  - [x] Body template (adapt UUID literals as preferred; keep assertion intent):
    ```ts
    describe('DELETE /v1/todos/:id — contract', () => {
      const T_EXIST = '01927f00-0000-7000-8000-000000000021';
      const T_KEEP = '01927f00-0000-7000-8000-000000000022';
      const GHOST = '00000000-0000-0000-0000-000000000000';

      async function seed() {
        await app.db
          .insertInto('todos')
          .values([
            { id: T_EXIST, description: 'To be deleted', completed: false, userId: null },
            { id: T_KEEP, description: 'Stays', completed: false, userId: null },
          ])
          .execute();
      }

      it('returns 204 with empty body on valid existing id', async () => {
        await seed();
        const res = await app.inject({ method: 'DELETE', url: `/v1/todos/${T_EXIST}` });

        expect(res.statusCode).toBe(204);
        expect(res.body).toBe('');
        // content-length is either '0' or absent — both satisfy RFC 7230 for 204
        expect(['0', undefined]).toContain(res.headers['content-length']);
      });

      it('removes the row from Postgres (direct Kysely read confirms)', async () => {
        await seed();
        await app.inject({ method: 'DELETE', url: `/v1/todos/${T_EXIST}` });

        const row = await app.db
          .selectFrom('todos')
          .selectAll()
          .where('id', '=', T_EXIST)
          .executeTakeFirst();

        expect(row).toBeUndefined();
      });

      it('excludes the deleted row from GET /v1/todos (end-to-end view)', async () => {
        await seed();
        await app.inject({ method: 'DELETE', url: `/v1/todos/${T_EXIST}` });

        const listRes = await app.inject({ method: 'GET', url: '/v1/todos' });
        expect(listRes.statusCode).toBe(200);
        const body = listRes.json() as Array<{ id: string }>;
        const ids = body.map((t) => t.id);
        expect(ids).toContain(T_KEEP);
        expect(ids).not.toContain(T_EXIST);
      });

      it('returns 400 on invalid path param (format: uuid violated)', async () => {
        const res = await app.inject({ method: 'DELETE', url: '/v1/todos/not-a-uuid' });

        expect(res.statusCode).toBe(400);
        expect(res.json()).toMatchObject({ statusCode: 400, error: 'Bad Request' });
      });

      it('returns 404 with exact id-echoing message on non-existent id', async () => {
        const res = await app.inject({ method: 'DELETE', url: `/v1/todos/${GHOST}` });

        expect(res.statusCode).toBe(404);
        expect(res.json()).toEqual({
          statusCode: 404,
          error: 'Not Found',
          message: `Todo ${GHOST} not found`,
        });
      });

      it('returns 404 on a second DELETE of the same id (hard-delete is permanent, no idempotency)', async () => {
        await seed();
        const first = await app.inject({ method: 'DELETE', url: `/v1/todos/${T_EXIST}` });
        expect(first.statusCode).toBe(204);

        const second = await app.inject({ method: 'DELETE', url: `/v1/todos/${T_EXIST}` });
        expect(second.statusCode).toBe(404);
        expect(second.json()).toEqual({
          statusCode: 404,
          error: 'Not Found',
          message: `Todo ${T_EXIST} not found`,
        });
      });

      it('ignores request body on DELETE (no body schema → no 400)', async () => {
        await seed();
        const res = await app.inject({
          method: 'DELETE',
          url: `/v1/todos/${T_EXIST}`,
          payload: { x: 1 },
        });

        expect(res.statusCode).toBe(204);
      });
    });
    ```
  - [x] **Why `expect(res.body).toBe('')`:** Fastify's inject response surfaces the body as a raw string. An empty 204 body produces `''` (not `null`, not `undefined`). This is the most precise expression of "no body" and matches Fastify's documented 204 behavior.
  - [x] **Why `expect(['0', undefined]).toContain(res.headers['content-length'])`:** Fastify on Node 18/20 typically omits `content-length` on 204 (the HTTP server handles framing); Fastify on some Node versions emits `'0'`. Both satisfy RFC 7230. Pinning to one breaks on Node-version drift; accepting both is the stable assertion.
  - [x] **Why `toEqual(...)` on the 404 body (not `toMatchObject`):** the 404 message is a versioned contract. A regression like `` `Todo with id ${id} not found` `` would be semantically equivalent but a **breaking wire-format change**. `toEqual` locks the exact shape. Same rule as PATCH's 404 contract test.
  - [x] **Why the "second DELETE → 404" test:** documents that the API is **not** idempotent at the semantic level. REST purists sometimes argue DELETE should be idempotent (repeated calls → same result). The MVP's stance is truthful: once a row is gone, asking to delete it again is a not-found error. Story 3.5's UI (`DeleteTodoModal`) never issues a second DELETE for the same row (the modal closes on success), so this is a defensive contract, not a UI concern.
  - [x] **Why the "body ignored" test:** locks the AC4 "no body schema" decision. A future refactor that adds `body: Type.Undefined()` or similar would regress this test.
  - [x] Seeding uses direct Kysely insert (not via `todosRepo.create` and not via POST) — same rationale as Story 3.1's PATCH contract tests (`decouples DELETE tests from POST contract`).
  - [x] **Do NOT** rewrite existing POST/GET/PATCH describe blocks — extend only.
  - [x] **Do NOT** add a 500 test case — there is no realistic 500 path on DELETE in the MVP (the only domain error is NotFound; DB errors would be bugs). Skip.

- [x] **Task 5: Create integration test `apps/api/test/integration.delete.persistence.test.ts`** (AC: 9)
  - [x] Create a new file at `apps/api/test/integration.delete.persistence.test.ts`:
    ```ts
    import { afterEach, describe, expect, it } from 'vitest';
    import type { FastifyInstance } from 'fastify';
    import { buildApp } from '../src/app.js';
    import { migrateLatest, truncateTodos } from './setup.js';

    describe('DELETE /v1/todos/:id — persistence across app restart', () => {
      let app: FastifyInstance | undefined;

      afterEach(async () => {
        if (app) {
          await app.close();
          app = undefined;
        }
      });

      it('a deleted row does not reappear after app close + rebuild (FR-011 / NFR-003)', async () => {
        // Build app #1; run migrations (idempotent if already applied).
        app = await buildApp();
        await migrateLatest(app.db);
        await truncateTodos(app.db);

        const KEEP = '01927f00-0000-7000-8000-0000000000d1';
        const DELETE_ME = '01927f00-0000-7000-8000-0000000000d2';

        await app.db
          .insertInto('todos')
          .values([
            { id: KEEP, description: 'Keep me', completed: false, userId: null },
            { id: DELETE_ME, description: 'Delete me', completed: false, userId: null },
          ])
          .execute();

        const delRes = await app.inject({ method: 'DELETE', url: `/v1/todos/${DELETE_ME}` });
        expect(delRes.statusCode).toBe(204);

        // Simulated server restart: close the Fastify instance (drops the DB pool),
        // then build a fresh instance. The `pg-data` Docker volume preserves the
        // committed state of the prior DELETE.
        await app.close();
        app = await buildApp();

        const listRes = await app.inject({ method: 'GET', url: '/v1/todos' });
        expect(listRes.statusCode).toBe(200);
        const body = listRes.json() as Array<{ id: string }>;
        const ids = body.map((t) => t.id);
        expect(ids).toContain(KEEP);
        expect(ids).not.toContain(DELETE_ME);
      });
    });
    ```
  - [x] **Why a new file (not extending `contract.todos.test.ts`):** `contract.todos.test.ts` uses a module-level `app` with `beforeAll`/`afterAll`. The restart test requires `await app.close()` mid-test and a rebuild — incompatible with the shared-app lifecycle. A dedicated file is clean.
  - [x] **Why not extend `db.persistence.test.ts`:** that file uses `docker compose restart postgres` and is `.skipIf(process.env.CI === 'true')`. The DELETE restart test does NOT need a Postgres restart (the `pg-data` volume is untouched during an app close) and MUST run in CI. Mixing the two lifecycles in one file would either skip this test in CI or force a docker command where none is needed.
  - [x] **Why `truncateTodos` is called in the test body, not in a `beforeEach`:** the file has one test. Truncating in a hook would imply multiple tests; inline truncation keeps the lifecycle explicit and readable.
  - [x] **Why `migrateLatest` is called only on the first app build:** migrations are idempotent but not free (they open a migration-lock table connection). Calling once keeps the test lean. If a future test in the same file creates a second app before the first has run migrations, it would need its own `migrateLatest` — but that's a future-file problem.
  - [x] **Why `app.inject` and not a real HTTP request:** the DELETE goes through the same plugin pipeline (cors, helmet, rate-limit, swagger, error-handler) as a live request. `inject` is the Fastify-native way to exercise the full stack in-process.
  - [x] **Do NOT** add `beforeAll`/`afterAll` with a shared `app` — the rebuild pattern requires per-test lifecycle control.
  - [x] **Do NOT** add a second `it(...)` for edge cases (e.g., "delete + create new row with same id + restart"). The MVP scope is "delete survives restart"; additional permutations are post-MVP.

- [x] **Task 6: Update `apps/api/src/app.test.ts` regression assertion** (AC: 8)
  - [x] In the test currently titled `registers the /healthz, /docs, POST /v1/todos, GET /v1/todos, and PATCH /v1/todos/:id routes` (Story 3.1 updated this title), extend:
    - Update the `it(...)` title to `registers the /healthz, /docs, POST /v1/todos, GET /v1/todos, PATCH /v1/todos/:id, and DELETE /v1/todos/:id routes`
    - Add the assertion: `expect(app.hasRoute({ method: 'DELETE', url: '/v1/todos/:id' })).toBe(true);` immediately after the existing PATCH assertion
  - [x] **Do NOT** add a DELETE happy-path `it` block in this file — `src/app.test.ts` exercises the plugin stack assembly (DummyDriver + buildApp), not route behavior. Behavior is covered against real Postgres in Tasks 4 + 5.
  - [x] **Do NOT** flip or delete any other assertion — only ONE line is added per the AC8 scope.

- [x] **Task 7: Run the full check script and finalize** (AC: 1–9)
  - [x] `npm run typecheck` — clean across both workspaces
  - [x] `npm run lint` — clean (the pre-existing `apps/api/src/db/index.ts:14` warning may remain; out of scope per the Story 1.6 deviations list in `deferred-work.md`)
  - [x] `npm run format:check` — clean; run `npm run format` if new files or edits need Prettier normalization (Prettier contract from Story 1.6: `singleQuote: true`, `semi: true`, `trailingComma: 'all'`, `printWidth: 100`)
  - [x] `npm test` — api passes (target: Story 3.1's tests + ~12 new tests from this story, all green; no POST/GET/PATCH regressions). The new persistence test (Task 5) runs in CI because it does NOT require docker-compose restart.
  - [x] `npm run check` (aggregate) — exits 0
  - [x] Manual Swagger UI spot-check (optional): open `/docs` in a dev run and verify the `DELETE /v1/todos/{id}` operation appears alongside POST/GET/PATCH with the 204/400/404 response entries and the `id` path parameter documented. No automated test asserts the Swagger UI render — it's a byproduct of Fastify's swagger plugin, not a story deliverable.
  - [x] **Do NOT** push to `main` or open a PR from within this task — CI from Story 1.6 runs on PR creation; Story 3.2 lands as a single `feat: story 3.2 implemented` commit and the ordinary PR flow picks it up.
  - [x] **Do NOT** touch `apps/web/` — web-side delete work (hook + modal + App wiring) lands in Stories 3.3 and 3.5; this story is API-only.
  - [x] **Do NOT** modify `plugins/swagger.ts` — no new TypeBox schema is added by this story; the params schema lives inline in `routes/todos.ts` (see Task 2 rationale), and DELETE has no body. The existing `addSchema` registrations (`ErrorResponse`, `Todo`, `CreateTodoInput`, `UpdateTodoInput`) are sufficient.
  - [x] **Do NOT** add a `DELETE` schema to `schemas/todo.ts` — there is no `DeleteTodoInput` concept (DELETE has no body). Adding one would be contract-bloat and invite future clients to send payloads this story deliberately does not validate.

## Dev Notes

### Why `remove` returns a number but `update` throws

The two repo functions look symmetric (both "act on a row by id, possibly-missing") but expose the zero-rows case differently:

**`update` (Story 3.1):** repo throws `NotFoundError('Todo {id} not found')` when `executeTakeFirst()` returns `undefined`. The route handler is one line: `return todosRepo.update(...)`.

**`remove` (this story):** repo returns `Promise<number>` (0 or 1). The route handler is three lines: call, check, throw-or-204.

Why the asymmetry? Two reasons:

1. **Epic-level specification.** Epic 3.2's AC text is explicit: "returns the number of affected rows (`1` on success) … When `remove` is called with a non-existent `id`, Then it returns `0`". The epic deliberately frames `remove` as a count-returning function because the happy-path caller (the route) already has the `id` and can construct the `NotFoundError` message itself — there's no reason to push that string-formatting concern into the repo. Epic 3.1's AC is different: "it throws `NotFoundError('Todo {id} not found')`" — the PATCH caller's happy path returns the updated row, so a separate count-return would be awkward (you'd return a tuple of row + affected count).

2. **Return-shape coherence.** `update` has a "success payload" (the updated Todo row) and an "error signal" (undefined from `executeTakeFirst`). Routing the error through an exception keeps the happy-path return type clean (`Promise<Todo>`, not `Promise<Todo | undefined>`). `remove` has no success payload — just a count. Returning the count directly expresses both outcomes (0 and 1) in the same channel; no exception needed for the zero case.

**When to apply which pattern in future stories:**
- Repo function produces data + may not find a row → **throw** (`findById`, `update`, future `updateDescription`, `findBySomeColumn`)
- Repo function produces only a count or reports "did it work" → **return the count** (`remove`, future `removeBulk`)

Both patterns are valid; the route layer bridges the difference. The global error handler's `NotFoundError → 404` mapping is the same in either case — the route just throws at a different moment.

### Why one DELETE + zero-rows check is the right pattern

Alternative considered and rejected: SELECT-first-then-DELETE.

```ts
// Pattern B (rejected):
const existing = await db.selectFrom('todos').selectAll().where('id', '=', id).executeTakeFirst();
if (!existing) throw new NotFoundError(...);
await db.deleteFrom('todos').where('id', '=', id).execute();
return 1;
```

**Why the single-statement Pattern A wins:**

1. **One query, one round-trip.** Pattern B is 2× the latency on the happy path.
2. **Atomic.** There's no race window where a row exists at SELECT time but has been deleted by another connection before the DELETE runs. Pattern A's `WHERE id = ?` predicate IS the existence check; there's no gap.
3. **Fewer Kysely call sites.** Less code to maintain.
4. **Affected-count truth.** Pattern A's `numDeletedRows` reflects actual Postgres action. Pattern B would hand-return `1` regardless — if the DB is under concurrent load (future multi-user mode), Pattern B could falsely claim a deletion that didn't happen.

The global error handler's `NotFoundError → 404` branch (`plugins/error-handler.ts:22-28`) is already tested at the unit layer (`error-handler.test.ts:36-51`) AND the integration layer (Story 3.1's PATCH 404 contract test). This story adds the DELETE integration test in Task 4.

### How Kysely builds `DeleteResult` from the driver's `QueryResult`

Kysely's Postgres dialect interprets the driver's `QueryResult` as follows:

- `QueryResult.rows` — the array of returned rows. For a DELETE without `RETURNING`, this is `[]`.
- `QueryResult.numAffectedRows` — a `bigint` representing the command-complete count from Postgres (e.g., `DELETE 3` → `3n`).
- `QueryResult.numChangedRows` — present for some dialects (e.g., MySQL); for Postgres it aliases `numAffectedRows`.

When a `deleteFrom(...)` query terminates with `.execute()` or `.executeTakeFirst()`/`.executeTakeFirstOrThrow()`, Kysely returns a single `DeleteResult` object whose `numDeletedRows` field is populated from `QueryResult.numAffectedRows`.

For the `SeedingDriver` test setup in `todosRepo.test.ts` (Task 3):

**Wrong shape (will NOT populate `numDeletedRows`):**
```ts
executeQuery: async () => ({ rows: [{ numDeletedRows: 1n }] }),
// ↑ Kysely's postgres dialect doesn't read per-row `numDeletedRows`; it reads
// top-level `numAffectedRows` on the QueryResult. This would give `numDeletedRows: 0n`
// at the DeleteResult level (the default when numAffectedRows is missing).
```

**Correct shape:**
```ts
executeQuery: async () => ({ rows: [], numAffectedRows: 1n }),
// ↑ Kysely's postgres dialect reads `numAffectedRows` and populates
// `DeleteResult.numDeletedRows` from it. This matches the real driver behavior.
```

If Task 3's tests fail with "expected 1, received 0" on the happy-path assertion, the likely cause is this shape mismatch. Check `node_modules/kysely/dist/esm/query-executor/default-query-executor.js` (or similar) for the exact field-read path in the installed version.

### What `server is restarted` means in this AC

Story 3.2's AC9 says "the server is restarted". In a web-stack MVP this phrase is ambiguous — it could mean:

1. **App process restart** — `app.close()` + `buildApp()` in the same Node process (what Task 5 tests).
2. **Container/host restart** — killing the Node process + starting a new one.
3. **DB-process restart** — `docker compose restart postgres` (what `db.persistence.test.ts` tests, already in place).

All three are failure modes that could regress persistence. The epic explicitly combines AC9's scope with "the server" (singular, the API server), distinguishing it from the already-covered DB-restart case. AC9 covers scenario #1, which is:
- The **cheapest** in CI (no docker, no process fork — just close & rebuild)
- The **most common** runtime event in dev (file-change hot-reload closes and rebuilds the app)
- Still **high-signal** (catches DB-pool bugs, connection leaks, transaction-commit-timing bugs that would cause uncommitted deletes)

Scenario #2 (container restart) is covered by CI itself — each CI run is a fresh container, and the contract tests would fail if deletes didn't persist across container boundaries. Scenario #3 remains covered by `db.persistence.test.ts` for the POST path; extending it for DELETE would be redundant with AC9's app-level test unless a future bug suggests otherwise.

### Why the id-params schema is now a module-level constant

Story 3.1 Dev Notes flagged this DRY opportunity:

> "This same pattern will apply to Story 3.2's `DELETE /v1/todos/:id` — recommend lifting the params schema into a shared constant in that story (premature DRY in this one)."

Story 3.2 is that story. Three options were considered:

**Option A (chosen): `const TodoIdParamsSchema` at module scope in `routes/todos.ts`.**
- Scoped to the file where it's used.
- No new files or imports.
- Routes read naturally: `params: TodoIdParamsSchema`.

**Option B (rejected): Move to `schemas/todo.ts`.**
- Mixes domain schemas (Todo, CreateTodoInput, UpdateTodoInput) with route-level path-param schemas.
- Would get `addSchema`-registered in `swagger.ts`, but path params aren't OpenAPI `components.schemas` — they're inline under `paths.*.parameters`. The `$id` would be unused (or worse, pollute the components section).

**Option C (rejected): New file `schemas/common.ts` or `schemas/params.ts`.**
- Overkill for one constant.
- Adds a file + an import per consumer with no reusability outside routes.

Option A is the lowest-overhead match for the PATCH + DELETE reuse. If a third route with the same id shape lands post-MVP (e.g., `GET /v1/todos/:id`), the constant accommodates it; if a totally different params shape emerges (e.g., `:year/:month` for an archive endpoint), a second constant joins beside it without coupling.

### Why DELETE has no body schema

HTTP allows DELETE to carry a body (RFC 7231 §4.3.5), but its semantics are "undefined" — servers MAY ignore it. Some REST frameworks add body schemas to DELETE to communicate "we really mean no body"; others leave body out of the schema entirely. Fastify + TypeBox offers both paths.

**Why Story 3.2 leaves body OUT of the DELETE schema:**

1. **MVP simplicity.** The UI's `useDeleteTodo` hook (Story 3.3) will call `apiClient.del('/v1/todos/${id}')` with no body. There's no client-side need for body-on-DELETE.
2. **Idempotency at the network layer.** Proxies and retry middlewares sometimes strip DELETE bodies (even though RFC 7231 doesn't mandate this). Having the API refuse a stripped body (by schema) would cause environment-dependent 400s — exactly the kind of bug NFR-004 "error resilience" argues against.
3. **Forward compatibility.** If a future story needs "soft-delete with reason" (e.g., `DELETE /v1/todos/:id` with body `{ reason: 'user-request' }`), adding a body schema is a backward-compatible change (old clients with no body still work if `body: Type.Optional(DeleteTodoInput)`). Removing a body schema later would break clients that send one — a one-way door we don't want to open.

Contract test AC6 case 9 documents this decision with a positive assertion: a DELETE with a JSON body returns 204 (not 400). Future maintainers reading this test will know the omission is deliberate.

### 204 vs 200-with-empty-body

PRD + architecture lock the DELETE happy path as `204` (architecture.md:217; epics.md FR-012 status-code table). REST and HTTP both allow 200 with an empty body on DELETE, but:

1. **RFC 7230 §3.3.2:** "A 204 response MUST NOT include a message body." This makes `204` the canonical "no body" status.
2. **Intermediary behavior:** CDN and proxy caches treat 204 as a special "no content" response; 200-with-empty-body may be cached as "200 OK with empty payload" and served to later requesters. For a hard-delete on a mutable resource, the wrong cache behavior matters.
3. **Consumer clarity:** `useDeleteTodo`'s mutation-fn will resolve as `Promise<void>` (Story 3.3) — a 204 gives `fetch` a natural "no-body" signal; a 200 with empty body forces an `if (response.status === 200 && response.body === null) {}` branch.

204 is the right answer; Story 3.2 lands it.

### Why the 404 message echoes the id

Identical rationale to Story 3.1's PATCH 404 message, repeated here for the DELETE contract:

- **Debuggable:** in CI logs or browser devtools, seeing `Todo 01927f00-...-0021 not found` immediately identifies which row the client was touching.
- **UI-legible:** even though Epic 4 builds better error copy, the raw API message is what end-users see before that work lands. "Todo [id] not found" is neutral and informative.
- **Contract-stable:** AC6 case 5 asserts the exact message, so this is a versioned contract — changing it later requires a contract-test update too.

The `id` value comes straight from the request's path parameter (validated as UUID format) — no PII concern, no sanitization needed.

### Why `reply.status(204).send()` (and why `return reply.send()`)

Fastify has three ways to end a request on 204:

**Way 1 (chosen): `return reply.status(204).send()`**
- Sets the status code.
- Sends with no payload.
- Fastify recognizes the 204 and skips the response serializer.
- Returning the reply signals "handler is done" to the async-handler runtime.

**Way 2 (rejected): `reply.code(204); return null;`**
- Sets the status code.
- Returning `null` from an async handler → Fastify treats `null` as the payload → invokes the serializer against the response schema.
- `response: { 204: Type.Null() }` would pass the null through — but then Fastify emits `null` as a 4-byte body (`'null'`). Violates RFC 7230 §3.3.2.

**Way 3 (rejected): `reply.code(204); return;`**
- Same as Way 2 but returning `undefined` — Fastify treats `undefined` as "no payload set; I'll use the implicit empty string" — usually works, but relies on undocumented behavior.

Way 1 is the documented, stable, spec-compliant 204 idiom for async Fastify handlers. It's what `@fastify/swagger`'s examples and Fastify's own 204 handler recipes use.

### Route order: DELETE after PATCH

Fastify's find-my-way router is order-independent for static + parameter paths (`/todos/:id` PATCH vs `/todos/:id` DELETE differ by HTTP verb, which is a separate router dimension). So DELETE could be declared anywhere inside `todosRoutes`. The pattern this story follows — DELETE after PATCH — keeps the source file in HTTP-verb convention order (POST → GET → PATCH → DELETE), matching Story 3.1's pattern and REST documentation norms.

### Previous Story Intelligence

**From Story 3.1 (PATCH) — directly load-bearing:**
- `NotFoundError` is now a proven error-path primitive (PATCH 404 contract test is green against real Postgres). This story re-exercises the same error-handler branch for DELETE.
- `format: 'uuid'` on path params is the right guardrail — prevents `22P02 invalid input syntax` from Postgres cascading into a 500.
- `typedApp.patch('/todos/:id', { schema: { params, body, response } }, handler)` is the established idiom for id-parametrized routes — DELETE follows the same shape (minus body).
- The inline params schema literal from PATCH is **lifted** to `TodoIdParamsSchema` in this story (per 3.1's Dev Notes hint). PATCH continues to pass its contract tests after the refactor (pure rename).
- `contract.todos.test.ts` extension pattern (`describe('<VERB> /v1/todos/:id — contract', ...)` blocks reusing the module-level lifecycle) is the canonical way to grow this file. DELETE joins PATCH as the fourth block.

**From Story 3.1 Dev Notes — deferred items this story touches:**
- **DRY the params schema** — done (Task 2).
- **Lift `rowToTodo(row)` helper on third callsite** — NOT done this story. `remove` doesn't serialize a `Todo`, so the third-callsite counter doesn't advance. Keep the deferral entry in `deferred-work.md`. The fourth callsite (if a future `findById` lands) would trigger the extraction.

**From Story 2.1 / 2.2 — pattern reinforcement:**
- Repo functions take `db` as the last argument (no module-level singleton). `remove` follows this.
- Contract tests seed via direct Kysely insert to decouple from the POST route. DELETE tests do the same.
- Route handlers are single-responsibility and short. DELETE is three statements (call repo, check count, send 204) — at the edge of "short" but clearly one responsibility.

**From Story 1.4 (plugin stack) — load-bearing:**
- Global error handler maps `NotFoundError` → 404. Unchanged.
- `/v1` prefix wiring. Unchanged.

**From Story 1.6 (CI + code quality) — awareness:**
- `npm run check` aggregate is the final verification in Task 7.
- Prettier contract: `singleQuote: true`, `semi: true`, `trailingComma: 'all'`, `printWidth: 100`.

**From Story 2.6 (Journey-1 E2E) — context-setting:**
- Epic 3's goal is the full complete + delete loop. Story 3.2 is the API-side half of the delete contract.
- Web-side consumers (`useDeleteTodo`, `DeleteTodoModal`, `App.tsx` wiring) land in Stories 3.3 and 3.5 — **not** this story.

### Git Intelligence

- Commit history shows a stable "one story per commit" rhythm: 1.1 → 1.2 → ... → 2.6 → 3.1 (in-progress on the working tree). Target commit for this story: `feat: story 3.2 implemented`.
- The open working tree when this story was authored shows Story 3.1's implementation in progress (modifications to schemas/todo.ts, repositories/todosRepo.ts, routes/todos.ts, test files). By the time a developer picks up Story 3.2, Story 3.1 should be merged to `main` and `3-1-*.md` status should be `review` or `done`. **If Story 3.1 is still in-progress when Story 3.2 is picked up, coordinate with the owner — Story 3.2's Task 2 refactor (`TodoIdParamsSchema` lift) will conflict with Story 3.1's inline PATCH params schema.** The refactor is trivial to rebase (two lines), but do not start Task 2 before Story 3.1 is merged.
- File-scope discipline: Story 3.2 touches exactly these files:
  1. `apps/api/src/repositories/todosRepo.ts` (extended — one new function)
  2. `apps/api/src/repositories/todosRepo.test.ts` (extended — two new describe blocks)
  3. `apps/api/src/routes/todos.ts` (extended — one new handler, one refactored handler, one new const, one new import, one comment deleted)
  4. `apps/api/src/app.test.ts` (one assertion added, one title updated)
  5. `apps/api/test/contract.todos.test.ts` (new describe block appended)
  6. `apps/api/test/integration.delete.persistence.test.ts` (NEW FILE — single integration test)
  7. `_bmad-output/implementation-artifacts/sprint-status.yaml` (status transitions)
  8. `_bmad-output/implementation-artifacts/3-2-todosrepo-remove-delete-v1-todos-id.md` (this file — dev record updates)
- **No new dependencies.** All packages (`kysely`, `@fastify/type-provider-typebox`, etc.) are already in `apps/api/package.json`.
- **No schema change, no migration.** `DELETE FROM todos WHERE id = ?` works against the existing table shape from migration `20260418_001_create_todos`.
- **No changes in `apps/web/`.**

### Latest Tech Information

**Kysely 0.28.x (`deleteFrom` query-builder):**
- `db.deleteFrom('todos').where('id', '=', id)` is the idiomatic by-id delete.
- `.executeTakeFirstOrThrow()` returns a `DeleteResult` with `numDeletedRows: bigint`.
- `DeleteResult.numDeletedRows` is populated from Postgres's command-complete count, which arrives via `pg` as `QueryResult.rowCount` (number), then is cast to `bigint` by Kysely's Postgres adapter. For a by-id delete against a primary key, the value is always `0n` or `1n`.
- `Number(bigint)` coercion is safe when the value fits in `Number.MAX_SAFE_INTEGER` (always, for 0/1).

**Fastify 5.x (`DELETE` with typed params, no body):**
- `typedApp.delete('/path/:id', { schema: { params, response } }, handler)` — the `TypeBoxTypeProvider` infers `request.params` as `Static<typeof ParamsSchema>`.
- Omitting `body` from the schema tells Fastify "don't validate the body" — any body is accepted and ignored (stays in memory but handler doesn't read it; bodyLimit still applies at 64 KB per `app.ts` config).
- `response: { 204: Type.Null(), 400: ..., 404: ... }` tells `@fastify/swagger` what to document. Fast-json-stringify is invoked ONLY for the handler's return value — calling `reply.status(204).send()` short-circuits the serializer (no body to serialize).

**AJV 8.x (`format: 'uuid'`) — unchanged from Story 3.1:**
- Permissive of all UUID versions (v1/v4/v7).
- `ajv-formats` plugin already wired into `app.ts:44`.

**Fastify light-my-request (used by `app.inject(...)`) — for tests:**
- `res.body` is always a string (the raw response body). For 204, it's `''`.
- `res.headers['content-length']` is either `'0'` or `undefined` on Node 18/20 — depends on the underlying `http` lib version. The contract test accepts both (AC6 case 1 assertion).
- `res.json()` parses the body as JSON — calling it on a 204 response would throw (empty string is not valid JSON). Always check `res.statusCode === 204` before calling `res.json()`.

### Project Structure Notes

**Extended files (4):**
- `apps/api/src/repositories/todosRepo.ts` — `remove` export added (no new imports needed; existing `Kysely` and `Database` imports cover it)
- `apps/api/src/repositories/todosRepo.test.ts` — two new `describe` blocks (no new imports needed; existing helpers cover DummyDriver and SeedingDriver patterns)
- `apps/api/src/routes/todos.ts` — `TodoIdParamsSchema` module-level const + DELETE handler + `NotFoundError` import; PATCH route updated to reference the new const; trailing comment removed
- `apps/api/test/contract.todos.test.ts` — new `describe('DELETE /v1/todos/:id — contract', ...)` block

**Modified files (1 assertion-only):**
- `apps/api/src/app.test.ts` — one additional `hasRoute` assertion for DELETE + title update

**New files (1):**
- `apps/api/test/integration.delete.persistence.test.ts` — the AC9 restart-survivability integration test

**No dependency changes.** **No migration changes.** **No `apps/web/` changes.** **No `plugins/swagger.ts` changes.**

**Alignment with `architecture.md:530`:** `repositories/todosRepo.ts` is the canonical data-access layer; adding `remove` completes the `{listAll, create, update, delete}` inventory declared in the architecture. (`findById` remains theoretical; no epic requires it.) DELETE completes the FR-004 "hard-delete in MVP" contract and the FR-012 `/v1/todos/:id` DELETE endpoint.

### Testing Standards

- **Unit tests:** co-located (`*.test.ts` next to `*.ts`). Story 3.2 adds cases to `repositories/todosRepo.test.ts` (two new describe blocks). `schemas/todo.test.ts` is NOT extended — DELETE has no new schema.
- **Contract tests:** `apps/api/test/contract.todos.test.ts` — extended with a new `describe` block; shares the module-level `buildApp + migrateLatest + truncateTodos` lifecycle.
- **Integration tests:** `apps/api/test/integration.delete.persistence.test.ts` — new file with a per-test lifecycle (manual `app.close()` + `buildApp()`); does NOT reuse the contract-test module-level hooks.
- **Lifecycle helpers** already in `test/setup.ts` — reuse `migrateLatest` and `truncateTodos`; do NOT duplicate.
- **Vitest runs serially at file level** (`fileParallelism: false` in `apps/api/vitest.config.ts`) — safe for the new integration test to close and rebuild the app without colliding with the contract-test file (they run in different file workers).
- **Coverage target:** `todosRepo.remove` reaches 100% unit coverage via the two SeedingDriver tests (happy path + zero-rows covers both the `result.numDeletedRows === 1n` and `=== 0n` branches; there is no other branch in the function).
- **Format validation at test time:** `Value.Check(TodoSchema, ...)` is NOT used in the DELETE contract tests (no body to validate) — the existing `FormatRegistry` setup at the top of `contract.todos.test.ts` remains untouched and continues to serve POST/GET/PATCH.
- **CI compatibility:** the new integration test (Task 5) runs in CI — it does NOT call `docker compose` and does NOT require a Postgres restart. The existing `db.persistence.test.ts` remains `.skipIf(process.env.CI === 'true')` for its docker-restart case.

### References

- Epic requirements: [epics.md § Story 3.2](../planning-artifacts/epics.md) (lines 850–892)
- Architecture — Status codes 201/200/200/204 + `/v1` prefix + API versioning: [architecture.md § API & Communication Patterns](../planning-artifacts/architecture.md) (lines 217, 221)
- Architecture — `repositories/todosRepo.ts` function inventory (`listAll, create, update, delete, findById`): [architecture.md § Complete Project Directory Structure](../planning-artifacts/architecture.md) (line 530)
- Architecture — Data-access boundary (routes → repositories → db): [architecture.md § Architectural Boundaries](../planning-artifacts/architecture.md) (lines 587–601)
- Architecture — FR-004 row (DELETE + DeleteTodoModal): [architecture.md § Requirements-to-Structure Mapping](../planning-artifacts/architecture.md) (line 620)
- Architecture — FR-011 persistence (pg-data volume + server restart): [architecture.md § Requirements-to-Structure Mapping](../planning-artifacts/architecture.md) (line 627)
- Architecture — Error handling rules (all routes `throw`; global error handler maps): [architecture.md § Process Patterns](../planning-artifacts/architecture.md) (lines 397–411)
- PRD — FR-004 (Delete + confirmation modal), FR-011 (persistence), FR-012 (REST API with /v1, status 204 on DELETE): [PRD.md § Functional Requirements](../planning-artifacts/PRD.md)
- Previous story: [3-1 UpdateTodoInput + todosRepo.update + PATCH /v1/todos/:id](./3-1-updatetodoinput-schema-todosrepo-update-patch-v1-todos-id.md) — schema + repo + route + contract-test patterns; 404-on-zero-rows precedent; params-schema DRY deferral
- Previous story: [2-1 TypeBox schemas + todosRepo.create + POST /v1/todos](./2-1-typebox-schemas-todosrepo-create-post-v1-todos.md) — `typedApp` idiom, `addSchema` pattern, `executeTakeFirstOrThrow` rationale
- Previous story: [2-2 todosRepo.listAll + GET /v1/todos](./2-2-todosrepo-listall-get-v1-todos-with-active-asc-ordering.md) — second handler pattern, contract-test extension pattern, seeding-via-direct-Kysely rationale
- Previous story: [1-4 API plugin stack + /v1 prefix + global error handler](./1-4-api-plugin-stack-v1-prefix-global-error-handler.md) — `NotFoundError` class, error handler's 404 branch, `ErrorResponse` schema
- Previous story: [1-6 CI + code-quality gate](./1-6-ci-pipeline-code-quality-gate-eslint-prettier-a11y-playwright-e2e-scaffold-onboarding-readme.md) — `npm run check` aggregate + Prettier contract

## Dev Agent Record

### Agent Model Used

Claude Opus 4.7 (1M context)

### Debug Log References

- `npm run typecheck` — clean across both workspaces (one TS error on first pass, see Completion Notes)
- `npm run lint` — only the pre-existing `apps/api/src/db/index.ts:14` warning (Story 1.6 deferred-work)
- `npm run format:check` — clean after one `prettier --write` pass on `repositories/todosRepo.ts`
- `npm test --workspace apps/api` — 11 files, 96 tests all green (85 → 96; +11 new: 3 repo + 7 contract + 1 integration)
- `npm test --workspace apps/web` — 21 files, 100 tests green (unchanged, no web-side work)
- `npm run check` — exits 0

### Completion Notes List

- **All 9 ACs satisfied.** `todosRepo.remove(id, db): Promise<number>` returns the bigint-coerced affected-row count (AC1). `DELETE /v1/todos/:id` handler maps `0 → NotFoundError` and returns 204 on success (AC2, AC3, AC5). `format: 'uuid'` on params rejects bad UUIDs with 400 (AC4). Contract test block covers all 7 cases (AC6) including the "second DELETE → 404" idempotency contract and the "body ignored" documentation test. Repo unit tests assert both `bigint → number` coercion AND the zero-rows-does-NOT-throw behavior (AC7). `app.test.ts` `hasRoute` regression updated (AC8). New `integration.delete.persistence.test.ts` proves delete survives app close + rebuild (AC9).
- **PATCH refactor to `TodoIdParamsSchema` is a pure rename.** Story 3.1's inline `Type.Object({ id: Type.String({ format: 'uuid' }) }, { additionalProperties: false })` was lifted to a module-level `const` in `routes/todos.ts`; PATCH route now references it; DELETE route references the same constant. All of Story 3.1's PATCH contract tests (10 cases) still pass unchanged.
- **One typecheck blip on first pass — TypeBox-typed reply required an argument.** With `response: { 204: Type.Null(...) }`, `TypeBoxTypeProvider` infers `reply.send()` as requiring a `null` argument (`TS2554: Expected 1 arguments, but got 0`). The story's Dev Notes prescribed `reply.status(204).send()` with no args. Fixed by passing `null` explicitly: `reply.status(204).send(null)`. Fastify still skips `fast-json-stringify` serialization on 204 per RFC 7230, so the wire-format assertion in AC6 case 1 (`expect(res.body).toBe('')` + `expect(['0', undefined]).toContain(res.headers['content-length'])`) holds. Contract test confirmed this: 204 responses ship empty body, no "null" leak.
- **Prettier normalization on `todosRepo.ts`.** After adding `remove`, Prettier collapsed the body onto one line under the 100-char `printWidth`. One `prettier --write` pass made format:check green. No semantic change.
- **File-scope discipline held.** Touched exactly the 6 declared files: `routes/todos.ts` (1 new handler + 1 refactor + 1 new const + 1 new import + 1 comment deleted), `repositories/todosRepo.ts` (1 new export), `repositories/todosRepo.test.ts` (2 new describes), `test/contract.todos.test.ts` (1 new describe block with 7 its), `test/integration.delete.persistence.test.ts` (new file, 1 test), `src/app.test.ts` (1 assertion + title update). No changes to `apps/web/`, `plugins/swagger.ts`, `schemas/todo.ts`, or `app.ts` (unlike Story 3.1's AJV deviation — this story didn't need it).
- **SeedingDriver shape for DELETE tests uses `{ rows: [], numAffectedRows: 1n }`** as the Dev Notes prescribed. Verified empirically by running the tests — the per-row `numDeletedRows` shape would have failed with "expected 1, received 0".

### File List

**Extended:**
- `apps/api/src/repositories/todosRepo.ts` — `remove(id, db): Promise<number>` export added
- `apps/api/src/repositories/todosRepo.test.ts` — two new describes (compiled DELETE shape + SeedingDriver behavior happy-path + zero-rows-returns-0-not-throws)
- `apps/api/src/routes/todos.ts` — `TodoIdParamsSchema` module-level const; `NotFoundError` import; PATCH refactored to reference the const; new `typedApp.delete('/todos/:id', ...)` handler; trailing comment removed
- `apps/api/src/app.test.ts` — DELETE `hasRoute` assertion + title updated
- `apps/api/test/contract.todos.test.ts` — new `describe('DELETE /v1/todos/:id — contract', ...)` block (7 it cases)

**New:**
- `apps/api/test/integration.delete.persistence.test.ts` — app-restart persistence test (AC9)

**Story artifacts:**
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — story 3.2 transitions (ready-for-dev → in-progress → review)
- `_bmad-output/implementation-artifacts/3-2-todosrepo-remove-delete-v1-todos-id.md` — this story file (status + task checkboxes + Dev Agent Record + Change Log)

### Change Log

- 2026-04-24 — Implemented Story 3.2: `todosRepo.remove` + `DELETE /v1/todos/:id`. All 9 ACs satisfied; 11 new tests added (3 repo unit + 7 contract + 1 integration) on top of the 85-test baseline → 96 tests. PATCH's params schema lifted to shared `TodoIdParamsSchema` const (pure refactor; Story 3.1's contract tests unchanged). One minor deviation from Dev Notes: `reply.status(204).send()` needed an explicit `null` argument under the TypeBox type provider; Fastify still skips body serialization on 204 so wire format is unchanged.
