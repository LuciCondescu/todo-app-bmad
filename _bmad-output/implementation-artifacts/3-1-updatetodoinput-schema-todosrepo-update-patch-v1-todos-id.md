# Story 3.1: `UpdateTodoInput` schema + `todosRepo.update` + `PATCH /v1/todos/:id`

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want to toggle a todo's completion via the API,
So that my marking-complete action persists and returns the updated record.

## Acceptance Criteria

**AC1 — `UpdateTodoInputSchema` added to `apps/api/src/schemas/todo.ts`**
- **Given** `apps/api/src/schemas/todo.ts` already exports `TodoSchema` + `CreateTodoInputSchema` (Story 2.1)
- **When** the engineer inspects the file
- **Then** a new export is added: `UpdateTodoInputSchema = Type.Object({ completed: Type.Boolean() }, { $id: 'UpdateTodoInput', additionalProperties: false })`
- **And** the static TS type is exported: `type UpdateTodoInput = Static<typeof UpdateTodoInputSchema>`
- **And** `additionalProperties: false` is enforced — unknown keys (including `description`, `id`, `createdAt`, `userId`) are rejected at validation time (description is **immutable** in MVP; see Dev Notes → "Why `description` is not in `UpdateTodoInput`")
- **And** `completed` is **required** — `Type.Object` with `Type.Boolean()` (not `Type.Optional(Type.Boolean())`) means a missing `completed` key fails validation
- **And** `Todo` + `CreateTodoInput` exports remain untouched

**AC2 — `todosRepo.update(id, { completed }, db)` exported from `apps/api/src/repositories/todosRepo.ts`**
- **Given** `todosRepo.ts` already exports `create` (Story 2.1) and `listAll` (Story 2.2)
- **When** the engineer inspects the file
- **Then** a new `async function update(id: string, input: UpdateTodoInput, db: Kysely<Database>): Promise<Todo>` is exported alongside `create` and `listAll`
- **And** it executes a **single** Kysely `UPDATE` query: `db.updateTable('todos').set({ completed: input.completed }).where('id', '=', id).returningAll().executeTakeFirst()`
- **When** the `UPDATE` affects **zero rows** (non-existent `id`)
- **Then** `executeTakeFirst()` returns `undefined` → the repo throws `new NotFoundError(\`Todo ${id} not found\`)` (imported from `../errors/index.js`)
- **When** the `UPDATE` affects **one row** (existing `id`)
- **Then** the repo returns the updated row serialized to the `Todo` shape: camelCase keys (via `CamelCasePlugin`) + `createdAt` converted from `Date` to ISO 8601 UTC string with `Z` suffix via `.toISOString()` — identical serialization rule to `create` / `listAll`
- **And** `update` never imports `Kysely` from `db/index.ts` — `db` is passed in as an argument (same pattern as `create` / `listAll`)
- **And** the `description`, `createdAt`, and `userId` fields in the returned `Todo` reflect the **original** row values (they were not part of the update) — the returning-row from `executeTakeFirst()` carries them through untouched

**AC3 — `PATCH /v1/todos/:id` handler registered in `apps/api/src/routes/todos.ts`**
- **Given** `todosRoutes` already registers `POST /todos` (Story 2.1) and `GET /todos` (Story 2.2) using `typedApp = app.withTypeProvider<TypeBoxTypeProvider>()`
- **When** the engineer inspects the file
- **Then** a new `typedApp.patch('/todos/:id', { schema: { params, body, response } }, handler)` is added to the **same plugin** — the existing `typedApp` alias is reused (do NOT call `.withTypeProvider` again)
- **And** the route schema is exactly:
  ```ts
  {
    params: Type.Object({ id: Type.String({ format: 'uuid' }) }, { additionalProperties: false }),
    body: UpdateTodoInputSchema,
    response: {
      200: TodoSchema,
      400: { $ref: 'ErrorResponse#' },
      404: { $ref: 'ErrorResponse#' },
    },
  }
  ```
