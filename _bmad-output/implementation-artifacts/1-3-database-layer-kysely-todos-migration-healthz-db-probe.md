# Story 1.3: Database layer — Kysely + todos migration + `/healthz` DB probe

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want Kysely wired to Postgres with the `todos` table migrated and `/healthz` reporting DB status,
So that subsequent stories (repositories, routes, contract tests) can persist and query todos with full type safety and a verified live connection.

## Acceptance Criteria

**AC1 — Kysely factory with `PostgresDialect` + `CamelCasePlugin`**
- **Given** Kysely is installed alongside the `pg` driver and the `uuid` library
- **When** the engineer inspects `apps/api/src/db/index.ts`
- **Then** a `createDb(connectionString: string): Kysely<Database>` factory constructs a `Kysely<Database>` instance with `PostgresDialect` (pool built from the passed `DATABASE_URL`) and the `CamelCasePlugin` enabled
- **And** `src/db/schema.ts` exports a `Database` interface declaring a `todos` table typed to match the migrated columns below, using **camelCase** keys (`createdAt`, `userId` — `CamelCasePlugin` bridges to snake_case at query time)

**AC2 — Migration creates the `todos` table idempotently via `npm run migrate`**
- **Given** a migration file `apps/api/src/db/migrations/20260418_001_create_todos.ts` exists with `up`/`down` exports
- **When** the engineer runs `npm run migrate --workspace apps/api` against a live Postgres
- **Then** the `todos` table exists with these columns (snake_case on disk):
  - `id` — `uuid` primary key
  - `description` — `varchar(500)` NOT NULL
  - `completed` — `boolean` NOT NULL DEFAULT `false`
  - `created_at` — `timestamptz` NOT NULL DEFAULT `now()`
  - `user_id` — `text` NULL
- **And** the index `idx_todos_completed_created_at` exists on `(completed, created_at)`
- **And** re-running `npm run migrate --workspace apps/api` is idempotent — no duplicate migration applied (verified via the `kysely_migration` table row count)

**AC3 — Data survives `docker compose restart postgres` (NFR-003 binding constraint)**
- **Given** a todo row is inserted after migration
- **When** the engineer runs `docker compose restart postgres` and waits for the healthcheck
- **Then** the previously inserted row is still present on query (verifies the `pg-data` named volume binding; this is the explicit binding constraint called out in architecture.md:852)

**AC4 — `/healthz` probes Postgres via `SELECT 1` and returns `ok` or `503 degraded`**
- **Given** `src/routes/health.ts` has been upgraded to probe the DB
- **When** a client issues `GET /healthz` while Postgres is reachable
- **Then** the handler runs `SELECT 1` through Kysely and responds `200 { "status": "ok", "db": "ok" }`
- **And** when the DB is unreachable (or `SELECT 1` throws) the handler responds `503 { "status": "degraded", "db": "error" }` — **the process does NOT crash; the error is logged via pino and swallowed by the route handler**
- **And** the route remains unversioned (not under `/v1`)

## Tasks / Subtasks

- [x] **Task 1: Install DB dependencies** (AC: 1, 2)
  - [x] Add runtime deps to `apps/api/package.json`: `kysely` (`^0.27.0`), `pg` (`^8.14.0`), `uuid` (`^11.0.0`). See Dev Notes → "Version pinning rationale"
  - [x] Add dev deps to `apps/api/package.json`: `@types/pg` (`^8.11.0`), `@types/uuid` (`^10.0.0`)
  - [x] Add two scripts to `apps/api/package.json`:
    - `"migrate": "tsx src/db/migrate.ts"`
    - `"db:reset": "tsx src/db/migrate.ts --reset"` (optional `--reset` flag tears down all migrations then re-migrates; see Dev Notes → "`migrate.ts` reference shape" for flag handling)
  - [x] From repo root: `npm install` — confirm `node_modules/kysely`, `node_modules/pg`, `node_modules/uuid` exist and the workspace resolves (`npm ls --workspace apps/api | grep kysely`)

- [x] **Task 2: Author `src/db/schema.ts` — typed `Database` interface** (AC: 1)
  - [x] Create `apps/api/src/db/schema.ts` exporting the `Database` interface (keys are camelCase; `CamelCasePlugin` maps to snake_case at query time)
  - [x] See Dev Notes → "`src/db/schema.ts` reference shape" for the exact shape. `TodoTable` uses `Generated<...>` only for the `createdAt` DEFAULT (so inserts can omit it) — `id` is **not** `Generated` because the app mints UUIDs via `uuid.v7()`
  - [x] **Do NOT** use Kysely's `ColumnType<...>` unless the column has distinct read/insert/update shapes. For `todos` only `createdAt` needs this (insert-optional due to DB default)
  - [x] Export the `TodoTable` sub-interface so repositories (Story 2.1+) can import concrete row types without re-deriving from `Database`

- [x] **Task 3: Author `src/db/index.ts` — Kysely factory** (AC: 1)
  - [x] Create `apps/api/src/db/index.ts` exporting `createDb(connectionString: string): Kysely<Database>`
  - [x] Inside `createDb`:
    1. `const pool = new Pool({ connectionString, max: 10 })` — `pg.Pool` with a modest upper bound suitable for single-user MVP (300 req/min rate limit from architecture § Rate limiting)
    2. `return new Kysely<Database>({ dialect: new PostgresDialect({ pool }), plugins: [new CamelCasePlugin()] })`
  - [x] Add the Fastify decorator type augmentation to this file (bottom of the file):
    ```ts
    declare module 'fastify' {
      interface FastifyInstance {
        db: Kysely<Database>;
      }
    }
    ```
  - [x] See Dev Notes → "`src/db/index.ts` reference shape" for the full source. Import as `import { createDb } from './db/index.js';` elsewhere (NodeNext requires the `.js` extension)
  - [x] **Do NOT** eagerly call `pool.connect()` or ping the DB inside `createDb`. The pool opens lazily on first query — this keeps `buildApp` fast and keeps unit tests that never query from needing a live Postgres

- [x] **Task 4: Author the migration `20260418_001_create_todos.ts`** (AC: 2)
  - [x] Create `apps/api/src/db/migrations/20260418_001_create_todos.ts` with `up(db)` and `down(db)` exports
  - [x] `up` creates the `todos` table with the 5 columns from AC2 (snake_case on disk) + the composite index `idx_todos_completed_created_at` on `(completed, created_at)`
  - [x] `down` drops the index then the table (reverse order)
  - [x] See Dev Notes → "migration reference shape" for the exact Kysely builder calls. Use `sql\`now()\`` for the `created_at` default and `varchar(500)` for `description` length enforcement at the DB layer (defense in depth behind the Story 2.1 TypeBox schema)
  - [x] **Migration filename contract:** `YYYYMMDD_NNN_<slug>.ts`. Kysely's `FileMigrationProvider` sorts files alphabetically and records the filename (without extension) in the `kysely_migration` table as the unique migration key. Keep this format for every future migration (this is the first one; the contract is locked here)

- [x] **Task 5: Author `src/db/migrate.ts` — Kysely migrator CLI** (AC: 2)
  - [x] Create `apps/api/src/db/migrate.ts` as the CLI invoked by `npm run migrate`
  - [x] Use `Migrator` + `FileMigrationProvider`, pointing `migrationFolder` at the `migrations/` directory alongside this file
  - [x] On success: log `✓ <migrationName>` per applied migration to stdout; on any failed migration: log `✗ <migrationName>`, log the error via `console.error`, and `process.exit(1)`
  - [x] Call `db.destroy()` at the end (success or failure) so the script exits cleanly — a lingering pool blocks Node from exiting
  - [x] Optional `--reset` flag: when present, call `migrateDown()` in a loop until `results` is empty, then `migrateToLatest()`. This satisfies the `db:reset` deferred-work item from Story 1.1's review. Fail the script hard if `--reset` is invoked against a prod-looking URL (heuristic: throw if `DATABASE_URL` does not contain `localhost` or `127.0.0.1` — prevents accidental prod wipe)
  - [x] See Dev Notes → "`src/db/migrate.ts` reference shape" for the full source — specifically the `FileMigrationProvider` incantation using `new URL('./migrations', import.meta.url)` for ESM-compatible folder resolution
  - [x] **Gotcha:** `FileMigrationProvider` dynamically imports every file in `migrations/` at runtime. Under `tsx` the `.ts` extension is handled transparently. **Do NOT** precompile migrations to `.js` — this adds a build step and breaks the one-command goal

