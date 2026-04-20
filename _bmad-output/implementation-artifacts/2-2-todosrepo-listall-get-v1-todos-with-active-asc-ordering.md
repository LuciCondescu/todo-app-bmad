# Story 2.2: `todosRepo.listAll` + `GET /v1/todos` with active-ASC ordering

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want to fetch the full todo list in a deterministic order,
So that active items appear first (creation ASC) and completed items appear last (creation ASC).

## Acceptance Criteria

**AC1 — `todosRepo.listAll(db)` exported from `apps/api/src/repositories/todosRepo.ts`**
- **Given** `todosRepo.ts` already exports `create(...)` from Story 2.1
- **When** the engineer inspects the file
- **Then** a new `async function listAll(db: Kysely<Database>): Promise<Todo[]>` is also exported
- **And** it executes a **single Kysely query** — `db.selectFrom('todos').selectAll().orderBy('completed', 'asc').orderBy('created_at', 'asc').execute()` — no subqueries, no post-sort in JS, no multiple round-trips
- **And** each returned row is serialized to the `Todo` shape (camelCase via `CamelCasePlugin`, `createdAt` converted from `Date → ISO 8601 UTC string with Z suffix` via `.toISOString()` — identical serialization rule to `create`)
- **And** `listAll` never imports `Kysely` from `db/index.ts` directly — it takes the `db` as its one argument (same pattern as `create` in Story 2.1)
- **And** `listAll` returns `[]` (empty array, not `null`/`undefined`) when the `todos` table has zero rows

**AC2 — `GET /v1/todos` handler registered in `apps/api/src/routes/todos.ts`**
- **Given** `todosRoutes` already registers `POST /todos` (Story 2.1)
- **When** the engineer inspects the file
- **Then** a new `typedApp.get('/todos', { schema: { response: { 200: Type.Array(TodoSchema) } } }, handler)` is added to the same plugin
- **And** the handler calls `todosRepo.listAll(app.db)` and returns the array directly (no wrapper object, no transform)
- **And** the response is a **plain JSON array** — the top-level body is `[{...}, {...}]`, **never** `{ "data": [...] }` or `{ "todos": [...] }` (architectural anti-pattern per architecture.md:479)
- **And** the route declares `response: { 200: Type.Array(TodoSchema) }` using the TypeBox type provider from Story 2.1 — Fastify's schema-driven serializer uses `fast-json-stringify` for the array, which is ~2× faster than default `JSON.stringify` at scale (matters for Journey 4 / NFR-001 perf headroom)
- **And** the plugin's `withTypeProvider<TypeBoxTypeProvider>()` alias from Story 2.1 is reused — **do NOT** call `.withTypeProvider` twice in the same plugin

**AC3 — Deterministic ordering: active first (by creation ASC), completed last (by creation ASC)**
- **Given** the database contains todos created in this order: T1 (active), T2 (completed), T3 (active), T4 (completed) — with creation timestamps `t1 < t2 < t3 < t4`
- **When** a client issues `GET /v1/todos`
- **Then** the response body's `id` sequence is exactly `[T1.id, T3.id, T2.id, T4.id]`:
  - Active section first: `T1, T3` (creation ASC)
  - Completed section last: `T2, T4` (creation ASC)
- **And** this ordering holds because `ORDER BY completed ASC, created_at ASC` sorts `false` before `true` in Postgres (boolean `false` → `0`, `true` → `1`) — verified by the `idx_todos_completed_created_at` composite index from migration `20260418_001_create_todos.ts`
- **And** no client-side sort / `Array.prototype.sort` is ever applied — the server's SQL `ORDER BY` is the sole source of ordering truth

**AC4 — Empty state: `200 []`, not 204 / 404 / wrapped**
- **Given** the `todos` table is empty (e.g., just after `TRUNCATE`)
- **When** a client issues `GET /v1/todos`
- **Then** the response status is `200` (NOT `204 No Content` — consumers expect a body)
- **And** the response body is exactly `[]` (a JSON empty array, 2 bytes)
- **And** `content-type` is `application/json; charset=utf-8`
- **And** the web-side `useTodos` hook (Story 2.3, consumer) can unconditionally `data.map(...)` without a null/undefined guard

**AC5 — Contract test at `apps/api/test/contract.todos.test.ts` (extended from Story 2.1)**
- **Given** the contract test file already exists from Story 2.1 (`describe('POST /v1/todos — contract', ...)`)
- **When** the engineer extends the file
- **Then** a new `describe('GET /v1/todos — contract', () => { ... })` block is added (same `beforeAll/afterAll/beforeEach` lifecycle — one `buildApp()` + `migrateLatest` in `beforeAll`, `truncateTodos` in `beforeEach`, `app.close()` in `afterAll`)
- **And** the block asserts:
  1. **Empty DB** → `GET /v1/todos` returns `200` with body `[]` (exact equality) and `content-type: application/json; charset=utf-8`
  2. **Four seeded todos with controlled state** → response `id` sequence matches `[T1, T3, T2, T4]` exactly (not `toContain`, not `toEqual(arrayContaining)` — strict positional equality)
  3. **Each element validates against `TypeBox.Value.Check(TodoSchema, element)`** (imported from `@sinclair/typebox/value`), catching schema drift at the contract layer
  4. **The body is a plain array**: `expect(Array.isArray(res.json())).toBe(true)` AND `expect(res.json()).not.toHaveProperty('data')` AND `expect(res.json()).not.toHaveProperty('todos')` — regression guard for the architectural anti-pattern
  5. **`createdAt` ISO 8601 regex** holds for every element — same `/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/` pattern Story 2.1 introduced