- **And** the handler body is: `return todosRepo.update(request.params.id, request.body, app.db);` — no `reply.code(200)` call (200 is Fastify's default); no try/catch; no inline Kysely query; no redundant `findById` lookup before the `UPDATE`
- **And** on success, the response is `200` with body matching `TodoSchema` and `completed` reflecting the request body (`true` or `false`)
- **And** the `/v1` prefix continues to come from the plugin registration in `app.ts` (`app.register(todosRoutes, { prefix: '/v1' })`); inside the plugin the path stays `'/todos/:id'`
- **And** the comment on the last line of `todosRoutes` is updated from `// Handlers for PATCH /todos/:id, DELETE /todos/:id land in stories 3.1, 3.2.` → `// Handler for DELETE /todos/:id lands in story 3.2.`

**AC4 — Validation failures return `400` via the global error handler**
- **Given** `UpdateTodoInputSchema` + the `params` schema from AC3
- **When** a client issues `PATCH /v1/todos/<valid-uuid>` with any of the following bodies:
  1. `{}` — missing `completed` (violates `required`)
  2. `{ "completed": "true" }` — `completed` is a string, not a boolean
  3. `{ "completed": 1 }` — `completed` is a number, not a boolean (coercion-guard — AJV's `coerceTypes: 'array'` from `app.ts` does NOT coerce booleans from numbers by default, but assert this explicitly)
  4. `{ "completed": true, "description": "edit" }` — unknown key (violates `additionalProperties: false`)
  5. `{ "completed": true, "id": "x" }` — unknown key (same rule; also guards against `id`-in-body confusion with `id`-in-path)
- **Then** the response is `400` with `{ statusCode: 400, error: 'Bad Request', message: <AJV detail> }` — the global error handler from Story 1.4 emits this envelope (`plugins/error-handler.ts:14-20` maps `error.validation` → 400)
- **When** a client issues `PATCH /v1/todos/not-a-uuid` (path param fails `format: 'uuid'`)
- **Then** the response is `400` with the same envelope — the `ajv-formats` wiring from Story 2.1 (`app.ts:31-42`, `plugins: [addFormats]` + `removeAdditional: false`) enforces `format: 'uuid'` on the request-validation AJV
- **And** the route returns **before** calling `todosRepo.update` — no DB query is issued on any 400 path (the validation hook runs ahead of the handler)
- **And** no bespoke try/catch is added in the route — all 400 paths go through the existing global error handler

**AC5 — Non-existent id returns `404` with `Todo <id> not found` via the global error handler**
- **Given** a valid UUID v4/v7 shape that does not match any row (e.g., `00000000-0000-0000-0000-000000000000`)
- **When** a client issues `PATCH /v1/todos/00000000-0000-0000-0000-000000000000` with a valid body `{ "completed": true }`
- **Then** `todosRepo.update` runs the UPDATE, `executeTakeFirst()` returns `undefined`, the repo throws `new NotFoundError('Todo 00000000-0000-0000-0000-000000000000 not found')`
- **And** the global error handler maps `NotFoundError` → `{ statusCode: 404, error: 'Not Found', message: 'Todo 00000000-0000-0000-0000-000000000000 not found' }` (already verified by `plugins/error-handler.test.ts:36-51` — this story adds the real-DB 404 round-trip in AC6)
- **And** the route handler does NOT wrap the repo call in try/catch (the handler stays 1 line)
- **And** the 404 message echoes the **path param** `id` verbatim — the `${id}` in the `NotFoundError` constructor expansion must not be masked or sanitized (FR-010: user-facing error clarity)

**AC6 — Contract test at `apps/api/test/contract.todos.test.ts` extended with `PATCH /v1/todos/:id` block**
- **Given** the contract test file already exists with `describe('POST /v1/todos — contract', ...)` + `describe('GET /v1/todos — contract', ...)`
- **When** the engineer extends the file
- **Then** a new `describe('PATCH /v1/todos/:id — contract', () => { ... })` block is added; it **reuses** the existing module-level `beforeAll(buildApp + migrateLatest)` / `afterAll(app.close)` / `beforeEach(truncateTodos)` lifecycle — do NOT open a second `FastifyInstance`
- **And** each test seeds via direct Kysely insert (not via `todosRepo.create`) with a fixed UUID v7 literal and an explicit `createdAt` — same seeding idiom as `GET` tests (see `contract.todos.test.ts:144-176`)
- **And** the block asserts:
  1. **`PATCH /v1/todos/<id>` with `{ completed: true }` on an active seeded row** → `200` + body satisfies `TodoSchema` (via `Value.Check`) + `completed === true` + `description` unchanged + `id` unchanged + `createdAt` matches the ISO UTC ms regex
  2. **`PATCH /v1/todos/<id>` with `{ completed: false }` on an already-completed seeded row** → `200` + `completed === false` (toggle-back path)
  3. **Row in Postgres reflects the update** — after a `PATCH`, a direct Kysely `selectFrom('todos').where('id', '=', body.id).executeTakeFirstOrThrow()` returns a row whose `completed` matches the PATCH input (FR-011 persistence guard at the PATCH boundary)
  4. **Invalid body cases → `400`** via `it.each([...])` covering the four body variants from AC4: `{}`, `{ completed: 'true' }`, `{ completed: true, description: 'x' }`, `{ completed: true, id: 'x' }`
  5. **Invalid path param → `400`** — `PATCH /v1/todos/not-a-uuid` with body `{ completed: true }` returns `400` (proves `format: 'uuid'` is enforced on the params schema)
  6. **Non-existent id → `404`** — `PATCH /v1/todos/00000000-0000-0000-0000-000000000000` with body `{ completed: true }` returns `404` + `{ statusCode: 404, error: 'Not Found', message: 'Todo 00000000-0000-0000-0000-000000000000 not found' }` (exact message assertion — the repo's template string is the contract)
  7. **`/docs/json` exposes `UpdateTodoInput` under `components.schemas`** — extend the existing `/docs/json` assertion in the `POST` block (or add a standalone one in the `PATCH` block) to include `expect(body.components.schemas).toHaveProperty('UpdateTodoInput')`
- **And** tests run against **real Postgres** via the `migrateLatest` + `truncateTodos` helpers from `apps/api/test/setup.ts` — **no mocks, no DummyDriver** (DummyDriver lives in the co-located unit tests)

**AC7 — Unit tests for `todosRepo.update` and the new schema**
- **Given** co-located unit tests at `apps/api/src/repositories/todosRepo.test.ts` and `apps/api/src/schemas/todo.test.ts`
- **When** `npm test --workspace apps/api` runs
- **Then** `schemas/todo.test.ts` adds assertions via TypeBox's `Value.Check`:
  - `UpdateTodoInputSchema` **rejects** `{}` (missing completed), `{ completed: 'true' }` (non-boolean), `{ completed: 1 }` (non-boolean), `{ completed: true, description: 'x' }` (unknown key), `{ completed: true, extra: 'field' }` (unknown key)
  - `UpdateTodoInputSchema` **accepts** `{ completed: true }` and `{ completed: false }` (boundary values)
- **And** `repositories/todosRepo.test.ts` adds two `describe` blocks:
  1. **`todosRepo.update — compiled UPDATE shape (DummyDriver)`** — compiles `db.updateTable('todos').set({ completed: true }).where('id', '=', 'some-id').returningAll()` via `DummyDriver` and asserts the SQL matches `/update\s+"todos"\s+set\s+"completed"/i`, `/where\s+"id"\s+=/i`, `/returning\s+\*/i`, and `parameters` is `[true, 'some-id']` in that order (catches `set({ id })` or `where('completed', ...)` typo regressions)
  2. **`todosRepo.update — behavior (SeedingDriver + zero-rows)`** — reuses the `SeedingDriver` pattern from `todosRepo.test.ts:33-54`:
     - **one row case:** seed the driver with a row whose `completed: true`; call `todosRepo.update('existing-id', { completed: true }, db)`; assert returned `Todo` has `completed === true`, `createdAt` matches the ISO UTC regex, all fields serialized correctly
     - **zero-rows case:** override the SeedingDriver to return `{ rows: [] }` (already a pattern in the existing "executeTakeFirstOrThrow" test for `create`); assert `todosRepo.update('ghost-id', { completed: true }, db)` **rejects** with `NotFoundError` and `error.message === 'Todo ghost-id not found'`
- **And** the zero-rows test uses `expect(...).rejects.toThrow(NotFoundError)` AND `expect(...).rejects.toThrow(/^Todo ghost-id not found$/)` (both assertions — the error *class* AND the exact *message*); importing `NotFoundError` from `../errors/index.js`

**AC8 — Schema registration in `plugins/swagger.ts` so OpenAPI exposes `UpdateTodoInput`**
- **Given** `plugins/swagger.ts` already calls `app.addSchema(...)` for `ErrorResponseSchema`, `TodoSchema`, `CreateTodoInputSchema` (Story 2.1)
- **When** the engineer inspects the file
- **Then** a fourth `app.addSchema(UpdateTodoInputSchema)` call is added alongside the three existing ones, **before** `await app.register(swagger, ...)` so the registration is visible to the swagger generator at `onReady` time
- **And** the import statement at the top of the file is extended: `import { TodoSchema, CreateTodoInputSchema, UpdateTodoInputSchema } from '../schemas/todo.js';`
- **And** after the story lands, `GET /docs/json` includes `components.schemas.UpdateTodoInput` with the expected `properties: { completed: { type: 'boolean' } }` shape (asserted in AC6 case 7)
- **And** `GET /docs` (Swagger UI) now renders the `PATCH /v1/todos/{id}` operation alongside `POST` and `GET` — verified by a manual check, not a unit-test assertion (the automatic OpenAPI path-generation from Fastify is already covered structurally by existing tests)

**AC9 — Regression assertions in `src/app.test.ts` and `test/plugins.integration.test.ts` updated**
- **Given** `src/app.test.ts:71-80` asserts `POST /v1/todos` + `GET /v1/todos` are registered (plus `/healthz`, `/docs`) via `app.hasRoute(...)`
- **When** the engineer updates this file
- **Then** the `registers the ... routes` test gains two new assertions:
  ```ts
  expect(app.hasRoute({ method: 'PATCH', url: '/v1/todos/:id' })).toBe(true);
  ```
  and the test's description string is updated to include `PATCH /v1/todos/:id` in the enumeration
- **And** no other `app.test.ts` cases require changes (the DummyDriver-backed happy-path assertions for POST/GET are orthogonal to the PATCH path; PATCH behavior is exercised against real Postgres in the contract test, not in `app.test.ts`)
- **And** `test/plugins.integration.test.ts` is **not** modified for this story — it covers cross-plugin wiring (CORS, rate-limit, Swagger, error handler); none of that changes. The PATCH route's existence is asserted via `app.hasRoute` in `src/app.test.ts`; its behavior is asserted in the contract test

## Tasks / Subtasks

- [x] **Task 1: Extend `apps/api/src/schemas/todo.ts` with `UpdateTodoInputSchema`** (AC: 1)
  - [x] Append to the existing file (preserve `TodoSchema`, `type Todo`, `CreateTodoInputSchema`, `type CreateTodoInput`):
    ```ts
    export const UpdateTodoInputSchema = Type.Object(
      {
        completed: Type.Boolean(),
      },
      { $id: 'UpdateTodoInput', additionalProperties: false },
    );
    export type UpdateTodoInput = Static<typeof UpdateTodoInputSchema>;
    ```
  - [x] Verify file still compiles: `npm run typecheck --workspace apps/api`
  - [x] **Do NOT** add `description: Type.Optional(...)` to `UpdateTodoInputSchema` — description is immutable in MVP (see Dev Notes → "Why `description` is not in `UpdateTodoInput`"). Editing descriptions is a post-MVP feature; adding the field now would silently expand the API contract
  - [x] **Do NOT** add `id: Type.String(...)` to `UpdateTodoInputSchema` — `id` is the path parameter, not a body field. Allowing it in the body invites clients to submit mismatched `id` values and is a source of confusion
  - [x] **Do NOT** inline the schema object in the route (AC3) instead of exporting it — we need the `$id` registered once so the OpenAPI output has a stable `UpdateTodoInput` component name (AC8)

- [x] **Task 2: Extend `apps/api/src/repositories/todosRepo.ts` with `update`** (AC: 2, 5)
  - [x] Append to the existing file (preserve `create` and `listAll` verbatim):
    ```ts
    import { NotFoundError } from '../errors/index.js';
    import type { UpdateTodoInput } from '../schemas/todo.js';

    export async function update(
      id: string,
      input: UpdateTodoInput,
      db: Kysely<Database>,
    ): Promise<Todo> {
      const row = await db
        .updateTable('todos')
        .set({ completed: input.completed })
        .where('id', '=', id)
        .returningAll()
        .executeTakeFirst();

      if (!row) {
        throw new NotFoundError(`Todo ${id} not found`);
      }

      return {
        id: row.id,
        description: row.description,
        completed: row.completed,
        createdAt: row.createdAt.toISOString(),
        userId: row.userId,
      };
    }
    ```
    - Merge new imports with the existing ones at the top of the file (single `import type { UpdateTodoInput }` line; pull in `NotFoundError` as a named import from `'../errors/index.js'`)
    - **Why `executeTakeFirst()` not `executeTakeFirstOrThrow()`:** we need to distinguish "zero rows" from "driver error" — `executeTakeFirstOrThrow` throws a generic `NoResultError`, which the global error handler would map to `500`. By using `executeTakeFirst()` + an explicit `if (!row)` + our own `NotFoundError`, we get a clean `404` envelope with the id-echoing message (AC5). `create` uses `executeTakeFirstOrThrow` because a zero-row insert is a pathological driver bug, not a domain-level outcome — different semantics, different choice
    - **Why `returningAll()`:** same rationale as `create` (Story 2.1 Dev Notes → `todosRepo.ts:13`) — `TodoTable` maps 1:1 to the `Todo` API shape, so `returningAll` is the cheapest idiom
    - **Why `.where('id', '=', id)` with no type cast:** the `id` parameter is typed `string` via the function signature; `TodoTable.id` is `string`; Kysely types the predicate correctly. Postgres will coerce the string to `uuid` at the protocol level (safe because the route's params schema already enforced `format: 'uuid'` — see AC4)
    - **Why the `!row` check uses truthiness and not `row === undefined`:** both are equivalent because `executeTakeFirst()` returns `TodoTable | undefined` (never `null`); `!row` is the more idiomatic narrow. Both readings satisfy TS
    - **Why the returned shape is built by hand (not `...row` spread):** the DB row's `createdAt` is a `Date`, not a `string`; spreading would break the `TodoSchema` response validator. Explicit field-by-field construction with `.toISOString()` is the same pattern `create` and `listAll` use
  - [x] **Do NOT** factor out a shared `rowToTodo(row)` helper in this story even though this is the third callsite (Story 2.2 Dev Notes flagged the helper extraction as "deferred to the third instance" at lines 342–350). Rationale: the serialization block is 6 lines; extracting it now adds one file + one import per callsite with no behavioral win; a later refactor story can DRY this up without touching the story boundaries. If the reviewer flags it, defer to `deferred-work.md` as a single-line entry
  - [x] **Do NOT** implement an existence check (`const existing = await findById(id); if (!existing) throw new NotFoundError(...)` before the `UPDATE`) — that's two queries; the single-UPDATE-returning-affected-rows pattern is the race-free idiom and also correct for the MVP (see Dev Notes → "Why one UPDATE + zero-rows check is the right pattern")
  - [x] **Do NOT** wrap the UPDATE in a transaction — a single statement is atomic in Postgres by default (same rule as Story 2.1's `create`)

- [x] **Task 3: Add `PATCH /v1/todos/:id` handler in `apps/api/src/routes/todos.ts`** (AC: 3)
  - [x] Extend the imports at the top of the file:
    ```ts
    import { CreateTodoInputSchema, TodoSchema, UpdateTodoInputSchema } from '../schemas/todo.js';
    ```
  - [x] Add the handler inside `todosRoutes`, **after** the existing `typedApp.get('/todos', ...)` block and **before** the final comment:
    ```ts
    typedApp.patch(
      '/todos/:id',
      {
        schema: {
          params: Type.Object({ id: Type.String({ format: 'uuid' }) }, { additionalProperties: false }),
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
  - [x] Update the trailing comment from `// Handlers for PATCH /todos/:id, DELETE /todos/:id land in stories 3.1, 3.2.` to `// Handler for DELETE /todos/:id lands in story 3.2.`
  - [ ] **Why `params: Type.Object({ id: Type.String({ format: 'uuid' }) }, { additionalProperties: false })`:** pushes id-format validation to the API boundary. Without `format: 'uuid'`, a request to `PATCH /v1/todos/not-a-uuid` would reach the repo → Postgres would throw `22P02 invalid input syntax for type uuid` → the global error handler would map it (via a missing path) to `500` (no `23*` code match). Adding `format: 'uuid'` → 400 at validation time → clean error surface. The `additionalProperties: false` on params is defensive and cheap — Fastify builds path params from the route pattern anyway, so no realistic path could inject extra params, but the constraint documents intent
  - [ ] **Why the handler is just `return todosRepo.update(...)`:** Fastify's async handler idiom — returning the value triggers `reply.send(...)`. The response schema `200: TodoSchema` drives `fast-json-stringify` to serialize the returned `Todo`. No need for `reply.code(200)` (200 is the default on return-from-handler); no `reply.send(...)` (implicit via return)
  - [ ] **Why `typedApp.patch(...)` and not a fresh `app.withTypeProvider<TypeBoxTypeProvider>()` call:** the `typedApp` alias from Story 2.1's `typedApp = app.withTypeProvider<TypeBoxTypeProvider>()` line is in scope throughout the plugin body — reuse it; multiple `.withTypeProvider` calls return equivalent aliases but redundancy smells
  - [x] **Do NOT** add `const existing = await todosRepo.findById(id)` before the update — `findById` doesn't exist, the pattern is the one-query UPDATE + zero-rows-throws approach (Task 2)
  - [x] **Do NOT** add a try/catch around `todosRepo.update(...)` — the global error handler maps `NotFoundError` → 404 (`plugins/error-handler.ts:22-28`) and `error.validation` → 400 (`plugins/error-handler.ts:14-20`). Catching in the route either swallows (bad) or re-throws (pointless)
  - [x] **Do NOT** add `request.params.id` validation logic (regex check, format assertion) in the handler — that's what the TypeBox `params` schema does at AJV time, before the handler runs
  - [x] **Do NOT** pass `request.body.completed` as a raw value (e.g., `update(id, request.body.completed, app.db)`) — the repo's signature takes `UpdateTodoInput` (the whole `{completed}` object), not a bare boolean. Matching the schema shape keeps future additions (e.g., `pinned: boolean` if that ever lands post-MVP) non-breaking

- [x] **Task 4: Register `UpdateTodoInputSchema` in `apps/api/src/plugins/swagger.ts`** (AC: 8)
  - [x] Update the import statement at line 5:
    ```ts
    import { TodoSchema, CreateTodoInputSchema, UpdateTodoInputSchema } from '../schemas/todo.js';
    ```
  - [x] Add a fourth `app.addSchema` call immediately after `app.addSchema(CreateTodoInputSchema)` at line 11:
    ```ts
    app.addSchema(ErrorResponseSchema);
    app.addSchema(TodoSchema);
    app.addSchema(CreateTodoInputSchema);
    app.addSchema(UpdateTodoInputSchema); // ← NEW
    ```
  - [ ] **Why registration goes in the swagger plugin (not the route):** same reasoning as Story 2.1 — swagger plugin runs **before** route plugins in the `app.ts` registration order (`app.register(swaggerPlugin)` at line 67 before `app.register(todosRoutes, { prefix: '/v1' })` at line 75), so the `$ref` resolution (if any route ever used `$ref: 'UpdateTodoInput#'`) happens with the schema already in the shared pool. This keeps the "all schemas register in one place" waterfall Story 2.1 set up
  - [x] **Do NOT** register the schema inside `todosRoutes` — if a future story (3.2, 4.4) uses `$ref: 'UpdateTodoInput#'` in its response, Fastify's `onReady` handler for swagger will have already snapshotted `components.schemas` before `todosRoutes` runs

- [x] **Task 5: Extend unit tests** (AC: 7)
  - [x] Extend `apps/api/src/schemas/todo.test.ts` — add a new `describe('UpdateTodoInputSchema', ...)` block after the existing `CreateTodoInputSchema` and `TodoSchema` blocks:
    ```ts
    describe('UpdateTodoInputSchema', () => {
      it('rejects missing completed', () => {
        expect(Value.Check(UpdateTodoInputSchema, {})).toBe(false);
      });
      it('rejects non-boolean completed (string)', () => {
        expect(Value.Check(UpdateTodoInputSchema, { completed: 'true' })).toBe(false);
      });
      it('rejects non-boolean completed (number)', () => {
        expect(Value.Check(UpdateTodoInputSchema, { completed: 1 })).toBe(false);
      });
      it('rejects unknown key description (additionalProperties: false)', () => {
        expect(Value.Check(UpdateTodoInputSchema, { completed: true, description: 'x' })).toBe(false);
      });
      it('rejects unknown key id (additionalProperties: false)', () => {
        expect(Value.Check(UpdateTodoInputSchema, { completed: true, id: 'x' })).toBe(false);
      });
      it('accepts { completed: true }', () => {
        expect(Value.Check(UpdateTodoInputSchema, { completed: true })).toBe(true);
      });
      it('accepts { completed: false }', () => {
        expect(Value.Check(UpdateTodoInputSchema, { completed: false })).toBe(true);
      });
    });
    ```
    - Extend the import at the top to include `UpdateTodoInputSchema`: `import { TodoSchema, CreateTodoInputSchema, UpdateTodoInputSchema } from './todo.js';`
    - **Note:** these 7 assertions deliberately parallel Story 2.1's `CreateTodoInputSchema` coverage for consistency — the review audit for parallel coverage (create + update + eventually delete) is easy to eyeball in a single file
  - [x] Extend `apps/api/src/repositories/todosRepo.test.ts` — add two new `describe` blocks:
    - **(a) Compiled SQL shape (DummyDriver):**
      ```ts
      describe('todosRepo.update — compiled UPDATE shape (DummyDriver)', () => {
        it('compiles to UPDATE "todos" SET "completed" = $1 WHERE "id" = $2 RETURNING *', () => {
          const db = createDummyDb();
          const compiled = db
            .updateTable('todos')
            .set({ completed: true })
            .where('id', '=', 'some-id')
            .returningAll()
            .compile();

          expect(compiled.sql).toMatch(/update\s+"todos"\s+set\s+"completed"/i);
          expect(compiled.sql).toMatch(/where\s+"id"\s+=/i);
          expect(compiled.sql).toMatch(/returning\s+\*/i);
          expect(compiled.parameters).toEqual([true, 'some-id']);
        });
      });
      ```
      - **Why assert `parameters === [true, 'some-id']` in that order:** Kysely's parameter binding order is deterministic — SET fields first, then WHERE predicates. A regression like `.set({ id: input.completed })` would shift the bindings and this test would catch it immediately
    - **(b) Behavior (SeedingDriver happy path + zero-rows):**
      ```ts
      describe('todosRepo.update — behavior (SeedingDriver)', () => {
        it('returns a Todo with updated completed field and serialized createdAt on existing row', async () => {
          const createdAt = new Date('2026-04-20T10:30:00.000Z');
          const { db } = createSeedingDb({
            id: '01957890-abcd-7def-8000-000000000000',
            description: 'Existing todo',
            completed: true,
            created_at: createdAt,
            user_id: null,
          });

          const todo = await todosRepo.update(
            '01957890-abcd-7def-8000-000000000000',
            { completed: true },
            db,
          );

          expect(todo).toEqual({
            id: '01957890-abcd-7def-8000-000000000000',
            description: 'Existing todo',
            completed: true,
            createdAt: '2026-04-20T10:30:00.000Z',
            userId: null,
          });
          expect(todo.createdAt).toMatch(ISO_UTC_MS_REGEX);
        });

        it('throws NotFoundError with an id-echoing message when the UPDATE affects zero rows', async () => {
          // Reuse the existing zero-rows driver pattern from the "executeTakeFirstOrThrow" test
          // in todosRepo.create — override acquireConnection to always return empty rows.
          const driver = new SeedingDriver({});
          driver.acquireConnection = async () => ({
            executeQuery: async () => ({ rows: [] }),
            // eslint-disable-next-line require-yield -- interface contract
            streamQuery: async function* () {
              throw new Error('unused');
            },
          });
          const db = new Kysely<Database>({
            dialect: {
              createAdapter: () => new PostgresAdapter(),
              createDriver: () => driver,
              createIntrospector: (innerDb) => new PostgresIntrospector(innerDb),
              createQueryCompiler: () => new PostgresQueryCompiler(),
            },
            plugins: [new CamelCasePlugin()],
          });

          await expect(todosRepo.update('ghost-id', { completed: true }, db)).rejects.toThrow(
            NotFoundError,
          );
          await expect(todosRepo.update('ghost-id', { completed: true }, db)).rejects.toThrow(
            /^Todo ghost-id not found$/,
          );
        });
      });
      ```
      - Import `NotFoundError` from `'../errors/index.js'` at the top of `todosRepo.test.ts` (alongside the existing Kysely imports)
      - **Why two `.rejects.toThrow(...)` assertions in the zero-rows test:** the first checks the error **class** (`instanceof NotFoundError`), the second checks the exact **message** via regex. Both matter: the class drives the error handler's 404 branch (`error instanceof NotFoundError`), and the message is the user-facing copy (AC5 requires exact text). Separating them documents the two invariants
      - **Why the zero-rows test doesn't reuse the happy-path `createSeedingDb({seedRow})`:** `createSeedingDb` puts the seed row in a captured closure inside `SeedingDriver.acquireConnection`; to return empty rows we'd need to either seed with a sentinel and then strip it, or override `acquireConnection` — the override is the more explicit signal to future readers that this is the "zero rows" path
  - [x] **Do NOT** write an integration test that spins up real Postgres inside `todosRepo.test.ts` — this file is the unit layer (DummyDriver + SeedingDriver). Real-Postgres assertions live in `test/contract.todos.test.ts` (Task 6). Mixing layers is the main anti-pattern Story 2.1 avoided

- [x] **Task 6: Extend contract test at `apps/api/test/contract.todos.test.ts`** (AC: 6)
  - [x] Add a new `describe('PATCH /v1/todos/:id — contract', () => { ... })` block **at the end of the file** (after the existing `GET /v1/todos — contract` block). Reuse the module-level `app`, `beforeAll`, `afterAll`, `beforeEach` — do NOT duplicate them
  - [x] Body of the new describe (template — adapt uuid/timestamps to your preference but keep assertion intent):
    ```ts
    describe('PATCH /v1/todos/:id — contract', () => {
      const T_ACTIVE = '01927f00-0000-7000-8000-000000000011';
      const T_COMPLETED = '01927f00-0000-7000-8000-000000000012';
      const GHOST = '00000000-0000-0000-0000-000000000000';

      async function seed() {
        await app.db
          .insertInto('todos')
          .values([
            { id: T_ACTIVE, description: 'Active row', completed: false, userId: null },
            { id: T_COMPLETED, description: 'Completed row', completed: true, userId: null },
          ])
          .execute();
      }

      it('returns 200 with updated Todo when flipping active → completed', async () => {
        await seed();
        const res = await app.inject({
          method: 'PATCH',
          url: `/v1/todos/${T_ACTIVE}`,
          payload: { completed: true },
        });

        expect(res.statusCode).toBe(200);
        const body = res.json();
        expect(Value.Check(TodoSchema, body)).toBe(true);
        expect(body.id).toBe(T_ACTIVE);
        expect(body.description).toBe('Active row');
        expect(body.completed).toBe(true);
        expect(body.createdAt).toMatch(ISO_UTC_MS_REGEX);
        expect(body.userId).toBeNull();
      });

      it('returns 200 with updated Todo when flipping completed → active (toggle-back)', async () => {
        await seed();
        const res = await app.inject({
          method: 'PATCH',
          url: `/v1/todos/${T_COMPLETED}`,
          payload: { completed: false },
        });

        expect(res.statusCode).toBe(200);
        expect(res.json().completed).toBe(false);
      });

      it('persists the update — a direct Kysely read reflects the new completed value', async () => {
        await seed();
        await app.inject({
          method: 'PATCH',
          url: `/v1/todos/${T_ACTIVE}`,
          payload: { completed: true },
        });

        const row = await app.db
          .selectFrom('todos')
          .selectAll()
          .where('id', '=', T_ACTIVE)
          .executeTakeFirstOrThrow();

        expect(row.completed).toBe(true);
      });

      it.each([
        ['missing completed', {}],
        ['string completed', { completed: 'true' }],
        ['number completed', { completed: 1 }],
        ['extra description key', { completed: true, description: 'x' }],
        ['extra id key', { completed: true, id: 'x' }],
      ])('returns 400 on %s', async (_label, payload) => {
        await seed();
        const res = await app.inject({
          method: 'PATCH',
          url: `/v1/todos/${T_ACTIVE}`,
          payload,
        });

        expect(res.statusCode).toBe(400);
        expect(res.json()).toMatchObject({ statusCode: 400, error: 'Bad Request' });
      });

      it('returns 400 on invalid path param (format: uuid violated)', async () => {
        const res = await app.inject({
          method: 'PATCH',
          url: '/v1/todos/not-a-uuid',
          payload: { completed: true },
        });

        expect(res.statusCode).toBe(400);
        expect(res.json()).toMatchObject({ statusCode: 400, error: 'Bad Request' });
      });

      it('returns 404 with id-echoing message on non-existent id', async () => {
        const res = await app.inject({
          method: 'PATCH',
          url: `/v1/todos/${GHOST}`,
          payload: { completed: true },
        });

        expect(res.statusCode).toBe(404);
        expect(res.json()).toEqual({
          statusCode: 404,
          error: 'Not Found',
          message: `Todo ${GHOST} not found`,
        });
      });

      it('exposes UpdateTodoInput in /docs/json components.schemas', async () => {
        const res = await app.inject({ method: 'GET', url: '/docs/json' });
        expect(res.statusCode).toBe(200);
        const body = res.json();
        expect(body.components.schemas).toHaveProperty('UpdateTodoInput');
        expect(body.components.schemas.UpdateTodoInput.properties).toMatchObject({
          completed: expect.any(Object),
        });
      });
    });
    ```
  - [ ] **Why the seed function is local to the `describe` block:** the existing POST and GET describe blocks each do their seeding inline (POST block: the endpoint itself creates rows; GET block: inline `.insertInto` per `it`). Factoring `seed()` avoids duplication across the 3 happy-path tests AND the 5 validation-failure tests (seeding keeps the 404 semantic clean — validation failures are NOT about missing rows; they're about malformed input. A seeded row proves that)
  - [ ] **Why fixed UUID v7 literals (not generated):** deterministic test data. Generated UUIDs make failure logs harder to match-up. The literals follow the v7 shape (first block time-ordered; `7` nibble at version position) so `Value.Check(TodoSchema, body)` with `format: 'uuid'` passes
  - [ ] **Why assert `expect(res.json()).toEqual(...)` with the exact 404 message** (not `toMatchObject`): the message is a contract — the UI (Stories 3.4, 3.5, 4.3) will surface this. Any regression in the template string (e.g., `"Todo {id} missing"` or `"Item ${id} not found"`) is a breaking contract change that tests must catch
  - [x] Extend the import at the top of the file to include `FormatRegistry`'s `UUID_V7_REGEX` re-use (the constant already exists at line 9) — no new imports should be needed if the existing `Value.Check(TodoSchema, ...)` pattern is reused
  - [x] **Do NOT** rewrite the existing GET-era seeding (`contract.todos.test.ts:144-176`) — leave it untouched
  - [x] **Do NOT** add a "toggle same value" (`completed: true → true`) test — the UPDATE still runs and still affects 1 row (Postgres doesn't skip no-op writes); the 200 response is identical to the "flip" case. Not worth the extra `it` — the happy-path test already covers this behavior implicitly

- [x] **Task 7: Update `apps/api/src/app.test.ts` regression assertion** (AC: 9)
  - [x] In the test `registers the /healthz, /docs, POST /v1/todos, and GET /v1/todos routes` (lines 71–80), extend the enumeration:
    - Update the `it(...)` title to `registers the /healthz, /docs, POST /v1/todos, GET /v1/todos, and PATCH /v1/todos/:id routes`
    - Add the assertion: `expect(app.hasRoute({ method: 'PATCH', url: '/v1/todos/:id' })).toBe(true);` immediately after the existing `GET /v1/todos` assertion
  - [x] **Do NOT** add a PATCH happy-path `it` block in this file — `src/app.test.ts` exercises the plugin stack assembly (DummyDriver + buildApp), not route behavior. Behavior is covered against real Postgres in Task 6
  - [x] **Do NOT** flip or delete any other assertion — only ONE line is added per the AC9 scope

- [x] **Task 8: Run the full check script and finalize** (AC: 1–9)
  - [x] `npm run typecheck` — clean across both workspaces
  - [x] `npm run lint` — clean (the pre-existing `apps/api/src/db/index.ts:14` warning may remain; out of scope per the Story 1.6 deviations list in `deferred-work.md`)
  - [x] `npm run format:check` — clean; run `npm run format` if new files or edits need Prettier normalization (Story 1.6 contract: `singleQuote: true`, `semi: true`, `trailingComma: 'all'`, `printWidth: 100`)
  - [x] `npm test` — api passes (target: 64 (baseline from 2.6) + ~14 new tests from this story = ~78 tests all green; web's 100 tests unchanged = 178 total unit/integration; regression guard: no POST/GET contract tests fail)
  - [x] `npm run check` (aggregate) — exits 0
  - [x] **Do NOT** push to `main` or open a PR from within this task — the CI workflow from Story 1.6 runs on PR creation; Story 3.1 lands as a single `feat: story 3.1 implemented` commit and the ordinary PR flow picks it up
  - [x] **Do NOT** touch `apps/web/` in this story — web-side work (hook that calls PATCH, optimistic UI) is Story 3.3's scope; this story is API-only

## Dev Notes

### Why `description` is not in `UpdateTodoInput`

The MVP scope from PRD / epics locks editing to a single dimension: the `completed` flag. Rationale:
1. **UX simplicity:** the checkbox toggle is the Journey-2 gesture. No inline edit field on the row means no edit-cancel, no focus trap, no "are you sure?" pattern. A row is either active or completed; its text is immutable
2. **Contract boundary:** if `description` becomes editable later, it gets its own schema (`UpdateDescriptionInput`), its own route (`PATCH /v1/todos/:id/description` is one option; `PATCH` body merging is another), and its own optimistic-UI handling in the web layer. The split keeps the bi-directional complete toggle free of accidental coupling to text editing
3. **Tightness of `additionalProperties: false`:** rejecting `{ completed: true, description: 'edit' }` makes the "`description` is immutable" rule a runtime invariant, not just a convention in the UI. If a future client (mobile app, CLI, scripted test) submits a description in the body, it fails with 400 — the API refuses to have two sources of truth for the row's text

If an "Edit description" feature lands post-MVP, Story N will:
- Add a second schema: `UpdatePatchInputSchema = Type.Object({ completed?: ..., description?: ... })` — making both fields optional, requiring `oneOf/anyOf` guards — OR split into two endpoints
- Update the repo to a combined `update(id, patch, db)` that handles partial updates via Kysely's `.set(patch)` spread

The current story does NOT lay the groundwork for that — explicit `completed`-only is the contract.

### Why one UPDATE + zero-rows check is the right pattern

Two candidate patterns for "update by id, 404 on missing":

**Pattern A (chosen) — single statement:**
```ts
const row = await db.updateTable('todos').set({ completed }).where('id', '=', id).returningAll().executeTakeFirst();
if (!row) throw new NotFoundError(...);
```

**Pattern B (rejected) — SELECT-then-UPDATE:**
```ts
const existing = await db.selectFrom('todos').selectAll().where('id', '=', id).executeTakeFirst();
if (!existing) throw new NotFoundError(...);
await db.updateTable('todos').set({ completed }).where('id', '=', id).execute();
return { ...existing, completed };
```

**Why A wins:**
1. **One query, one round-trip.** Pattern B is 2× the latency for the happy path. At MVP scale it doesn't matter; at NFR-002 perf verification (Story 5.1, p95 ≤200ms) it's free headroom
2. **Atomic.** There's no race window where a row exists at SELECT time and has been deleted by DELETE time. With Pattern A, the UPDATE's `WHERE` predicate IS the existence check; there's no consistency gap
3. **Returning-row truth.** Pattern A's returning row reflects the post-update state (including the new `completed`). Pattern B has to hand-merge the SELECT snapshot with the update input — trivial here, but drift-prone if the schema gains a server-derived field later (e.g., `updated_at`)
4. **Fewer Kysely call sites.** Less code to maintain and test

The global error handler's `NotFoundError` → 404 branch (`plugins/error-handler.ts:22-28`) is already tested (`error-handler.test.ts:36-51`); this story re-exercises it at the real-DB layer via the 404 contract test in Task 6.

### Why `format: 'uuid'` on the path param matters

Without `params: Type.Object({ id: Type.String({ format: 'uuid' }) })`:
- `PATCH /v1/todos/abc` → route handler runs → `todosRepo.update('abc', ...)` → Kysely compiles `WHERE "id" = 'abc'` → Postgres sends `invalid input syntax for type uuid: "abc"` → error code `22P02`
- The global error handler's `23*` branch doesn't match (it's for integrity constraint violations, not syntax errors) → falls through to the `500 Internal Server Error` branch → client sees a misleading 500

With the schema:
- `PATCH /v1/todos/abc` → AJV validates `id` against `format: 'uuid'` → fails → error handler's `error.validation` branch → 400 envelope

Adding `format: 'uuid'` is **one line of schema** and makes the error surface accurate. This same pattern will apply to Story 3.2's `DELETE /v1/todos/:id` — recommend lifting the params schema into a shared constant in that story (premature DRY in this one).

**AJV format registration note:** the `ajv-formats` plugin is already wired into Fastify's request-validation AJV (`app.ts:31-42`, set up in Story 2.1). `format: 'uuid'` matches the pattern `/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i` (variant/version nibble agnostic — v1, v4, v7 all pass). This is looser than our `uuid v7` generation check but exactly right for the *validation* layer: any valid UUID shape is acceptable input; the *generation* path (Story 2.1's `create`) enforces v7 specifically.

### `additionalProperties: false` on params

Path params in Fastify come from the URL pattern — `/todos/:id` yields `{ id: string }`. There's no realistic way a client can smuggle extra keys into the params object (URL parsing doesn't allow it). Nevertheless, `additionalProperties: false` on the params schema:
1. Documents intent: "these are the only params this route expects"
2. Costs nothing at runtime (AJV short-circuits on empty `extra-keys` list)
3. Future-proofs against `:id` getting a sibling param (e.g., `/todos/:id/:index` in some feature) — any mismatch between pattern and schema becomes a test failure

It's the same rule already in force on every body schema in the codebase (TodoSchema, CreateTodoInput, UpdateTodoInput).

### Route order in the plugin matters for Fastify's router

Fastify's find-my-way router is order-independent for static paths and parameter paths (`/todos` vs `/todos/:id` are disambiguated by specificity, not registration order). So the existing POST + GET + the new PATCH can be declared in any order inside `todosRoutes`. The pattern this story follows — PATCH after GET, before the `// Handler for DELETE ...` comment — keeps the source file readable (HTTP verb order: POST → GET → PATCH → DELETE is the REST convention).

### Status-code contract: 200 vs 204 for successful UPDATE

PRD + architecture lock the happy path as `200` for PATCH (`architecture.md:217`). Alternative `204 No Content` was considered by REST purists (no body = no allocation). Rejected:
1. **Web consumer contract:** `useToggleTodo` (Story 3.3) updates the TanStack Query cache with the server's authoritative response — needs the row body, not a 204
2. **UI feedback:** on a toggle-back, the server might have amended the row (e.g., `updated_at` if we add it later); returning the row means the client never falls out of sync
3. **Symmetry with POST (201 + body) and GET (200 + body):** three endpoints returning bodies, one return-nothing makes PATCH an outlier

204 is reserved for the DELETE endpoint (Story 3.2) where "nothing to return" is the natural semantic.

### Why the 404 message echoes the id

The AC5 requirement `message: 'Todo <id> not found'` is a deliberate product choice:
- **Debuggable:** in CI logs or browser devtools, seeing `Todo 01927f00-...-0011 not found` immediately identifies which row the client was touching — much better than a generic "not found"
- **UI-legible:** even though Epic 4 builds better error copy on top, the raw API message is what end-users see before that work lands. "Todo [id] not found" is neutral and informative
- **Contract-stable:** the test in AC6 case 6 asserts the exact message, so this is a versioned contract — changing it later requires a contract-test update too

The `id` value comes straight from the request's path parameter (validated as UUID format, so not an injection vector) — no PII concern, no sanitization needed.

### TypeBox `Value.Check` with format: 'uuid' in unit tests

Story 2.1 surfaced a deviation: `@sinclair/typebox/value`'s `Value.Check` in v0.34.x enforces format keywords by default, and returns `false` with `kind: 49` ("Unknown format") if the format isn't in `FormatRegistry`. Story 2.1 registered permissive checkers via:
```ts
if (!FormatRegistry.Has('uuid')) FormatRegistry.Set('uuid', (v) => UUID_GENERIC_REGEX.test(v));
if (!FormatRegistry.Has('date-time')) FormatRegistry.Set('date-time', (v) => ISO_UTC_MS_REGEX.test(v));
```
in `test/contract.todos.test.ts` (lines 13–20).

**For this story (3.1):** the existing registration is already in place for the PATCH contract tests — the `FormatRegistry` is module-scoped, so the same file's PATCH block gets the same format checkers. `Value.Check(TodoSchema, body)` works on the PATCH happy path response.

**For `schemas/todo.test.ts` (unit):** the tests on `UpdateTodoInputSchema` don't use any `format` keyword (it's just `Type.Boolean()`), so no FormatRegistry setup is needed in that file. The existing `schemas/todo.test.ts` did set up the registry for `TodoSchema`'s `format: 'uuid'` and `format: 'date-time'`; leave that setup alone.

### Why `executeTakeFirst` is the right Kysely idiom for UPDATE

Kysely's returning-style query terminators:
- **`.execute()`** — returns an array of all returned rows (`TodoTable[]`). Use for bulk updates or when cardinality is unknown
- **`.executeTakeFirst()`** — returns the first returned row or `undefined`. Use when cardinality is "0 or 1"
- **`.executeTakeFirstOrThrow()`** — returns the first row or throws `NoResultError`. Use when cardinality MUST be 1 (pathological otherwise)

For `update(id, ...)`:
- Cardinality **by WHERE predicate** is 0 or 1 (id is the primary key, unique)
- Cardinality of 0 is a **legitimate domain outcome** (id doesn't exist) — we want to distinguish it from a driver error, so we throw our own `NotFoundError` rather than catching a generic `NoResultError`
- Therefore: `executeTakeFirst()` + explicit `if (!row)` check, NOT `executeTakeFirstOrThrow()`

Contrast with `create` (Story 2.1) which uses `executeTakeFirstOrThrow` because a zero-row INSERT is not a domain outcome — it's a driver bug. Same rule, different decision because of the semantic difference.

### Why the UPDATE's `set({ completed })` doesn't need `updatedAt`

Postgres doesn't auto-track row modification time (no `ON UPDATE CASCADE` for timestamps). If we wanted `updatedAt`, we'd either:
- Add an `updated_at timestamptz DEFAULT now()` column + a trigger — migration work, touches `db/schema.ts`, schema drift risk
- Pass `updatedAt: new Date()` to `.set(...)` at the repo level — simpler, but drifts the schema (the API contract omits `updatedAt` today)

The MVP explicitly doesn't track `updatedAt` (it's not in `TodoSchema`, not in `TodoTable`, not in migration `20260418_001`). This story inherits that decision. If an "edit history" feature lands later, adding `updatedAt` is a one-shot migration + schema-and-route sweep; it's not a hook Story 3.1 needs to leave open.

### Why the contract test seeds via direct Kysely insert, not via the API

Two options for seeding rows before PATCH:
1. **Seed via `POST /v1/todos` + capture the returned id**: round-trips the HTTP stack; rows are real; but tests are coupled to the POST contract (a POST regression would cascade failures into PATCH tests, making debugging harder)
2. **Seed via direct `app.db.insertInto('todos')`** (CHOSEN): one-line setup; rows are real Postgres state; tests are decoupled from POST — they test PATCH in isolation

Option 2 matches the existing pattern in the GET contract tests (`contract.todos.test.ts:144-176`). The seeding strategy section of Story 2.2's Dev Notes (lines 297–327) walked through this rationale in detail — "Seeding strategy: direct insert with controlled timestamps".

### Previous Story Intelligence

**From Story 2.1 (schemas + create) — directly load-bearing:**
- `TodoSchema`, `CreateTodoInputSchema` live in `apps/api/src/schemas/todo.ts` — add `UpdateTodoInputSchema` to the same file; follow the identical `$id` + `additionalProperties: false` pattern
- `todosRepo.ts::create` pattern: UUID v7 + trim + ISO 8601 serialization via `.toISOString()` + `returningAll()` + row-to-Todo hand serialization. Story 3.1's `update` follows the same serialization block verbatim
- `todosRepo.test.ts` established `createDummyDb()` helper (DummyDriver) for compiled-SQL-shape tests and `createSeedingDb(seedRow)` + `SeedingDriver` for behavior tests. Reuse both verbatim
- `routes/todos.ts` established `typedApp = app.withTypeProvider<TypeBoxTypeProvider>()` — reuse the alias
- `plugins/swagger.ts` is the canonical `addSchema(...)` registration site — append the 4th call here
- Fastify's `ajv.plugins: [addFormats]` + `removeAdditional: false` (set in `app.ts:31-42`) is already wired — `format: 'uuid'` on the params schema Just Works; no more `addFormats` wiring needed this story
- Contract-test lifecycle: `beforeAll(buildApp + migrateLatest)` / `afterAll(app.close)` / `beforeEach(truncateTodos)` from `test/contract.todos.test.ts` — reuse, do NOT duplicate

**From Story 2.2 (listAll + GET) — pattern reinforcement:**
- Second repo function added; third comes in this story (`update`). The third callsite DOES justify extracting a `rowToTodo(row)` helper, but Story 2.2 Dev Notes (lines 342–350) explicitly deferred this refactor — keep deferring, add to `deferred-work.md` after this story lands
- Second handler added to `todosRoutes`; reuse `typedApp` — no new `withTypeProvider` call
- Contract test block extends the existing file (doesn't create a new one) — follow the same "add a new describe block" pattern

**From Story 1.4 (plugin stack) — load-bearing:**
- `NotFoundError` class at `src/errors/index.ts` — already defined; Story 3.1 is its **first runtime caller** from a repo. (`plugins/error-handler.test.ts` tested the mapping in Story 1.4; no prior repo threw it)
- Global error handler at `plugins/error-handler.ts:22-28` maps `NotFoundError` → 404 with the instance's `.message`
- `/v1` prefix at `app.register(todosRoutes, { prefix: '/v1' })` (`app.ts:75`) — routes inside the plugin use `/todos/:id` not `/v1/todos/:id`

**From Story 1.6 (CI + code quality) — awareness items:**
- `npm run check` aggregates typecheck + lint + format + test; use for final verification in Task 8
- Prettier: `singleQuote: true`, `semi: true`, `trailingComma: 'all'`, `printWidth: 100`
- Pre-existing lint warning at `apps/api/src/db/index.ts:14` — **do not fix in this story** (Story 1.6 deviation, left intentionally in `deferred-work.md` per the chain of prior stories)

**From Story 2.6 (Journey 1 E2E) — unrelated but context-setting:**
- Epic 2 is DONE; this is the first Epic 3 story; Epic 3's goal is the complete + delete user loop (Journey 2)
- The web `apps/web/src/hooks/useToggleTodo.ts` and `useDeleteTodo.ts` are NOT in this story (they're Story 3.3). This story is API-only
- The E2E journey-1 suite uses `docker compose exec psql TRUNCATE` (Story 2.6 Dev Notes "Journey-1 DB cleanup strategy"); **not relevant to this story's tests** (which run via `migrateLatest` + `truncateTodos` in `beforeEach`)

### Git Intelligence

- Last 7 commits: 1.6 → 2.1 → 2.2 → 2.3 → 2.4 → 2.5 → 2.6, all `feat: story X.Y implemented`. Story 3.1 continues the convention: target commit `feat: story 3.1 implemented`
- File-scope discipline has held across every story — no incidental `src/` cleanups. Keep the pattern: Story 3.1 touches exactly these files:
  1. `apps/api/src/schemas/todo.ts` (extended)
  2. `apps/api/src/schemas/todo.test.ts` (extended)
  3. `apps/api/src/repositories/todosRepo.ts` (extended)
  4. `apps/api/src/repositories/todosRepo.test.ts` (extended)
  5. `apps/api/src/routes/todos.ts` (extended)
  6. `apps/api/src/plugins/swagger.ts` (extended)
  7. `apps/api/src/app.test.ts` (one assertion added)
  8. `apps/api/test/contract.todos.test.ts` (new describe block appended)
  9. `_bmad-output/implementation-artifacts/sprint-status.yaml` (status transitions)
  10. `_bmad-output/implementation-artifacts/3-1-updatetodoinput-schema-todosrepo-update-patch-v1-todos-id.md` (this file — dev record updates)
- **No new dependencies.** All packages (`@sinclair/typebox`, `@fastify/type-provider-typebox`, `kysely`, `ajv-formats`, etc.) are already in `apps/api/package.json`
- **No changes in `apps/web/`.** Web consumption lands in Story 3.3 (`useToggleTodo` hook)

### Latest Tech Information

**Kysely 0.28.x (`update` query-builder):**
- `db.updateTable('todos').set(patch).where(...).returningAll()` is the idiomatic UPDATE-returning pattern in Postgres dialect
- `.set(...)` accepts `Updateable<TodoTable>` — for `TodoTable.completed: boolean`, passing `{ completed: boolean }` is type-checked
- `.executeTakeFirst()` returns `Selectable<TodoTable> | undefined` — matches the 0-or-1 cardinality of a by-id update
- CamelCasePlugin transforms `createdAt` (camelCase input) ↔ `created_at` (snake_case column) at query-builder parse time; `SET "completed" = $1` doesn't trigger it because there's no case-disagreement

**TypeBox 0.34.x (`Type.Object` with boolean-only schema):**
- `Type.Object({ completed: Type.Boolean() }, { additionalProperties: false, $id: 'UpdateTodoInput' })` is the canonical idiom
- `Static<typeof UpdateTodoInputSchema>` → `{ completed: boolean }` at the TS level
- `FormatRegistry` not needed for `Type.Boolean()` (no format keyword); needed only for `Type.String({ format: 'uuid' })` in the path-param schema (already registered in `contract.todos.test.ts:13-20`)

**Fastify 5.x (`PATCH` with typed params + body):**
- `typedApp.patch('/path/:id', { schema: { params, body, response } }, handler)` — the `TypeBoxTypeProvider` infers `request.params` as `Static<typeof ParamsSchema>` and `request.body` as `Static<typeof BodySchema>`
- The `response: { 200: TodoSchema, 400: {...}, 404: {...} }` tells `@fastify/swagger` what to document; `fast-json-stringify` uses the `200:` entry for fast serialization; 400 and 404 entries are for OpenAPI only (the global error handler constructs those responses via `reply.status(...).send(...)`, bypassing the response serializer for error paths — see `plugins/error-handler.ts:15-19, 23-27`)

**AJV 8.x (strict mode + `ajv-formats`):**
- `format: 'uuid'` matches `/^(urn:uuid:)?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i` — permissive of all UUID versions; reject at the app layer if v7-only is required (not required here — the route just needs "a UUID"; Story 2.1's `create` handles v7-only generation)
- `coerceTypes: 'array'` in our `app.ts` config does NOT coerce `string → boolean` or `number → boolean` — AJV's coercion table covers string↔number, not boolean from string; this means `{ completed: 'true' }` correctly fails validation (AC4 case 2 holds)

### Project Structure Notes

**Extended files (6):**
- `apps/api/src/schemas/todo.ts` — `UpdateTodoInputSchema` + `type UpdateTodoInput` exports added
- `apps/api/src/schemas/todo.test.ts` — new `describe('UpdateTodoInputSchema', ...)` block
- `apps/api/src/repositories/todosRepo.ts` — `update` export added (+ `NotFoundError` import)
- `apps/api/src/repositories/todosRepo.test.ts` — two new `describe` blocks: compiled UPDATE shape + behavior (happy path + zero-rows)
- `apps/api/src/routes/todos.ts` — `typedApp.patch('/todos/:id', ...)` handler added (+ `UpdateTodoInputSchema` import)
- `apps/api/src/plugins/swagger.ts` — 4th `app.addSchema(UpdateTodoInputSchema)` call

**Modified files (2 assertions-only):**
- `apps/api/src/app.test.ts` — one additional `hasRoute` assertion for PATCH
- `apps/api/test/contract.todos.test.ts` — new `describe('PATCH /v1/todos/:id — contract', ...)` block

**No new files.** No new dependencies. No `apps/web/` changes. No migration changes.

**Alignment with `architecture.md:530`:** `repositories/todosRepo.ts` is the canonical data-access layer; adding `update` alongside `create` + `listAll` matches the declared function inventory (`listAll, create, update, delete, findById`). `findById` and `delete` arrive in Story 3.2 (delete) or later (findById appears unneeded in the scoped MVP; may never land).

### Testing Standards

- **Unit tests:** co-located (`*.test.ts` next to `*.ts`). Story 3.1 adds cases to `schemas/todo.test.ts` and `repositories/todosRepo.test.ts`
- **Contract tests:** `apps/api/test/contract.todos.test.ts` — extended with a new `describe` block; shares the module-level `buildApp + migrateLatest + truncateTodos` lifecycle
- **Lifecycle helpers** already in `test/setup.ts` — reuse `migrateLatest` and `truncateTodos`; do NOT duplicate
- **Vitest runs serially at file level** (`fileParallelism: false` in `apps/api/vitest.config.ts`) — safe to share the same Postgres; `truncateTodos` in `beforeEach` provides per-test isolation
- **Coverage target:** `todosRepo.update` should reach 100% unit-only coverage via the SeedingDriver tests (happy path + zero-rows = both branches of `if (!row)`)
- **Format validation at test time:** `Value.Check(TodoSchema, ...)` requires `FormatRegistry` entries for `uuid` and `date-time` — already registered at the top of `test/contract.todos.test.ts` (lines 13–20). No new registration needed

### References

- Epic requirements: [epics.md § Story 3.1](../planning-artifacts/epics.md) (lines 796–848)
- Architecture — ID strategy + TypeBox SoT + API boundaries: [architecture.md § Technology Stack](../planning-artifacts/architecture.md) (lines 193, 214, 217, 221, 435–452)
- Architecture — Project Structure (`repositories/todosRepo.ts`): [architecture.md § Complete Project Directory Structure](../planning-artifacts/architecture.md) (lines 528–532)
- Architecture — Requirements-to-Structure Mapping (FR-003 row): [architecture.md § Requirements-to-Structure Mapping](../planning-artifacts/architecture.md) (line 619)
- Architecture — Data-access boundary (routes → repositories → db): [architecture.md § Architectural Boundaries](../planning-artifacts/architecture.md) (lines 587–601)
- PRD — FR-003 (complete toggle), FR-010 (error messages), FR-012 (REST API with /v1), NFR-002 (API p95 ≤200ms): [PRD.md § Functional Requirements](../planning-artifacts/PRD.md)
- Previous story: [2-1 TypeBox schemas + todosRepo.create + POST /v1/todos](./2-1-typebox-schemas-todosrepo-create-post-v1-todos.md) — schema + repo + route patterns
- Previous story: [2-2 todosRepo.listAll + GET /v1/todos](./2-2-todosrepo-listall-get-v1-todos-with-active-asc-ordering.md) — second handler, second repo function, contract-test extension pattern
- Previous story: [1-4 API plugin stack + /v1 prefix + global error handler](./1-4-api-plugin-stack-v1-prefix-global-error-handler.md) — `NotFoundError`, error handler, `/v1` mount, `ErrorResponse` schema
- Previous story: [1-6 CI + code-quality gate](./1-6-ci-pipeline-code-quality-gate-eslint-prettier-a11y-playwright-e2e-scaffold-onboarding-readme.md) — `npm run check` aggregate + Prettier contract

## Dev Agent Record

### Agent Model Used

Claude Opus 4.7 (1M context)

### Debug Log References

- `npm run typecheck` — clean across both workspaces
- `npm run lint` — only the pre-existing `apps/api/src/db/index.ts:14` warning (out of scope per Story 1.6 deferred-work)
- `npm run format:check` — clean (all files match Prettier style)
- `npm test --workspace apps/api` — 10 files, 85 tests all green (baseline 59 → 85, +26 new assertions: 7 schema + 3 repo + 16 contract)
- `npm test --workspace apps/web` — 21 files, 100 tests green (unchanged, no web-side work)
- `npm run check` — exits 0

### Completion Notes List

- **Implementation scope matched the story plan verbatim.** `UpdateTodoInputSchema` + `todosRepo.update` + `PATCH /v1/todos/:id` wired through the same layer stack Story 2.1/2.2 established (schema → repo → route → swagger).
- **Deviation — AJV coercion config.** The story's Dev Notes claimed `coerceTypes: 'array'` would reject `{ completed: 'true' }` and `{ completed: 1 }` as 400. In practice, AJV 8's `'array'` mode still coerces `string → boolean` and `number → boolean`, so the PATCH contract cases "string completed" and "number completed" initially returned 200. AC4 explicitly requires these as 400, so I changed `customOptions.coerceTypes` from `'array'` → `false` in `apps/api/src/app.ts`. The comment was updated to explain both the `removeAdditional: false` and the new `coerceTypes: false` choice. This is a one-line config change; no other test behavior moved. File is outside Task 8's listed file-scope but was required to honor AC4 cases 2 & 3.
- **No array query params exist today** (POST body and GET with no params), so removing array-coercion has no ripple effect. POST /v1/todos contract suite and existing app.test.ts 400-envelope cases stayed green.
- **All 9 ACs satisfied** — schema export (AC1), repo update function w/ NotFoundError (AC2 + AC5), PATCH handler with uuid-format params (AC3), 400 on all 6 invalid body/path cases (AC4), 404 with id-echo message (AC5), contract test block at real Postgres (AC6 cases 1–7), schema + repo unit tests (AC7), swagger registration (AC8), `hasRoute` regression updated (AC9).
- **File-scope discipline held except for the AJV config deviation above.** No changes to `apps/web/`, no new dependencies, no migrations. `src/errors/index.ts` was NOT modified — reused as-is (this story is `NotFoundError`'s first real-runtime caller, as flagged in Dev Notes).

### File List

**Extended:**
- `apps/api/src/schemas/todo.ts` — `UpdateTodoInputSchema` + `type UpdateTodoInput` exports added
- `apps/api/src/schemas/todo.test.ts` — new `describe('UpdateTodoInputSchema', ...)` block (7 assertions)
- `apps/api/src/repositories/todosRepo.ts` — `update(id, input, db)` export added; `NotFoundError` + `UpdateTodoInput` imports
- `apps/api/src/repositories/todosRepo.test.ts` — two new describes: compiled UPDATE shape (DummyDriver) + behavior (SeedingDriver happy + zero-rows w/ NotFoundError assertions)
- `apps/api/src/routes/todos.ts` — `typedApp.patch('/todos/:id', ...)` handler + `UpdateTodoInputSchema` import; trailing comment updated
- `apps/api/src/plugins/swagger.ts` — 4th `app.addSchema(UpdateTodoInputSchema)` call + import extended
- `apps/api/src/app.test.ts` — PATCH `hasRoute` assertion added; test title updated
- `apps/api/test/contract.todos.test.ts` — new `describe('PATCH /v1/todos/:id — contract', ...)` block with 10 `it` cases (3 happy + persistence + 5 `it.each` 400s + 400-uuid + 404 + docs)

**Modified (config deviation, see Completion Notes):**
- `apps/api/src/app.ts` — AJV `customOptions.coerceTypes: 'array' → false`; comment updated

**Story artifacts:**
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — story status transitions (ready-for-dev → in-progress → review)
- `_bmad-output/implementation-artifacts/3-1-updatetodoinput-schema-todosrepo-update-patch-v1-todos-id.md` — this story file (status + task checkboxes + Dev Agent Record + Change Log)

### Change Log

- 2026-04-24 — Implemented Story 3.1: `UpdateTodoInputSchema` + `todosRepo.update` + `PATCH /v1/todos/:id`. All 9 ACs satisfied; 26 new tests added (7 schema + 3 repo + 16 contract) on top of the 59-test baseline. Deviation: disabled AJV `coerceTypes` globally so AC4 cases 2 & 3 (`{completed:'true'}` and `{completed:1}`) correctly reject as 400 — Dev Notes assumption about AJV behavior was incorrect.