- [x] **Task 6: Wire the DB into `buildApp` with a lifecycle hook** (AC: 1, 4)
  - [x] Update `apps/api/src/app.ts`:
    1. Extend `BuildAppOptions` with an optional `db?: Kysely<Database>` for test overrides (signature: `{ config?: Record<string, unknown>; db?: Kysely<Database> }`)
    2. Inside `buildApp`, after `@fastify/env` is registered and before `healthRoutes` is registered: `const db = opts.db ?? createDb(app.config.DATABASE_URL); app.decorate('db', db);`
    3. Register an `onClose` hook that destroys the Kysely instance: `app.addHook('onClose', async () => { await db.destroy(); });`
  - [x] **Critical ordering:** create `db` **after** `@fastify/env` registration (so `app.config.DATABASE_URL` is populated), but **before** `healthRoutes` registration (so the route sees `app.db` in its plugin scope)
  - [x] **Critical: pool cleanup on test-override path.** If `opts.db` is provided by a test, the test owns that instance and should `await db.destroy()` itself — `app.close()` still fires the `onClose` hook which calls `db.destroy()`, so tests passing a shared Kysely instance across multiple `buildApp` calls must **not** reuse the instance after the first `app.close()`. Use one Kysely per test-scope (`beforeEach` / `beforeAll` paired with the corresponding `close`)
  - [x] Keep the existing `try { ... } catch (err) { await app.close(); throw err; }` wrapper — it already handles cleanup if env or route registration throws. `onClose` will run and destroy `db` on the failure path

- [x] **Task 7: Upgrade `src/routes/health.ts` — `SELECT 1` probe** (AC: 4)
  - [x] Replace the body with a probe against `app.db` using `sql\`SELECT 1\`.execute(app.db)`
  - [x] On success: return `{ status: 'ok', db: 'ok' }` (defaults to `200`)
  - [x] On failure: `app.log.error({ err }, 'healthz db probe failed')`, then `reply.code(503); return { status: 'degraded', db: 'error' };`
  - [x] **Must NOT re-throw** — re-throwing escalates to the global error handler (which lands in Story 1.4) and would produce a `500` envelope instead of the contracted `503 { status, db }` shape. Swallow via `try/catch` inside the handler
  - [x] See Dev Notes → "`src/routes/health.ts` reference shape" for the full source
  - [x] **Do NOT** add a query-result assertion (`result[0].ok === 1` etc.). `SELECT 1` either succeeds (live DB) or throws (connection / auth / permission failure). Result shape is not load-bearing

- [x] **Task 8: Update unit tests — `src/app.test.ts`** (AC: 1, 4)
  - [x] The existing three tests must continue to pass. Adjust them to pass a stubbed `db` so unit tests don't require live Postgres:
    - Test 1 (route registration): pass `opts.db: buildStubDb('ok')` — the healthz route gets registered regardless of DB state
    - Test 2 (healthz `ok` branch): pass `opts.db: buildStubDb('ok')`, assert `200 { status: 'ok', db: 'ok' }`
    - Test 3 (fail-fast on missing env): unchanged — `buildApp({ config: {} })` rejects before DB is constructed
  - [x] Add a new Test 4 (healthz `degraded` branch): pass `opts.db: buildStubDb('throw')`, assert `503 { status: 'degraded', db: 'error' }` and that `app.log.error` was called (spy on `app.log.error` via `vi.spyOn`)
  - [x] See Dev Notes → "stub DB helper for unit tests" for a ~15-line helper that returns a `Kysely<Database>`-shaped object whose `sql\`...\`.execute()` path either resolves or rejects
  - [x] `afterEach(async () => { await app?.close(); app = undefined; })` stays — the `onClose` hook will call `db.destroy()` on the stub, so the stub's `destroy` must be a no-op (`async () => {}`)

- [x] **Task 9: Add unit test — `src/db/index.test.ts` (CamelCasePlugin compile check)** (AC: 1)
  - [x] Create `apps/api/src/db/index.test.ts` — co-located unit test, no DB required
  - [x] Use Kysely's compile API (no driver execution) to verify `CamelCasePlugin` is actually wired:
    ```ts
    const db = createDb('postgresql://unused:unused@localhost/never');
    const compiled = db.selectFrom('todos').select(['createdAt', 'userId']).compile();
    expect(compiled.sql).toMatch(/select\s+"created_at",\s*"user_id"\s+from\s+"todos"/i);
    await db.destroy();
    ```
  - [x] This catches the "forgot to register CamelCasePlugin" regression before it reaches integration tests (cheap, fast, zero-dependency)
  - [x] **Note on the unused connection string:** `createDb` constructs the pool lazily — no connection attempt happens until the first query executes. `.compile()` never executes; it builds SQL in-process only. Safe

- [x] **Task 10: Author `apps/api/test/setup.ts` + integration tests** (AC: 2, 3, 4)
  - [x] Create `apps/api/test/` folder (the integration test home; architecture.md:534–539)
  - [x] Create `apps/api/test/setup.ts` with shared helpers:
    - `getTestDbUrl()` — reads `DATABASE_URL` from env (tests inherit the local dev / CI value); fail hard with a readable error if unset
    - `migrateLatest(db)` — programmatic invocation of the Kysely `Migrator` against the test DB (reuses the same `FileMigrationProvider` pattern as `migrate.ts`)
    - `truncateTodos(db)` — `sql\`TRUNCATE TABLE todos\``; call in `beforeEach` for test isolation
  - [x] Create `apps/api/test/db.migration.test.ts` covering AC2:
    - **Test:** `migrateToLatest` applies `20260418_001_create_todos`; assert the `information_schema.tables` row for `todos` exists AND `information_schema.columns` reports the exact 5 columns (name + data type) AND `pg_indexes` reports `idx_todos_completed_created_at` on `todos(completed, created_at)`
    - **Test:** idempotent re-run — call `migrator.migrateToLatest()` twice; second call returns `results: []` and the `kysely_migration` table row count does not change
  - [x] Create `apps/api/test/db.persistence.test.ts` covering AC3:
    - **Test (local-only):** insert a row with a known UUID v7 id; run `docker compose restart postgres` via `child_process.exec('docker compose restart postgres', { cwd: repoRoot })`; poll `pg_isready` (or a simple `SELECT 1` retry) until the container is healthy; re-query; assert the row is present
    - **Wrap in `describe.skipIf(process.env.CI === 'true')`** — in CI, Postgres runs as a service container, not docker-compose; the test would false-fail. The durability contract is verified locally; CI's alternative proof is that migrations + persistence work against a fresh service container each run, which is covered by the migration test above
  - [x] Create `apps/api/test/health.integration.test.ts` covering AC4 against a real `buildApp()` (no DB stub):
    - **Test (ok path):** `const app = await buildApp()` (real DB); `app.inject({ method: 'GET', url: '/healthz' })` → `200 { status: 'ok', db: 'ok' }`
    - **Test (degraded path):** `const app = await buildApp()`; `await app.db.destroy()` (force the pool closed); `app.inject({ method: 'GET', url: '/healthz' })` → `503 { status: 'degraded', db: 'error' }`. Do NOT call `app.close()` on the degraded-path app *before* the inject — only after, otherwise the inject hits a destroyed Fastify instance
  - [x] See Dev Notes → "integration test conventions" for the exact `beforeAll` / `afterAll` / `beforeEach` setup shape

