# Story 1.2: Fastify API skeleton with `/healthz`

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want a Fastify API workspace that starts in dev mode and responds on `/healthz`,
So that I can confirm the API half of the stack is alive before adding business logic.

## Acceptance Criteria

**AC1 — `apps/api/` workspace boots via `npm run dev`**
- **Given** `apps/api/` workspace exists with its own `package.json` and `tsconfig.json` extending `tsconfig.base.json`
- **When** the engineer runs `npm run dev --workspace apps/api` from the repo root
- **Then** `tsx watch src/server.ts` starts Fastify listening on the configured `PORT` (default `3000`)
- **And** the boot log line is pretty-printed via `pino-pretty` when `NODE_ENV=development`

**AC2 — `@fastify/env` validates a typed config schema and fails fast**
- **Given** `@fastify/env` is registered with a typed config schema inside `buildApp`
- **When** the server boots without a required env var (e.g. `DATABASE_URL`)
- **Then** the server fails fast with a validation error whose message references the missing key
- **And** `apps/api/.env.example` enumerates all five env vars: `DATABASE_URL`, `PORT`, `CORS_ORIGIN`, `LOG_LEVEL`, `NODE_ENV`
- **And** `apps/api/.env` is gitignored (inherits from root `.gitignore`; no per-workspace `.gitignore` needed)

**AC3 — `GET /healthz` returns `200 { "status": "ok" }`**
- **Given** the server is running (or an `app.inject` test harness is driving `buildApp`)
- **When** a client issues `GET /healthz`
- **Then** the response is `200` with body `{ "status": "ok" }` and content-type `application/json`
- **And** the route is registered **unversioned** (not under `/v1` — `/v1` prefix arrives in Story 1.4)
- **And** the DB probe field is **not** included (that lands in Story 1.3; this story ships `{ status }` only)

