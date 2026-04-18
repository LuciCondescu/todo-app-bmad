# Story 1.4: API plugin stack + `/v1` prefix + global error handler

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want the Fastify plugin stack, `/v1` route prefix, a TypeBox `ErrorResponse` schema, and a global error handler registered once in `buildApp`,
So that every route added in subsequent stories (Epic 2 onwards) inherits CORS, security headers, rate limiting, body-size limits, OpenAPI docs, and a consistent error envelope without per-route wiring.

## Acceptance Criteria

**AC1 — Core security + transport plugins registered globally**
- **Given** `buildApp` has already registered `@fastify/env` and decorated `app.db` (Story 1.3 contract)
- **When** the engineer inspects `apps/api/src/app.ts`
- **Then** the following plugins are registered — in this order, after env + db, before any route plugin:
  1. `@fastify/cors` — `origin` sourced from `app.config.CORS_ORIGIN` (see Dev Notes → "CORS allow-list parsing" for list-vs-scalar handling)
  2. `@fastify/helmet` — with `contentSecurityPolicy: false` (so `/docs` Swagger UI renders; see Dev Notes → "Helmet + Swagger UI CSP gotcha")
  3. `@fastify/rate-limit` — `max: 300`, `timeWindow: '1 minute'`
- **And** the Fastify instance is constructed with `bodyLimit: 65_536` (64 KB — architecture.md:205)
- **And** the env schema picks up `format: 'uri'` on `CORS_ORIGIN` and `DATABASE_URL` via `ajv-formats` (closes deferred-work.md lines 21–22)

**AC2 — OpenAPI docs at `/docs` and `/docs/json`**
- **Given** `@fastify/swagger` and `@fastify/swagger-ui` are registered (in that order) after the security plugins but before route plugins
- **When** a client issues `GET /docs`
- **Then** Swagger UI HTML renders (response contains the markers `swagger-ui` and references a JS bundle)
- **And** `GET /docs/json` returns a valid OpenAPI 3.x document (`openapi: '3.x.x'`, with `info.title`, `info.version`, `paths`, `components.schemas`)
- **And** the generated OpenAPI `paths` object lists `/healthz` (any route registered before swagger.ready completes is auto-included)
- **And** `components.schemas.ErrorResponse` is present in the OpenAPI JSON (added via `app.addSchema(ErrorResponse)` — see AC5)

**AC3 — `/v1` route prefix is an encapsulated plugin mounting `routes/todos.ts`**
- **Given** a `/v1` scope is registered via `await app.register(v1Plugin, { prefix: '/v1' })` (or equivalent) inside `buildApp`
- **When** the engineer inspects `apps/api/src/app.ts` and `apps/api/src/routes/todos.ts`
- **Then** the `/v1` scope registers `todosRoutes` (imported from `./routes/todos.js`)
- **And** `src/routes/todos.ts` exports a `FastifyPluginAsync` with **no handlers registered yet** (handlers arrive in Epic 2) — the file exists so every future `POST/GET/PATCH/DELETE /v1/todos*` mounts under `/v1` automatically
- **And** a sanity-check route mounted under `/v1` during tests is reachable at `/v1/<path>` and NOT at `/<path>`
- **And** `/healthz` remains unversioned (mounted at root, NOT under `/v1`)