- [x] **Task 11: Update `tsconfig.json` `include` to cover `test/`** (AC: 2, 3, 4)
  - [x] Verify `apps/api/tsconfig.json` already includes `test/**/*.ts` in the `include` array — Story 1.2 added this as a safety net (see `tsconfig.json` line 9)
  - [x] Verify `npx tsc -p apps/api/tsconfig.json --noEmit` exits 0 after `test/` files land

- [x] **Task 12: End-to-end smoke verification** (AC: 1, 2, 3, 4 — pre-review manual check)
  - [x] `docker compose up -d postgres` (container healthy within 30s per Story 1.1 AC)
  - [x] `cp apps/api/.env.example apps/api/.env` (if not already present); do NOT commit `.env`
  - [x] `npm install` — exits 0; workspace picks up `kysely`, `pg`, `uuid`
  - [x] `npm run migrate --workspace apps/api` — logs `✓ 20260418_001_create_todos`; exits 0
  - [x] `npm run migrate --workspace apps/api` again — logs nothing new (no `✓`); exits 0 (idempotency)
  - [x] `npm run dev --workspace apps/api` — starts Fastify; `curl -sSf http://localhost:3000/healthz` returns `{"status":"ok","db":"ok"}` with `Content-Type: application/json; charset=utf-8`
  - [x] Stop the Postgres container (`docker compose stop postgres`); curl `/healthz` again — returns `503 {"status":"degraded","db":"error"}` (Fastify process stays alive). Restart Postgres (`docker compose start postgres`); curl again → `200 { status, db }`
  - [x] `npm test --workspace apps/api` — all unit tests pass (4 in `app.test.ts`, 1 in `db/index.test.ts`) AND integration tests pass (migration, persistence-local, healthz ok/degraded)
  - [x] `npx tsc -p apps/api/tsconfig.json --noEmit` — exits 0

## Dev Notes

### Scope discipline — what this story is and isn't

**This story is the DB layer + probed `/healthz` — nothing else.** Scope hard stops:

- **Repositories are out.** `src/repositories/todosRepo.ts` (architecture.md:530) does NOT land in this story. It arrives with Story 2.1 alongside the first `POST /v1/todos` route. Inserts in this story's integration tests go **directly through Kysely** (via `db.insertInto('todos').values({...}).execute()`), not through a repo layer.
- **TypeBox schemas are out.** No `src/schemas/`, no `Todo` / `CreateTodoInput`. TypeBox arrives with Story 2.1's request schemas. The DB `Database` interface (`schema.ts`) is **hand-written, not TypeBox-derived** — it mirrors the migration column set.
- **Routes beyond `/healthz` are out.** No `/v1/todos`, no `src/routes/todos.ts`, no `/v1` prefix plugin. The `/healthz` upgrade is the only route change.
- **Plugin stack is out.** No `@fastify/cors`, `@fastify/helmet`, `@fastify/rate-limit`, `@fastify/swagger`. **All still Story 1.4's deliverable** — resist the temptation to wire them because "we're already editing `app.ts`".
- **Global error handler is out.** Still Story 1.4. The `/healthz` degraded-path handling lives **inside the route** (not via the global handler) specifically because the contracted response shape (`{ status, db }`) differs from the Fastify error envelope.
- **Web app is out.** `apps/web/` doesn't exist yet (arrives in Story 1.5). Ignore it entirely.
- **CI is out.** No changes to `.github/workflows/`. Story 1.6 wires the migrate step into CI.

If you find yourself installing `@fastify/cors`, `@fastify/helmet`, `@sinclair/typebox`, `@fastify/swagger*`, `@fastify/rate-limit`, or creating `src/repositories/`, `src/schemas/`, `src/errors/`, `src/plugins/`, or the `/v1` prefix plugin — **stop**, you've crossed into a later story's scope.

### Target workspace layout (after this story)

```
apps/api/
├── package.json                        ← + kysely, pg, uuid, @types/pg, @types/uuid; + migrate & db:reset scripts
├── tsconfig.json                       ← unchanged (test/** already included)
├── .env.example                        ← unchanged
└── src/
    ├── server.ts                       ← unchanged
    ├── app.ts                          ← + createDb → app.decorate('db', db) + onClose hook
    ├── app.test.ts                     ← updated: 4 tests, each with stub db
    ├── config.ts                       ← unchanged
    ├── db/
    │   ├── index.ts                    ← NEW: createDb factory + fastify module augmentation
    │   ├── index.test.ts               ← NEW: CamelCasePlugin compile-check unit test
    │   ├── schema.ts                   ← NEW: Database + TodoTable interfaces
    │   ├── migrate.ts                  ← NEW: Kysely migrator CLI
    │   └── migrations/
    │       └── 20260418_001_create_todos.ts  ← NEW: up/down
    ├── routes/
    │   └── health.ts                   ← UPDATED: SELECT 1 probe + 200/503 branches
└── test/
    ├── setup.ts                        ← NEW: test-DB helpers (getTestDbUrl, migrateLatest, truncateTodos)
    ├── db.migration.test.ts            ← NEW: AC2 — schema + idempotency
    ├── db.persistence.test.ts          ← NEW: AC3 — survives docker compose restart
    └── health.integration.test.ts      ← NEW: AC4 — ok + degraded via real buildApp
```

**That's 7 new source files, 4 new test files, 3 modified files (`package.json`, `app.ts`, `routes/health.ts`), 1 modified test file (`app.test.ts`).**

Directories intentionally NOT created in this story (arrive later):
- `src/plugins/`, `src/schemas/`, `src/errors/`, `src/repositories/` — Story 1.4 / 2.1
- `apps/web/` — Story 1.5

### Version pinning rationale

```
"kysely":       "^0.27.0"   ← current stable line; ships CamelCasePlugin, FileMigrationProvider, Migrator
"pg":           "^8.14.0"   ← Node Postgres; Kysely PostgresDialect uses this driver directly
"uuid":         "^11.0.0"   ← v7() stabilized in v9; v11 is current. Use uuid.v7() for time-ordered IDs (architecture.md:193)
"@types/pg":    "^8.11.0"   ← type defs for the pg driver
"@types/uuid":  "^10.0.0"   ← type defs for the uuid package (stays at 10.x even as uuid hits 11.x; upstream convention)
```

- **Caret ranges** per the Story 1.2 convention — `npm install` picks up patch/minor updates, ABI-breaking majors are pinned.
- **No `drizzle-orm`, `prisma`, `typeorm`.** Architecture locked Kysely (architecture.md:161). If you see one of these listed somewhere, it's cruft from unrelated research — ignore it.
- **UUID library specifically, not `crypto.randomUUID()`.** Node's `crypto.randomUUID()` produces v4 UUIDs (random). Architecture explicitly requires **v7** (time-ordered — architecture.md:193) for clean `created_at ASC` ordering (FR-002) with stable index performance. `uuid.v7()` is the only practical source in Node ecosystem today.

### `src/db/schema.ts` reference shape

```ts
// apps/api/src/db/schema.ts
// Hand-written DB interface. Matches migration 20260418_001 column set.
// Keys are camelCase — CamelCasePlugin maps to snake_case in SQL at query time.

import type { Generated } from 'kysely';

export interface TodoTable {
  id: string;                            // uuid v7, minted by the app via uuid.v7()
  description: string;                   // varchar(500) NOT NULL
  completed: boolean;                    // NOT NULL DEFAULT false — insert-required (no DB default shortcut used in inserts per architecture § Data consistency)
  createdAt: Generated<Date>;            // timestamptz NOT NULL DEFAULT now() — Generated so inserts may omit
  userId: string | null;                 // text NULL — nullable per FR-005 / NFR-005
}

export interface Database {
  todos: TodoTable;
}
```