**AC4 — Factory pattern: `buildApp(config)` + `server.ts` entrypoint**
- **Given** the codebase uses the factory pattern described in architecture.md §Structure Patterns
- **When** the engineer inspects the source
- **Then** `src/app.ts` exports an async `buildApp` factory that returns a `FastifyInstance` with `@fastify/env` registered and routes mounted — testable via `app.inject`
- **And** `src/server.ts` is the runtime entrypoint that builds the app and calls `app.listen({ port })`
- **And** `buildApp` is callable in tests with an env-override object (forwarded to `@fastify/env`'s `data` option) so tests never depend on ambient `process.env`

## Tasks / Subtasks

- [x] **Task 1: Scaffold `apps/api/` workspace** (AC: 1)
  - [x] Create directory `apps/api/` (delete `apps/.gitkeep` only if `apps/web/` is also being created — for this story leave `.gitkeep` in place since `apps/web/` lands in Story 1.5; the `.gitkeep` becomes redundant once both exist but pruning it is out of scope here)
  - [x] Create `apps/api/package.json` with the shape documented in Dev Notes → "`package.json` shape". Required: `"name": "@todo-app/api"`, `"private": true`, `"type": "module"`, `"version": "0.0.0"`, the 3 scripts (`dev`, `test`, `typecheck`), and the 2 runtime deps + 5 dev deps (no more, no less — see pinned versions)
  - [x] From repo root run `npm install` — confirm a single root `node_modules/` + updated `package-lock.json`, and that npm workspaces resolves `apps/api` (verify via `npm ls --workspace apps/api` or `cat package-lock.json | head` showing the workspace entry)
  - [x] Verify `node_modules/fastify`, `node_modules/@fastify/env`, `node_modules/tsx`, `node_modules/vitest`, `node_modules/pino-pretty` exist

- [x] **Task 2: Add `apps/api/tsconfig.json` extending base** (AC: 1, 4)
  - [x] Create `apps/api/tsconfig.json` that `"extends": "../../tsconfig.base.json"` and overrides `"module": "NodeNext"` + `"moduleResolution": "NodeNext"` (the base sets `"Bundler"` for the Vite web app; the API runs on Node directly and needs NodeNext semantics — see story 1.1 dev notes line 178 which explicitly anticipates this override)
  - [x] Set `"outDir": "dist"` and `"rootDir": "src"` so that when `build` eventually ships (Story 1.6) the output lands in `apps/api/dist/`
  - [x] `"include": ["src/**/*.ts", "test/**/*.ts"]`
  - [x] Do NOT re-declare `"strict"` or other compiler options set by the base — inheritance handles them
  - [x] **Consequence of `module: "NodeNext"`:** relative imports in `.ts` source files MUST use the `.js` extension (e.g. `import { buildApp } from './app.js'`) — TypeScript enforces this under NodeNext. `tsx watch` is lenient but `tsc --noEmit` will fail without the extensions. Write imports with `.js` from day one to avoid refactor later.
  - [x] Verify: from repo root, `npx tsc -p apps/api/tsconfig.json --noEmit` exits 0 (once source files are in place at the end of the story)

- [x] **Task 3: Author `apps/api/.env.example`** (AC: 2)
  - [x] Create `apps/api/.env.example` with the 5 env vars documented in Dev Notes → "`.env.example` contents". Use sensible local-dev defaults for everything except `DATABASE_URL` (which is required and should be the real local Postgres URI matching `docker-compose.yml`: `postgresql://postgres:postgres@localhost:5432/todo_app`)
  - [x] Do NOT create `apps/api/.env` — it is gitignored via the root `.gitignore` (which already ignores `.env`). Developers copy `.env.example` → `.env` per README (arrives in Story 1.6). For this story, dev/test runs can rely on `@fastify/env`'s `dotenv: true` option to auto-load `apps/api/.env` when present, and tests pass overrides via `data:` (no file needed).
  - [x] Verify: `git check-ignore apps/api/.env` (hypothetically; the path doesn't need to exist) confirms it would be ignored if created — or equivalently, inspect root `.gitignore` and confirm `.env` pattern is present

- [x] **Task 4: Author `src/config.ts` — env schema + typed `Config`** (AC: 2)
  - [x] Create `apps/api/src/config.ts` exporting:
    - A JSON Schema `envSchema` (plain object literal, no TypeBox yet — TypeBox arrives with Story 2.1's request schemas) with `required: ['DATABASE_URL']` and typed properties for all 5 env vars, using `default:` to populate optional keys
    - An exported `Config` TypeScript type (hand-written to match the schema's resolved shape)
    - A `declare module 'fastify'` block that augments `FastifyInstance` with `config: Config` — this is how `@fastify/env` surfaces the typed config throughout the app
  - [x] See Dev Notes → "`src/config.ts` reference shape" for the exact schema + type pair. Keep them in sync by construction (a TS test can enforce this in a future story; for now hand-alignment is fine given the tiny surface)
  - [x] **Do NOT use TypeBox** — the architecture reserves TypeBox for request/response schemas starting in Story 2.1. `@fastify/env` accepts plain JSON Schema, which is all we need here.

- [x] **Task 5: Author `src/app.ts` — `buildApp` factory** (AC: 1, 2, 4)
  - [x] Create `apps/api/src/app.ts` exporting an async function `buildApp(opts?: BuildAppOptions): Promise<FastifyInstance>` where `BuildAppOptions` has optional `config?: Record<string, unknown>` (passed through to `@fastify/env`'s `data` option)
  - [x] Inside `buildApp`:
    1. Compute `logger` config from raw `process.env` **before** creating the Fastify instance (see Dev Notes → "Logger bootstrapping chicken-and-egg"). Default: `level: process.env.LOG_LEVEL ?? 'info'`; when `process.env.NODE_ENV !== 'production'` also set `transport: { target: 'pino-pretty' }`
    2. `const app = fastify({ logger })` — do NOT set `bodyLimit`, helmet, cors, or any other plugin options; those land in Story 1.4
    3. `await app.register(fastifyEnv, { schema: envSchema, dotenv: true, data: opts.config ?? process.env })` — this throws on validation failure (satisfies AC2 fail-fast behavior), and after resolution `app.config` is typed `Config`
    4. `await app.register(healthRoutes)` — mounts `/healthz` unversioned
    5. `await app.ready()` — finalize plugin resolution so tests get a fully-primed instance
    6. `return app`
  - [x] Export the `BuildAppOptions` type so tests can import it
  - [x] **Do NOT** register cors/helmet/rate-limit/swagger here. **Do NOT** add a global error handler. **Do NOT** register `/v1` prefix. All of that is Story 1.4's deliverable — keep `buildApp` scoped to env + `/healthz` for this story.

- [x] **Task 6: Author `src/routes/health.ts` — `GET /healthz` route** (AC: 3)
  - [x] Create `apps/api/src/routes/health.ts` exporting a Fastify plugin function (default export) that registers `GET /healthz` returning `{ status: 'ok' }` with `200`
  - [x] The route is **synchronous**: no DB probe, no async work. DB probe is Story 1.3's AC (epics.md §Story 1.3 adds the `SELECT 1` and the `503` degraded branch).
  - [x] Use Fastify's native handler signature; no TypeBox response schema yet (response schemas are Story 2.1+). Fastify will serialize the plain object to JSON with `application/json` content-type — satisfies AC3 without extra config.
  - [x] Register the route at the top level (unversioned). AC3 is explicit that `/healthz` is NOT under `/v1`.

- [x] **Task 7: Author `src/server.ts` — runtime entrypoint** (AC: 1, 4)
  - [x] Create `apps/api/src/server.ts` that:
    1. Calls `const app = await buildApp()` (no `config` override — uses `process.env` + dotenv)
    2. Calls `await app.listen({ port: app.config.PORT, host: '0.0.0.0' })` (host `0.0.0.0` so Playwright E2E from Story 1.6 and Docker-based CI can reach it; Fastify's 127.0.0.1 default is too restrictive for CI)
    3. On any error: log via `app.log.error(err)` (or `console.error` as fallback if the app failed to build), then `process.exit(1)` — this is the "fail fast" requirement from AC2 in observable form
  - [x] Wrap the whole thing in a top-level `try/catch` or an `async main()` function — NodeNext + `"type": "module"` supports top-level `await`, but top-level `await` inside a throw does NOT call the catch handler of an enclosing script. Use an explicit `main().catch(err => { console.error(err); process.exit(1); })` pattern for clarity.
  - [x] **Do NOT** import `@fastify/env` directly here — it's registered inside `buildApp`. `server.ts` should be thin: load → build → listen → handle errors.

- [x] **Task 8: Unit test — `src/app.test.ts`** (AC: 2, 3, 4; covers Test Scenarios "unit/1" and "integration/1-2" in the epic)
  - [x] Create `apps/api/src/app.test.ts` (co-located with `app.ts` per the unit-test convention in architecture.md §Structure Patterns)
  - [x] Test 1 — **route registration:** `const app = await buildApp({ config: { DATABASE_URL: 'postgresql://test' } })`; assert `app.printRoutes()` contains `/healthz`; then `await app.close()`
  - [x] Test 2 — **healthz via inject:** from the same `app`, `await app.inject({ method: 'GET', url: '/healthz' })`; assert `res.statusCode === 200`, `res.headers['content-type']` matches `application/json`, and `res.json()` deep-equals `{ status: 'ok' }`
  - [x] Test 3 — **missing required env fails fast:** `await expect(buildApp({ config: {} })).rejects.toThrow(/DATABASE_URL/i)` — `@fastify/env` throws a validation error whose message references the missing property
  - [x] Use vitest's `describe` / `it` / `expect` APIs. No custom test setup file needed for this story.
  - [x] **Important:** always `await app.close()` in a `afterEach` or at the end of each test to release the port / free Fastify resources — forgetting this causes vitest hangs.

- [x] **Task 9: Vitest configuration** (AC: coverage for Task 8; no direct AC but required for `npm test --workspace apps/api` to discover the tests)
  - [x] Zero-config is acceptable: vitest picks up `*.test.ts` co-located with source when run from the workspace root. Verify by running `npm test --workspace apps/api` and confirming the 3 tests in Task 8 execute.
  - [x] Optional: create a minimal `apps/api/vitest.config.ts` only if the zero-config run produces ESM/NodeNext interop warnings. Keep it minimal (`defineConfig({ test: { environment: 'node' } })`) — do NOT add jsdom (web-only) or coverage config (that's Story 1.6's CI concern).

- [x] **Task 10: End-to-end smoke verification** (AC: 1, 2, 3, 4 — pre-review manual check)
  - [x] Copy `apps/api/.env.example` → `apps/api/.env` locally for the smoke test. Do NOT commit the `.env`.
  - [x] Run `npm run dev --workspace apps/api`. Observe:
    - A pino-pretty formatted log line: `[... INFO ...] Server listening at http://0.0.0.0:3000` (exact wording is Fastify's default — the point is it's readable, not JSON)
    - No startup errors
  - [x] From another shell: `curl -sSf http://localhost:3000/healthz` returns `{"status":"ok"}` with a `200`. Alternatively `curl -i` to confirm `HTTP/1.1 200 OK` + `Content-Type: application/json`.
  - [x] Remove `DATABASE_URL` from `apps/api/.env` (comment it out), re-run `npm run dev`. Confirm the process exits with a non-zero code and the error message references `DATABASE_URL`. Restore `.env` afterwards.
  - [x] Run `npm test --workspace apps/api` — all 3 tests in Task 8 pass.
  - [x] Run `npx tsc -p apps/api/tsconfig.json --noEmit` — exits 0.

### Review Findings

Triaged from a 3-layer adversarial code review (Blind Hunter, Edge Case Hunter, Acceptance Auditor) on 2026-04-18. Raw findings: 57. After dedup + triage: 7 patches, 9 deferred, 21 dismissed as noise/spec-prescribed/false-positive.

**Patches (actionable now):**

- [x] [Review][Patch] Wrap plugin registrations in try/catch and close app on failure [apps/api/src/app.ts:12-18] — if `fastifyEnv`, `healthRoutes`, or `app.ready()` throws, the partially-constructed Fastify instance (and its pino-pretty worker thread) is leaked. Matters in the missing-env test path.
- [x] [Review][Patch] Disable `dotenv` when `opts.config` is provided to prevent test pollution [apps/api/src/app.ts:14] — change to `dotenv: opts.config === undefined`. Otherwise a local `apps/api/.env` mutates `process.env` during tests and `buildLoggerConfig` picks up unintended `LOG_LEVEL`/`NODE_ENV`.
- [x] [Review][Patch] Add PORT range validation to env schema [apps/api/src/config.ts:9] — `minimum: 1, maximum: 65535`. Prevents invalid port silently passing env validation only to die with a cryptic `EADDRINUSE` / `EACCES` at `app.listen`.
- [x] [Review][Patch] Replace fragile `printRoutes().toContain` with `hasRoute` [apps/api/src/app.test.ts:17] — use `app.hasRoute({ method: 'GET', url: '/healthz' })`. The Dev Notes themselves warn against asserting `printRoutes()` output; test currently violates that guidance.
- [x] [Review][Patch] Tighten `Content-Type` assertion to exact string [apps/api/src/app.test.ts:24] — `.toBe('application/json; charset=utf-8')` instead of `.toMatch(/application\/json/)`. The regex also matches `application/json-patch+json` etc.
- [x] [Review][Patch] Clarify Debug Log wording to match Fastify 5's multi-interface log output [this file, Dev Agent Record → Debug Log] — current phrasing reads as if it contradicts `host: '0.0.0.0'`. Paste verbatim log or explain Fastify 5 logs one line per resolved interface.
- [x] [Review][Patch] Fix garbled `` `require 'number'` `` typo in Completion Notes [this file, Dev Agent Record → Completion Notes] — should be `` `type: 'number'` ``. Looks like AI-hallucinated JSON-Schema syntax.

**Deferred (pre-existing, out of scope, or accepted by Dev Notes):**

- [x] [Review][Defer] No SIGTERM/SIGINT graceful shutdown [apps/api/src/server.ts] — deferred; production lifecycle hardening belongs with deploy/CI story (1.6+).
- [x] [Review][Defer] No `unhandledRejection` / `uncaughtException` handlers [apps/api/src/server.ts] — deferred; Node 20+ defaults to non-zero exit on unhandled rejections, which is sufficient fail-fast for MVP. Revisit with observability story.
- [x] [Review][Defer] Invalid `LOG_LEVEL` raw-env value would crash pino before `@fastify/env` validates [apps/api/src/app.ts buildLoggerConfig] — deferred; pino's error message is readable enough for MVP. Harden when a central logger config module lands.
- [x] [Review][Defer] `DATABASE_URL` has no URI format validation [apps/api/src/config.ts:7] — deferred; Story 1.3 connects to Postgres and will surface real format errors at probe time. Adding `format: 'uri'` now requires `ajv-formats`.
- [x] [Review][Defer] `CORS_ORIGIN` has no URI format validation [apps/api/src/config.ts:10] — deferred to Story 1.4 (`@fastify/cors` wire-up). Value is declared-but-unused in this story.
- [x] [Review][Defer] Tests don't stub `process.env` for `LOG_LEVEL` / `NODE_ENV` [apps/api/src/app.test.ts] — deferred; no current assertion depends on logger output, so CI env leak is latent not active.
- [x] [Review][Defer] No direct coverage of `buildLoggerConfig` dev/prod branches [apps/api/src/app.test.ts] — deferred; helper is private. Refactor for testability when Story 1.4 adds real plugin interactions.
- [x] [Review][Defer] No `HEAD /healthz` assertion despite LB probe patterns [apps/api/src/app.test.ts] — deferred; Fastify auto-registers HEAD for GET. Add when a real LB config depends on it.
- [x] [Review][Defer] Default `host: '0.0.0.0'` has no env-override (`HOST`) [apps/api/src/server.ts:6] — deferred; Dev Notes explicitly accept this tradeoff for Docker/CI reachability at MVP. Revisit when a deploy target is chosen.
- [x] [Review][Defer] No drift test between `.env.example` keys and `envSchema.properties` [apps/api/] — deferred; low-value until the schema grows beyond 5 keys.

**Dismissed (not real issues):** 21 findings — mostly Dev-Notes-prescribed patterns (e.g., `Record<string, unknown>` for `BuildAppOptions.config`, `await app.ready()` in `buildApp`, caret version ranges, `tsconfig.json` `test/**/*.ts` safety-net include), and standard HTTP/Node semantics (404 on trailing-slash / wrong-case paths, `process.exit(1)` on fail-fast, etc.).

**Overall verdict:** All 4 ACs honored. Zero scope creep. Implementation tracks the Dev Notes reference shapes precisely. The 7 patches are low-risk ergonomic/robustness improvements; none block review sign-off on their own.

## Dev Notes

### Scope discipline — what this story is and isn't

**This story is the Fastify API skeleton — env + one route.** Scope hard stops:

- **DB layer is out:** No Kysely, no `pg` driver, no `src/db/`, no migrations, no `/healthz` DB probe. All of that is Story 1.3. `/healthz` in this story returns `{ status: 'ok' }` only — the `{ db }` field gets added in 1.3.
- **Plugin stack is out:** No `@fastify/cors`, `@fastify/helmet`, `@fastify/rate-limit`, `@fastify/swagger`, `@fastify/swagger-ui`. No `bodyLimit` override. No global error handler. No `/v1` prefix plugin. No `src/errors/`. **All of that is Story 1.4.**
- **TypeBox is out:** No `@sinclair/typebox` dep. No `src/schemas/`. Request/response schemas start in Story 2.1. For env validation, plain JSON Schema (which `@fastify/env` accepts natively) is sufficient.
- **Repositories and business routes are out:** No `src/repositories/`. No `src/routes/todos.ts`. No CRUD. Those are Epic 2+.
- **Web app is out:** `apps/web/` doesn't exist yet and won't until Story 1.5. Don't touch it.
- **CI is out:** No `.github/workflows/ci.yml`. No `lint` / `format:check` / `build` scripts in the API's package.json — only `dev`, `test`, `typecheck`. Story 1.6 adds the rest when CI lands.
- **The root `.gitignore` is sufficient:** `.env` is already ignored. No per-workspace `.gitignore` needed.

If you find yourself installing `kysely`, `pg`, `@fastify/cors`, `@fastify/helmet`, `@fastify/rate-limit`, `@fastify/swagger*`, `@sinclair/typebox`, or `uuid` — **stop**, you've crossed into a later story's scope.

### Target workspace layout (after this story)

```
apps/api/
├── package.json                    ← @todo-app/api, ESM, 2 deps + 5 devDeps
├── tsconfig.json                   ← extends base, module=NodeNext
├── .env.example                    ← 5 env vars, no secrets
└── src/
    ├── server.ts                   ← entrypoint: buildApp + listen
    ├── app.ts                      ← buildApp factory (exported, testable)
    ├── app.test.ts                 ← co-located unit tests (routes + env + healthz inject)
    ├── config.ts                   ← env JSON Schema + Config type + module augmentation
    └── routes/
        └── health.ts               ← GET /healthz plugin
```

**That's it — 6 source files, 1 test file, 1 `.env.example`, 1 `tsconfig.json`, 1 `package.json`.** The fuller structure in architecture.md:503–539 (db/, plugins/, schemas/, errors/, repositories/, test/…) is built up across Stories 1.3–1.6 and 2.1+. Do NOT pre-create empty `db/`, `plugins/`, `schemas/` directories — let them arrive when they're populated. Empty directories create noise and a false sense of progress.

### `package.json` shape

```json
{
  "name": "@todo-app/api",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "test": "vitest run",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "fastify": "^5.1.0",
    "@fastify/env": "^5.0.0"
  },
  "devDependencies": {
    "@types/node": "^22.10.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0",
    "pino-pretty": "^13.0.0",
    "vitest": "^3.0.0"
  }
}
```

- **`"type": "module"`** is required by architecture.md:130 ("ESM throughout; Fastify TS docs recommend ESM") — this, combined with `module: "NodeNext"` in tsconfig, makes `.js` extensions in relative imports mandatory.
- **`"private": true"`** — the workspace is never published.
- **Version pins are minimums within the current major line.** Use caret ranges (`^`) so `npm install` can pick up patch/minor updates. Don't pin to exact versions unless a compat issue is known.
- **No `build` script** — production build is deferred per architecture.md:701–703; the `build` script lands in Story 1.6 with CI. Adding a placeholder now would need `outDir` + NodeNext + `.js` extensions to actually produce runnable output, which is worth getting right once, not twice.
- **No `lint` / `format:check`** — those land in Story 1.6 at the root level (ESLint + Prettier are root-level configs per architecture.md).
- **`tsx watch`** restarts the process on `src/**/*.ts` changes automatically; no `nodemon` needed.

### `apps/api/tsconfig.json` reference shape

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*.ts", "test/**/*.ts"]
}
```

Why override `module` / `moduleResolution`:
- Root base sets `"module": "ESNext"` + `"moduleResolution": "Bundler"` — those are for Vite's bundler-aware resolution on the web side.
- API runs on Node directly (both in dev via `tsx` and in eventual prod via `tsc` → `node`). Node's native ESM resolver needs `"NodeNext"` (which implies `"module": "NodeNext"` + `"moduleResolution": "NodeNext"`), and crucially this mode enforces the `.js` extension rule on relative imports at typecheck time.
- **Story 1.1 dev notes explicitly anticipate this override** (line 178: "apps/api (tsx + tsc) will override to NodeNext in Story 1.2 if needed — that is the whole point of keeping per-workspace tsconfig.json files").

Do NOT redeclare `strict`, `esModuleInterop`, `skipLibCheck`, `forceConsistentCasingInFileNames`, `resolveJsonModule`, `isolatedModules` — they're inherited from the base and must remain consistent.

Do NOT include `test/` in the glob if no `test/` directory is being created (this story doesn't create one; tests are co-located with source). Only add `test/**/*.ts` to `include` as a safety net for Story 1.3's integration tests; harmless if the directory is empty.

### `apps/api/.env.example` contents

```dotenv
# Postgres connection string — matches docker-compose.yml credentials.
# Required: @fastify/env fails boot if this is missing or blank.
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/todo_app

# HTTP port Fastify listens on. Defaults to 3000 if unset.
PORT=3000

# Web origin allowed by @fastify/cors (wired in Story 1.4; declared now).
CORS_ORIGIN=http://localhost:5173

# pino log level. Use 'info' in dev, 'warn' in prod. One of:
# fatal | error | warn | info | debug | trace | silent
LOG_LEVEL=info

# One of: development | production | test
# Controls pino-pretty transport (dev only) and future plugin behaviors.
NODE_ENV=development
```

Notes:
- `DATABASE_URL` is required in the schema even though this story doesn't connect to Postgres. Reason: the schema drives the fail-fast contract in AC2, AND Story 1.3 will use it — pinning it now prevents a retrofit. The dev comment explains that the local value matches `docker-compose.yml` (user: `postgres`, pw: `postgres`, db: `todo_app`, port `5432`).
- `CORS_ORIGIN` is declared but unused by code in this story. That is intentional — declaring all 5 env vars at the `@fastify/env` schema level means the 1.4 author just uses `app.config.CORS_ORIGIN`, no env-schema change needed.
- Comments explain each var in one line each. Keep them — they're onboarding aids for Story 1.6 (NFR-006 ≤15-min onboarding).
- Do NOT put real secrets here — `.env.example` is committed. The values shown are safe local-dev defaults.

### `src/config.ts` reference shape

```ts
// apps/api/src/config.ts
// Env schema for @fastify/env. Plain JSON Schema; TypeBox arrives in Story 2.1.

export const envSchema = {
  type: 'object',
  required: ['DATABASE_URL'],
  properties: {
    DATABASE_URL: { type: 'string', minLength: 1 },
    PORT: { type: 'number', default: 3000 },
    CORS_ORIGIN: { type: 'string', default: 'http://localhost:5173' },
    LOG_LEVEL: {
      type: 'string',
      enum: ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'],
      default: 'info',
    },
    NODE_ENV: {
      type: 'string',
      enum: ['development', 'production', 'test'],
      default: 'development',
    },
  },
} as const;

export interface Config {
  DATABASE_URL: string;
  PORT: number;
  CORS_ORIGIN: string;
  LOG_LEVEL: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';
  NODE_ENV: 'development' | 'production' | 'test';
}

// Module augmentation: makes app.config typed throughout the codebase.
declare module 'fastify' {
  interface FastifyInstance {
    config: Config;
  }
}
```

Notes:
- The `minLength: 1` on `DATABASE_URL` ensures `DATABASE_URL=` (empty string) also fails — without it, an empty string is technically a valid string and `@fastify/env` would accept it.
- `PORT` as `number`: `@fastify/env` (via `env-schema`) auto-coerces env-var strings to the declared JSON Schema types — so `PORT=3000` in `.env` is parsed to the number `3000`. No manual parsing needed.
- `LOG_LEVEL` enum mirrors pino's valid levels exactly. `silent` is included because it's legal; default is `info`.
- `NODE_ENV` enum is locked to the three Node-ecosystem conventional values. No `'staging'` / `'qa'` — add those in a later story if deploy lands.
- The `declare module 'fastify'` block must be at the bottom (after the `Config` type). TypeScript doesn't care about order but humans do.
- `as const` on the schema preserves literal types — helpful if a later story wants to `Static<typeof envSchema>` via TypeBox (won't be needed in this story).

### `src/app.ts` reference shape

```ts
// apps/api/src/app.ts
import fastify, { type FastifyInstance } from 'fastify';
import fastifyEnv from '@fastify/env';
import { envSchema } from './config.js';
import healthRoutes from './routes/health.js';

export interface BuildAppOptions {
  /**
   * Override env values for testing; forwarded to @fastify/env's `data` option.
   * When omitted, @fastify/env uses process.env + dotenv loading.
   */
  config?: Record<string, unknown>;
}

export async function buildApp(opts: BuildAppOptions = {}): Promise<FastifyInstance> {
  const app = fastify({ logger: buildLoggerConfig() });

  await app.register(fastifyEnv, {
    schema: envSchema,
    dotenv: true,
    data: opts.config ?? process.env,
  });

  await app.register(healthRoutes);
  await app.ready();

  return app;
}

function buildLoggerConfig() {
  // Read raw env BEFORE @fastify/env is registered — see Dev Notes.
  const level = process.env.LOG_LEVEL ?? 'info';
  const isDev = (process.env.NODE_ENV ?? 'development') !== 'production';

  return isDev
    ? { level, transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss Z', ignore: 'pid,hostname' } } }
    : { level };
}
```

### `src/routes/health.ts` reference shape

```ts
// apps/api/src/routes/health.ts
import type { FastifyPluginAsync } from 'fastify';

const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get('/healthz', async () => ({ status: 'ok' }));
};

export default healthRoutes;
```

That's the whole route. No schema, no DB probe, no logging — those are later stories' responsibilities.

### `src/server.ts` reference shape

```ts
// apps/api/src/server.ts
import { buildApp } from './app.js';

async function main() {
  const app = await buildApp();
  try {
    await app.listen({ port: app.config.PORT, host: '0.0.0.0' });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main().catch((err) => {
  // If buildApp itself threw (e.g. missing DATABASE_URL), the app.log isn't available.
  // Fall back to console.error; this is the observable form of AC2 fail-fast.
  console.error(err);
  process.exit(1);
});
```

### Logger bootstrapping chicken-and-egg

**Problem:** The logger config (level + pretty-print transport) should come from the typed `Config`, but `Config` is only available *after* `@fastify/env` finishes registering, which happens *inside* the Fastify instance, which needs a logger passed at *construction* time.

**Options considered:**
1. **Use `env-schema` directly** (the lib that `@fastify/env` wraps) to validate config *before* creating the Fastify instance, pass config into `buildApp(config)`. Clean but violates the epic AC literal wording "`@fastify/env` is registered".
2. **Two-phase logger:** start with a default logger, then swap after env validation. Not supported by Fastify — logger is constructor-time only.
3. **Read raw `process.env` for logger config only** — specifically `LOG_LEVEL` and `NODE_ENV` — before creating Fastify; use the fully typed `app.config` for everything else. This is a tiny, bounded duplication of the defaults.

**Chosen:** option 3 (see `buildLoggerConfig()` in the reference shape). Reasoning:
- `LOG_LEVEL` and `NODE_ENV` both have sensible string defaults and are read-once at boot. No risk of drift during runtime.
- The duplication is exactly two `??` operators — smaller than either alternative's ceremony.
- If `@fastify/env` later rejects the env (missing `DATABASE_URL`), the logger may have reported on `LOG_LEVEL=info` with `pino-pretty` — fine, the failure message is still readable. The fail-fast contract is preserved.

**Do not** try to read `DATABASE_URL` or `CORS_ORIGIN` before `@fastify/env` registration — those carry real schema guarantees that should only flow through the typed path.

### `@fastify/env` v5 behavior — gotchas

- **Validation error format:** when a required key is missing, the thrown error is an `Error` (wrapped AJV validation failure) whose `.message` matches something like `"env must have required property 'DATABASE_URL'"`. Your test assertion `/DATABASE_URL/i` is safe across minor version bumps. Avoid asserting exact message prefixes.
- **`data: process.env` is the default** when `data` is omitted. Passing `data: opts.config ?? process.env` explicitly is slightly redundant but makes the test-override behavior obvious. Harmless.
- **`dotenv: true`** causes `@fastify/env` to load `apps/api/.env` from the workspace CWD automatically. If you run tests via `npm test --workspace apps/api`, the CWD is `apps/api/` so the file is found. If you run tests from the repo root via `npx vitest -r apps/api`, the CWD is the repo root and `.env` would not be loaded — prefer workspace-scoped commands.
- **`confKey` default is `'config'`** — accessed as `app.config.PORT`. Don't set `confKey` to anything else; the architecture's module augmentation in `config.ts` assumes this key.
- **Registration throws** (does not emit) on validation failure — a bare `await app.register(fastifyEnv, ...)` will reject inside `buildApp`, which is exactly what AC2 and Task 8 Test 3 rely on.

### Fastify 5 listen signature

```ts
await app.listen({ port: app.config.PORT, host: '0.0.0.0' });
```

- Returns a `Promise<string>` (the listening address). Awaiting is mandatory — don't use the old callback signature.
- `host: '0.0.0.0'` binds on all interfaces. Fastify's default (`'127.0.0.1'`) is too restrictive for CI runners inside Docker-compose networks. Since this API is single-user local-dev with no exposed ports beyond `localhost`, `'0.0.0.0'` is safe for the MVP. Revisit if/when prod deploy is chosen.
- Do NOT set `listenOptions` beyond `port` and `host` — backlog, ipv6Only, and exclusive are unnecessary at this scale.

### pino-pretty in dev

When `NODE_ENV !== 'production'`, the logger uses:
```ts
transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss Z', ignore: 'pid,hostname' } }
```

- `translateTime: 'HH:MM:ss Z'` shortens the timestamp to a readable hh:mm:ss (plus timezone).
- `ignore: 'pid,hostname'` drops two noisy fields that don't help local-dev observability.
- `target: 'pino-pretty'` requires `pino-pretty` to be installed (see `devDependencies` in the package.json shape).
- In production (`NODE_ENV=production`) the transport is omitted → pino emits structured JSON, which is what real log aggregators prefer.

### Test-file conventions

- **Unit test:** `src/app.test.ts` co-located with `app.ts`. Architecture.md §Structure Patterns line 366 mandates this pattern for unit tests.
- **No integration `test/` folder yet** — Story 1.3 creates `apps/api/test/` with `setup.ts` + integration tests against real Postgres. This story's 3 tests (routes, healthz via inject, missing-env throw) fit cleanly into `src/app.test.ts` as unit tests. `app.inject` is still "unit" at this boundary because no network or DB is involved.
- **Always `await app.close()`** after a buildApp test — Fastify holds listeners/timers that keep vitest alive past the test if not closed. A shared `afterEach(() => app?.close())` helper is clean when tests share a before-each setup.
- **Do not assert exact `app.printRoutes()` output** — whitespace / tree-drawing characters vary by version. Assert `.toContain('/healthz')` or `.toMatch(/healthz/)` instead.

### Verification checklist (pre-review, manual)

From repo root, in order:

1. `npm install` — exits 0; `node_modules/fastify`, `node_modules/@fastify/env`, `node_modules/tsx`, `node_modules/vitest`, `node_modules/pino-pretty`, `node_modules/typescript` all exist.
2. `npx tsc -p apps/api/tsconfig.json --noEmit` — exits 0.
3. `cp apps/api/.env.example apps/api/.env`.
4. `npm run dev --workspace apps/api` → see pretty-printed `Server listening at http://0.0.0.0:3000` within ~1 s.
5. In a second shell: `curl -sSf http://localhost:3000/healthz` → `{"status":"ok"}`; `curl -i http://localhost:3000/healthz` → `HTTP/1.1 200 OK` + `Content-Type: application/json`.
6. Ctrl-C the dev server. Comment out `DATABASE_URL` in `apps/api/.env`. Re-run `npm run dev --workspace apps/api` → process exits non-zero within ~1 s; error message contains `DATABASE_URL`. Uncomment `DATABASE_URL` afterwards.
7. `npm test --workspace apps/api` — all 3 tests pass.
8. `git status` — no `.env` staged anywhere; only the intended new/modified files (see File List below).

### Project Structure Notes

Files **added** by this story:

```
apps/api/
├── package.json
├── tsconfig.json
├── .env.example
└── src/
    ├── server.ts
    ├── app.ts
    ├── app.test.ts
    ├── config.ts
    └── routes/
        └── health.ts
```

Files **modified** by this story:

- `package-lock.json` (root — npm install picks up the new workspace deps: fastify, @fastify/env, tsx, vitest, pino-pretty, typescript, @types/node)

Files **intentionally NOT created**:

- `apps/api/.env` (gitignored; developer-local)
- `apps/api/.gitignore` (root `.gitignore` covers `.env` / `dist/` / `node_modules/`)
- `apps/api/dist/` (no production build in this story)
- `apps/api/test/` (integration folder arrives in Story 1.3)
- `apps/api/src/db/`, `src/plugins/`, `src/schemas/`, `src/errors/`, `src/repositories/` (Stories 1.3 / 1.4 / 2.1 populate these)
- `apps/api/vitest.config.ts` (zero-config works for this story)

**Conflict check:** no conflicts with the unified project structure in architecture.md §Complete Project Directory Structure (lines 503–539). This story adds exactly the subset of files called out in AC1–AC4; the rest of `apps/api/` arrives in Stories 1.3, 1.4, 2.1, 3.x.

**Note on `apps/.gitkeep`:** Story 1.1 added `apps/.gitkeep` because `apps/` was empty. With `apps/api/` arriving, the `.gitkeep` becomes redundant but pruning it is **out of scope** for this story. Story 1.5 (which adds `apps/web/`) or a later cleanup can remove it. Leaving it in place costs nothing.

### Testing Strategy for this story

Per the epic's Test Scenarios section (epics.md §Story 1.2 lines 234–244):

- **Unit tests (co-located `*.test.ts`):**
  - `buildApp()` returns a Fastify instance with `/healthz` registered (assert via `app.printRoutes().includes('/healthz')`).
  - `buildApp({ config: {} })` rejects with an error mentioning `DATABASE_URL` (covers the "env schema rejects missing required key" scenario — tested through `buildApp` rather than against the schema in isolation, which is a cleaner boundary and doesn't require an extra ajv/env-schema dep).
- **Integration tests (inject, no real network):**
  - `app.inject({ method: 'GET', url: '/healthz' })` returns `200`, `application/json`, body `{ status: 'ok' }`. Co-located in `src/app.test.ts` as a third test — a real `test/` folder is not needed until Story 1.3 brings in Postgres integration tests.
- **E2E tests:** none — Playwright arrives in Story 1.6.

**Do not set up:**
- A separate `test/setup.ts` (no shared setup needed for 3 tests).
- `vitest-axe`, jsdom, or coverage (web / CI concerns).
- Any test that requires Postgres to be running (those start in Story 1.3).

### Previous story intelligence (from Story 1.1)

**What 1.1 established that 1.2 builds on:**
- Root `package.json` with `"workspaces": ["apps/*"]` — `npm install` at root will auto-resolve the new `apps/api` workspace. Verified in 1.1's Debug Log ("`npm install` at repo root → exits 0").
- `tsconfig.base.json` is the extendable base — **already includes `strict: true`, `esModuleInterop`, `skipLibCheck`, `forceConsistentCasingInFileNames`, `resolveJsonModule`, `isolatedModules`** at the root level. Do NOT redeclare these in `apps/api/tsconfig.json` — inheritance handles them.
- `docker-compose.yml` has `postgres:16-alpine` listening on `5432` with `user/pw/db = postgres/postgres/todo_app`. The `.env.example` `DATABASE_URL` must match these credentials exactly — copy the values, don't invent new ones.
- `.gitignore` already covers `.env`, `dist/`, `node_modules/` + editor folders. No per-workspace `.gitignore` needed.

**What 1.1 got right that 1.2 should replicate:**
- **Tight scope discipline.** The 1.1 dev notes explicitly listed what's out of scope and the dev agent respected it — zero scope creep. Same discipline applies here: API skeleton only, no plugin stack, no DB, no `/v1`.
- **Reference shapes with rationale.** 1.1 gave the exact expected `tsconfig.base.json`, `docker-compose.yml`, `.gitignore` contents with "why" notes. This story follows the same pattern for `package.json`, `tsconfig.json`, `config.ts`, `app.ts`, etc.
- **Version pins with caret ranges.** 1.1 didn't pin exact versions (it had zero deps); this story uses `^major.minor` so `npm install` picks up compatible patches.

**What 1.1 didn't cover that 1.2 must address fresh:**
- First TypeScript compilation in this repo — this is where `module: NodeNext` + `.js` relative imports first show up. Get it right once.
- First workspace `package.json` — the `"type": "module"` + ESM story starts here.
- First test runner (vitest) — verify zero-config works before investing in a config file.

**Deferred items from 1.1's review** (see `_bmad-output/implementation-artifacts/deferred-work.md`) that remain deferred — **do not address in this story:**
- Node version pinning (`.nvmrc` / `engines`) — Story 1.6.
- `.npmrc` — Story 1.6.
- Additional `.gitignore` entries (`coverage/`, `.turbo/`, `*.tsbuildinfo`) — add organically as later stories need them; this story adds none of those concerns.
- `LICENSE`, `db:reset`, `.gitattributes` — Stories 1.3 / 1.6 or later.

### Latest tech information (verified against stack versions April 2026)

- **Fastify 5.x** is the active release line (5.0 shipped late 2024). Uses TypeScript 5+, requires Node 20+, ships native ESM types. TypeScript-first reference at https://fastify.dev/docs/latest/Reference/TypeScript/.
- **`@fastify/env` 5.x** is compatible with Fastify 5. API is stable: `{ schema, data?, dotenv?, confKey? }`. Uses `env-schema` under the hood (same schema format).
- **tsx 4.x** — drop-in replacement for `ts-node`; handles ESM by default; `tsx watch` auto-restarts on file change.
- **pino-pretty 13.x** — transport compatible with pino 9 (which Fastify 5 ships). `translateTime` + `ignore` options are the standard dev-friendly settings.
- **vitest 3.x** — ESM-first, zero-config for co-located `*.test.ts` in a Node-only workspace. `vitest run` for single-pass (CI-friendly); `vitest` for watch mode.
- **Node LTS in April 2026:** Node 22 (`"Jod"`) is the primary LTS; Node 24 becomes LTS in October 2025 per the Node release schedule. Both support native ESM + top-level `await` + `--import tsx`. No `"engines"` pin in package.json for this story (Story 1.6 will add it).

### References

- Epic + story source: [_bmad-output/planning-artifacts/epics.md#Story-1.2](../planning-artifacts/epics.md) (lines 207–244)
- Epic goal + walking-skeleton outcome: [epics.md §Epic 1 goal](../planning-artifacts/epics.md) (lines 168–170)
- Architecture — starter selection + ESM stance: [architecture.md §Starter Template Evaluation](../planning-artifacts/architecture.md) (lines 75–153)
- Architecture — `buildApp` factory pattern + `apps/api/` layout: [architecture.md §Structure Patterns](../planning-artifacts/architecture.md) (lines 322–342)
- Architecture — complete project directory structure: [architecture.md §Complete Project Directory Structure](../planning-artifacts/architecture.md) (lines 485–585)
- Architecture — pino logger defaults: [architecture.md §Infrastructure & Deployment, row "Logging"](../planning-artifacts/architecture.md) (line 251)
- Architecture — env files + @fastify/env: [architecture.md §Authentication & Security, row "Secrets handling"](../planning-artifacts/architecture.md) (line 206)
- Architecture — `/healthz` unversioned decision: [architecture.md §API & Communication Patterns, row "Health check"](../planning-artifacts/architecture.md) (lines 222)
- Architecture — test location rules: [architecture.md §Structure Patterns](../planning-artifacts/architecture.md) (line 366)
- Architecture — enforcement guidelines (8 MUST rules): [architecture.md §Enforcement Guidelines](../planning-artifacts/architecture.md) (lines 419–428)
- Previous story: [1-1-monorepo-scaffold-with-docker-postgres.md](./1-1-monorepo-scaffold-with-docker-postgres.md) — especially the note at line 178 anticipating NodeNext override for this story.
- Deferred work from 1.1: [deferred-work.md](./deferred-work.md)

## Dev Agent Record

### Agent Model Used

claude-opus-4-7 (Claude Opus 4.7, 1M context) via BMAD `dev-story` skill, 2026-04-18.

### Debug Log References

- `npm install` (repo root) — exits 0; resolves `@todo-app/api` workspace; installs fastify@5.8.5, @fastify/env@5.0.3, tsx@4.21.0, vitest@3.2.4, pino-pretty@13.1.3, typescript@5.9.3, @types/node@22.19.17.
- `npx tsc -p apps/api/tsconfig.json --noEmit` — exits 0 (relative imports use `.js` extensions, NodeNext-compliant).
- `npm test --workspace apps/api` — 3/3 tests pass in `src/app.test.ts` (routes registration, healthz inject, missing DATABASE_URL throws).
- `npm run dev --workspace apps/api` with a copied `.env` — pino-pretty boot emits one `INFO: Server listening at http://<addr>:3000` line **per resolved interface** (Fastify 5 behavior when `host: '0.0.0.0'`). Observed output: `http://127.0.0.1:3000` and `http://192.168.0.71:3000`. The code path binds to `0.0.0.0`; Fastify just expands it for display.
- `curl -sSf http://localhost:3000/healthz` → `{"status":"ok"}`; `curl -i` → `HTTP/1.1 200 OK` + `Content-Type: application/json; charset=utf-8`.
- Fail-fast smoke: ran `server.ts` with `DATABASE_URL=''` — process exits 1 with AJV error `env/DATABASE_URL must NOT have fewer than 1 characters` (satisfies AC2; also covered by unit test 3).
- `git status` — `apps/api/.env` is untracked/ignored; only `apps/api/`, root `package-lock.json`, and the story/sprint-status files are modified.

### Completion Notes List

- Scope held exactly to the story: only env validation + unversioned `/healthz`. No DB layer, no cors/helmet/rate-limit/swagger, no `/v1` prefix, no TypeBox, no global error handler.
- Factory pattern: `buildApp(opts?)` in `src/app.ts` is callable from tests with `data` overrides; `src/server.ts` is the thin runtime entrypoint.
- Logger bootstrapping handled per Dev Notes chicken-and-egg: `buildLoggerConfig()` reads raw `LOG_LEVEL`/`NODE_ENV` from `process.env` (with defaults) before Fastify construction — `@fastify/env` then validates the rest.
- Tests use `app.inject` (no real network) and always `await app.close()` in `afterEach` to release Fastify handles.
- `apps/api/.env` was created **only** for the local smoke test and removed before review; it remains gitignored via the root `.gitignore`.
- `apps/.gitkeep` left in place per the story (will become redundant once `apps/web/` arrives in Story 1.5; pruning it is out of scope here).
- No `vitest.config.ts` needed — zero-config discovery worked cleanly.
- `type: 'number'` in the env schema causes `@fastify/env` v5 (via `env-schema` / AJV) to auto-coerce `PORT=3000` string → number, as expected.

### File List

**Added:**
- `apps/api/package.json`
- `apps/api/tsconfig.json`
- `apps/api/.env.example`
- `apps/api/src/server.ts`
- `apps/api/src/app.ts`
- `apps/api/src/app.test.ts`
- `apps/api/src/config.ts`
- `apps/api/src/routes/health.ts`

**Modified:**
- `package-lock.json` (root — picks up new `@todo-app/api` workspace deps)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (story 1-2 status transitions)

**Intentionally not created** (per Dev Notes scope discipline): `apps/api/.env`, `apps/api/.gitignore`, `apps/api/dist/`, `apps/api/test/`, `apps/api/vitest.config.ts`, `apps/api/src/db/`, `apps/api/src/plugins/`, `apps/api/src/schemas/`, `apps/api/src/errors/`, `apps/api/src/repositories/`.

### Change Log

| Date       | Change                                                                                      |
|------------|---------------------------------------------------------------------------------------------|
| 2026-04-18 | Story 1.2 implemented: `apps/api/` workspace, `@fastify/env` typed config, `GET /healthz` → `{status:'ok'}`, 3 unit tests via `app.inject`. All ACs satisfied; status → review. |
| 2026-04-18 | Code review: 3-layer adversarial review (Blind + Edge + Auditor). 7 patches applied, 9 deferred (logged in `deferred-work.md`), 21 dismissed. Patches: plugin-registration cleanup on failure, `dotenv` gated by `opts.config`, `PORT` range validation (1–65535), `hasRoute` instead of `printRoutes`, exact `content-type` assertion, Debug Log wording, Completion Notes typo fix. Tests remain 3/3 green; tsc clean. Status → done. |