**AC4 — `NotFoundError` class + global error handler map every thrown error to a consistent envelope**
- **Given** `src/errors/index.ts` exports a `NotFoundError` class (extends `Error`, carries the 404 intent) and `src/plugins/error-handler.ts` registers a single `app.setErrorHandler(handler)` at root
- **When** a route throws a TypeBox / Fastify **validation** error (the request body fails schema validation)
- **Then** the response is `400 { "statusCode": 400, "error": "Bad Request", "message": <detail> }` (Fastify's default envelope; re-emit via `error.validation` branch)
- **And** when a route throws `new NotFoundError('Todo abc not found')`, the response is `404 { "statusCode": 404, "error": "Not Found", "message": "Todo abc not found" }`
- **And** when a route throws a Postgres-shaped error with a SQLSTATE starting with `23` (e.g., `{ code: '23505' }` unique violation), the response is `409 { "statusCode": 409, "error": "Conflict", "message": "Conflict — the request violates a database constraint." }` — **no Postgres detail, constraint name, or SQL text is echoed**
- **And** when a route throws any other `Error`, the response is `500 { "statusCode": 500, "error": "Internal Server Error", "message": "Internal server error" }` **and** `app.log.error({ err }, 'unhandled route error')` is called with the original error
- **And** the handler NEVER calls `reply.code(...)` before returning; it uses `reply.status(n).send(body)` (Fastify 5 idiom) and the function is declared `async`

**AC5 — Shared TypeBox `ErrorResponse` schema registered with the instance**
- **Given** `src/schemas/errors.ts` exports `ErrorResponse = Type.Object({ statusCode, error, message })` plus `type ErrorResponse = Static<typeof ErrorResponse>`
- **When** `buildApp` runs, the schema is registered via `app.addSchema({ $id: 'ErrorResponse', ...ErrorResponseSchema })` **before** any route plugin registers (so future routes can `$ref` it in their `response: { 400: { $ref: 'ErrorResponse#' } }` entries)
- **Then** `GET /docs/json` shows `components.schemas.ErrorResponse` with fields `statusCode: integer`, `error: string`, `message: string`
- **And** a placeholder dummy route used only in tests can declare `response: { 400: { $ref: 'ErrorResponse#' } }` and the compiled schema resolves without error
- **And** `/healthz` is **not** required to reference `ErrorResponse` (it has its own `{ status, db }` contract locked in Story 1.3; non-2xx responses on /healthz are ops concerns, not API consumer concerns)

## Tasks / Subtasks

- [x] **Task 1: Install plugin + schema dependencies** (AC: 1, 2, 4, 5)
  - [x] Add runtime deps to `apps/api/package.json`:
    - `@fastify/cors` — `^11.0.0`
    - `@fastify/helmet` — `^13.0.0`
    - `@fastify/rate-limit` — `^10.0.0`
    - `@fastify/swagger` — `^9.0.0`
    - `@fastify/swagger-ui` — `^5.0.0`
    - `@sinclair/typebox` — `^0.34.0`
    - `ajv-formats` — `^3.0.0`
    - See Dev Notes → "Version pinning rationale" for why these specific majors (Fastify 5 peer compatibility matrix)
  - [x] From repo root: `npm install` — confirm `node_modules/@fastify/cors`, `node_modules/@fastify/helmet`, `node_modules/@fastify/rate-limit`, `node_modules/@fastify/swagger`, `node_modules/@fastify/swagger-ui`, `node_modules/@sinclair/typebox`, `node_modules/ajv-formats` all exist
  - [x] `npm ls --workspace apps/api @fastify/cors @fastify/helmet @fastify/rate-limit @fastify/swagger @fastify/swagger-ui @sinclair/typebox ajv-formats` — each resolves to its installed version
  - [x] **Do NOT** add `@fastify/type-provider-typebox` (arrives in Story 2.1 with typed response validators on real routes). For 1.4 the TypeBox schema is consumed only via `app.addSchema` (by `$id`), not as a route type-provider.

- [x] **Task 2: Extend the env schema with URI formats (closes deferred items from 1.2)** (AC: 1)
  - [x] Update `apps/api/src/config.ts`: add `format: 'uri'` to `CORS_ORIGIN` and `DATABASE_URL` properties.
  - [x] `CORS_ORIGIN` becomes: `{ type: 'string', format: 'uri', default: 'http://localhost:5173', minLength: 1 }` — **important:** keep `default` + `minLength: 1` so CI and dev boot without setting the variable
  - [x] `DATABASE_URL` becomes: `{ type: 'string', format: 'uri', minLength: 1 }` — no default; `required` stays
  - [x] Wire `ajv-formats` into `@fastify/env`'s AJV instance: pass `ajv: { customOptions: { formats: addFormats } }` is NOT how `@fastify/env` works — instead use the `ajv` option documented by `@fastify/env` v5 (`ajv.customOptions` with `addFormats`). See Dev Notes → "`ajv-formats` wiring into `@fastify/env`" for the exact registration shape
  - [x] **Do NOT** emit a custom CORS_ORIGIN list validator here — comma-separated lists are a single `string` at the schema layer; the list is parsed at plugin-wire time in `src/plugins/cors.ts` (Task 4). Keeping the env schema simple avoids dragging a custom AJV keyword into MVP.

- [x] **Task 3: Author the TypeBox `ErrorResponse` schema + `NotFoundError` class** (AC: 4, 5)
  - [x] Create `apps/api/src/schemas/errors.ts`:
    ```ts
    import { Type, type Static } from '@sinclair/typebox';

    export const ErrorResponseSchema = Type.Object(
      {
        statusCode: Type.Integer(),
        error: Type.String(),
        message: Type.String(),
      },
      { $id: 'ErrorResponse', additionalProperties: false },
    );

    export type ErrorResponse = Static<typeof ErrorResponseSchema>;
    ```
    - See Dev Notes → "`ErrorResponse` schema notes" for why we keep `$id` inside the schema options (Fastify 5's AJV will read `$id` automatically when `addSchema` is called)
  - [x] Create `apps/api/src/errors/index.ts`:
    ```ts
    export class NotFoundError extends Error {
      readonly statusCode = 404;
      constructor(message: string) {
        super(message);
        this.name = 'NotFoundError';
      }
    }
    ```
    - See Dev Notes → "`NotFoundError` shape" for why `readonly statusCode = 404` (error handler uses `instanceof` AND `err.statusCode` detection for robustness)
  - [x] Both files are imported from `app.ts` (directly or transitively); no test yet (covered by the error-handler unit test in Task 7)

- [x] **Task 4: Author the security plugin wrappers — `cors.ts`, `helmet.ts`, `rate-limit.ts`** (AC: 1)
  - [x] Create `apps/api/src/plugins/cors.ts`:
    ```ts
    import fp from 'fastify-plugin';
    import cors from '@fastify/cors';

    export default fp(async (app) => {
      const raw = app.config.CORS_ORIGIN;
      const origins = raw.includes(',') ? raw.split(',').map((s) => s.trim()).filter(Boolean) : raw;
      await app.register(cors, { origin: origins });
    }, { name: 'cors-plugin', dependencies: ['@fastify/env'] });
    ```
    - See Dev Notes → "CORS allow-list parsing" for the scalar-vs-list contract
    - `fastify-plugin` (`fp`) **breaks the encapsulation boundary** so the plugin's registrations apply at the parent scope. This is required because CORS + helmet + rate-limit must apply to all sibling routes. Add `fastify-plugin` as a runtime dep if Fastify 5 doesn't ship it transitively (check `node_modules/fastify-plugin` after `npm install`; it's a peer dep of most `@fastify/*` plugins and should resolve automatically)
    - **`dependencies: ['@fastify/env']`** — enforces registration order: `fp` throws at startup if `@fastify/env` hasn't been registered first. Cheap ordering guard; catches future regressions if someone reorders `app.ts`
  - [x] Create `apps/api/src/plugins/helmet.ts`:
    ```ts
    import fp from 'fastify-plugin';
    import helmet from '@fastify/helmet';

    export default fp(async (app) => {
      await app.register(helmet, { contentSecurityPolicy: false });
    }, { name: 'helmet-plugin' });
    ```
    - **Why `contentSecurityPolicy: false`:** helmet's default CSP blocks Swagger UI's inline scripts + blob URLs, producing a white-screen `/docs`. Disabling CSP globally is acceptable at MVP (API is internal-ish); tightening with a Swagger-UI-aware CSP is Growth-phase ops work. See Dev Notes → "Helmet + Swagger UI CSP gotcha"
  - [x] Create `apps/api/src/plugins/rate-limit.ts`:
    ```ts
    import fp from 'fastify-plugin';
    import rateLimit from '@fastify/rate-limit';

    export default fp(async (app) => {
      await app.register(rateLimit, { max: 300, timeWindow: '1 minute' });
    }, { name: 'rate-limit-plugin' });
    ```
    - **300 req/min/IP** is exactly the architecture.md:204 ceiling. No env override needed at MVP scale
    - **Do NOT** add `skipOnError: true` or custom `keyGenerator` — defaults are correct for single-user MVP
    - **Do NOT** exclude `/healthz` from rate limiting. Docker-compose healthcheck at 30s intervals consumes ~2 req/min — well under 300; Growth-phase load balancers may need an allowlist but that's premature now
  - [x] All three wrappers use `fastify-plugin` so their `app.register(...)` calls decorate the root instance, not a throwaway child scope

- [x] **Task 5: Author `src/plugins/swagger.ts` — registers `@fastify/swagger` and `@fastify/swagger-ui`** (AC: 2, 5)
  - [x] Create `apps/api/src/plugins/swagger.ts`:
    ```ts
    import fp from 'fastify-plugin';
    import swagger from '@fastify/swagger';
    import swaggerUi from '@fastify/swagger-ui';
    import { ErrorResponseSchema } from '../schemas/errors.js';

    export default fp(async (app) => {
      app.addSchema(ErrorResponseSchema);

      await app.register(swagger, {
        openapi: {
          info: {
            title: 'todo-app API',
            version: '1.0.0',
          },
          servers: [{ url: '/' }],
        },
      });

      await app.register(swaggerUi, { routePrefix: '/docs' });
    }, { name: 'swagger-plugin', dependencies: ['@fastify/env'] });
    ```
    - See Dev Notes → "Swagger registration order & schema publication" for why `addSchema` sits inside this plugin
    - **`@fastify/swagger-ui` default `routePrefix` is `/documentation`; explicitly set `/docs`** to match the architecture decision (architecture.md:521)
    - **Do NOT** set `exposeRoute` or the legacy `swagger` option shape — those are `@fastify/swagger` v8 APIs; v9 uses only the `openapi` option for OpenAPI 3.x
    - **Do NOT** add `transform` or `transformObject` — they're unused at MVP; adding them when you only intend to ship a basic OpenAPI doc inflates surface area
    - The empty `src/routes/todos.ts` placeholder (Task 6) means swagger's `paths` in 1.4 will list only `/healthz` plus whatever Swagger UI mounts. Epic 2 routes will appear automatically as they register before swagger's `onReady`

- [x] **Task 6: Author `src/routes/todos.ts` — empty `/v1/todos` plugin (handlers arrive in Epic 2)** (AC: 3)
  - [x] Create `apps/api/src/routes/todos.ts`:
    ```ts
    import type { FastifyPluginAsync } from 'fastify';

    const todosRoutes: FastifyPluginAsync = async (_app) => {
      // Handlers for POST/GET/PATCH/DELETE /v1/todos* land in Epic 2 (stories 2.1..3.2).
      // Keeping this file + its /v1 prefix registration stable avoids churn in app.ts.
    };

    export default todosRoutes;
    ```
  - [x] **This file is intentionally handler-free in 1.4.** Do NOT add any `app.get/app.post` stubs that return `501 Not Implemented` — the absence of a route is the correct contract for 1.4 (a request to `POST /v1/todos` in 1.4 naturally returns `404 Not Found` from Fastify's default 404). Epic 2 fills it in.
  - [x] **Do NOT** import the (future) `todosRepo`, `CreateTodoInput`, or any Epic 2 artifacts. Keep this file a literal 3-line stub.

- [x] **Task 7: Author `src/plugins/error-handler.ts` + co-located unit tests** (AC: 4)
  - [x] Create `apps/api/src/plugins/error-handler.ts`:
    ```ts
    import fp from 'fastify-plugin';
    import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
    import { NotFoundError } from '../errors/index.js';

    type PgLikeError = { code?: string };

    export function isPgError(err: unknown): err is PgLikeError {
      return typeof err === 'object' && err !== null && typeof (err as PgLikeError).code === 'string';
    }

    export default fp(async (app) => {
      app.setErrorHandler(async (error: FastifyError, _req: FastifyRequest, reply: FastifyReply) => {
        // 1. Fastify / TypeBox validation errors — preserve default 400 envelope
        if (error.validation) {
          return reply.status(400).send({
            statusCode: 400,
            error: 'Bad Request',
            message: error.message,
          });
        }

        // 2. NotFoundError — thrown by repositories/routes for missing ids
        if (error instanceof NotFoundError) {
          return reply.status(404).send({
            statusCode: 404,
            error: 'Not Found',
            message: error.message,
          });
        }

        // 3. Postgres SQLSTATE 23xxx — constraint / integrity violations
        if (isPgError(error) && typeof error.code === 'string' && error.code.startsWith('23')) {
          return reply.status(409).send({
            statusCode: 409,
            error: 'Conflict',
            message: 'Conflict — the request violates a database constraint.',
          });
        }

        // 4. Everything else — log full error, return generic 500
        app.log.error({ err: error }, 'unhandled route error');
        return reply.status(500).send({
          statusCode: 500,
          error: 'Internal Server Error',
          message: 'Internal server error',
        });
      });
    }, { name: 'error-handler-plugin' });
    ```
    - **Returning `reply.status(...).send(...)` from an `async` handler** is the Fastify 5 idiom. Equivalent to `reply.status(...).send(...); return reply;`. Do NOT `throw` from inside the handler (infinite loop) and do NOT `reply.code(...)` (legacy alias; stick to `.status`)
    - **`isPgError` is a hand-rolled shape check**, not `instanceof`. `node-postgres` errors are plain objects with `code` (no shared class export), and they reach the error handler after being thrown through Kysely's internal catch chain. The `.code.startsWith('23')` check covers all integrity-violation families (unique, foreign-key, check, not-null, exclusion). See Dev Notes → "Postgres 23xxx safe-message rationale"
    - **Never echo raw Postgres text** — `error.detail`, `error.constraint`, `error.message` can contain table/column names and enumerated row values, which is an information disclosure. The fixed generic message is the safe choice
    - **`error.validation` branch** must come BEFORE the generic 500 branch — Fastify's validation errors are instances of `FastifyError` with a `validation` array; without the explicit branch they'd fall through to `500`
  - [x] Create `apps/api/src/plugins/error-handler.test.ts` — co-located unit test, no app wiring:
    ```ts
    import { describe, it, expect, vi } from 'vitest';
    import Fastify from 'fastify';
    import errorHandlerPlugin from './error-handler.js';
    import { NotFoundError } from '../errors/index.js';

    async function buildTestApp() {
      const app = Fastify({ logger: false });
      await app.register(errorHandlerPlugin);
      return app;
    }

    describe('global error handler', () => {
      it('maps Fastify validation errors to 400 with Bad Request envelope', async () => {
        const app = await buildTestApp();
        app.post('/v', {
          schema: { body: { type: 'object', required: ['x'], properties: { x: { type: 'string' } } } },
        }, async () => ({ ok: true }));

        const res = await app.inject({ method: 'POST', url: '/v', payload: {} });

        expect(res.statusCode).toBe(400);
        expect(res.json()).toMatchObject({ statusCode: 400, error: 'Bad Request' });
        await app.close();
      });

      it('maps NotFoundError to 404 with the supplied message', async () => {
        const app = await buildTestApp();
        app.get('/nf', async () => {
          throw new NotFoundError('Todo abc not found');
        });

        const res = await app.inject({ method: 'GET', url: '/nf' });

        expect(res.statusCode).toBe(404);
        expect(res.json()).toEqual({
          statusCode: 404,
          error: 'Not Found',
          message: 'Todo abc not found',
        });
        await app.close();
      });

      it('maps Postgres 23xxx errors to 409 with a safe message (no raw detail leaked)', async () => {
        const app = await buildTestApp();
        app.get('/pg', async () => {
          const err = Object.assign(new Error('duplicate key value violates unique constraint "todos_pkey"'), {
            code: '23505',
            detail: 'Key (id)=(abc) already exists.',
          });
          throw err;
        });

        const res = await app.inject({ method: 'GET', url: '/pg' });
        const body = res.json();

        expect(res.statusCode).toBe(409);
        expect(body.statusCode).toBe(409);
        expect(body.error).toBe('Conflict');
        expect(body.message).not.toMatch(/todos_pkey/);
        expect(body.message).not.toMatch(/abc/);
        expect(body.message).not.toMatch(/duplicate key/);
        await app.close();
      });

      it('maps generic errors to 500 and logs the original error', async () => {
        const app = Fastify({ logger: false });
        const logErrorSpy = vi.spyOn(app.log, 'error');
        await app.register(errorHandlerPlugin);
        app.get('/boom', async () => {
          throw new Error('boom');
        });

        const res = await app.inject({ method: 'GET', url: '/boom' });

        expect(res.statusCode).toBe(500);
        expect(res.json()).toEqual({
          statusCode: 500,
          error: 'Internal Server Error',
          message: 'Internal server error',
        });
        expect(logErrorSpy).toHaveBeenCalled();
        await app.close();
      });
    });
    ```
  - [x] **Why a throwaway Fastify instance instead of `buildApp`**: tests the error handler in isolation, no DB, no env — catches regressions in the handler itself without being a full integration test. Integration coverage lives in Task 10.

- [x] **Task 8: Wire everything into `buildApp`** (AC: 1, 2, 3, 4, 5)
  - [x] Update `apps/api/src/app.ts`:
    1. Construct Fastify with `bodyLimit: 65_536`: `const app = fastify({ logger: buildLoggerConfig(), bodyLimit: 65_536 });`
    2. After `@fastify/env` registers and `app.db` is decorated (Story 1.3), register plugins in this order:
       ```ts
       await app.register(corsPlugin);
       await app.register(helmetPlugin);
       await app.register(rateLimitPlugin);
       await app.register(swaggerPlugin);
       await app.register(errorHandlerPlugin);

       // Unversioned routes (ops surface)
       await app.register(healthRoutes);

       // Versioned app routes
       await app.register(todosRoutes, { prefix: '/v1' });
       ```
    3. Keep the existing `try { ... } catch (err) { await app.close(); throw err; }` wrapper — `onClose` (1.3) still fires on the failure path to destroy the DB pool
  - [x] **Critical ordering rules:**
    - `@fastify/env` first (so `app.config` is populated before any plugin reads it)
    - `createDb` + `app.decorate('db', ...)` + `onClose` hook before any plugin that might eventually need `app.db` (none in 1.4, but keep the slot)
    - `cors → helmet → rate-limit` (all three are `fp`-wrapped so order is cosmetic, but this is the architecture-documented order)
    - `swagger` before `errorHandler` — `@fastify/swagger` installs hooks that must see route registrations, and it also registers its own error paths that shouldn't be overridden by our handler's 500 branch for swagger internals
    - `errorHandler` before any route plugin — `setErrorHandler` applies to routes registered after it at the same or deeper scope (Fastify encapsulation rule)
    - `healthRoutes` (unversioned) before `todosRoutes` (`/v1` prefix) — harmless cosmetic; keeps /healthz's OpenAPI entry at the top
  - [x] **Do NOT** move the plugin imports above `buildApp` module boundary; keep them `import`-at-the-top but invoke inside the factory so tests can swap them via DI if a future need arises (none in 1.4)
  - [x] **Do NOT** add a `preHandler`, `onRequest`, or `onResponse` hook in `app.ts` — none required for this story

- [x] **Task 9: Update unit tests — `src/app.test.ts`** (AC: 1, 2, 3, 4, 5)
  - [x] Continue passing the stub `db` from Story 1.3 so unit tests remain DB-free (see `src/app.test.ts` stub helper from 1.3)
  - [x] Existing three tests stay — just swap expectations where the envelope contract has changed:
    - Test 1 (route registration): now assert `hasRoute({ method: 'GET', url: '/healthz' })` **and** `hasRoute({ method: 'GET', url: '/docs' })` **and** the absence of `/v1/todos` GET/POST (not yet registered)
    - Test 2 (/healthz ok branch): **unchanged** — still `200 { status, db: 'ok' }` (the /healthz contract is owned by 1.3, not touched here)
    - Test 3 (fail-fast on missing `DATABASE_URL`): unchanged
  - [x] Add Test 4: `POST /v1/todos` returns `404` (handlers not registered yet) — proves the `/v1` prefix plugin is mounted but empty
  - [x] Add Test 5: `GET /unknown` returns `404` (Fastify default 404 — no /v1 prefix) and the body matches `{ statusCode: 404, error: 'Not Found' }` — proves the default-404 path isn't broken by any of the new plugins
  - [x] **Do NOT** write tests for helmet header values or exact CORS header contents here — those are third-party-library concerns. Asserting one header name per plugin is enough smoke (`res.headers['x-content-type-options']` for helmet, preflight `access-control-allow-origin` for CORS). Integration tests in Task 10 cover the end-to-end shape more rigorously.

- [x] **Task 10: Author integration tests — `test/plugins.integration.test.ts`** (AC: 1, 2, 3, 4, 5)
  - [x] Create `apps/api/test/plugins.integration.test.ts` (live Postgres via `DATABASE_URL`; spins up real `buildApp`)
  - [x] **Setup:** reuse the `test/setup.ts` helpers from Story 1.3 (`getTestDbUrl`, `migrateLatest`, `truncateTodos`). `buildApp()` picks up the real DB, but no migrations are strictly required for this story's tests — call `migrateLatest` in `beforeAll` anyway for consistency with the story 1.3 integration-test convention
  - [x] **Tests to implement:**
    - **CORS preflight — `OPTIONS /healthz` with `Origin: http://localhost:5173`** returns `204` (or `200`) with `access-control-allow-origin: http://localhost:5173` present. Cross-origin smoke only — don't assert the full header set
    - **Helmet default headers — `GET /healthz`** response includes `x-content-type-options: nosniff` and `x-frame-options: DENY` (helmet defaults minus CSP)
    - **Rate limit headers — `GET /healthz`** response includes `x-ratelimit-limit: 300` and `x-ratelimit-remaining: <number>`
    - **`GET /docs`** returns `200` and the body contains `swagger-ui` (HTML marker) AND the body does NOT contain a verbatim CSP block that would break the UI (negative check: response does not include `content-security-policy` header)
    - **`GET /docs/json`** returns `200`, `Content-Type: application/json; charset=utf-8`, and the parsed body matches `{ openapi: /^3\./, info: { title: 'todo-app API', version: '1.0.0' }, paths: expect.objectContaining({ '/healthz': expect.any(Object) }), components: { schemas: expect.objectContaining({ ErrorResponse: expect.any(Object) }) } }`
    - **`POST /v1/todos`** returns `404` (no handler yet) with envelope `{ statusCode: 404, error: 'Not Found', message: ... }` — verifies the `/v1` prefix plugin is mounted (else this would 404 identically, but with a different code path — assert the envelope shape specifically)
    - **`GET /healthz`** still returns `200 { status: 'ok', db: 'ok' }` — regression guard ensuring the /v1 prefix wiring didn't capture `/healthz`
    - **Unknown route `GET /v99/nope`** returns `404` with the default Fastify envelope `{ statusCode: 404, error: 'Not Found' }` — confirms our error handler didn't swallow default 404s (Fastify's 404 is a separate `setNotFoundHandler`; our `setErrorHandler` does not touch it)
    - **Throwaway route with induced error**: register a dummy route inside the test (via `app.get('/__explode', async () => { throw new NotFoundError('nope'); })` **before** `app.ready()` or against the live `buildApp()` by creating a minimal child scope in the test file that registers on a separate `buildApp` instance) to confirm end-to-end round-trip hits the error handler with the correct envelope. See Dev Notes → "Injecting a test-only route into `buildApp()` without forking it"
  - [x] **Do NOT** write a test that actually exceeds 300 req/min — the default `@fastify/rate-limit` store is in-memory and rate-limited tests are flaky in parallel CI; smoke the headers instead
  - [x] **Do NOT** spin up a second Fastify instance without `@fastify/env` registered — the error-handler test (Task 7) already covers handler-in-isolation; integration tests should exercise the full `buildApp` surface
  - [x] See Dev Notes → "integration test conventions (1.4 continuation)" for the shared `beforeAll`/`afterAll` patterns carried over from 1.3

- [x] **Task 11: End-to-end smoke verification** (AC: 1, 2, 3, 4, 5 — pre-review manual check)
  - [x] `docker compose up -d postgres` — healthy within 30s
  - [x] `npm install` — exits 0; all 7 new packages resolved
  - [x] `npx tsc -p apps/api/tsconfig.json --noEmit` — exits 0 (no type errors in new files)
  - [x] `cp apps/api/.env.example apps/api/.env` (if missing); **verify** `.env.example` now has `CORS_ORIGIN=http://localhost:5173` as the default (no change required; the key was declared in 1.2)
  - [x] `npm run migrate --workspace apps/api` — applies the 1.3 migration; exits 0
  - [x] `npm run dev --workspace apps/api` — Fastify starts; log lines show each plugin registering (`cors-plugin`, `helmet-plugin`, etc.); no startup errors
  - [x] `curl -sSf http://localhost:3000/healthz` → `{"status":"ok","db":"ok"}` with `Content-Type: application/json; charset=utf-8`
  - [x] `curl -s -o /dev/null -D - http://localhost:3000/healthz` → headers include `x-content-type-options: nosniff`, `x-frame-options`, `x-ratelimit-limit: 300`, `x-ratelimit-remaining: <n>`
  - [x] `curl -i http://localhost:3000/docs` → `200 OK` HTML body starts with `<!DOCTYPE html>` and contains `swagger-ui`
  - [x] `curl -s http://localhost:3000/docs/json | jq '.openapi, .info.title, .paths | keys, .components.schemas | keys'` → shows `"3.x.x"`, `"todo-app API"`, `["/healthz"]` (list length ≥ 1), `["ErrorResponse"]`
  - [x] `curl -i -X POST http://localhost:3000/v1/todos` → `404 Not Found` with `{ "statusCode": 404, "error": "Not Found", ... }` envelope (no handlers yet — expected)
  - [x] `curl -i -X OPTIONS -H 'Origin: http://localhost:5173' -H 'Access-Control-Request-Method: POST' http://localhost:3000/v1/todos` → `204` (or `200`) with `Access-Control-Allow-Origin: http://localhost:5173`
  - [x] `npm test --workspace apps/api` — all tests pass (3+ updated in `src/app.test.ts`, 4 new in `src/plugins/error-handler.test.ts`, integration suite in `test/plugins.integration.test.ts`, plus Story 1.3's carry-forward tests)
  - [x] `git status` — expected new/modified files match the File List below

## Dev Notes

### Scope discipline — what this story is and isn't

**This story is the API plugin stack + `/v1` prefix + global error handler + TypeBox ErrorResponse schema — nothing else.** Scope hard stops:

- **Todo routes and schemas are out.** `src/routes/todos.ts` is a 3-line empty `FastifyPluginAsync` stub. No `POST`/`GET`/`PATCH`/`DELETE` handlers, no `Todo` / `CreateTodoInput` TypeBox schemas. Those arrive in Stories 2.1 (POST + CreateTodoInput), 2.2 (GET list), 3.1 (PATCH + UpdateTodoInput), 3.2 (DELETE).
- **`todosRepo` repository is out.** `src/repositories/todosRepo.ts` arrives with Story 2.1. Do not create the `repositories/` directory in 1.4 at all.
- **`Todo` TypeBox schema is out.** `src/schemas/todo.ts` arrives with Story 2.1 (the first route that needs it). **`src/schemas/errors.ts` (ErrorResponse) is the only schema landing in 1.4** — it's consumed by the global error handler and referenced by future routes.
- **`@fastify/type-provider-typebox` is out.** Arrives with Story 2.1 when the first real TypeBox-validated route exists. 1.4 uses the ErrorResponse schema via `app.addSchema($id: 'ErrorResponse')` only.
- **DB migrations are out.** Story 1.3 already created the `todos` table. 1.4 doesn't touch `src/db/**` at all.
- **Web app is out.** `apps/web/` arrives in Story 1.5.
- **CI is out.** Story 1.6 wires plugin smoke into CI.
- **Graceful shutdown (SIGTERM/SIGINT), `unhandledRejection` handlers, custom 404 handler** — all still deferred (see `deferred-work.md`). 1.4 does NOT add them.

If you find yourself creating `src/repositories/`, `src/schemas/todo.ts`, adding TypeBox `Todo` definitions, or implementing any `/v1/todos` handler — **stop**, you've crossed into Story 2.1's scope.

### Target workspace layout (after this story)

```
apps/api/
├── package.json                              ← + @fastify/cors, helmet, rate-limit, swagger, swagger-ui, @sinclair/typebox, ajv-formats
├── tsconfig.json                             ← unchanged
├── .env.example                              ← unchanged (CORS_ORIGIN already declared in 1.2)
└── src/
    ├── server.ts                             ← unchanged
    ├── app.ts                                ← UPDATED: bodyLimit, plugin registrations, /v1 mount, error-handler
    ├── app.test.ts                           ← UPDATED: +2 tests (docs hasRoute, /v1 empty-prefix 404)
    ├── config.ts                             ← UPDATED: + format: 'uri' on CORS_ORIGIN and DATABASE_URL + ajv-formats wiring
    ├── db/                                   ← unchanged (owned by 1.3)
    │   ├── index.ts
    │   ├── index.test.ts
    │   ├── schema.ts
    │   ├── migrate.ts
    │   └── migrations/20260418_001_create_todos.ts
    ├── errors/
    │   └── index.ts                          ← NEW: NotFoundError
    ├── schemas/
    │   └── errors.ts                         ← NEW: ErrorResponse TypeBox schema
    ├── plugins/
    │   ├── cors.ts                           ← NEW: fp-wrapped @fastify/cors
    │   ├── helmet.ts                         ← NEW: fp-wrapped @fastify/helmet, CSP disabled
    │   ├── rate-limit.ts                     ← NEW: fp-wrapped @fastify/rate-limit (300/min)
    │   ├── swagger.ts                        ← NEW: fp-wrapped @fastify/swagger + swagger-ui; addSchema('ErrorResponse')
    │   ├── error-handler.ts                  ← NEW: setErrorHandler with validation / NotFoundError / 23xxx / 500 branches
    │   └── error-handler.test.ts             ← NEW: 4 unit tests for the error-handler branches
    └── routes/
        ├── health.ts                         ← unchanged (owned by 1.3)
        └── todos.ts                          ← NEW: 3-line empty plugin (handlers arrive in Epic 2)
└── test/
    ├── setup.ts                              ← unchanged (owned by 1.3)
    ├── db.migration.test.ts                  ← unchanged
    ├── db.persistence.test.ts                ← unchanged
    ├── health.integration.test.ts            ← unchanged
    └── plugins.integration.test.ts           ← NEW: end-to-end plugin + docs + /v1 + error-envelope smoke
```

**That's 8 new source files, 1 new integration test file, 1 new unit test file, 3 modified files (`package.json`, `app.ts`, `config.ts`), 1 modified test file (`app.test.ts`).**

Directories intentionally NOT created in this story (arrive later):
- `src/repositories/` — Story 2.1
- `src/schemas/todo.ts` — Story 2.1

### Version pinning rationale

```
"@fastify/cors":         "^11.0.0"   ← Fastify 5 compat line; exports are unchanged from v10 for our usage
"@fastify/helmet":       "^13.0.0"   ← Fastify 5 compat line
"@fastify/rate-limit":   "^10.0.0"   ← Fastify 5 compat line; in-memory store default
"@fastify/swagger":      "^9.0.0"    ← Fastify 5 compat; OpenAPI 3.x (dropped Swagger 2 support from v8)
"@fastify/swagger-ui":   "^5.0.0"    ← Fastify 5 compat; bundles swagger-ui-dist internally
"@sinclair/typebox":     "^0.34.0"   ← current stable; Type.Object / Type.Integer / Static<> unchanged since 0.32
"ajv-formats":           "^3.0.0"    ← AJV 8 compat; AJV 7-era (2.x) shipped without ESM support
```

- **Caret ranges** per the 1.2/1.3 convention — `npm install` picks up patch/minor updates, ABI-breaking majors pinned
- **No `fastify-plugin` entry** in the dep list — it's a peer of every `@fastify/*` plugin and resolves transitively. If `npm install` warns about an unmet peer, add `fastify-plugin: ^5.0.0` as a direct runtime dep
- **`@sinclair/typebox` 0.34.x** is the version active for `@fastify/swagger` 9.x and `@fastify/type-provider-typebox` (the latter arrives in Story 2.1; keep the typebox major pinned so 2.1 doesn't need to upgrade)
- **No `ajv-errors` or `ajv-keywords`** — we don't use custom error messages or keywords in the env schema. If the schema grows a `pattern` that needs descriptive messages, Growth-phase work

### `ajv-formats` wiring into `@fastify/env`

`@fastify/env` uses its own AJV instance internally. To wire `ajv-formats` into it:

```ts
// apps/api/src/app.ts (relevant extract)
import fastifyEnv from '@fastify/env';
import addFormats from 'ajv-formats';
import { envSchema } from './config.js';

await app.register(fastifyEnv, {
  schema: envSchema,
  dotenv: opts.config === undefined,
  data: opts.config ?? process.env,
  ajv: {
    customOptions: {},
    plugins: [addFormats],  // ← this line adds format: 'uri', format: 'email', etc.
  },
});
```

**Key details:**
- `ajv.plugins` takes an array of plugin functions `(ajv) => ajv`. `addFormats` is exactly this shape; it mutates the AJV instance to register all standard JSON-schema formats
- `customOptions: {}` is required (even empty) so that `@fastify/env` v5 doesn't default-construct its own AJV without the `formats: true` flag
- **Do NOT** call `addFormats(someAjvInstance)` at module load; `@fastify/env` owns its AJV lifecycle, and decorating a foreign instance is a noop
- If `ajv-formats` is missing, AJV's unknown-format behavior kicks in — silently accepts any string for `format: 'uri'`. Tests in Task 2 should verify the wiring by booting with `CORS_ORIGIN=not-a-uri` and expecting `buildApp` to throw (add one test: `expect(buildApp({ config: { DATABASE_URL: 'postgresql://ok', CORS_ORIGIN: 'not a uri' } })).rejects.toThrow(/format/i)`)

### `ErrorResponse` schema notes

```ts
export const ErrorResponseSchema = Type.Object(
  { statusCode: Type.Integer(), error: Type.String(), message: Type.String() },
  { $id: 'ErrorResponse', additionalProperties: false },
);
```

- **`$id` inside schema options** — TypeBox writes `$id` into the compiled JSON Schema. When passed to `app.addSchema`, Fastify's AJV indexes it by this id so routes can `$ref` it as `{ $ref: 'ErrorResponse#' }`
- **`additionalProperties: false`** — locks the envelope shape; catches accidental field additions in future routes via a 500 serialization error in dev
- **Keep the TypeBox `type ErrorResponse = Static<typeof ErrorResponseSchema>` export** — even unused in 1.4, Epic 2 routes will consume this type alias

### `NotFoundError` shape

```ts
export class NotFoundError extends Error {
  readonly statusCode = 404;
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}
```

- **`readonly statusCode = 404`** — future-proofs the error handler: `if (instanceof NotFoundError || (typeof err.statusCode === 'number' && err.statusCode === 404))`. For now we only use `instanceof`, but keeping the field means third-party libraries that rethrow as a plain object with `statusCode` also work
- **`this.name = 'NotFoundError'`** — ensures serialized error logs show the class name, not the generic `Error`
- **Do NOT** add a `code` property (that's Fastify's `FastifyError.code` territory — reserved for framework-level error codes)
- **Do NOT** add `.toJSON()` — the error handler controls the envelope; a custom JSON representation would leak through `JSON.stringify(err)` in logs

### CORS allow-list parsing

`@fastify/cors` accepts `origin` as:
- a `string` (exact match)
- a `string[]` (allow-list)
- a function `(origin, cb) => cb(null, allow)`
- a `RegExp`
- `true` / `false`

Our contract: `CORS_ORIGIN` is a **comma-separated list or a single origin**. Parse at plugin-wire time:

```ts
const raw = app.config.CORS_ORIGIN;
const origins = raw.includes(',') ? raw.split(',').map((s) => s.trim()).filter(Boolean) : raw;
await app.register(cors, { origin: origins });
```

- **Scalar → scalar**: `CORS_ORIGIN=http://localhost:5173` → `origin: 'http://localhost:5173'` (exact match)
- **List → array**: `CORS_ORIGIN=http://localhost:5173,https://app.example.com` → `origin: ['http://localhost:5173', 'https://app.example.com']`
- **Empty/whitespace entries are dropped** (`.filter(Boolean)`)
- **Do NOT** default to `origin: true` or `origin: '*'` — that would allow any origin to bypass the `CORS_ORIGIN` gate and violates the architecture's "allow-list" rule (architecture.md:202)

### Helmet + Swagger UI CSP gotcha

`@fastify/helmet` with defaults emits:
```
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; ...
```

Swagger UI's HTML page ships with inline bootstrap scripts, blob-URL worker loaders, and fetches from CDN fonts/icons. Any one of these is blocked by helmet's default CSP → `/docs` white-screens.

**Fix we're using (MVP-appropriate):** disable CSP globally via `{ contentSecurityPolicy: false }`. This preserves helmet's other protections (`x-frame-options`, `x-content-type-options`, `referrer-policy`, `strict-transport-security` in HTTPS envs, etc.).

**Alternatives considered and rejected:**
- **Per-route CSP override** (`app.register(helmet, { enableCSPNonces: true })` + Swagger UI nonce plumbing) — adds configuration complexity and breaks when swagger-ui-dist upgrades
- **Register helmet in a child scope that excludes `/docs`** — works, but encapsulation + `fp` interactions are subtle; higher risk of regressions
- **Trim CSP to allow `'unsafe-inline'` and `blob:`** — defeats the purpose of CSP entirely

MVP picks the simplest correct answer (disable). Revisit when a hardened CSP is an explicit requirement (prod deploy, Growth phase).

### Swagger registration order & schema publication

`@fastify/swagger` hooks into Fastify's route-registration lifecycle. On `onReady`, it walks every registered route and builds the OpenAPI doc.

**Consequences:**
- **Register swagger BEFORE the routes you want documented.** If you `app.register(swagger)` AFTER `app.register(todosRoutes)`, the generated doc is empty. This is the #1 gotcha for new Fastify+Swagger users.
- **`app.addSchema(ErrorResponseSchema)` must happen before routes reference it with `$ref`**, otherwise the AJV compiler throws at route-registration time with `schema with id "ErrorResponse" is not found`. Putting `addSchema` at the top of the swagger plugin (Task 5) guarantees ordering.
- **`@fastify/swagger` v9 uses the `openapi` option only.** The v8-era `swagger` option key is a no-op in v9 — it doesn't error, it silently falls back to an empty config. If your OpenAPI doc has an unexpected title/version, check you're using the `openapi` key.

### Postgres 23xxx safe-message rationale

Postgres SQLSTATE codes in the 23-class mean "integrity constraint violation":
- `23505` — unique_violation (duplicate primary key, unique index hit)
- `23503` — foreign_key_violation
- `23502` — not_null_violation
- `23514` — check_violation
- `23000` — integrity_constraint_violation (generic)
- `23P01` — exclusion_violation

All of these, when allowed to bubble up raw, include strings like:
```
duplicate key value violates unique constraint "todos_pkey"
DETAIL: Key (id)=(abc-123) already exists.
```

That leaks: the constraint name (schema intelligence), the column (`id`), and the actual value that collided (`abc-123`, a user-supplied UUID). Any of these is a minor info-disclosure; together they're a reconnaissance gift.

Our fixed generic "Conflict — the request violates a database constraint." intentionally reveals nothing. The full error still gets logged (step 4 of the handler would log it if the step-3 branch weren't taken — but it's taken). Operators reading logs see the raw detail; attackers hitting the public surface don't.

**Why not map each 23xxx subtype to a more specific client message?** Because there's no generally-safe subtype message — a 23503 FK violation message would expose the constraint name (which is typically the parent table name). Keep the generic response; rely on logs for debugging.

### Injecting a test-only route into `buildApp()` without forking it

Several integration tests need to induce a specific error (NotFoundError, Postgres 23xxx, generic) inside a real `buildApp` to verify the envelope. Three approaches, in order of preference:

1. **Dummy route in `todos.ts` via a guarded flag (REJECTED)** — requires exposing internal state; pollutes production code.
2. **Spin up a second Fastify instance in the test file with just the error-handler plugin (ACCEPTED for error-handler unit tests)** — Task 7 uses this pattern. Works but doesn't exercise the full plugin chain.
3. **Expose a `buildApp` option for test-only routes (RECOMMENDED for integration tests)**:
   ```ts
   export interface BuildAppOptions {
     config?: Record<string, unknown>;
     db?: Kysely<Database>;
     registerTestRoutes?: (app: FastifyInstance) => Promise<void>;  // ← NEW in 1.4
   }

   // inside buildApp, just before the /v1 prefix registration:
   if (opts.registerTestRoutes) {
     await opts.registerTestRoutes(app);
   }
   ```
   Then in `test/plugins.integration.test.ts`:
   ```ts
   const app = await buildApp({
     registerTestRoutes: async (app) => {
       app.get('/__explode/nf', async () => { throw new NotFoundError('nope'); });
       app.get('/__explode/23', async () => { throw Object.assign(new Error('x'), { code: '23505' }); });
       app.get('/__explode/500', async () => { throw new Error('boom'); });
     },
   });
   ```
   This keeps production `app.ts` free of test scaffolding and keeps the tests reading against the real plugin chain.
   **Add `registerTestRoutes` to `BuildAppOptions` as part of Task 8.** It's a one-line extension that costs nothing in prod but saves each test file from rebuilding a parallel plugin stack.

### Integration test conventions (1.4 continuation)

Carry forward from Story 1.3:
- **Use `DATABASE_URL` from env directly** — `getTestDbUrl()` in `test/setup.ts`; no separate test DB
- **`beforeAll` builds app, `afterAll` calls `app.close()`** — the 1.3 `onClose` hook destroys the DB pool
- **`beforeEach` truncates `todos`** — not strictly needed for 1.4's tests (no writes) but harmless and consistent
- **`describe.skipIf(process.env.CI === 'true')`** for tests that depend on `docker compose` — not needed in 1.4 (no restart tests here)

**1.4-specific additions:**
- Tests that need a throwaway route use `registerTestRoutes` from `BuildAppOptions` (see above)
- Tests that exercise the error handler at the HTTP layer do so via `app.inject({ method: 'GET', url: '/__explode/nf' })` round-tripping through the real plugin chain
- Tests that only assert header presence do so against `/healthz` — the only route registered in 1.4

### Kysely + CamelCasePlugin gotchas (carried from 1.3)

None of the 1.4 changes touch Kysely or the `Database` interface. The carry-forward note is: **don't add new columns, new tables, or new migrations in 1.4.** If a future Task X in 1.4 ever tempts you to add a database-backed piece (e.g., "log error events to a table"), that's Story 1.6 observability scope.

### Previous story intelligence (from Story 1.3)

**What 1.3 established that 1.4 builds on:**
- `buildApp(opts)` factory with `opts.config` and `opts.db` overrides (`src/app.ts:6-28` before 1.3, `src/app.ts:~30-50` after 1.3 lands). **1.4 adds `opts.registerTestRoutes`** for integration tests (see "Injecting a test-only route..." above)
- The `try/catch` wrapper around plugin registrations survives — `onClose` still destroys the DB pool on the failure path
- `dotenv: opts.config === undefined` gate — unchanged; 1.4 tests pass explicit `opts.config`
- `app.decorate('db', db)` pattern (`src/db/index.ts`) — 1.4 does NOT add new decorators. If you ever need `app.something` in 1.4, stop — it's a scope violation
- `onClose` hook already registered by 1.3 — 1.4 does NOT add a second `onClose`; swagger's shutdown is framework-managed
- Module-augmentation pattern (`declare module 'fastify' { interface FastifyInstance { db: ... } }` in `src/db/index.ts`) — 1.4 adds NO new augmentations. The `app.config` augmentation is already in `config.ts` (from 1.2). Swagger exposes `app.swagger()` via its own augmentation — we don't call it directly, so no wiring needed
- Integration test folder `test/` already populated by 1.3 — 1.4 adds one file (`plugins.integration.test.ts`) alongside the 1.3 trio
- Vitest 3.x, Node 22 LTS, ESM-native, `tsx` in dev — unchanged stack

**What 1.3 got right that 1.4 should replicate:**
- **Tight scope discipline** — the 1.3 Scope section explicitly called out what was out, and the dev respected it. Mirror that here
- **Reference shapes with rationale** — every new file in 1.4 has a source listing + a "why this way" note in Dev Notes
- **Lean tests** — 1.3 introduced a 2-method Kysely stub instead of an in-memory SQLite. 1.4 mirrors the pattern with a throwaway Fastify instance for error-handler unit tests (no mocks, real Fastify)
- **`await app.close()` in `afterEach`** — mandatory for every test that builds an app. The `onClose` hook now also fires swagger shutdown — no changes needed

**Deferred items from earlier stories that 1.4 closes:**
- **`CORS_ORIGIN` URI format validation** (deferred-work.md:22) — closed here via `format: 'uri'` + `ajv-formats`
- **`DATABASE_URL` URI format validation** (deferred-work.md:21) — closed here alongside `CORS_ORIGIN` (both benefit from the `ajv-formats` wiring in the same Task 2)

**Deferred items from earlier stories that 1.4 does NOT address** (continue to defer):
- SIGTERM/SIGINT graceful shutdown — still Story 1.6 / ops
- `unhandledRejection` / `uncaughtException` handlers — still observability story
- `buildLoggerConfig` direct branch test — still deferred (touching `app.ts` heavily in 1.4; still no clean refactoring hook)
- `HEAD /healthz` — still deferred
- `HOST` env override — still deferred
- `.env.example` / `envSchema` drift test — still deferred

### Latest tech information (verified against stack versions April 2026)

- **Fastify 5.x** is the active major; all `@fastify/*` plugins in this story support it via their current major versions. Fastify 5 introduced strict async plugin handling — `setErrorHandler(async (...))` is the idiomatic signature (the sync form still works but async unlocks awaiting in the handler).
- **`@fastify/cors` 11.x** — peer Fastify 5. API surface unchanged from v10 for our usage (`origin` option).
- **`@fastify/helmet` 13.x** — peer Fastify 5. `contentSecurityPolicy: false` option preserved from v10+.
- **`@fastify/rate-limit` 10.x** — peer Fastify 5. Default in-memory store. `max`/`timeWindow` options unchanged from v9.
- **`@fastify/swagger` 9.x** — peer Fastify 5. OpenAPI 3.x only (v8 dropped Swagger 2 entirely). The `openapi` option is the sole doc-configuration entry point.
- **`@fastify/swagger-ui` 5.x** — peer Fastify 5 and `@fastify/swagger` 9. Bundles `swagger-ui-dist` internally; no separate install needed. `routePrefix` option unchanged.
- **`@sinclair/typebox` 0.34.x** — `Type.Object` supports a `$id` option (moved from `schemaOptions` in 0.32). The `Static<typeof X>` helper is unchanged since 0.31.
- **`ajv-formats` 3.x** — AJV 8 compat. Registers `uri`, `email`, `date-time`, `uuid`, `ipv4`, etc. Called as a plugin: `plugins: [addFormats]`.
- **`fastify-plugin` 5.x** — peer Fastify 5. `fp((app, opts) => { ... }, { name, dependencies })` API unchanged from v4.
- **Node 22 LTS** is still the target (from Story 1.2). ESM + top-level await + `tsx` import hook all supported.

### Verification checklist (pre-review, manual)

From repo root, in order:

1. `docker compose up -d postgres` — healthy within 30s
2. `npm install` — exits 0; all 7 new packages (`@fastify/cors`, `@fastify/helmet`, `@fastify/rate-limit`, `@fastify/swagger`, `@fastify/swagger-ui`, `@sinclair/typebox`, `ajv-formats`) resolve
3. `npx tsc -p apps/api/tsconfig.json --noEmit` — exits 0 (clean typecheck across new `plugins/`, `errors/`, `schemas/errors.ts`)
4. `npm run migrate --workspace apps/api` — applies 1.3's migration; exits 0
5. `npm run dev --workspace apps/api` — Fastify starts; the log stream shows each plugin registered (or at least no errors). `pino-pretty` output present
6. In another shell:
   - `curl -sSf http://localhost:3000/healthz` → `{"status":"ok","db":"ok"}`
   - `curl -s -D - -o /dev/null http://localhost:3000/healthz` → headers include `x-content-type-options: nosniff`, `x-frame-options`, `x-ratelimit-limit: 300`, `x-ratelimit-remaining: <n>` (no `content-security-policy`)
   - `curl -i http://localhost:3000/docs` → `200 OK`, HTML body containing `swagger-ui`
   - `curl -s http://localhost:3000/docs/json | jq '.openapi, .info.title, .components.schemas.ErrorResponse'` → prints `"3.x.x"`, `"todo-app API"`, and the ErrorResponse schema object
   - `curl -i -X POST http://localhost:3000/v1/todos` → `404` with `{ statusCode: 404, error: 'Not Found', message: ... }` envelope
   - `curl -i -X OPTIONS -H 'Origin: http://localhost:5173' -H 'Access-Control-Request-Method: POST' http://localhost:3000/v1/todos` → `204` or `200` with `Access-Control-Allow-Origin: http://localhost:5173`
7. Stop dev server. `npm test --workspace apps/api` — all tests pass:
   - `src/app.test.ts` (updated, ~5 tests)
   - `src/db/index.test.ts` (1 test, carry-over)
   - `src/plugins/error-handler.test.ts` (4 tests, NEW)
   - `test/db.migration.test.ts` (2 tests, carry-over)
   - `test/db.persistence.test.ts` (1 test, carry-over; skipped in CI)
   - `test/health.integration.test.ts` (2 tests, carry-over)
   - `test/plugins.integration.test.ts` (NEW — ~8 tests: CORS, helmet, rate-limit, /docs, /docs/json, /v1 mount, /healthz regression, unknown-route, error-envelope round-trips)
8. `npx tsc -p apps/api/tsconfig.json --noEmit` — exits 0
9. `git status` — `.env` not staged; expected new/modified files match the File List

### Project Structure Notes

Files **added** by this story:

```
apps/api/src/errors/index.ts
apps/api/src/schemas/errors.ts
apps/api/src/plugins/cors.ts
apps/api/src/plugins/helmet.ts
apps/api/src/plugins/rate-limit.ts
apps/api/src/plugins/swagger.ts
apps/api/src/plugins/error-handler.ts
apps/api/src/plugins/error-handler.test.ts
apps/api/src/routes/todos.ts
apps/api/test/plugins.integration.test.ts
```

Files **modified** by this story:

- `apps/api/package.json` — adds 7 runtime deps + transitively pulls in `fastify-plugin`
- `apps/api/src/app.ts` — `bodyLimit: 65_536`, register 5 plugins + error handler + health + `/v1` prefix for `todosRoutes`; extend `BuildAppOptions` with optional `registerTestRoutes`
- `apps/api/src/app.test.ts` — add `/docs` hasRoute check, `/v1/todos POST → 404` test, unknown-route 404 envelope test
- `apps/api/src/config.ts` — `format: 'uri'` on `CORS_ORIGIN` + `DATABASE_URL` (via `ajv-formats` wired into `@fastify/env`)
- `package-lock.json` (root — npm install picks up new transitive deps)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — story 1-4 status transitions (handled by create-story → `ready-for-dev`; dev-story will transition to `in-progress` then `review`)
- `_bmad-output/implementation-artifacts/deferred-work.md` — on close-out, mark the two closed items (`CORS_ORIGIN` URI format, `DATABASE_URL` URI format) as resolved with a link to 1.4's commit

Files **intentionally NOT created** (per scope discipline — arrive in later stories):
- `apps/api/src/schemas/todo.ts` — Story 2.1
- `apps/api/src/repositories/todosRepo.ts` — Story 2.1
- Per-endpoint route handlers inside `src/routes/todos.ts` — Story 2.1 / 2.2 / 3.1 / 3.2

**Conflict check:** no conflicts with the unified project structure in architecture.md §Complete Project Directory Structure (lines 485–585). This story creates exactly the `plugins/`, `errors/`, `schemas/errors.ts` subset that architecture prescribes; the remaining `schemas/todo.ts` and `repositories/` arrive in Epic 2.

### Testing Strategy for this story

Per the epic's Test Scenarios section (epics.md §Story 1.4):

**Unit tests (co-located `*.test.ts`, no live DB):**
- `src/plugins/error-handler.test.ts` — 4 tests covering the four branches (validation → 400, NotFoundError → 404, 23xxx → 409 with no leak, generic → 500 + log)
- `src/app.test.ts` — updated to cover plugin registration (hasRoute for `/healthz`, `/docs`, absence of `/v1/todos`) + `/v1/todos POST → 404` + unknown-route 404 envelope. Continues to pass stub `db` per 1.3 pattern

**Integration tests (under `test/`, real Postgres via `DATABASE_URL`):**
- `test/plugins.integration.test.ts` — end-to-end smoke across the whole plugin chain:
  - CORS preflight headers
  - Helmet default headers (no CSP)
  - Rate-limit headers (counter only; no bucket-exhaustion test)
  - `/docs` Swagger UI HTML marker
  - `/docs/json` OpenAPI shape + `components.schemas.ErrorResponse` presence
  - `/v1/todos POST` returns 404 (no handlers yet) with correct envelope
  - `/healthz` regression (still 200 with 1.3's shape)
  - Unknown-route default-404 envelope
  - Error-envelope round-trips via `registerTestRoutes` (NotFoundError / 23505 / generic)

**E2E tests:** none — Playwright harness arrives in Story 1.6

**Do not set up in this story:**
- Rate-limit exhaustion tests (flaky in parallel CI; deferred to Growth-phase)
- A hardened CSP + Swagger UI compat test (deferred to prod-deploy story)
- A standalone `todos.contract.test.ts` (arrives with Story 2.1 when there are actual handlers)
- Coverage reporting (Story 1.6 / CI)

### References

- Epic + story source: [epics.md §Story 1.4](../planning-artifacts/epics.md) (lines 289–341)
- Epic 1 goal + walking-skeleton outcome: [epics.md §Epic 1 goal](../planning-artifacts/epics.md) (lines 168–170)
- Architecture — plugin stack (CORS, helmet, rate-limit, bodyLimit): [architecture.md §Authentication & Security](../planning-artifacts/architecture.md) (lines 202–205)
- Architecture — OpenAPI docs decision: [architecture.md §API & Communication Patterns, row "API docs"](../planning-artifacts/architecture.md) (line 215)
- Architecture — error envelope: [architecture.md §API & Communication Patterns, row "Error response shape"](../planning-artifacts/architecture.md) (line 216)
- Architecture — `/v1` prefix decision: [architecture.md §API & Communication Patterns, row "API versioning"](../planning-artifacts/architecture.md) (line 221)
- Architecture — unversioned `/healthz`: [architecture.md §API & Communication Patterns, row "Health check"](../planning-artifacts/architecture.md) (line 222)
- Architecture — plugin file layout: [architecture.md §Complete Project Directory Structure](../planning-artifacts/architecture.md) (lines 517–528)
- Architecture — error mapping rules (validation / 23xxx / NotFoundError / 500): [architecture.md §Process Patterns — Error handling](../planning-artifacts/architecture.md) (lines 398–406)
- Architecture — anti-patterns (never new error envelopes, never leak Postgres): [architecture.md §Pattern Examples — Anti-patterns](../planning-artifacts/architecture.md) (lines 473–481)
- PRD — FR-012 (`/v1` prefix amendment): [PRD.md §Functional Requirements](../planning-artifacts/PRD.md) (line 143)
- PRD — FR-010 (inline error path, informs error envelope contract): [PRD.md §Functional Requirements](../planning-artifacts/PRD.md) (line 141)
- PRD — NFR-004 (error resilience): [PRD.md §Non-Functional Requirements](../planning-artifacts/PRD.md) (line 152)
- Previous story: [1-3-database-layer-kysely-todos-migration-healthz-db-probe.md](./1-3-database-layer-kysely-todos-migration-healthz-db-probe.md) — `BuildAppOptions`, `onClose` hook, stub-db pattern, integration-test conventions
- Previous story: [1-2-fastify-api-skeleton-with-healthz.md](./1-2-fastify-api-skeleton-with-healthz.md) — `buildApp` factory, `@fastify/env` wiring, `hasRoute` assertion pattern
- Deferred work picked up here: [deferred-work.md](./deferred-work.md) lines 21–22 — `CORS_ORIGIN` + `DATABASE_URL` URI format validation

## Dev Agent Record

### Agent Model Used

claude-opus-4-7 (1M context) — Claude Code dev-story workflow

### Debug Log References

- `npx tsc -p apps/api/tsconfig.json --noEmit` — clean (0 errors) after all edits
- `npx vitest run` (apps/api) — 30/30 tests pass across 7 files
- Live server smoke: `/healthz`, `/docs`, `/docs/json`, `POST /v1/todos → 404`, CORS preflight — all green

### Completion Notes List

- Landed the full Fastify 5 plugin stack (cors, helmet w/ CSP off, rate-limit 300/min, swagger + swagger-ui at `/docs`), the `/v1` prefix mount with an empty `todosRoutes` stub, and a root-scoped global error handler covering validation → 400, `NotFoundError` → 404, Postgres 23xxx → 409 (no leakage), and fallback → 500 with `app.log.error`.
- Added `src/schemas/errors.ts` (`ErrorResponseSchema`, `$id: 'ErrorResponse'`) registered via `app.addSchema(...)` in the swagger plugin. Overrode `@fastify/swagger` v9's `refResolver.buildLocalReference` so `components.schemas.ErrorResponse` lands under the `$id` key (default would emit `def-0`) — verified live in `/docs/json`.
- Wired `ajv-formats` into `@fastify/env` using the `env-schema` v6 contract `ajv.customOptions: (ajv) => { addFormats(ajv); return ajv; }`. The story Dev Notes' `plugins: [addFormats]` shape is **not** part of env-schema v6's public API (only `Ajv | { customOptions: fn | opts }` is supported); the actual runtime wiring uses `customOptions` per env-schema's `chooseAjvInstance` implementation. Added a regression test in `app.test.ts` that boots with `CORS_ORIGIN='not a uri'` and expects the build to reject with a `format|uri` error.
- `ajv-formats` is a CJS module whose compiled `index.js` does `module.exports = exports = formatsPlugin; exports.default = formatsPlugin`. Under TS `NodeNext`, the default-import type resolves to a non-callable namespace, but at runtime the ESM namespace exposes the callable at `.default`. Used `import * as addFormatsModule from 'ajv-formats'` + `const addFormats = (addFormatsModule as unknown as { default: ... }).default` to satisfy both typechecker and runtime. Verified with `node --input-type=module` that `m.default` is a function.
- Extended `BuildAppOptions` with the optional `registerTestRoutes` hook (called after plugin registration but before the `/v1` mount) so integration tests can inject `__explode/*` routes without rebuilding the plugin chain or polluting production code. Used it in three integration tests to round-trip `NotFoundError`, a 23505 error, and a generic `Error`.
- `src/plugins/error-handler.test.ts` boots a throwaway `Fastify({ logger: false })` instance — no DB, no env — to cover the four error-handler branches in isolation (4 tests). Integration tests in `test/plugins.integration.test.ts` exercise the same branches via the real `buildApp` with the whole plugin chain (11 tests).
- Scope was held tight: no `todosRepo`, no `Todo`/`CreateTodoInput` schemas, no `@fastify/type-provider-typebox`, no `src/repositories/` directory, no graceful-shutdown or `unhandledRejection` wiring. `src/routes/todos.ts` is the literal 3-line stub.
- Closed the two deferred items from Story 1.2/1.3: `CORS_ORIGIN` and `DATABASE_URL` now both validate `format: 'uri'` via `ajv-formats`.
- All AC satisfied:
  - **AC1** — cors/helmet/rate-limit/bodyLimit + `ajv-formats` URI check — ✅ smoke + headers + test `fails fast when CORS_ORIGIN is not a valid URI`
  - **AC2** — `/docs` HTML + `/docs/json` OpenAPI shape including `components.schemas.ErrorResponse` — ✅ integration + live smoke
  - **AC3** — `/v1` encapsulated plugin mounts `routes/todos.ts` (empty), `/healthz` unversioned — ✅ tests + live curl
  - **AC4** — error-handler branches (400 validation / 404 NotFoundError / 409 23xxx safe / 500 generic + log) using `reply.status().send()` in async handler — ✅ 4 unit + 3 integration tests
  - **AC5** — `ErrorResponse` TypeBox schema with `$id` registered via `app.addSchema`, surfaced in `/docs/json` under `components.schemas.ErrorResponse` — ✅ integration test + live `/docs/json`

### File List

**New files:**
- `apps/api/src/errors/index.ts` — `NotFoundError` class with `readonly statusCode = 404`
- `apps/api/src/schemas/errors.ts` — TypeBox `ErrorResponseSchema` (`$id: 'ErrorResponse'`) + `ErrorResponse` type alias
- `apps/api/src/plugins/cors.ts` — fp-wrapped `@fastify/cors`; comma-list → array parsing at wire time
- `apps/api/src/plugins/helmet.ts` — fp-wrapped `@fastify/helmet`, CSP disabled for Swagger UI compat
- `apps/api/src/plugins/rate-limit.ts` — fp-wrapped `@fastify/rate-limit`, 300 req/min/IP
- `apps/api/src/plugins/swagger.ts` — fp-wrapped `@fastify/swagger` + `@fastify/swagger-ui` at `/docs`; `addSchema(ErrorResponseSchema)`; custom `refResolver.buildLocalReference` so `$id` becomes the components key
- `apps/api/src/plugins/error-handler.ts` — root `setErrorHandler` (validation/404/409/500 branches)
- `apps/api/src/plugins/error-handler.test.ts` — 4 unit tests against a throwaway Fastify instance
- `apps/api/src/routes/todos.ts` — 3-line `FastifyPluginAsync` stub (handlers arrive in Epic 2)
- `apps/api/test/plugins.integration.test.ts` — 11 integration tests across the full plugin chain

**Modified files:**
- `apps/api/package.json` — added `@fastify/cors`, `@fastify/helmet`, `@fastify/rate-limit`, `@fastify/swagger`, `@fastify/swagger-ui`, `@sinclair/typebox`, `ajv-formats`, `fastify-plugin` (declared explicitly)
- `apps/api/src/app.ts` — `bodyLimit: 65_536`; `ajv-formats` wired via `ajv.customOptions`; registered `cors/helmet/rate-limit/swagger/error-handler` in order; added optional `registerTestRoutes` hook; mounted `todosRoutes` at `/v1`
- `apps/api/src/config.ts` — added `format: 'uri'` on `DATABASE_URL` and `CORS_ORIGIN` (kept default + `minLength: 1` for both)
- `apps/api/src/app.test.ts` — replaced the single `/healthz` hasRoute test with a combined hasRoute check (`/healthz`, `/docs`, `!/v1/todos`); added ajv-formats URI-validation test, POST `/v1/todos` 404 envelope test, unknown-route 404 envelope test
- `package-lock.json` — lockfile refreshed by `npm install`
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — `1-4-...` transitioned `ready-for-dev → in-progress → review`

### Change Log

| Date       | Change                                                                                                                                                                                                                                                                     |
|------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| 2026-04-18 | Story 1.4 implemented: Fastify plugin stack (cors/helmet/rate-limit/swagger/swagger-ui), `/v1` prefix mount with empty `todosRoutes`, root `setErrorHandler` (400/404/409/500 envelope), TypeBox `ErrorResponseSchema` registered via `addSchema`. Closed deferred items: `CORS_ORIGIN` + `DATABASE_URL` now validate `format: 'uri'` via `ajv-formats`. 30/30 tests pass. Status → review. |