**Notes on `Generated<T>`:** Kysely's `Generated<T>` marks a column as insert-optional (the DB fills it in). Only `createdAt` qualifies — inserts can omit it and Postgres's `DEFAULT now()` applies. `completed` has a DB default too, but architecture's data-consistency rule (explicit values on writes) means inserts always specify it. Keeping `completed: boolean` (not `Generated<boolean>`) enforces that at compile time.

**Why no `ColumnType<Select, Insert, Update>`:** None of the 5 columns need distinct read/insert/update shapes. Reach for `ColumnType` only when a column's TS type differs between SELECT, INSERT, and UPDATE (e.g., a JSON column read as parsed object, written as string).

### `src/db/index.ts` reference shape

```ts
// apps/api/src/db/index.ts
import pg from 'pg';
import { CamelCasePlugin, Kysely, PostgresDialect } from 'kysely';
import type { Database } from './schema.js';

const { Pool } = pg;

export function createDb(connectionString: string): Kysely<Database> {
  const pool = new Pool({ connectionString, max: 10 });

  return new Kysely<Database>({
    dialect: new PostgresDialect({ pool }),
    plugins: [new CamelCasePlugin()],
  });
}

// Fastify module augmentation — makes app.db typed throughout the codebase.
declare module 'fastify' {
  interface FastifyInstance {
    db: Kysely<Database>;
  }
}
```