- **And** the test seeds via direct Kysely insert with **explicit controlled `created_at` timestamps** — NOT via `todosRepo.create` (see Dev Notes → "Seeding strategy: direct insert with controlled timestamps" for why this is correct and NOT a boundary violation)

**AC6 — Unit test for `todosRepo.listAll` — compiled-SQL shape assertion**
- **Given** `apps/api/src/repositories/todosRepo.test.ts` already tests `create` via `DummyDriver` (Story 2.1)
- **When** the engineer extends the file
- **Then** a new `describe('listAll — compiled SELECT shape (DummyDriver)', ...)` block asserts:
  1. The compiled SQL matches `/select\s+\*\s+from\s+"todos"/i` (plus the CamelCasePlugin's SELECT column expansion — see note below)
  2. The compiled SQL contains `order by "completed" asc, "created_at" asc` (case-insensitive; whitespace-tolerant)
  3. The parameters array is empty (no `WHERE`, no bound params) — a regression guard for accidental scoping
- **And** the test does NOT call `listAll({} as Kysely<Database>)` and expect a returned value — `DummyDriver` returns `[]` synchronously, so the test compiles the query builder and inspects `.compile()` directly (same pattern as the `create` unit test)
- **Note on CamelCasePlugin + `selectAll()`:** in Kysely, `.selectAll()` with `CamelCasePlugin` still compiles to `SELECT *` at the SQL layer — the plugin maps column **names at parse time** (when Kysely reads typed selects like `.select(['createdAt'])`), not when it emits `*`. So `SELECT *` is the correct expected compiled output; row-level column name transformation happens inside the driver

**AC7 — No web-side or OpenAPI changes beyond the automatic ones**
- **Given** `GET /v1/todos` is registered with a TypeBox response schema
- **When** `/docs/json` is fetched
- **Then** `components.schemas` still contains `Todo`, `CreateTodoInput`, `ErrorResponse` (unchanged from Story 2.1 — **no** new schemas added for an array-response since `Type.Array(TodoSchema)` is inline, not a named/addressable schema)
- **And** `paths['/v1/todos']` gains a `get` operation alongside the existing `post` (automatic via Fastify → Swagger integration)
- **And** no `apps/web/` files are touched in this story (web work is Stories 2.3–2.6)
- **And** no new dependencies are added — `@fastify/type-provider-typebox`, `@sinclair/typebox`, `kysely`, `uuid` are all already installed (2.1 covered deps)

## Tasks / Subtasks

- [x] **Task 1: Extend `apps/api/src/repositories/todosRepo.ts` with `listAll`** (AC: 1)
  - [x] Add the `listAll` export alongside the existing `create`:
    ```ts
    export async function listAll(db: Kysely<Database>): Promise<Todo[]> {
      const rows = await db
        .selectFrom('todos')
        .selectAll()
        .orderBy('completed', 'asc')
        .orderBy('created_at', 'asc')
        .execute();

      return rows.map((row) => ({
        id: row.id,
        description: row.description,
        completed: row.completed,
        createdAt: row.createdAt.toISOString(),
        userId: row.userId,
      }));
    }
    ```
    - See Dev Notes → "Why two `.orderBy(...)` calls instead of `.orderBy(['completed', 'created_at'])`" — the chain is the Kysely idiom for multi-column sort and matches the index definition byte-for-byte
    - The `rows.map` serialization block is intentionally **duplicated** from `create`'s return statement. See Dev Notes → "When to extract a `serializeTodo` helper" — rule: extract at the 3rd callsite (arrives in Story 3.1 with `update`), not the 2nd
    - **`orderBy('created_at', 'asc')`**, NOT `.orderBy('createdAt', 'asc')` — Kysely's `orderBy` string literal type is the **column name in the DB schema sense**, which under CamelCasePlugin's convention is the camelCase key (same as `selectAll()` output). But wait — this is a subtle footgun, see Dev Notes → "CamelCasePlugin + `orderBy` column-name convention" for the exact behavior and why we pass `created_at` vs `createdAt`
  - [x] **Do NOT** add pagination (`LIMIT`/`OFFSET`, cursor, page-size param). Scope caps MVP at ≤50 todos (Journey 4). Pagination is Growth-phase and would introduce response-shape churn (`{items: [...], nextCursor}`) that breaks Story 2.3's simple array consumer
  - [x] **Do NOT** accept a filter argument (`{ completed?: boolean }`). FR-002 requires the full list; sectioning is a web-side concern (Story 2.5 splits active vs. completed via JS `.filter`)
  - [x] **Do NOT** cache the result (e.g., via a module-level Map). Postgres is the source of truth; caching adds invalidation complexity with zero benefit at MVP traffic levels

- [x] **Task 2: Add `GET /v1/todos` handler in `apps/api/src/routes/todos.ts`** (AC: 2, 3, 4)
  - [x] Extend the existing `todosRoutes` plugin — **same `typedApp` alias** from Story 2.1, no duplicate `withTypeProvider` call:
    ```ts
    // apps/api/src/routes/todos.ts
    import { Type } from '@sinclair/typebox';
    import type { FastifyPluginAsync } from 'fastify';
    import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
    import { CreateTodoInputSchema, TodoSchema } from '../schemas/todo.js';
    import * as todosRepo from '../repositories/todosRepo.js';

    const todosRoutes: FastifyPluginAsync = async (app) => {
      const typedApp = app.withTypeProvider<TypeBoxTypeProvider>();

      typedApp.post(
        '/todos',
        {
          schema: {
            body: CreateTodoInputSchema,
            response: { 201: TodoSchema, 400: { $ref: 'ErrorResponse#' } },
          },
        },
        async (request, reply) => {
          const todo = await todosRepo.create(request.body, app.db);
          reply.code(201);
          return todo;
        },
      );

      typedApp.get(
        '/todos',
        {
          schema: {
            response: { 200: Type.Array(TodoSchema) },
          },
        },
        async () => {
          return todosRepo.listAll(app.db);
        },
      );

      // Handlers for PATCH /todos/:id, DELETE /todos/:id land in stories 3.1, 3.2.
    };

    export default todosRoutes;
    ```
    - **Why `Type.Array(TodoSchema)` inline, not a named schema:** the array shape is purely a transport wrapper — it has no meaningful identity on its own and isn't referenced anywhere else. Naming it (`TodoArraySchema` with `$id: 'TodoArray'`) would pollute `components.schemas` with a redundant entry. The inline form generates a correct OpenAPI `{ type: 'array', items: { $ref: 'Todo#' } }` automatically
    - **Why `async () => { return ... }` not `async (req, reply) => { reply.code(200); return ... }`:** Fastify defaults GET responses to 200 — setting it explicitly is noise. Also no `request`/`reply` arg because the handler takes no input and needs no response customization (status, headers)
    - **Why no try/catch around `todosRepo.listAll(app.db)`:** same rule as Story 2.1 — the global error handler (Story 1.4's `plugins/error-handler.ts`) maps any thrown error (e.g., a Postgres connection drop mid-query) to the 500 envelope. A route-level try/catch would either swallow (bad) or re-throw (pointless)
  - [x] **Do NOT** introduce a new route file (e.g., `routes/todos-list.ts`). One file per resource is the architectural convention (architecture.md:531-533)
  - [x] **Do NOT** add a `onRequest` or `preHandler` hook to set cache headers (`Cache-Control: no-cache`, etc.). List data mutates on every create/toggle/delete — defaulting to no caching is Fastify's built-in behavior and matches MVP requirements
  - [x] **Do NOT** log the list response (neither via `app.log.info` nor `request.log.info`). Fastify's default pino logger emits request/response lines at `info` level; logging the body at that level leaks user-data (todo descriptions) into logs unnecessarily

- [x] **Task 3: Extend the unit test at `apps/api/src/repositories/todosRepo.test.ts`** (AC: 6)
  - [x] Add a new `describe` block alongside the existing `todosRepo.create — compiled insert shape (DummyDriver)` block:
    ```ts
    describe('todosRepo.listAll — compiled SELECT shape (DummyDriver)', () => {
      it('compiles to SELECT * FROM todos ORDER BY completed ASC, created_at ASC with no WHERE clause', () => {
        const db = createDummyDb();
        const compiled = db
          .selectFrom('todos')
          .selectAll()
          .orderBy('completed', 'asc')
          .orderBy('created_at', 'asc')
          .compile();

        expect(compiled.sql).toMatch(/select\s+\*\s+from\s+"todos"/i);
        expect(compiled.sql).toMatch(/order\s+by\s+"completed"\s+asc,\s+"created_at"\s+asc/i);
        expect(compiled.sql).not.toMatch(/where/i);
        expect(compiled.parameters).toEqual([]);
      });
    });
    ```
    - The `createDummyDb` helper from Story 2.1's test file is **reused** — no duplicate definition (if 2.1 defines it inside the file's module scope, it's already in-scope for the new describe)
    - **Do NOT** invoke `todosRepo.listAll(db)` and `await` it — `DummyDriver.acquireConnection().executeQuery()` returns `{ rows: [] }` synchronously, so `listAll` would return `[]`. Asserting `[]` proves nothing about the SQL shape (which is the whole point). Inspect the query builder instead
    - **Do NOT** use Kysely's `ExpressionBuilder` mock or similar — the `.compile()` call on a real (DummyDriver-backed) query builder is the cheapest, most faithful way to assert the SQL

- [x] **Task 4: Extend the contract test at `apps/api/test/contract.todos.test.ts`** (AC: 3, 4, 5)
  - [x] Add a new `describe('GET /v1/todos — contract', ...)` block after the existing Story 2.1 block. Share the top-level `beforeAll`/`afterAll` that construct `app` once per file — **do NOT** rebuild the app per describe:
    ```ts
    import { Value } from '@sinclair/typebox/value';
    import { TodoSchema } from '../src/schemas/todo.js';
    // ... existing imports from Story 2.1 ...

    describe('GET /v1/todos — contract', () => {
      // Reuses beforeAll(buildApp + migrateLatest), beforeEach(truncateTodos), afterAll(app.close)
      // from the top-level lifecycle hooks already in place.

      it('returns 200 [] on an empty table', async () => {
        const res = await app.inject({ method: 'GET', url: '/v1/todos' });

        expect(res.statusCode).toBe(200);
        expect(res.headers['content-type']).toBe('application/json; charset=utf-8');
        expect(res.json()).toEqual([]);
      });

      it('returns plain array (NOT {data}/{todos} wrapper)', async () => {
        const res = await app.inject({ method: 'GET', url: '/v1/todos' });

        const body = res.json();
        expect(Array.isArray(body)).toBe(true);
        expect(body).not.toHaveProperty('data');
        expect(body).not.toHaveProperty('todos');
      });

      it('returns [T1, T3, T2, T4] — active section (ASC) followed by completed section (ASC)', async () => {
        // Seed 4 todos with explicit created_at timestamps so ordering is deterministic
        // regardless of insert timing. Directly via Kysely — see Dev Notes → "Seeding strategy".
        const ids = {
          T1: '01927f00-0000-7000-8000-000000000001',
          T2: '01927f00-0000-7000-8000-000000000002',
          T3: '01927f00-0000-7000-8000-000000000003',
          T4: '01927f00-0000-7000-8000-000000000004',
        };
        const now = new Date('2026-04-20T10:00:00.000Z').getTime();
        await app.db
          .insertInto('todos')
          .values([
            { id: ids.T1, description: 'T1 active',    completed: false, userId: null, createdAt: new Date(now + 1000) },
            { id: ids.T2, description: 'T2 completed', completed: true,  userId: null, createdAt: new Date(now + 2000) },
            { id: ids.T3, description: 'T3 active',    completed: false, userId: null, createdAt: new Date(now + 3000) },
            { id: ids.T4, description: 'T4 completed', completed: true,  userId: null, createdAt: new Date(now + 4000) },
          ])
          .execute();

        const res = await app.inject({ method: 'GET', url: '/v1/todos' });

        expect(res.statusCode).toBe(200);
        const body = res.json();
        expect(body.map((t: { id: string }) => t.id)).toEqual([ids.T1, ids.T3, ids.T2, ids.T4]);
      });

      it('every returned element satisfies TodoSchema (structural validation)', async () => {
        await app.db
          .insertInto('todos')
          .values({
            id: '01927f00-0000-7000-8000-0000000000aa',
            description: 'seed',
            completed: false,
            userId: null,
          })
          .execute();

        const res = await app.inject({ method: 'GET', url: '/v1/todos' });
        const body = res.json() as unknown[];

        expect(body.length).toBeGreaterThan(0);
        for (const item of body) {
          expect(Value.Check(TodoSchema, item)).toBe(true);
        }
      });

      it('createdAt on every element matches ISO 8601 UTC ms pattern with Z suffix', async () => {
        await app.db
          .insertInto('todos')
          .values([
            { id: '01927f00-0000-7000-8000-0000000000bb', description: 'a', completed: false, userId: null },
            { id: '01927f00-0000-7000-8000-0000000000cc', description: 'b', completed: true,  userId: null },
          ])
          .execute();

        const res = await app.inject({ method: 'GET', url: '/v1/todos' });
        const body = res.json() as Array<{ createdAt: string }>;

        for (const item of body) {
          expect(item.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
        }
      });
    });
    ```
    - **Why hard-coded UUIDs** instead of `uuidv7()` for test seeds: determinism. If a test seeds via `uuidv7()` and asserts ordering, two sub-millisecond inserts could generate UUIDs with the same timestamp prefix, and a future developer asserting `[T1, T2, ...]` by UUID wouldn't spot the flake. Controlled IDs = zero ambiguity. The `uuidv7()` path is already exercised by Story 2.1's POST contract test
    - **Why explicit `createdAt` timestamps**: Postgres's `now()` at insert time resolves to microsecond precision, but sub-ms inserts in the same transaction could produce identical or near-identical timestamps. The T1→T4 ordering test needs deterministic gaps, so we set `createdAt` explicitly via `new Date(base + offset)`
    - **Why seed directly via Kysely, NOT via `todosRepo.create` + a fake `update`**: `todosRepo.update` doesn't exist until Story 3.1. The epic test notes mention it, but that's aspirational. Direct `db.insertInto(...).values([...])` is the right path; see Dev Notes → "Seeding strategy"
  - [x] **Do NOT** share test data across `it` blocks. `beforeEach(truncateTodos)` (already in place from Story 2.1's lifecycle) wipes rows — each test starts from a clean table
  - [x] **Do NOT** rely on `Promise.all([...inserts])` for seeding — concurrent inserts race on the `ORDER BY created_at` disambiguation. The `insertInto().values([...]).execute()` multi-row insert is atomic and preserves order via the `VALUES` list position

- [x] **Task 5: Run the full check script** (AC: 1–7)
  - [x] `npm run typecheck` — clean
  - [x] `npm run lint` — clean (the pre-existing `apps/api/src/db/index.ts:14` warning may remain per Story 1.6 deviations — do not touch)
  - [x] `npm run format:check` — clean
  - [x] `npm test --workspace apps/api` — expect: all pre-existing tests pass + new `listAll` unit test (1) + new `GET /v1/todos` contract tests (~5) — no regressions in Story 2.1's tests
  - [x] `npm run check` (aggregate) — exits 0
  - [x] Manual smoke: `docker compose up -d postgres`, `npm run dev --workspace apps/api`, then `curl http://localhost:3000/v1/todos` returns `[]` on a fresh DB; `curl -X POST http://localhost:3000/v1/todos -H 'content-type: application/json' -d '{"description":"test"}'` then `curl http://localhost:3000/v1/todos` returns a single-element array
  - [x] Verify `GET http://localhost:3000/docs/json` now shows `paths['/v1/todos']` with both `get` and `post` operations

## Dev Notes

### Seeding strategy: direct insert with controlled timestamps

The epic's *Test Scenarios* note says "seed four todos (T1 active, T2 completed, T3 active, T4 completed) via `todosRepo.create` + `todosRepo.update`". **`todosRepo.update` does not exist in Story 2.2** — it arrives in Story 3.1. Two paths to seed the test data:

**Option A — seed active via `todosRepo.create`, flip via inline Kysely update (rejected):**
```ts
await todosRepo.create({ description: 'T1 active' }, app.db);
await todosRepo.create({ description: 'T2 completed' }, app.db);
await app.db.updateTable('todos').set({ completed: true }).where('description', '=', 'T2 completed').execute();
// ... repeat for T3, T4
```
- Pro: exercises `create`
- Con: `create` uses `uuidv7()` and the current time, so two consecutive `create` calls can produce near-identical `created_at` (same ms) AND the test would need to look up IDs by description before asserting. Flaky under any CI clock behavior.

**Option B — seed all 4 directly via `app.db.insertInto(...).values([...]).execute()` (chosen):**
- Pro: controlled IDs, controlled timestamps, single SQL statement, zero timing ambiguity
- Con: bypasses the repo — but this is a **test-fixture concern**, not a production code path. The architectural boundary "routes → repositories → db" applies to production code only. Direct-DB seeding is the standard pattern in `apps/api/test/db.persistence.test.ts:37` and in the Journey 4 perf harness planned for Story 5.1
- Why this does NOT violate architecture: seeding is not a CRUD operation on behalf of a user — it's a test setup operation. The architecture's rule is "routes don't call Kysely directly"; test files have no such constraint

Option B is the right answer. Ignore the epic's offhand mention of `todosRepo.update` — it was written before the decomposition put `update` into Story 3.1.

### CamelCasePlugin + `orderBy` column-name convention

**This is a tricky interaction — get it right first try.** Kysely's `CamelCasePlugin` is a write-side plugin: it rewrites *emitted* SQL column names. But Kysely's query builder types come from your `Database` interface (`apps/api/src/db/schema.ts`), which is hand-written in **camelCase** (`createdAt`, `userId`). So in TypeScript:

- `db.selectFrom('todos').select(['createdAt'])` — TypeScript compiles fine (`createdAt` is a key of `TodoTable`); CamelCasePlugin emits `SELECT "created_at"` in the SQL
- `db.selectFrom('todos').orderBy('createdAt', 'asc')` — TypeScript compiles fine; CamelCasePlugin emits `ORDER BY "created_at" ASC`

**Equivalent outcomes.** Either camelCase or snake_case works functionally because CamelCasePlugin auto-converts. The **chosen convention** in this repo is camelCase (matches the `Database` interface and matches the `select(['createdAt'])` call in `apps/api/src/db/index.test.ts:18`). For `orderBy`, pass `'completed'` (no case conversion needed — single word) and `'created_at'` would also work but `'createdAt'` is the repo convention.

**Rule for this story:** use `orderBy('completed', 'asc').orderBy('createdAt', 'asc')`. But Task 3's compiled-SQL assertion regex must still match the emitted SQL `"created_at"` (snake_case in the actual SQL string), not the camelCase argument.

Wait — this creates a task-level correction. Let me reconcile: the unit test regex `/order\s+by\s+"completed"\s+asc,\s+"created_at"\s+asc/i` asserts the **compiled SQL** (output of `.compile()`), which under CamelCasePlugin is **snake_case**. The argument to `.orderBy(...)` in both `listAll` and the test builder is **camelCase** (`'createdAt'`). This is correct — the mismatch between argument (camelCase) and compiled SQL (snake_case) is the plugin's whole point.

**Correction to Task 1's code snippet:** use `.orderBy('createdAt', 'asc')` not `.orderBy('created_at', 'asc')`. The AC1 text says `created_at` because it's describing the **DB column**; the repo code uses `createdAt` (the `TodoTable` key). The emitted SQL is `created_at` either way. Use `createdAt` for consistency with the rest of the codebase (`db/index.test.ts`).

### Why two `.orderBy(...)` calls instead of `.orderBy(['completed', 'createdAt'])`

Kysely supports both forms:
- `.orderBy('completed', 'asc').orderBy('createdAt', 'asc')` — chained, one argument per call
- `.orderBy([sql`completed asc`, sql`"created_at" asc`])` — raw-SQL array
- `.orderBy('completed asc', 'createdAt asc')` — string-with-direction (older API, still works)

The **chained form** is the Kysely 0.28 canonical idiom for multi-column ordering — every function takes `(column, direction)` and composes. It's also the form that produces the cleanest compiled SQL for assertion (each `orderBy` call contributes exactly `"col" DIR` to the SQL, comma-separated by Kysely).

### When to extract a `serializeTodo` helper

Both `create` (Story 2.1) and `listAll` (this story) need to convert a raw DB row to a `Todo`:

```ts
{ id, description, completed, createdAt: date.toISOString(), userId }
```

**Rule: extract at the 3rd callsite.** Two callsites is fine — duplication is cheap and local. Extracting prematurely creates a helper that gets imported by one module and might not be the right abstraction when the 3rd consumer (Story 3.1's `update`) arrives. At that point, `update` will likely return `Todo` with the same shape, and a `serializeTodo(row: TodoRow): Todo` helper starts earning its keep.

Do NOT extract in this story. The `rows.map(row => ({...}))` block in `listAll` is the second instance; one more (Story 3.1) justifies the helper.

### Why the index matters (idx_todos_completed_created_at)

Migration `20260418_001_create_todos.ts` declares:
```ts
await db.schema
  .createIndex('idx_todos_completed_created_at')
  .on('todos')
  .columns(['completed', 'created_at'])
  .execute();
```

This is a composite B-tree index on `(completed, created_at)`. Postgres will use it for `ORDER BY completed ASC, created_at ASC` **as long as both columns are in the `ORDER BY` in that order with matching direction**. Our SQL matches exactly.

**What this buys us:** at 50+ todos (Journey 4 / NFR-001 threshold), the sort is index-backed instead of a sequential scan + sort. Below 50 rows it doesn't matter (Postgres will pick a `Seq Scan + Sort` plan regardless; the index is too costly vs. a full-table sort of tiny data). The index was declared defensively — Story 2.2 doesn't need to verify it's being hit (pg plan inspection is Epic 5 work).

**Regression guard:** if a future story swaps `ORDER BY completed ASC, created_at ASC` for `ORDER BY created_at ASC, completed ASC`, the index no longer applies (column order mismatch). The unit test's compiled-SQL regex catches this.

### Type-provider continuity from Story 2.1

Story 2.1 set up `app.withTypeProvider<TypeBoxTypeProvider>()` inside `todosRoutes`. Story 2.2 **reuses** that same `typedApp` alias — do NOT call `.withTypeProvider` again:

```ts
// ❌ wrong — creates a second alias, doesn't break but adds noise
const typedApp1 = app.withTypeProvider<TypeBoxTypeProvider>();
typedApp1.post('/todos', ...);
const typedApp2 = app.withTypeProvider<TypeBoxTypeProvider>();
typedApp2.get('/todos', ...);

// ✅ right
const typedApp = app.withTypeProvider<TypeBoxTypeProvider>();
typedApp.post('/todos', ...);
typedApp.get('/todos', ...);
```

The Story 2.1 implementation already places the `typedApp` alias at the top of the plugin function; just use it.

### `Type.Array(TodoSchema)` serialization performance

Fastify 5's response serialization via `fast-json-stringify` (the compiled schema path) is ~2× faster than default `JSON.stringify` for array responses. The speedup comes from:
1. Pre-compiled property access (no hidden-class deopt)
2. No `toJSON` method lookups
3. Tight loop for array elements with known shape

Declaring `response: { 200: Type.Array(TodoSchema) }` opts into this path. At 50 todos this is ~0.1ms vs ~0.3ms — meaningful for NFR-001's p95 ≤100ms budget once UI render overhead is added.

**Do NOT** omit the response schema "because it's just an array of Todo." The schema is the mechanism that triggers the compiled serializer.

### Empty-array response: 200 vs 204

HTTP semantics would allow `204 No Content` for an empty list, but it's semantically wrong for a list endpoint: the client explicitly asked for "all todos" — the correct answer is "here are zero of them", not "I have nothing to return." REST convention for list endpoints is:
- Populated list → `200` with array body
- Empty list → `200` with `[]` body
- Collection deleted entirely (rare) → `200 []` still correct; `410 Gone` only if the resource type itself is retired

Also, `204` has no body — clients parsing `res.json()` would choke. `200 []` is the one right answer.

### Previous Story Intelligence

**From Story 2.1 (`POST /v1/todos`, schemas, `create`) — all load-bearing:**
- `TodoSchema` + `CreateTodoInputSchema` in `apps/api/src/schemas/todo.ts` — reused verbatim in 2.2's response schema
- `@fastify/type-provider-typebox` already installed — no new dep
- `ajv-formats` already wired into Fastify's validator AJV (Story 2.1 Task 6) — `format: 'date-time'` on `createdAt` works out of the box for the GET response serializer
- `removeAdditional: false` already set in `fastify({ ajv: { ... } })` — no impact on GET (no request body to strip), but preserve it
- `todosRepo.create` established the "repo returns Todo with `createdAt: .toISOString()`" serialization pattern — `listAll` follows the exact same pattern
- `plugins/swagger.ts` already calls `app.addSchema(TodoSchema)` and `app.addSchema(CreateTodoInputSchema)` — the array response `Type.Array(TodoSchema)` will auto-resolve the inner `$ref: 'Todo#'` via those registrations

**From Story 1.4 (plugin stack) — continued reliance:**
- `/v1` prefix applied at `app.register(todosRoutes, { prefix: '/v1' })` — our new GET route path is `'/todos'` (not `'/v1/todos'`)
- Global error handler catches thrown errors → 500 envelope — our handler has no try/catch

**From Story 1.3 (DB layer) — continued reliance:**
- `app.db` decorated; `CamelCasePlugin` already wired; migration `20260418_001_create_todos.ts` created the table + the composite index this query uses
- `truncateTodos(db)` in `test/setup.ts` is the test-isolation hook — reused verbatim

**Contract-test lifecycle from Story 2.1:**
- `beforeAll` opens `app` once (via `buildApp()` + `migrateLatest(app.db)`) — share it in 2.2; do NOT add a new `buildApp`
- `beforeEach` calls `truncateTodos(app.db)` — each test starts with an empty table; 2.2's seeding happens inside the `it` blocks
- `afterAll` closes `app` — no duplicate cleanup needed

### Git Intelligence

- The last 6 commits on `master` are Stories 1.1 → 1.6. Story 2.1's implementation commit is pending (`feat: story 2.1 implemented`). Story 2.2 will land as `feat: story 2.2 implemented` after 2.1
- File-scope discipline has held across the sprint: no incidental refactors, no cleanups creeping in. Keep the pattern — 2.2 touches exactly `todosRepo.ts`, `routes/todos.ts`, `todosRepo.test.ts`, `contract.todos.test.ts`

### Latest Tech Information

**Kysely 0.28.x** (already installed):
- `.selectAll()` — emits `SELECT *` in SQL; column-name transformation at row-parse time via CamelCasePlugin
- `.orderBy(column, direction)` — chainable for multi-column sort; takes `'asc'` or `'desc'` (not `'ASC'`/`'DESC'` — lowercase enforced by the literal type)
- `.execute()` — returns `Array<RowType>`; for zero rows returns `[]` (never `null`/`undefined`)
- `.compile()` on a query builder produces `{ sql, parameters, query }` — safe for unit-test assertions, same value the runtime would send to `pg`

**TypeBox `Type.Array` behavior:**
- `Type.Array(TodoSchema)` produces `{ type: 'array', items: { $ref: '...' } }` at JSON-schema emit time IF `TodoSchema` has an `$id` registered via `app.addSchema`. Otherwise it inlines the full `items` schema. Since Story 2.1 registered `TodoSchema` with `$id: 'Todo'` and called `app.addSchema`, the OpenAPI emits `{ type: 'array', items: { $ref: '#/components/schemas/Todo' } }` — clean, referentially correct

### References

- Epic requirements: [epics.md § Story 2.2](../planning-artifacts/epics.md) (lines 514–554)
- Architecture — API boundaries, `todosRepo` location: [architecture.md § Complete Project Directory Structure](../planning-artifacts/architecture.md) (line 530)
- Architecture — `repositories/todosRepo.ts::listAll` mapping: [architecture.md § Requirements-to-Structure Mapping](../planning-artifacts/architecture.md) (line 618 — FR-002 row)
- Architecture — ordering as NFR-001 / NFR-002 headroom: [architecture.md § NFR Coverage](../planning-artifacts/architecture.md) (lines 735–739)
- PRD — FR-002 list ordering: [PRD.md § Functional Requirements](../planning-artifacts/PRD.md) (FR-002)
- Migration — composite index that backs this query: `apps/api/src/db/migrations/20260418_001_create_todos.ts` (lines 13–17)
- Previous story: [2-1 TypeBox schemas + `todosRepo.create` + `POST /v1/todos`](./2-1-typebox-schemas-todosrepo-create-post-v1-todos.md) — **direct antecedent**; schemas, type-provider wiring, `ajv-formats`, `createdAt` serialization pattern
- Previous story: [1-4 API plugin stack](./1-4-api-plugin-stack-v1-prefix-global-error-handler.md) — `/v1` prefix, error handler, schema registration via `plugins/swagger.ts`
- Previous story: [1-3 DB layer](./1-3-database-layer-kysely-todos-migration-healthz-db-probe.md) — `app.db` decoration, CamelCasePlugin, migration + index

### Project Structure Notes

- **No new files** — Story 2.2 extends existing files only
- **Modified files:**
  - `apps/api/src/repositories/todosRepo.ts` — `listAll` export added alongside `create`
  - `apps/api/src/repositories/todosRepo.test.ts` — new `describe` block for `listAll`'s compiled SQL
  - `apps/api/src/routes/todos.ts` — `GET /todos` handler added alongside `POST /todos`
  - `apps/api/test/contract.todos.test.ts` — new `describe('GET /v1/todos — contract', ...)` block
- **No web-side changes** — web's list consumer is Story 2.3 (`useTodos` hook) + Story 2.5 (`TodoList`)

### Testing Standards

- **Unit**: co-located `*.test.ts` (new describe block in `todosRepo.test.ts`)
- **Contract/integration**: `apps/api/test/contract.todos.test.ts` (extended, not replaced)
- **Lifecycle**: reuse 2.1's `beforeAll`/`afterAll`/`beforeEach` at the top level — do NOT nest a second lifecycle inside the new describe
- **Coverage**: `@vitest/coverage-v8` available but no threshold enforced at story level (unchanged from 2.1)

## Dev Agent Record

### Agent Model Used

Claude Opus 4.7 (1M context) — model id `claude-opus-4-7[1m]`

### Debug Log References

- Contract test `every returned element satisfies TodoSchema` initially failed: `Value.Check` returns `false` for any `format` keyword (uuid, date-time) unless that format is registered via `FormatRegistry.Set(...)`. Fixed by registering both formats inside `apps/api/test/contract.todos.test.ts` (test-local, guarded by `FormatRegistry.Has(...)` so it stays idempotent across files that import the test).
- Regression in `apps/api/src/app.test.ts:71-80`: pre-2.2 test asserted `GET /v1/todos` was NOT yet registered. Flipped the assertion to `true` and renamed the test to reflect the new baseline.
- Prettier flagged the multi-row `insertInto('todos').values([...])` block in the contract test (long lines on the T1/T2/T3/T4 object literals). Ran `prettier --write` which expanded each row onto its own multi-line object. No behavioral change.

### Completion Notes List

- `todosRepo.listAll(db)` added to `apps/api/src/repositories/todosRepo.ts` — single Kysely query `SELECT * FROM todos ORDER BY completed ASC, created_at ASC`, row→Todo serialization duplicated from `create` (helper extraction deferred to Story 3.1's `update` per the 3rd-callsite rule in Dev Notes).
- `GET /v1/todos` registered in `apps/api/src/routes/todos.ts` using the existing `typedApp` alias with `response: { 200: Type.Array(TodoSchema) }` — no second `withTypeProvider` call. Handler has no `request`/`reply` args, no try/catch (global error handler from Story 1.4 covers failures).
- Unit test in `todosRepo.test.ts`: `describe('todosRepo.listAll — compiled SELECT shape (DummyDriver)')` asserts `SELECT * FROM "todos" ORDER BY "completed" ASC, "created_at" ASC` with empty parameters and no WHERE clause. Uses the existing `createDummyDb()` helper.
- Contract test file `apps/api/test/contract.todos.test.ts`: lifecycle hooks (`beforeAll`/`afterAll`/`beforeEach`) hoisted to top-level so the new `describe('GET /v1/todos — contract')` block reuses the same `app` instance as the POST block. Five `it` blocks cover: empty `200 []`, plain-array (no wrapper), T1→T3→T2→T4 ordering via controlled timestamps, `Value.Check(TodoSchema, item)` per element, and `createdAt` ISO-UTC-ms regex.
- `FormatRegistry.Set` calls registered for `uuid` and `date-time` so `Value.Check` honours formats on the client side of the contract. Registration is guarded by `FormatRegistry.Has(...)`.
- Manual smoke verified: empty list returns `[]`; after POST the list contains the new row; active items precede completed items; `/docs/json` exposes both `get` and `post` for `/v1/todos` with unchanged `components.schemas`.
- `npm run check` (typecheck + lint + format:check + test across both workspaces) exits 0. 64 api tests + 9 web tests pass. Only pre-existing lint warning from Story 1.6 remains (`apps/api/src/db/index.ts:14`), untouched.

### File List

- Modified: `apps/api/src/repositories/todosRepo.ts` — added `listAll` export alongside existing `create`.
- Modified: `apps/api/src/repositories/todosRepo.test.ts` — added `describe('todosRepo.listAll — compiled SELECT shape (DummyDriver)')` block.
- Modified: `apps/api/src/routes/todos.ts` — added `typedApp.get('/todos', ...)` handler alongside existing `post`; imported `Type` from `@sinclair/typebox`.
- Modified: `apps/api/test/contract.todos.test.ts` — hoisted lifecycle hooks, registered `uuid` / `date-time` formats on `FormatRegistry`, added `describe('GET /v1/todos — contract')` with 5 `it` blocks; imported `FormatRegistry`, `Value`, and `TodoSchema`.
- Modified: `apps/api/src/app.test.ts` — updated route-registration assertion to expect `GET /v1/todos` = `true` (was `false` under Story 2.1's baseline).
- Modified: `_bmad-output/implementation-artifacts/sprint-status.yaml` — story `2-2-...` moved `ready-for-dev → in-progress → review`.
- Modified: `_bmad-output/implementation-artifacts/2-2-todosrepo-listall-get-v1-todos-with-active-asc-ordering.md` — Status, task/subtask checkboxes, Dev Agent Record, File List, Change Log.

## Change Log

| Date       | Version | Change                                                                                             | Author |
| ---------- | ------- | -------------------------------------------------------------------------------------------------- | ------ |
| 2026-04-20 | 1.0     | Implemented `todosRepo.listAll` + `GET /v1/todos` with active-ASC ordering; contract + unit tests. | Dev    |