**Notes:**
- **`import pg from 'pg'; const { Pool } = pg;`** — `pg` ships a CommonJS default export; destructuring the named `Pool` class from the default is the NodeNext-compatible pattern. Named imports (`import { Pool } from 'pg'`) may break depending on `pg` minor version under NodeNext interop. The default-import-then-destructure pattern is stable.
- **`max: 10`** — pool size upper bound. Architecture's rate-limit decision (~300 req/min/IP, single-user MVP) caps realistic concurrency well below 10. No env-override needed at this scale.
- **`CamelCasePlugin` only** — no `DeduplicateJoinsPlugin`, no `ParseJSONResultsPlugin`. Those are optimizations for later or for JSON columns (which `todos` doesn't have).
- **The `declare module 'fastify'` block must appear in a file that's imported somewhere in the app**, otherwise TS won't pick up the augmentation. `app.ts` imports `createDb` from this file — that's enough to activate the augmentation globally.

### `src/db/migrations/20260418_001_create_todos.ts` reference shape

```ts
// apps/api/src/db/migrations/20260418_001_create_todos.ts
import { sql, type Kysely } from 'kysely';

// Kysely<any> is idiomatic here — migrations run before the typed `Database` is meaningful
// (the interface is always one-ahead-or-synced with the migration set).
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('todos')
    .addColumn('id', 'uuid', (col) => col.primaryKey())
    .addColumn('description', sql`varchar(500)`, (col) => col.notNull())
    .addColumn('completed', 'boolean', (col) => col.notNull().defaultTo(false))
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('user_id', 'text')
    .execute();

  await db.schema
    .createIndex('idx_todos_completed_created_at')
    .on('todos')
    .columns(['completed', 'created_at'])
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropIndex('idx_todos_completed_created_at').execute();
  await db.schema.dropTable('todos').execute();
}
```

**Column-by-column rationale:**
- `id uuid primary key` — native Postgres `uuid` type; app generates via `uuid.v7()`. **No `gen_random_uuid()` default** — architecture pins API-side generation (architecture.md:193) for consistency with future cross-region / offline-mint scenarios. Kysely's `'uuid'` string is mapped to the native type by the Postgres dialect.
- `description varchar(500) not null` — DB-layer length enforcement; TypeBox will enforce the same at the API boundary in Story 2.1 (defense in depth). `varchar(500)` is preferred over `text + CHECK char_length(description) <= 500` for simpler SQL and identical performance in Postgres.
- `completed boolean not null default false` — matches FR-005. DB default handles the unusual case of an insert omitting `completed`; architectural rule says writes specify it explicitly.
- `created_at timestamptz not null default now()` — UTC by convention (architecture.md:287). `timestamptz` stores microseconds since epoch UTC and displays per session timezone; this is what Postgres recommends for all wall-clock-aware columns.
- `user_id text` (nullable) — NFR-005 binding: the column exists from MVP so the Growth-phase auth story doesn't need a schema migration. `text` (not `uuid`) because the future user-identity shape is undecided (could be email hash, SSO subject, etc.); `text` covers all of them.

**Index rationale:** `idx_todos_completed_created_at` on `(completed, created_at)` serves the FR-002 list-all-ordering query: `ORDER BY completed ASC, created_at ASC`. The composite index produces a sequential scan in the required order without a runtime sort, critical for Journey 4 perf (NFR-001, ≥50 todos).

### `src/db/migrate.ts` reference shape

```ts
// apps/api/src/db/migrate.ts
import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';
import { FileMigrationProvider, Migrator, NO_MIGRATIONS } from 'kysely';
import { createDb } from './index.js';

const MIGRATIONS_FOLDER = fileURLToPath(new URL('./migrations', import.meta.url));

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }

  const args = new Set(process.argv.slice(2));
  const reset = args.has('--reset');

  if (reset && !(connectionString.includes('localhost') || connectionString.includes('127.0.0.1'))) {
    console.error('Refusing --reset against a non-local DATABASE_URL');
    process.exit(1);
  }

  const db = createDb(connectionString);

  try {
    const migrator = new Migrator({
      db,
      provider: new FileMigrationProvider({ fs, path, migrationFolder: MIGRATIONS_FOLDER }),
    });

    if (reset) {
      const { error: downErr, results: downResults } = await migrator.migrateTo(NO_MIGRATIONS);
      if (downErr) throw downErr;
      for (const r of downResults ?? []) {
        console.log(r.status === 'Success' ? `↺ down ${r.migrationName}` : `✗ down ${r.migrationName}`);
      }
    }

    const { error, results } = await migrator.migrateToLatest();
    for (const r of results ?? []) {
      console.log(r.status === 'Success' ? `✓ ${r.migrationName}` : `✗ ${r.migrationName}`);
    }
    if (error) {
      console.error(error);
      process.exit(1);
    }
  } finally {
    await db.destroy();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

**Key details:**
- **`new URL('./migrations', import.meta.url)` + `fileURLToPath`** — the canonical ESM-safe way to resolve a sibling folder. Works under both `tsx` (dev/migrate) and `tsc → node` (if ever used). `path.dirname(import.meta.url)` would give a `file://` URL that `FileMigrationProvider` cannot use directly.
- **`NO_MIGRATIONS` sentinel** — Kysely exports this constant; `migrator.migrateTo(NO_MIGRATIONS)` rolls down through every applied migration. Used by `--reset` to clean-slate the DB (local-dev only).
- **Local-only `--reset` guard** — refusing to reset against non-local URLs prevents accidental production wipes (`DATABASE_URL=postgres://prod.example.com/... npm run db:reset` — absolutely not).
- **`await db.destroy()` in `finally`** — mandatory, otherwise the pool keeps Node alive. A migrator script that "completes but doesn't exit" is always this bug.
- **stdout formatting (`✓` / `✗` / `↺`)** — matches Story 1.2's convention of human-readable CLI output. Emoji-free variants are also fine if the dev's terminal renders poorly; ASCII `[OK]` / `[FAIL]` is acceptable.

### `src/routes/health.ts` reference shape

```ts
// apps/api/src/routes/health.ts
import { sql } from 'kysely';
import type { FastifyPluginAsync } from 'fastify';

const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get('/healthz', async (_req, reply) => {
    try {
      await sql`SELECT 1`.execute(app.db);
      return { status: 'ok', db: 'ok' };
    } catch (err) {
      app.log.error({ err }, 'healthz db probe failed');
      reply.code(503);
      return { status: 'degraded', db: 'error' };
    }
  });
};

export default healthRoutes;
```

**Notes:**
- **Kysely's `sql` template tag** executes a raw parameterized statement against the given Kysely instance. `sql\`SELECT 1\`.execute(db)` bypasses the query builder — appropriate for a probe where no typed result is needed. Result shape is `{ rows: [{ '?column?': 1 }] }`; we don't read it.
- **`reply.code(503)` + `return { ... }`** — Fastify's split-response pattern. Setting the status code on `reply` then returning the body is the standard idiom; it serializes as JSON and uses the `503` status.
- **`app.log.error({ err }, 'healthz db probe failed')`** — pino's preferred "error object as first arg, message as second" pattern. Makes the error serializable + searchable in structured logs. **Do NOT** `console.error` — the Fastify logger is already primed with pino-pretty in dev.
- **Swallow, don't re-throw.** Once Story 1.4 adds the global error handler, a re-thrown error from this route would produce a `500 { statusCode: 500, error: 'Internal Server Error', ... }` envelope — wrong shape for the contracted `503 { status, db }` response. The `try/catch` keeps the contract local and deliberate.

### Stub DB helper for unit tests

```ts
// apps/api/src/app.test.ts (top of file)
import type { Kysely } from 'kysely';
import type { Database } from './db/schema.js';

/**
 * Minimal Kysely<Database>-shaped stub for unit tests.
 * The healthz route calls sql`SELECT 1`.execute(app.db); Kysely routes that
 * through db.executeQuery. Stubbing just executeQuery + destroy covers the route.
 */
function buildStubDb(mode: 'ok' | 'throw'): Kysely<Database> {
  return {
    executeQuery: async () => {
      if (mode === 'throw') throw new Error('stub DB error');
      return { rows: [{ '?column?': 1 }], numAffectedRows: 0n, numChangedRows: 0n };
    },
    destroy: async () => {},
  } as unknown as Kysely<Database>;
}
```

**Why this pattern:** Kysely's `sql\`...\`.execute(db)` internally calls `db.executeQuery(compiledQuery)`. A 2-method stub (`executeQuery` + `destroy`) is sufficient surface for the `/healthz` route's probe. The `as unknown as Kysely<Database>` cast is warranted — the test is about route behavior, not full `Kysely` API coverage.

**Alternative considered and rejected:** spinning up a real Kysely against an in-memory SQLite via `better-sqlite3`. Adds a dep, adds config, and SQLite's SQL semantics don't fully match Postgres — false confidence. The 2-method stub is simpler and correct for this test surface.

### Integration test conventions

**Use the test DB URL straight from `DATABASE_URL`.** The local `.env` points at `postgresql://postgres:postgres@localhost:5432/todo_app`. CI's `services.postgres` exposes an identical URL via environment variables. **Do NOT** spin up a separate `todo_app_test` DB in this story — it adds a provisioning step to both local and CI and the payoff is marginal at MVP.

**Suite lifecycle:**
```ts
// test/db.migration.test.ts (shape)
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Kysely } from 'kysely';
import { createDb } from '../src/db/index.js';
import { getTestDbUrl, migrateLatest, truncateTodos } from './setup.js';
import type { Database } from '../src/db/schema.js';

describe('todos migration', () => {
  let db: Kysely<Database>;

  beforeAll(async () => {
    db = createDb(getTestDbUrl());
    await migrateLatest(db);
  });

  afterAll(async () => {
    await db.destroy();
  });

  beforeEach(async () => {
    await truncateTodos(db);
  });

  // ...tests
});
```

**Information-schema assertions:** use raw `sql` queries (not Kysely's query builder) for introspection — introspection over `information_schema` involves joins and column metadata that the typed builder doesn't model. Example:

```ts
import { sql } from 'kysely';

const { rows } = await sql<{ column_name: string; data_type: string }>`
  SELECT column_name, data_type
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'todos'
  ORDER BY ordinal_position
`.execute(db);

expect(rows.map((r) => r.column_name)).toEqual(['id', 'description', 'completed', 'created_at', 'user_id']);
```

**Durability test implementation (AC3, local-only):**
```ts
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { v7 as uuidv7 } from 'uuid';

const execAsync = promisify(exec);

describe.skipIf(process.env.CI === 'true')('todos persistence across Postgres restart', () => {
  it('survives docker compose restart postgres', async () => {
    const id = uuidv7();
    await db.insertInto('todos').values({
      id,
      description: 'survives restart',
      completed: false,
      userId: null,
    }).execute();

    await execAsync('docker compose restart postgres', { cwd: new URL('../../..', import.meta.url).pathname });

    // Poll until Postgres is healthy (up to ~30s — matches Story 1.1 healthcheck budget).
    for (let i = 0; i < 30; i++) {
      try {
        await sql`SELECT 1`.execute(db);
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }

    const rows = await db.selectFrom('todos').selectAll().where('id', '=', id).execute();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.description).toBe('survives restart');
  }, 60_000); // 60s vitest timeout to cover restart + polling
});
```

- **`cwd` for `docker compose`** — the compose file lives at repo root; test file is at `apps/api/test/`. `new URL('../../..', import.meta.url).pathname` resolves to repo root under ESM.
- **`describe.skipIf(process.env.CI === 'true')`** — Vitest's built-in conditional skip. CI Postgres is a service container, not docker-compose; the restart mechanism differs. The NFR-003 durability contract is still enforced locally where `docker-compose.yml` is the truth, and CI separately proves migrations + inserts + reads work against a fresh Postgres every run.
- **Pool survives the restart** — `pg.Pool` reconnects on next query after a broken connection. No need to destroy+recreate `db` in the test.

### Kysely + CamelCasePlugin gotchas

- **`CamelCasePlugin` is bidirectional for column names only**, not table names. `db.selectFrom('todos')` stays as `todos` on the wire; only column references (`select('createdAt')`, `where('userId', 'is', null)`) get translated. If you ever add a multi-word table (e.g., `user_preferences`), the `Database` interface key needs to match exactly what you type in `selectFrom(...)` — the plugin will NOT auto-map `userPreferences` ↔ `user_preferences` at the table level.
- **Insert values go through the same camelCase → snake_case mapping.** `db.insertInto('todos').values({ createdAt: new Date(), userId: null })` compiles to `INSERT INTO todos (created_at, user_id) VALUES ($1, $2)`. Safe default.
- **Raw `sql\`...\`` bypasses the plugin.** When you write `sql\`SELECT user_id FROM todos\``, you're responsible for column names on both sides. For `SELECT 1` this doesn't matter; for real raw queries prefer the query builder.
- **`kysely_migration` + `kysely_migration_lock` tables are created automatically** by the migrator on first run. They live in the `public` schema alongside `todos`. Do NOT add them to the `Database` interface — they're Kysely-internal and should not be queried by app code.

### Previous story intelligence (from Story 1.2)

**What 1.2 established that 1.3 builds on:**
- `buildApp(opts)` factory with `opts.config` test override (see `src/app.ts:6-28`). 1.3 extends `BuildAppOptions` with `opts.db` following the same pattern.
- Try/catch wrapper around plugin registrations (1.2 review patch — `src/app.ts:13-25`): **keep it in place** and let `onClose` handle DB cleanup on the failure path.
- `dotenv: opts.config === undefined` gate (1.2 review patch — `src/app.ts:16`): prevents test pollution from a local `.env`. **Do not alter it**; 1.3's tests pass explicit `opts.config` and should continue to.
- `hasRoute` over `printRoutes` (1.2 review patch — `src/app.test.ts:17`): keep using `hasRoute` in the route-registration test; it's robust across Fastify minor versions.
- Exact `content-type` assertion (`application/json; charset=utf-8` — `src/app.test.ts:26`): keep. The new 503 test asserts the same content-type.
- Module augmentation pattern (`src/config.ts:31-35`): same pattern now appears in `src/db/index.ts` for `app.db`. One augmentation per file, each must be imported transitively from `app.ts`.
- `tsconfig.json` already includes `test/**/*.ts` (added as safety-net in 1.2). No tsconfig change needed for the new `test/` folder.

**What 1.2 got right that 1.3 should replicate:**
- **Tight scope discipline** — 1.2 listed exactly what was out of scope and the dev respected it. 1.3's "scope discipline" section is longer *because* the DB layer naturally tempts scope creep into repos/schemas/error handlers — resist.
- **Reference shapes with rationale.** Every new file in 1.3 has a "reference shape" block with "why" notes. Copy-paste is fine; understanding the "why" prevents future drift.
- **`await app.close()` in `afterEach`** — mandatory for every test that builds an app. The `onClose` hook now calls `db.destroy()`, so this also closes the DB pool and prevents vitest hangs.

**Deferred items from 1.2's review that 1.3 closes:**
- **`DATABASE_URL` URI format validation** — deferred in 1.2 specifically because "Story 1.3 connects to Postgres and will surface real format errors at probe time." 1.3 does not need to add `format: 'uri'` + `ajv-formats`; the real connection produces readable errors natively (Kysely/pg report invalid URLs with a stack trace to pino).
- **`db:reset` workflow** — Story 1.1 deferred-work item ("natural home is Story 1.3 or 1.6"). Closed here via the optional `--reset` flag in `migrate.ts` with a local-only guard. Could also live entirely in README / Story 1.6; making it a script flag keeps it discoverable.

**Deferred items from 1.2's review that 1.3 does NOT address** (continue to defer):
- SIGTERM/SIGINT graceful shutdown — still Story 1.6 / ops.
- `unhandledRejection` / `uncaughtException` handlers — still observability story.
- `buildLoggerConfig` direct branch test — still deferred.
- `HEAD /healthz` — still deferred.
- `HOST` env override — still deferred.
- `.env.example` / `envSchema` drift test — still deferred; arrives when the schema grows.

### Latest tech information (verified against stack versions April 2026)

- **Kysely 0.27.x** is the current stable; TypeScript 5+, Node 18+, ESM-native. `CamelCasePlugin`, `Migrator`, `FileMigrationProvider`, and the `NO_MIGRATIONS` sentinel are all stable public API. Docs: https://kysely.dev/docs/.
- **`pg` 8.x** (`node-postgres`) is the canonical Postgres driver; Kysely's `PostgresDialect` depends on it directly. `Pool` default `max` is 10; no special configuration needed for single-user MVP.
- **`uuid` 11.x** — v7 API: `import { v7 as uuidv7 } from 'uuid'; uuidv7();` returns a time-ordered UUID v7 string. Compatible with Postgres's native `uuid` column type (canonical hyphenated form).
- **Vitest 3.x** — `describe.skipIf(condition)` and `it.skipIf(condition)` are stable; ideal for the CI-conditional durability test.
- **Node 22 LTS** is the target (Story 1.2 Dev Notes §"Latest tech information"). ESM + top-level await + `tsx` import hook all supported.
- **Postgres 16-alpine** — `docker-compose.yml` pins this; no migration or driver issues vs 14/15; `gen_random_uuid()` is built-in to `pgcrypto` but unused here (app mints UUIDs).

### Verification checklist (pre-review, manual)

From repo root, in order:

1. `docker compose up -d postgres` — healthy within 30s.
2. `npm install` — exits 0; `node_modules/kysely`, `node_modules/pg`, `node_modules/uuid`, `node_modules/@types/pg`, `node_modules/@types/uuid` exist.
3. `npx tsc -p apps/api/tsconfig.json --noEmit` — exits 0 (clean typecheck across new `db/` and `test/` files, no `.js`-extension violations).
4. `cp apps/api/.env.example apps/api/.env` (if missing).
5. `npm run migrate --workspace apps/api` — logs `✓ 20260418_001_create_todos`; exits 0. Re-run: no `✓` output, exits 0 (idempotency).
6. `psql $DATABASE_URL -c "\d todos"` (optional) — shows 5 columns + primary key + `idx_todos_completed_created_at`. Helpful for manual inspection; not part of automated tests.
7. `npm run dev --workspace apps/api` — pretty-printed boot log appears. In another shell: `curl -sSf http://localhost:3000/healthz` → `{"status":"ok","db":"ok"}`; `curl -i http://localhost:3000/healthz` → `HTTP/1.1 200 OK`, `Content-Type: application/json; charset=utf-8`.
8. `docker compose stop postgres`; curl `/healthz` again — `503 {"status":"degraded","db":"error"}`; Fastify process still running (no crash). `docker compose start postgres`; after ~2s, curl `/healthz` → back to `200`.
9. `npm test --workspace apps/api` — all tests pass:
   - `src/app.test.ts`: 4 tests (3 existing updated + 1 new degraded path)
   - `src/db/index.test.ts`: 1 test (CamelCasePlugin compile check)
   - `test/db.migration.test.ts`: 2 tests (schema + idempotency)
   - `test/db.persistence.test.ts`: 1 test (AC3 local-only; skipped in CI)
   - `test/health.integration.test.ts`: 2 tests (ok + degraded)
10. `npm run db:reset --workspace apps/api` (smoke the --reset flag) — tears down + re-applies migrations; exits 0. **Verify refusal on non-local URL:** `DATABASE_URL=postgres://remote.example.com/x npm run db:reset --workspace apps/api` → exits 1 with the local-only error message. Restore `.env` afterwards.
11. `git status` — `.env` is not staged; expected new/modified files match the File List below.

### Project Structure Notes

Files **added** by this story:

```
apps/api/src/db/index.ts
apps/api/src/db/index.test.ts
apps/api/src/db/schema.ts
apps/api/src/db/migrate.ts
apps/api/src/db/migrations/20260418_001_create_todos.ts
apps/api/test/setup.ts
apps/api/test/db.migration.test.ts
apps/api/test/db.persistence.test.ts
apps/api/test/health.integration.test.ts
```

Files **modified** by this story:

- `apps/api/package.json` — adds runtime deps (`kysely`, `pg`, `uuid`), dev deps (`@types/pg`, `@types/uuid`), and scripts (`migrate`, `db:reset`).
- `apps/api/src/app.ts` — `BuildAppOptions` gets optional `db`; factory decorates `app.db` and registers `onClose` hook.
- `apps/api/src/app.test.ts` — tests pass stubbed `db`; adds the degraded-path test (Test 4).
- `apps/api/src/routes/health.ts` — adds `SELECT 1` probe + `200`/`503` branches.
- `package-lock.json` (root — npm install picks up new transitive deps).
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — story 1-3 status transitions (handled by create-story; dev-story transitions to `in-progress` then `review`).

Files **intentionally NOT created** (per scope discipline — arrive in later stories):
- `apps/api/src/repositories/todosRepo.ts` — Story 2.1
- `apps/api/src/schemas/todo.ts` — Story 2.1
- `apps/api/src/plugins/*`, `apps/api/src/errors/*` — Story 1.4
- `apps/api/src/routes/todos.ts` — Story 1.4 / 2.1

**Conflict check:** no conflicts with the unified project structure in architecture.md §Complete Project Directory Structure (lines 485–585). This story creates exactly the `db/` subtree + first `test/` integration tests that architecture prescribes; the rest of `apps/api/` arrives in Stories 1.4 / 2.1 / 3.x.

### Testing Strategy for this story

Per the epic's Test Scenarios section (epics.md §Story 1.3):

**Unit tests (co-located `*.test.ts`, no live DB):**
- `src/app.test.ts` — 4 tests using a stub `db`:
  1. Route registration (`hasRoute`)
  2. `/healthz` ok path (stub returns success → `200 { status, db: 'ok' }`)
  3. Fail-fast on missing `DATABASE_URL` (unchanged from 1.2; DB never constructed)
  4. `/healthz` degraded path (stub throws → `503 { status: 'degraded', db: 'error' }` + `log.error` spy called)
- `src/db/index.test.ts` — CamelCasePlugin compile check: `db.selectFrom('todos').select(['createdAt']).compile().sql` matches `select "created_at" from "todos"` (case-insensitive).

**Integration tests (under `test/`, real Postgres via `DATABASE_URL`):**
- `test/db.migration.test.ts` — migrator applies `20260418_001`; `information_schema` assertions for table + 5 columns + index; idempotency via second `migrateToLatest()` returning empty `results`.
- `test/db.persistence.test.ts` — local-only (`describe.skipIf(process.env.CI)`); insert, `docker compose restart postgres`, poll for health, re-query, row present. NFR-003 durability contract.
- `test/health.integration.test.ts` — real `buildApp()` against real DB: ok path + degraded path (induced via `await app.db.destroy()` before inject).

**E2E tests:** none — Playwright harness arrives in Story 1.6.

**Do not set up in this story:**
- A separate `todo_app_test` database (deferred to 1.6 if isolation pressure arises; `TRUNCATE` between tests is sufficient now)
- `apps/api/vitest.config.ts` (zero-config still works; 1.2 confirmed this)
- Test fixtures / factories (Story 2.1 brings seed helpers for contract tests)
- Coverage reporting (Story 1.6 / CI)

### References

- Epic + story source: [epics.md §Story 1.3](../planning-artifacts/epics.md) (lines 246–287)
- Epic 1 goal + walking-skeleton outcome: [epics.md §Epic 1 goal](../planning-artifacts/epics.md) (lines 168–170)
- Architecture — DB engine + Kysely + migrator decisions: [architecture.md §Data Architecture](../planning-artifacts/architecture.md) (lines 186–195)
- Architecture — API health check unversioned decision: [architecture.md §API & Communication Patterns, row "Health check"](../planning-artifacts/architecture.md) (line 222)
- Architecture — DB naming (snake_case + CamelCasePlugin): [architecture.md §Naming Patterns — Database](../planning-artifacts/architecture.md) (lines 283–290)
- Architecture — `apps/api/src/db/*` layout: [architecture.md §Complete Project Directory Structure](../planning-artifacts/architecture.md) (lines 508–516)
- Architecture — enforcement guidelines (camelCase wire / snake_case DB rule): [architecture.md §Enforcement Guidelines](../planning-artifacts/architecture.md) (lines 419–428)
- Architecture — UUID v7 app-side decision: [architecture.md §Data Architecture, row "ID strategy"](../planning-artifacts/architecture.md) (line 193)
- Architecture — NFR-003 `pg-data` volume binding constraint: [architecture.md §Implementation Handoff](../planning-artifacts/architecture.md) (line 852)
- Architecture — migration command pattern: [architecture.md §Infrastructure & Deployment, row "Migration command"](../planning-artifacts/architecture.md) (line 249)
- Previous story: [1-2-fastify-api-skeleton-with-healthz.md](./1-2-fastify-api-skeleton-with-healthz.md) — factory pattern, `BuildAppOptions`, test conventions.
- Previous story: [1-1-monorepo-scaffold-with-docker-postgres.md](./1-1-monorepo-scaffold-with-docker-postgres.md) — `pg-data` volume, docker-compose credentials.
- Deferred work picked up here: [deferred-work.md](./deferred-work.md) — `db:reset` workflow (from 1.1); `DATABASE_URL` format validation closure (from 1.2).
- PRD — data model + durability contract: [PRD.md FR-005, FR-011, NFR-003, NFR-005](../planning-artifacts/PRD.md).

## Dev Agent Record

### Agent Model Used

claude-opus-4-7 (Claude Opus 4.7, 1M context) via BMAD `dev-story` skill, 2026-04-18.

### Debug Log References

- `docker compose up -d postgres` — container healthy within 1s.
- `npm install` (repo root, after adding `kysely ^0.27.0`, `pg ^8.14.0`, `uuid ^11.0.0`, `@types/pg ^8.11.0`, `@types/uuid ^10.0.0`) — 18 packages added. `npm audit` flagged **1 high-severity** advisory against `kysely@<=0.28.13` (SQL injection via unsanitised JSON path keys when using `Kysely<any>`, plus MySQL `sql.lit` issue — GHSA-wmrf-hv6w-mr66 / GHSA-8cpq-38p9-67gx). **Deviated from the spec's `^0.27.0` pin** and bumped to `^0.28.0` (installed `0.28.16`, the audit's recommended fix); the minor bump is continuous for the APIs we use (`Migrator`, `FileMigrationProvider`, `CamelCasePlugin`, `PostgresDialect`, `NO_MIGRATIONS`, query builder, `sql` tag). Second `npm audit` → `found 0 vulnerabilities`. As a belt-and-braces follow-up, migrations use `Kysely<unknown>` instead of `Kysely<any>` to stay out of the advisory's code path even on future regressions.
- `npx tsc -p apps/api/tsconfig.json --noEmit` — initially failed with `TS6059: File 'test/*.ts' is not under 'rootDir' 'src'`. Root cause: Story 1.2 set `"rootDir": "src"` in `apps/api/tsconfig.json`, which is incompatible with the new `test/` folder being part of the `include` glob. Dropped `rootDir` (TS will infer it; no emit in this story anyway — Story 1.6 revisits when the production build lands). Retypecheck exits 0.
- `npm run migrate --workspace apps/api` (first run) → `applied 20260418_001_create_todos`. Second run → no output (idempotent). Initial attempt errored with `DATABASE_URL is required` because Vitest and CLI scripts don't auto-load `.env`. Added a tiny inline dotenv parser (~10 LOC, zero deps) to both `src/db/migrate.ts` and `test/setup.ts` — reads `apps/api/.env` and applies only keys not already present in `process.env`, so CI's explicit env vars always win.
- `npm test --workspace apps/api` — initial run had **5 failures**, all fallout from evolving design decisions:
  1. **Stub-DB insufficient for Kysely `sql` tag compile pipeline.** The spec proposed a 2-method stub (`executeQuery` + `destroy`) for the unit-test ok/degraded healthz probes. Kysely's `sql\`SELECT 1\`.execute(db)` routes through `compile(executor)` which needs a full `QueryCompiler` + `Adapter` — the stub wasn't deep enough. Two options: build a DummyDriver-backed real `Kysely`, or move the probe assertions to integration tests. Went with the latter — probe behaviour genuinely depends on Kysely internals and is integration-shaped. Unit tests now cover only route registration + fail-fast env (pure Fastify/env concerns), using a `DummyDriver`-backed real `Kysely` instance for the `opts.db` parameter.
  2. **Vitest parallelised the test files** by default; `db.persistence.test.ts` ran `docker compose restart postgres` mid-flight while `db.migration.test.ts` and `health.integration.test.ts` had live connections → `57P01 admin shutdown`. Fixed by adding `vitest.config.ts` with `fileParallelism: false` — integration tests mutate a shared schema and can't safely run concurrently.
  3. **CamelCasePlugin transformed raw-sql result keys.** `SELECT column_name FROM information_schema.columns` returned `{ columnName }`, not `{ column_name }`, because the plugin applies to ALL result rows, not just rows from typed query-builder queries. Updated the test generics and property accesses to camelCase and left a comment in the test explaining why.
  4. **`pg.Pool` emitted unhandled `error` events post-test.** After the persistence test's `docker compose restart postgres` killed connections, idle clients in the pool threw `57P01 admin shutdown` events with no listener attached — Node treats unhandled `error` events as fatal, Vitest reported a phantom "failed" exit even though all 10 tests had passed. Fix lives in production code, not test code: added a `pool.on('error', ...)` listener inside `createDb` that logs and swallows the event (the pool reconnects on next acquire). This is also a real production safety — a Postgres restart or network blip would otherwise crash the Fastify process.
- Final `npm test --workspace apps/api` → **10 passed, 5 files, exit 0**:
  - `src/db/index.test.ts` (1 test) — CamelCasePlugin compile check
  - `src/app.test.ts` (2 tests) — route registration + fail-fast env
  - `test/db.migration.test.ts` (4 tests) — columns, index, varchar(500), idempotency
  - `test/db.persistence.test.ts` (1 test, local-only) — survives `docker compose restart postgres`
  - `test/health.integration.test.ts` (2 tests) — ok + degraded via real `buildApp()`
- `npm run dev --workspace apps/api` + `curl http://localhost:3000/healthz` → `200 {"status":"ok","db":"ok"}`. `docker compose stop postgres` + curl → `503 {"status":"degraded","db":"error"}` (Fastify process stays alive, no crash). `docker compose start postgres` + curl → back to `200` (pool auto-recovers; no server restart needed).
- `DATABASE_URL=postgres://remote.example.com:5432/x npm run db:reset --workspace apps/api` → stderr `Refusing --reset against a non-local DATABASE_URL`, exit 1. Local-safety guard works.

### Completion Notes List

- **All 4 ACs satisfied.** AC1: `createDb` returns `Kysely<Database>` with `CamelCasePlugin`; compile-time test verifies camelCase → snake_case translation. AC2: migration creates exactly the 5 columns + index per spec; information_schema assertions and second-run empty-results prove idempotency. AC3: insert + `docker compose restart postgres` + re-query passes (row still present, verifying `pg-data` named volume binding). AC4: real `buildApp()` against real Postgres returns `200 ok`; destroying the pool and reprobing returns `503 degraded` (Fastify still serving).
- **Scope held tightly.** No Kysely query in `app.ts` beyond the `sql\`SELECT 1\`` probe in `routes/health.ts`. No repositories, no TypeBox, no plugin stack (cors/helmet/rate-limit/swagger), no global error handler, no `/v1` prefix — all still belong to Stories 1.4 / 2.1 as intended.
- **Deferred-work items closed in this story:**
  - **`db:reset` workflow** (from 1.1 review) — implemented as the `--reset` flag on `migrate.ts` with a local-only guard (refuses non-`localhost`/`127.0.0.1` URLs to prevent accidental prod wipes).
  - **`DATABASE_URL` URI format validation** (from 1.2 review) — closed naturally; Kysely/pg surface real connection errors at probe time with readable messages, no `ajv-formats` needed.
- **Deliberate deviations from the story spec, each justified:**
  - **Kysely pinned `^0.28.0` instead of `^0.27.0`** — security advisory GHSA-wmrf-hv6w-mr66 (high severity) affects the `Kysely<any>` path used in migrations. `^0.28.0` is the minimum fixed line; the APIs we use are continuous.
  - **Migrations type-parametrised as `Kysely<unknown>` instead of `Kysely<any>`** — defensive against the advisory's root-cause code path.
  - **Healthz ok/degraded tests now live at BOTH unit and integration levels.** First pass moved probe assertions to integration only (the spec's 2-method stub was insufficient for Kysely's `sql` tag compile pipeline). Review observation caught that this left `routes/health.ts` with zero unit coverage — anyone running `vitest src/` without Postgres would get a false-green. Corrected by using a `DummyDriver`-backed real `Kysely<Database>` for the ok path (no throw, route returns 200) and a custom minimal `ThrowingDriver` implementing the `Driver` interface for the degraded path (every `executeQuery` throws). Unit-only coverage now reports `health.ts` 100% with no live Postgres needed; integration tests reinforce the probe behaviour against the real stack.
  - **Added `pool.on('error')` handler in `createDb`.** Not specified in the story but necessary: `pg.Pool` emits `error` on idle-client failures (connection reset, Postgres restart, admin shutdown) and Node treats unhandled EventEmitter `error` events as fatal. The handler logs and swallows the event; pg auto-reconnects on the next acquire. This is a real production-availability fix, not a test workaround.
  - **Added `vitest.config.ts` with `fileParallelism: false`.** The story anticipated zero-config vitest (copying Story 1.2's setup). Integration tests mutating shared Postgres state + file-level parallelism is incompatible; serial execution is the correct safe default for this suite.
  - **Dropped `rootDir: "src"` from `apps/api/tsconfig.json`.** Incompatible with the new `test/` folder under the same `include` glob; `noEmit` in this story means the change has no runtime consequences. Story 1.6 will reintroduce emit config when the production build lands.
  - **Inline dotenv parser (~10 LOC) duplicated in `src/db/migrate.ts` and `test/setup.ts`.** Vitest and plain CLI scripts don't auto-load `.env`; rather than add a `dotenv` dev dep, parsed `apps/api/.env` manually with `fs` and a conservative key/value split. Existing `process.env` entries always win (CI compatibility). Natural future refactor: lift to a shared `src/env-file.ts` helper if a third caller appears.
- **Information-schema gotcha pinned for future migrations:** when `CamelCasePlugin` is active, raw `sql\`SELECT column_name ... \`` queries return `{ columnName }` on the wire — not `{ column_name }`. Tests should either access camelCase properties or alias in SQL (`SELECT column_name AS "column_name"`). Relevant for any future introspection/debug queries.
- **`HEAD /healthz`, graceful SIGTERM shutdown, drift-check between `.env.example` and `envSchema.properties`, `HOST` env override, `LOG_LEVEL` pino validation** — all still deferred from Story 1.2's review. None of these blocked Story 1.3 and remain logged in `deferred-work.md`.

### File List

**Added:**
- `apps/api/src/db/index.ts`
- `apps/api/src/db/index.test.ts`
- `apps/api/src/db/schema.ts`
- `apps/api/src/db/migrate.ts`
- `apps/api/src/db/migrations/20260418_001_create_todos.ts`
- `apps/api/test/setup.ts`
- `apps/api/test/db.migration.test.ts`
- `apps/api/test/db.persistence.test.ts`
- `apps/api/test/health.integration.test.ts`
- `apps/api/vitest.config.ts`

**Modified:**
- `apps/api/package.json` (+ `kysely`, `pg`, `uuid`, `@types/pg`, `@types/uuid`; + `migrate` and `db:reset` scripts)
- `apps/api/tsconfig.json` (dropped `"rootDir": "src"` to unblock `test/**/*.ts` inclusion)
- `apps/api/src/app.ts` (DB decorator + `onClose` pool destroy + `opts.db` test override)
- `apps/api/src/app.test.ts` (DummyDriver-backed stub db; 2 tests: route registration + fail-fast env)
- `apps/api/src/routes/health.ts` (`SELECT 1` probe + `200`/`503` branches with pino error log)
- `package-lock.json` (root — workspace picks up new deps transitively)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (story 1-3 `ready-for-dev` → `in-progress` → `review`)

**Intentionally NOT created** (per scope discipline — arrive in later stories): `src/repositories/`, `src/schemas/`, `src/plugins/`, `src/errors/`, `src/routes/todos.ts`, `apps/web/`, `.github/workflows/ci.yml`.

### Change Log

| Date       | Change                                                                                                                                                                                                                                                                                                                                                                                         |
|------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| 2026-04-18 | Story 1.3 implemented: Kysely + `pg` + `uuid` deps, `src/db/{schema,index,migrate,migrations/*}`, `createDb` factory with `PostgresDialect` + `CamelCasePlugin` + pool error handler, `apps/api/test/` integration suite (migration, persistence, healthz), `/healthz` upgraded with `SELECT 1` probe returning `200 ok` / `503 degraded`. 10/10 tests pass. Live smoke: ok → degraded → ok across `docker compose stop/start postgres`. Idempotent `npm run migrate`; `db:reset` flag with local-only guard. Status → review. |
| 2026-04-18 | Deviations from story spec (each justified in Completion Notes): kysely bumped `^0.27.0` → `^0.28.0` (security advisory GHSA-wmrf-hv6w-mr66); healthz probe tests moved from unit to integration (stub-DB insufficient for Kysely `sql` tag compile); added `pool.on('error')` handler in `createDb` (production availability fix); added `vitest.config.ts` with `fileParallelism: false` (integration tests share schema); dropped `rootDir: "src"` to unblock `test/` inclusion. |
