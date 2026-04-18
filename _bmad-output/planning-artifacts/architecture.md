---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8]
inputDocuments:
  - _bmad-output/planning-artifacts/PRD.md
  - _bmad-output/planning-artifacts/product-brief.md
  - _bmad-output/planning-artifacts/PRD-validation-report.md
workflowType: 'architecture'
project_name: 'todo-app'
user_name: 'Lucian'
date: '2026-04-18'
lastStep: 8
status: 'complete'
completedAt: '2026-04-18'
---

# Architecture Decision Document

_This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together._

## Project Context Analysis

### Requirements Overview

**Functional Requirements (12 FRs):**
FR-001..FR-012 define a single-resource CRUD web app:
- Create, view, complete, delete todos (FR-001..FR-004) — core loop.
- Fixed data model (FR-005): `{id, description ≤500, completed, createdAt, userId (nullable)}`.
- Rendering contracts (FR-006..FR-008): completed styling + WCAG contrast, empty state, loading state.
- Responsive cross-browser access (FR-009) across the declared matrix at viewports ≥320px.
- Inline error + retry with preserved input on any CRUD failure (FR-010).
- Persistence across refresh, browser close, and server restart (FR-011).
- Fixed REST API contract (FR-012): `POST /todos`, `GET /todos`, `PATCH /todos/:id`, `DELETE /todos/:id` with JSON bodies matching FR-005.

**Non-Functional Requirements (7 NFRs):**
- **Performance** (NFR-001, NFR-002): UI p95 ≤100ms, API p95 ≤200ms — test-gated.
- **Durability** (NFR-003): zero loss across three boundaries (refresh, browser close, server restart).
- **Error resilience** (NFR-004): inline error + input preservation under fault injection.
- **Schema future-compat** (NFR-005): nullable `userId` from day one to protect Growth-phase auth addition.
- **Onboarding** (NFR-006): new-engineer clone → run ≤15 minutes via README alone.
- **Accessibility** (NFR-007): WCAG 2.1 AA contrast including completed-todo text at 60% opacity, via axe-core.

**Scale & Complexity:**
- Primary domain: full-stack web app (browser UI + REST API + persistent storage).
- Complexity level: low — single resource, single persona, no auth/multi-tenancy/realtime/compliance in MVP.
- Estimated architectural components: frontend app, backend API (4 endpoints), persistent datastore, build/CI/deploy pipeline.

### Technical Constraints & Dependencies

**Fixed / non-negotiable:**
- **Data contract** (FR-005): five-field todo shape with nullable `userId`. No additional fields in MVP.
- **API contract** (FR-012): the four REST verbs/paths and their status codes (201/200/200/204) are locked.
- **Browser matrix** (Responsive Design section): evergreen Chrome/Firefox/Safari + iOS 15+; IE/legacy Edge unsupported.
- **Minimum viewport**: 320px with no horizontal scroll; 44×44px min tap targets.

**Open to architecture phase:**
- Framework choice (frontend).
- Backend framework / runtime.
- Persistence technology (must satisfy durability across server restart).
- Hosting / deployment target (must satisfy NFR-006 local-run time).

**Process constraints:**
- Solo builder — scope must fit single-person cadence.
- Training project — BMAD artifacts are themselves deliverables; bias toward mainstream, well-documented stack choices.

### Cross-Cutting Concerns Identified

1. **Persistence & durability** — affects datastore choice, server restart behavior, and integration-test design.
2. **Latency budget** — affects framework choice, rendering strategy (SSR vs SPA vs hybrid), DB roundtrip cost, and deployment locality.
3. **Accessibility (WCAG 2.1 AA)** — component library choice, color tokens, focus management (modal), automated axe-core check in CI.
4. **Error handling & retry** — shared client-side pattern across all CRUD calls; inline error component; optional optimistic UI strategy.
5. **Responsive + cross-browser** — CSS approach (system fonts, flex/grid), component testing matrix, visual-diff smoke tests.
6. **Growth-phase schema compatibility** — `userId` nullable everywhere it appears; no hardcoded `"anonymous"` or equivalent.
7. **Developer onboarding time** — dependency choices, README quality, single-command bootstrap, no heavy native build steps.

## Starter Template Evaluation

### Primary Technology Domain

Full-stack web application — split into two apps:
- Client: React (Vite) SPA
- Server: Fastify REST API on Node.js
- Datastore: PostgreSQL (separate process, containerized locally)

### Starter Options Considered

| Option | Summary | Verdict |
|---|---|---|
| **Official `create-vite` + official Fastify TS docs setup** (recommended) | Two first-party starters, wired together in a simple npm workspaces monorepo. Maximum mainstream. | **Selected** — lowest surprise, best fit for NFR-006, solid fit for training goal. |
| `theogravity/fastify-starter-turbo-monorepo` | Turbo + pnpm monorepo, Fastify v5, kysely, Postgres, sample tests, OpenAPI generators. | Rejected — third-party structure, Turbo overhead beyond scope, no React side. |
| `riipandi/fuelstack` | Turborepo + Fastify + Drizzle + Vite React + Next.js + Jest. | Rejected — drags in Next.js, Drizzle, and a one-maintainer opinion stack. |
| `fastify-cli generate` (JS default) + Vite React | Official CLI, but JS-first; TS support is not first-class. | Rejected — TS setup is manual anyway, easier to start from Fastify TS docs directly. |
| Meta-framework (Next.js / Remix / SvelteKit) | Single-server full-stack app. | Out of scope — user elected **React + separate Fastify backend**, not a meta-framework. |

### Selected Starter: official Vite React-TS + official Fastify TypeScript setup, in an npm-workspaces monorepo

**Rationale for Selection:**
- Both halves of the stack are scaffolded from their canonical, first-party starting points — zero third-party template lock-in.
- npm workspaces require no extra dependency or learning beyond Node itself; satisfies NFR-006.
- Keeps the training-project surface area small — every architectural decision beyond the scaffold is ours to make explicitly, which is part of the learning goal.
- Postgres runs via `docker-compose` per user preference — satisfies durability NFRs without committing to a hosted provider prematurely.
- Vite React-TS ships with Vitest-ready config; Fastify has first-class Vitest/Node-test support. Satisfies "defaults are OK for testing".

**Initialization Commands:**

```bash
# Repo root (one-time)
mkdir todo-app && cd todo-app
npm init -y
# Edit package.json to add: "workspaces": ["apps/*"]

# Frontend scaffold (official)
npm create vite@latest apps/web -- --template react-ts

# Backend scaffold (manual per Fastify TS docs)
mkdir -p apps/api && cd apps/api
npm init -y
npm i fastify
npm i -D typescript @types/node tsx
# Configure tsconfig.json + src/server.ts per fastify.dev TypeScript reference

# Postgres via Docker (local dev)
# docker-compose.yml at repo root defining a postgres service
```

**Architectural Decisions Provided by Starter:**

**Language & Runtime:**
- TypeScript across both apps.
- Node.js (LTS) for the API; modern evergreen browsers for the web app.
- ESM throughout (Vite default; Fastify TS docs recommend ESM).

**Styling Solution:**
- **Not decided by starter.** Vite React-TS ships with plain CSS by default. Styling choice (plain CSS vs CSS Modules vs Tailwind vs shadcn/ui) is deferred to a later architectural decision.

**Build Tooling:**
- Vite (web) — fast HMR, optimized prod build, TS via esbuild.
- tsx (api) — zero-config TS execution in dev; production build via `tsc` or bundler TBD in a later decision.

**Testing Framework:**
- Vitest for both apps (defaults; Vite-native on the web side, works standalone on the API).
- `axe-core` for a11y (required by NFR-007 — added in a later decision).

**Code Organization:**
- `apps/web` — Vite default `src/` layout (components under `src/`).
- `apps/api` — minimal `src/` layout; route/plugin structure TBD in a later decision.
- `apps/*` sibling directories under an npm-workspaces root.

**Development Experience:**
- `npm run dev` in each app (Vite dev server on web; `tsx watch` on api).
- Root-level `docker-compose up -d postgres` for local Postgres.
- Hot reload on both sides.

**Note:** Project initialization using this command should be the first implementation story.

## Core Architectural Decisions

### Decision Priority Analysis

**Critical Decisions (Block Implementation):**
- Database engine: PostgreSQL 16
- DB access layer: Kysely
- Migrations: Kysely migrator
- API schema validation: TypeBox (Fastify native)
- Server-state management (web): TanStack Query
- Styling: Tailwind CSS v4 via `@tailwindcss/vite`
- API versioning: `/v1` route prefix (FR-012 amended in PRD v1.2)

**Important Decisions (Shape Architecture):**
- No auth in MVP; nullable `userId` preserved
- CORS, helmet, rate-limit, body-limit, env loading
- OpenAPI docs via `@fastify/swagger` + `swagger-ui`
- Native `fetch` + thin `apiClient` module on the web
- Optimistic UI for complete/delete only; wait-for-id on create
- No routing in MVP (single screen)
- CI: GitHub Actions with Postgres service; axe-core in test step
- Local dev: Docker Compose runs Postgres only; app processes run on host
- Prod deployment: deferred

**Deferred Decisions (Post-MVP):**
- Authentication mechanism (Growth phase) — email link vs SSO vs password
- Caching (none in MVP; revisit if NFR-002 pressures)
- APM / monitoring (request logs sufficient for single-user MVP)
- Component library (revisit if component count grows)
- API version `v2` path (only if contract evolves; `v1` is the boundary)

### Data Architecture

| Decision | Choice | Rationale | Provided by Starter |
|---|---|---|---|
| DB engine | **PostgreSQL 16** (Docker image `postgres:16-alpine`) | Stable, widely supported, matches NFR-006 (official image = fast onboarding). | No |
| DB access layer | **Kysely** (type-safe SQL query builder) | Thin, great TS inference, no client-generation step; right weight for 4 endpoints. | No |
| Migrations | **Kysely's built-in migrator**, migration files under `apps/api/migrations/` | Stays inside the query-builder ecosystem; one fewer tool. | No |
| ID strategy | **UUID v7** generated API-side (via `uuid` lib) | Time-ordered — clean creation-ASC ordering (FR-002) with stable index performance. Matches FR-005 `string/uuid`. | No |
| Schema validation (API boundary) | **TypeBox** schemas driving Fastify's native validator + serializer + static TS types | Single source of truth: schema ⇒ runtime validation + static types + OpenAPI output. | No |
| Caching | **None in MVP** | Single-user load, 4 endpoints, Postgres latency trivial at this scale. | No |

### Authentication & Security

| Decision | Choice | Rationale | Provided by Starter |
|---|---|---|---|
| MVP authentication | **None** — anonymous requests; `userId` written as `null` | Locked by PRD scope; NFR-005 keeps nullable column for Growth-phase auth. | No |
| CORS | **`@fastify/cors`** with allow-list of web-app origins per env | Web and API run on different ports in local dev; required for the browser to call the API. | No |
| Security headers | **`@fastify/helmet`** with defaults | Cheap baseline hardening (CSP, X-Frame-Options, etc.). | No |
| Rate limiting | **`@fastify/rate-limit`** at ~300 req/min/IP | Protects public surface; loose because single-user; wire-up seat for Growth tightening. | No |
| Request body size | **Fastify `bodyLimit: 64 KB`** | Description ≤500 chars; 64 KB is orders above legit traffic, well under attack payloads. | No |
| Secrets handling | **`.env` files loaded via `@fastify/env`**, committed as `.env.example`, live file gitignored | Matches Docker-local dev; `DATABASE_URL`, `PORT`, `CORS_ORIGIN` are the only secrets in MVP. | No |
| Encryption at rest | **Postgres / filesystem defaults** | PRD/brief explicitly accept personal-use privacy posture; no PII, no regulatory regime. | No |
| TLS in transit | **Deferred to deployment decision**; HTTP in local dev | Enforced at hosting layer when prod deployment is chosen. | No |

### API & Communication Patterns

| Decision | Choice | Rationale | Provided by Starter |
|---|---|---|---|
| Schema source of truth | **TypeBox in `apps/api/src/schemas/`** — one source feeding validator, serializer, and OpenAPI | Zero duplication; changes in one place. | No |
| API docs | **`@fastify/swagger` + `@fastify/swagger-ui`** — auto-generated from TypeBox schemas, served at `/docs` | Free docs; supports training-project "process is output" goal. | No |
| Error response shape | **Fastify default** `{ statusCode, error, message }`; global error handler maps Postgres + validation errors to 400/404/409/500 within that envelope | Documented by Swagger; simple client-side render path (FR-010). | No |
| Status codes | **201/200/200/204** for POST/GET/PATCH/DELETE (PRD); **400** validation, **404** missing id, **500** unexpected | Happy path is PRD-locked; this row pins error paths. | No |
| Content negotiation | **JSON only** (`application/json`) | PRD FR-012 locked. | No |
| Web HTTP client | **Native `fetch`** wrapped in a typed `apiClient.ts` — throws on non-2xx, decodes JSON | No extra dep; right weight for 4 endpoints. | No |
| Request correlation | **Fastify default `request.id`** + pino logger with request binding | Free with Fastify. | No |
| API versioning | **`/v1` prefix from day one** — `POST /v1/todos`, `GET /v1/todos`, `PATCH /v1/todos/:id`, `DELETE /v1/todos/:id` | Explicit contract boundary for Growth/Vision. PRD FR-012 amended to match (v1.2). | No |
| Health check | **`GET /healthz`** unversioned, returns `{ status, db }` after `SELECT 1` | Ops concern, not API consumer concern. Docker Compose healthcheck target. | No |

### Frontend Architecture

| Decision | Choice | Rationale | Provided by Starter |
|---|---|---|---|
| Server-state management | **TanStack Query** (React Query) | Purpose-built for REST CRUD: caching, revalidation, optimistic updates, retry — nails FR-008/FR-010. | No |
| Client-state management | **`useState` / `useReducer`** — no Redux/Zustand in MVP | Only transient UI state (input value, modal open); persistent state is server state. | No |
| Routing | **None in MVP** | Single-screen app; avoid react-router until a second screen exists. | No |
| Optimistic updates | **Yes** for complete-toggle (FR-003) and delete (FR-004); **no** for create (needs server-assigned `id`) | Matches Journey 2 "immediately renders"; create requires the real `id` before the row stabilizes. | No |
| Form handling | **Controlled input** — no form library | Single text input; form libraries are overkill. | No |
| Web HTTP module | **`apiClient.ts`** wrapping native `fetch`; typed per endpoint | Reuses TypeBox-derived types; minimal surface. | No |
| Styling | **Tailwind CSS v4** via **`@tailwindcss/vite`**; `@import "tailwindcss";` in entry CSS | Single utility system across the UI; current v4 install path (no `tailwind.config.js` by default). | No |
| Component library | **None** — native HTML + Tailwind utilities | Low component count; revisit shadcn/ui if inventory grows. | No |
| Accessibility primitives | Native HTML (`<input type="checkbox">`, `<dialog>`); **axe-core in Vitest** | NFR-007 / FR-006 verified in CI; native `<dialog>` provides focus trap and Escape-close for free. | No |
| Bundle optimization | Vite defaults (tree-shaking on); no manual code-splitting for single-route app | Measured against NFR-001/SC-003 via Journey 4. | Partial (Vite default) |
| Journey-4 perf | Key-stable list (`key={todo.id}`) + `React.memo` on Todo row | Prevents unnecessary row re-renders during rapid-toggle bursts at ≥50 todos. | No |
| Env vars | **`import.meta.env.VITE_API_URL`** pointing at Fastify origin per env | Vite built-in. | Yes (Vite) |

### Infrastructure & Deployment

| Decision | Choice | Rationale | Provided by Starter |
|---|---|---|---|
| Local dev orchestration | **`docker-compose.yml` at repo root** with `postgres:16-alpine` only; app processes run on host via `npm run dev` in each workspace | Matches Docker-local preference without container rebuilds during dev. NFR-006: `docker compose up -d && npm run dev`. | No |
| Prod deployment target | **Deferred — TBD post-MVP** | PRD/brief don't pin it; flag as open architectural question before first deploy. | No |
| CI | **GitHub Actions** — install → typecheck → lint → test (with axe-core) → build | Ecosystem default; required to enforce NFR-007 in CI. | No |
| CI database | **`services.postgres`** (GitHub-hosted Postgres service container) | Mirrors local Docker Postgres; FR-011/NFR-003 integration tests run against real Postgres. | No |
| Migration command | **`npm run migrate`** in `apps/api` invoking Kysely migrator against `DATABASE_URL` | One command covers local + CI + future prod. Runs pre-test in CI. | No |
| Env files | **`apps/api/.env` + `.env.example`**, **`apps/web/.env` + `.env.example`** — example files committed, live files gitignored | README-driven onboarding (NFR-006). | No |
| Logging | **Fastify's built-in pino logger** — `info` dev, `warn` prod; `pino-pretty` in dev | Free with Fastify; sufficient for Journey-4 perf investigation. | Yes (Fastify) |
| APM / monitoring | **None in MVP** — request logs suffice at single-user scale | Revisit on prod deploy if NFR-002 regresses. | No |
| Health check | **`GET /healthz`** as Docker Compose healthcheck target | Ties API health into compose ops. | No |
| Release / versioning | **Trunk-based on `main`, no tagged releases in MVP** | Solo-builder overhead not repaid yet. | No |
| Pre-commit hooks | **None in MVP** — CI is the quality gate | Keeps onboarding clean (no Husky step). | No |

### Decision Impact Analysis

**Implementation Sequence (drives story ordering):**
1. Repo scaffold: npm workspaces + `create-vite` web app + Fastify TS api + Docker Compose Postgres + `.env.example`s.
2. Postgres schema + initial Kysely migration (`todos` table with `userId` nullable, index on `(completed, createdAt)` for FR-002 ordering).
3. Fastify API skeleton: plugin registration (cors, helmet, rate-limit, env, swagger), TypeBox schemas, four `/v1/todos` routes + `/healthz`, global error handler.
4. Web app skeleton: Tailwind v4 wired via Vite plugin, `apiClient.ts`, TanStack Query provider.
5. UI components in UX-inventory order: Header → Add Todo Input → Todo Row → Todo List → Empty/Loading/Error states → Delete modal.
6. GitHub Actions CI with Postgres service, migrations, Vitest + axe-core.
7. Journey-4 perf validation against NFR-001/NFR-002.

**Cross-Component Dependencies:**
- **TypeBox schemas** are upstream of **Fastify routes**, **OpenAPI docs**, and **web `apiClient` types** — a schema change ripples into all three; therefore schemas live in `apps/api` and get imported (or code-generated into a type package) for the web side.
- **Kysely migrations** are upstream of **integration tests** (FR-011, NFR-003) — CI runs migrations before tests.
- **`/v1` prefix** is wired in one Fastify plugin registration; all routes mount under it — future `/v2` would mount a sibling plugin without touching v1.
- **Optimistic UI + error rollback** is a shared TanStack-Query pattern across complete and delete mutations — extracted as a small mutation-factory helper to avoid drift.
- **axe-core in CI** gates NFR-007 — any new component must be covered by a render-test that runs axe.

## Implementation Patterns & Consistency Rules

### Pattern Categories Defined

**Critical Conflict Points Identified:** 6 areas — DB naming, API naming, code naming, project structure, data/error formats, error & loading handling.

### Naming Patterns

**Database (Postgres / Kysely):**
- Table names: **plural, snake_case** — `todos`. No `tbl_` prefixes.
- Column names: **snake_case** — `id`, `description`, `completed`, `created_at`, `user_id`.
- Primary keys: always named `id`.
- Timestamps: always `created_at`, `updated_at` (TIMESTAMPTZ in UTC). `updated_at` only added when a table needs it — `todos` doesn't need it in MVP.
- Foreign-key columns: `<referent>_id` — e.g., `user_id` (even though `userId` is nullable and unused in MVP, the column name is fixed).
- Indexes: `idx_<table>_<columns>` — e.g., `idx_todos_completed_created_at` for the FR-002 ordering index.
- Kysely TS mapping: use the **Camelcase plugin** so DB `snake_case` maps to TS `camelCase` at query time. No ad-hoc renaming in individual queries.

**API (routes + JSON):**
- Routes: **plural resource, kebab-case not needed** (single word) — `/v1/todos`, `/v1/todos/:id`. `:id` not `{id}` (Fastify convention).
- JSON bodies: **camelCase everywhere** — `{ "id": "...", "description": "...", "completed": false, "createdAt": "...", "userId": null }`. Matches FR-005 and TS types.
- Query params (if any): camelCase (`?includeCompleted=true`).
- Request/response headers: standard names only; no custom `X-*` headers in MVP.

**Code (TypeScript / React):**
- **Components:** `PascalCase`, one component per file, file name matches component name — `TodoRow.tsx`, `DeleteTodoModal.tsx`.
- **Hooks:** `camelCase` starting with `use` — `useTodos.ts`, `useCreateTodo.ts`.
- **Plain modules:** `camelCase` — `apiClient.ts`, `todoSchemas.ts`.
- **Types & interfaces:** `PascalCase` — `Todo`, `CreateTodoInput`. Prefer **type aliases** over interfaces unless extension is needed.
- **Functions & variables:** `camelCase`.
- **Constants:** `SCREAMING_SNAKE_CASE` only for true module-level immutables (e.g., `MAX_DESCRIPTION_LENGTH = 500`).
- **Env vars:** `SCREAMING_SNAKE_CASE` — `DATABASE_URL`, `PORT`, `CORS_ORIGIN`, `VITE_API_URL`.
- **Fastify route handlers:** single-responsibility functions exported from a `routes/` file; registered via `app.register()` per route group.

### Structure Patterns

**Monorepo root:**
```
todo-app/
├── apps/
│   ├── api/
│   └── web/
├── docker-compose.yml
├── package.json          ← workspaces: ["apps/*"]
├── .github/workflows/ci.yml
└── README.md
```

**`apps/api/` layout:**
```
apps/api/
├── src/
│   ├── server.ts             ← entrypoint; builds & starts Fastify
│   ├── app.ts                ← exported Fastify factory (testable)
│   ├── config.ts             ← @fastify/env schema + types
│   ├── db/
│   │   ├── index.ts          ← Kysely instance factory
│   │   ├── schema.ts         ← Kysely DB interface (typed tables)
│   │   └── migrations/       ← Kysely migration files
│   ├── plugins/              ← Fastify plugins (cors, helmet, rate-limit, swagger, error-handler)
│   ├── schemas/              ← TypeBox schemas (Todo, CreateTodoInput, etc.)
│   └── routes/
│       ├── todos.ts          ← all /v1/todos routes
│       └── health.ts
├── test/                     ← integration tests that spin up the app + real Postgres
├── .env.example
├── package.json
└── tsconfig.json
```

**`apps/web/` layout:**
```
apps/web/
├── src/
│   ├── main.tsx              ← entrypoint
│   ├── App.tsx               ← root component
│   ├── api/
│   │   ├── apiClient.ts      ← fetch wrapper
│   │   └── todos.ts          ← typed per-endpoint functions
│   ├── hooks/                ← useTodos, useCreateTodo, useToggleTodo, useDeleteTodo
│   ├── components/           ← TodoList, TodoRow, AddTodoInput, DeleteTodoModal, EmptyState, ErrorBanner, LoadingSkeleton
│   ├── lib/                  ← small utilities
│   ├── styles/
│   │   └── index.css         ← @import "tailwindcss";
│   └── types.ts              ← re-exports of shared schema-derived types
├── test/                     ← axe-core a11y tests + Journey-4 perf harness
├── .env.example
├── package.json
├── tsconfig.json
└── vite.config.ts
```

**Test location:** **Unit tests co-located as `*.test.ts(x)`** next to source (Vitest default). **Integration/a11y/perf tests live in the app's `test/` folder**, because they exercise the whole app or the real DB.

### Format Patterns

**API response envelope:**
- **Success:** the resource shape directly — `{ "id": "...", "description": "...", ... }` for single, `[{...}, {...}]` for collection. **No `{data: ...}` wrapper.**
- **Error:** Fastify default envelope — `{ "statusCode": 404, "error": "Not Found", "message": "Todo 'abc' not found" }`. Global error handler normalizes Postgres errors and TypeBox validation errors into this shape.

**Data exchange:**
- **Dates:** **ISO 8601 strings in UTC** with `Z` suffix — `"2026-04-18T10:30:00.000Z"`. Never epochs. Matches FR-005 `createdAt`.
- **Nulls:** explicit `null` on the wire for absent optional fields — never omit the key. `userId` is always present as `null` in MVP responses.
- **Booleans:** `true`/`false`. Never `1/0`.
- **IDs on the wire:** string (UUID v7 serialized as its canonical hyphenated form).

### Communication Patterns

**TanStack Query conventions:**
- **Query keys:** namespaced tuples — `['todos']` for the list, `['todos', id]` for one todo (prepared for future single-todo fetch). Never ad-hoc strings.
- **Mutation keys:** not strictly required, but for consistency: `['todos', 'create']`, `['todos', 'toggle']`, `['todos', 'delete']`.
- **Invalidation:** every mutation invalidates `['todos']` on settle (success or failure), except optimistic updates that do it only on error rollback.
- **Optimistic update pattern** (shared factory in `hooks/useOptimisticTodoMutation.ts`):
  1. `onMutate`: cancel in-flight queries for `['todos']`, snapshot the previous cache, apply the optimistic change.
  2. `onError`: restore the snapshot + surface inline error.
  3. `onSettled`: invalidate `['todos']`.
- **Errors from the API** reach components as typed `ApiError` objects carrying `statusCode` + `message`. Never raw `Response` objects.

**React state discipline:**
- **Immutable updates only.** No `Array.prototype.sort()` / `.push()` / `.splice()` on state; always build new arrays.
- **Derived state is `useMemo`'d** only when profiling shows it matters. Don't preemptively memoize primitives.

### Process Patterns

**Error handling:**
- **API side:**
  - All routes `throw` on failure — never manually `reply.code(500).send(...)`.
  - A single global error handler (registered in `plugins/error-handler.ts`) maps:
    - TypeBox/Fastify validation errors → `400`
    - Postgres constraint errors (23xxx codes) → `409` with a safe message
    - Not-found errors (thrown as `NotFoundError`) → `404`
    - Everything else → `500` with a generic message; full error logged via pino.
  - Never leak Postgres error text or stack traces to the client in prod.
- **Web side:**
  - A top-level **`<ErrorBoundary>`** catches render errors and renders a generic failure screen.
  - CRUD errors are **inline at the failure site** (FR-010) via a shared `<InlineError>` component with a `Retry` button.
  - Network-level failures surface the same copy as server 5xx: "Couldn't save. Check your connection." (PRD copy commitment).

**Loading states:**
- **Initial fetch** uses the skeleton loading component (FR-008), driven by TanStack Query's `isPending` on the list query.
- **In-flight mutations** set per-row/per-button `disabled` states by keying off the mutation's `isPending`. No global spinner.
- **Empty-state check** runs *after* the initial fetch resolves with zero items, never during `isPending` (prevents the flash-of-empty-state FR-008 forbids).

### Enforcement Guidelines

**All agents writing code against this architecture MUST:**
1. Use **camelCase on the wire and in TS, snake_case in Postgres**, bridged by the Kysely Camelcase plugin. Never add ad-hoc field renaming.
2. Define API request/response shapes as **TypeBox schemas in `apps/api/src/schemas/`**, never inline in routes.
3. Never invent new error envelopes — use the Fastify default `{ statusCode, error, message }`.
4. Co-locate **unit tests as `*.test.ts(x)`**; keep **integration/a11y tests under `test/`**.
5. Use **TanStack Query for all server-state**; never store fetched data in component `useState`.
6. Use **UUID v7** for new todo IDs (API-generated); never let clients mint IDs.
7. Include **axe-core render test** for every new web component introduced.
8. Keep **`userId` nullable end-to-end** and default to `null` on writes in MVP — no `"anonymous"` placeholder strings.

**Pattern enforcement in CI:**
- ESLint + `@typescript-eslint` with a strict config fails the build on naming/structural violations it can catch.
- Contract tests (`test/contract.*.test.ts`) assert the API envelope + status codes on every route.
- axe-core tests run inside Vitest; a failure fails CI.
- Kysely type inference + TypeScript `strict` catch schema/TS drift at compile time.

### Pattern Examples

**Good — API route with TypeBox schema:**
```ts
// apps/api/src/schemas/todo.ts
import { Type, Static } from '@sinclair/typebox'
export const Todo = Type.Object({
  id: Type.String({ format: 'uuid' }),
  description: Type.String({ minLength: 1, maxLength: 500 }),
  completed: Type.Boolean(),
  createdAt: Type.String({ format: 'date-time' }),
  userId: Type.Union([Type.String(), Type.Null()]),
})
export type Todo = Static<typeof Todo>

// apps/api/src/routes/todos.ts
fastify.post('/v1/todos', { schema: { body: CreateTodoInput, response: { 201: Todo } } }, handler)
```

**Good — TanStack Query hook with shared optimistic pattern:**
```ts
// apps/web/src/hooks/useToggleTodo.ts
export const useToggleTodo = () =>
  useMutation({
    mutationKey: ['todos', 'toggle'],
    mutationFn: (input: { id: string; completed: boolean }) => api.todos.update(input),
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: ['todos'] })
      const previous = queryClient.getQueryData<Todo[]>(['todos'])
      queryClient.setQueryData<Todo[]>(['todos'], (prev) =>
        prev?.map((t) => (t.id === input.id ? { ...t, completed: input.completed } : t)))
      return { previous }
    },
    onError: (_e, _i, ctx) => ctx?.previous && queryClient.setQueryData(['todos'], ctx.previous),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['todos'] }),
  })
```

**Anti-patterns — do NOT:**
- ❌ Hand-craft SQL strings in routes (use Kysely).
- ❌ Rename a JSON field on its way through a route.
- ❌ Swallow a Postgres error and return `200`.
- ❌ Store todos in `useState` + manual `fetch` inside a component.
- ❌ Add a `"anonymous"` literal for `userId`.
- ❌ Introduce a new `{ data, error }` wrapper on an endpoint.
- ❌ Add a new Tailwind utility directive or a CSS-in-JS library alongside Tailwind.
- ❌ Add a wrapper HTTP client (`axios`, `ky`) that duplicates `apiClient.ts`.

## Project Structure & Boundaries

### Complete Project Directory Structure

```
todo-app/
├── README.md                         ← NFR-006 onboarding guide
├── package.json                      ← npm workspaces root
├── package-lock.json
├── tsconfig.base.json                ← shared TS strict config
├── docker-compose.yml                ← postgres:16-alpine service
├── .gitignore
├── .editorconfig
├── .github/
│   └── workflows/
│       └── ci.yml                    ← install → migrate → typecheck → lint → test (+axe) → build
├── _bmad-output/                     ← BMad artifacts (brief, PRD, architecture)
│   └── planning-artifacts/
│
├── apps/
│   ├── api/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── .env.example              ← DATABASE_URL, PORT, CORS_ORIGIN, LOG_LEVEL, NODE_ENV
│   │   ├── .env                      ← gitignored
│   │   ├── src/
│   │   │   ├── server.ts             ← entrypoint: load config → build app → listen
│   │   │   ├── app.ts                ← Fastify factory (exported for tests)
│   │   │   ├── config.ts             ← @fastify/env schema + typed config
│   │   │   ├── db/
│   │   │   │   ├── index.ts          ← Kysely instance factory (PostgresDialect + CamelCasePlugin)
│   │   │   │   ├── schema.ts         ← Kysely `Database` interface (typed tables)
│   │   │   │   └── migrations/
│   │   │   │       └── 20260418_001_create_todos.ts
│   │   │   ├── plugins/
│   │   │   │   ├── cors.ts
│   │   │   │   ├── helmet.ts
│   │   │   │   ├── rate-limit.ts
│   │   │   │   ├── swagger.ts        ← @fastify/swagger + swagger-ui at /docs
│   │   │   │   ├── env.ts
│   │   │   │   └── error-handler.ts  ← maps validation + Postgres + NotFoundError → envelope
│   │   │   ├── schemas/
│   │   │   │   ├── todo.ts           ← TypeBox: Todo, CreateTodoInput, UpdateTodoInput
│   │   │   │   └── errors.ts         ← TypeBox: ErrorResponse (Fastify default envelope)
│   │   │   ├── errors/
│   │   │   │   └── index.ts          ← NotFoundError, ValidationError classes
│   │   │   ├── repositories/
│   │   │   │   └── todosRepo.ts      ← Kysely queries (listAll, create, update, delete, findById)
│   │   │   └── routes/
│   │   │       ├── todos.ts          ← POST/GET/PATCH/DELETE /v1/todos
│   │   │       └── health.ts         ← GET /healthz
│   │   └── test/
│   │       ├── setup.ts              ← spins up app + runs migrations against a test DB
│   │       ├── contract.todos.test.ts              ← FR-012 shapes + status codes
│   │       ├── integration.persistence.test.ts    ← FR-011 / NFR-003: survives restart
│   │       ├── integration.errors.test.ts         ← FR-010 / NFR-004: error paths
│   │       └── health.test.ts
│   │
│   └── web/
│       ├── package.json
│       ├── tsconfig.json
│       ├── tsconfig.node.json
│       ├── vite.config.ts            ← @tailwindcss/vite + react plugins
│       ├── index.html
│       ├── .env.example              ← VITE_API_URL
│       ├── .env                      ← gitignored
│       ├── src/
│       │   ├── main.tsx              ← QueryClientProvider + ErrorBoundary + <App/>
│       │   ├── App.tsx               ← Header + list-or-empty + AddTodoInput + modal mount
│       │   ├── api/
│       │   │   ├── apiClient.ts      ← fetch wrapper; throws ApiError on non-2xx
│       │   │   ├── todos.ts          ← typed endpoint functions
│       │   │   └── errors.ts         ← ApiError class + helpers
│       │   ├── hooks/
│       │   │   ├── useTodos.ts                    ← FR-002 list query
│       │   │   ├── useCreateTodo.ts               ← FR-001 mutation (non-optimistic)
│       │   │   ├── useToggleTodo.ts               ← FR-003 optimistic mutation
│       │   │   ├── useDeleteTodo.ts               ← FR-004 optimistic mutation
│       │   │   └── useOptimisticTodoMutation.ts   ← shared optimistic factory
│       │   ├── components/
│       │   │   ├── Header.tsx
│       │   │   ├── AddTodoInput.tsx               ← FR-001
│       │   │   ├── TodoList.tsx                   ← FR-002 ordering + sectioning
│       │   │   ├── TodoRow.tsx                    ← FR-003 / FR-006 completed styling
│       │   │   ├── DeleteTodoModal.tsx            ← FR-004 confirmation (native <dialog>)
│       │   │   ├── EmptyState.tsx                 ← FR-007
│       │   │   ├── LoadingSkeleton.tsx            ← FR-008
│       │   │   ├── InlineError.tsx                ← FR-010 / NFR-004
│       │   │   └── ErrorBoundary.tsx              ← catches render errors
│       │   ├── lib/
│       │   │   └── constants.ts                   ← MAX_DESCRIPTION_LENGTH = 500
│       │   ├── styles/
│       │   │   └── index.css                      ← @import "tailwindcss";
│       │   └── types.ts                           ← re-export Todo type derived from API schema
│       └── test/
│           ├── setup.ts                           ← Vitest + jsdom + axe
│           ├── a11y/
│           │   ├── TodoList.a11y.test.tsx         ← NFR-007 / FR-006
│           │   ├── AddTodoInput.a11y.test.tsx
│           │   └── DeleteTodoModal.a11y.test.tsx
│           └── perf/
│               └── journey4.perf.test.tsx        ← Journey 4 / NFR-001 behavior
```

### Architectural Boundaries

**API Boundaries:**
- **Public surface:** HTTP on `PORT` (default 3000). Exposed routes: `/v1/todos`, `/v1/todos/:id` (four verbs), `/healthz`, `/docs` (Swagger UI).
- **Internal service boundary:** `routes/*` → `repositories/todosRepo.ts` → `db/index.ts` (Kysely). Routes must not import Kysely directly; they only call repository functions.
- **Auth boundary:** none in MVP; the CORS allow-list is the only gate. `userId` is always written as `null`. Growth-phase auth plugs in at a new `plugins/auth.ts` and route preHandlers.
- **Data-access boundary:** all DB reads/writes go through `repositories/todosRepo.ts`. Routes never build queries inline.

**Component Boundaries (web):**
- **`App.tsx`** owns page layout + modal mount state (the only UI state that crosses component boundaries).
- **`TodoList`** is purely presentational — receives `Todo[]` via props; never fetches.
- **Data-fetching components** = hooks layer only. No component calls `fetch` directly.
- **Hooks layer** is the only caller of `api/todos.ts`.
- **`api/todos.ts`** is the only caller of `apiClient.ts`.
- **`ErrorBoundary`** wraps `<App/>` in `main.tsx` — catches all render errors; surfaces generic failure UI; does NOT participate in CRUD error flow (those are inline via `InlineError`).

**Data Boundaries:**
- **Schema source of truth:** `apps/api/src/schemas/todo.ts` (TypeBox). This drives:
  - Fastify runtime validation and serialization.
  - OpenAPI output served at `/docs`.
  - Static TS types imported into routes, repositories, and re-exported to `apps/web/src/types.ts`.
- **DB schema source of truth:** `apps/api/src/db/migrations/*`. The Kysely `Database` interface in `db/schema.ts` is written by hand to match and is enforced at compile time — a migration without a schema update fails typecheck.
- **No shared package** in MVP; `apps/web` imports types from `apps/api` via a relative or workspace path (both are TypeScript sources in the same repo). If this coupling starts to bite, extract a `packages/shared-types/` later.

### Requirements-to-Structure Mapping

**Functional Requirements:**

| FR | Primary file(s) | Supporting tests |
|---|---|---|
| FR-001 Create | `routes/todos.ts` (POST) · `components/AddTodoInput.tsx` · `hooks/useCreateTodo.ts` · `schemas/todo.ts` (CreateTodoInput) | `contract.todos.test.ts` · component test next to `AddTodoInput.tsx` |
| FR-002 List + ordering | `routes/todos.ts` (GET) · `repositories/todosRepo.ts::listAll` · `components/TodoList.tsx` · `hooks/useTodos.ts` | `contract.todos.test.ts` |
| FR-003 Complete toggle | `routes/todos.ts` (PATCH) · `components/TodoRow.tsx` · `hooks/useToggleTodo.ts` · `hooks/useOptimisticTodoMutation.ts` | contract + `a11y/TodoList.a11y.test.tsx` |
| FR-004 Delete + confirm modal | `routes/todos.ts` (DELETE) · `components/DeleteTodoModal.tsx` · `hooks/useDeleteTodo.ts` | contract + `a11y/DeleteTodoModal.a11y.test.tsx` |
| FR-005 Data model | `schemas/todo.ts` · `db/schema.ts` · `db/migrations/20260418_001_create_todos.ts` | `contract.todos.test.ts` · `integration.persistence.test.ts` |
| FR-006 Completed styling + contrast | `components/TodoRow.tsx` (Tailwind classes) | `a11y/TodoList.a11y.test.tsx` |
| FR-007 Empty state | `components/EmptyState.tsx` · render logic in `App.tsx` | unit test |
| FR-008 Loading state | `components/LoadingSkeleton.tsx` · render logic in `App.tsx` | unit test |
| FR-009 Responsive + matrix | Tailwind breakpoints throughout `components/*` | Journey-4 perf harness renders at 320px in the perf test env |
| FR-010 Inline error + retry | `components/InlineError.tsx` + mutation `onError` callbacks in hooks | `integration.errors.test.ts` (API) + component test (web) |
| FR-011 Persistence | `db/migrations/*` · `repositories/todosRepo.ts` · `docker-compose.yml` | `integration.persistence.test.ts` |
| FR-012 REST API with `/v1` | `routes/todos.ts` · `plugins/swagger.ts` route prefix | `contract.todos.test.ts` |

**Non-Functional Requirements:**

| NFR | Location / mechanism | Verification |
|---|---|---|
| NFR-001 UI p95 ≤100ms | React.memo on `TodoRow` + key-stable list + Tailwind-only styling | `test/perf/journey4.perf.test.tsx` measures interaction timings |
| NFR-002 API p95 ≤200ms | Fastify default performance + Postgres local/CI | request-log aggregation in `test/perf/journey4.perf.test.tsx` or pino logs |
| NFR-003 Durability | Postgres + migrations + `docker-compose.yml` persistent volume | `integration.persistence.test.ts` restarts server between read/write |
| NFR-004 Error resilience | `plugins/error-handler.ts` + `components/InlineError.tsx` | `integration.errors.test.ts` |
| NFR-005 Nullable `userId` | `schemas/todo.ts` + `db/schema.ts` + initial migration | `contract.todos.test.ts` asserts null round-trip |
| NFR-006 Onboarding ≤15 min | `README.md` + `docker-compose.yml` + `.env.example` files + root `npm run dev` script | manual onboarding trial |
| NFR-007 WCAG 2.1 AA | Native HTML + Tailwind contrast utilities + axe-core in CI | `test/a11y/*.a11y.test.tsx` |

**Cross-Cutting Concerns:**

| Concern | Location |
|---|---|
| CORS / helmet / rate-limit / body-limit | `apps/api/src/plugins/*.ts` (registered in `app.ts`) |
| Environment loading | `apps/api/src/plugins/env.ts` → typed `config` object |
| Logging | Fastify pino defaults; `NODE_ENV=development` enables `pino-pretty` |
| Error envelope | `apps/api/src/plugins/error-handler.ts` |
| Query client + cache | `apps/web/src/main.tsx` (single `QueryClient` instance) |
| Shared types | `apps/web/src/types.ts` re-exports from `apps/api/src/schemas/todo.ts` |

### Integration Points

**Internal communication:**
- **Web → API:** HTTP JSON over `fetch`, through `apiClient.ts`. CORS-allowed origin in dev/prod config.
- **API → DB:** Kysely pool (one per process) over the standard Postgres wire protocol; connection string from `DATABASE_URL`.
- **Hooks → API layer:** function calls; mutation factories own all TanStack Query wiring.

**External integrations:** None in MVP.

**Data flow (create → read example):**
1. User submits `AddTodoInput` → `useCreateTodo.mutate({ description })`.
2. Hook calls `api.todos.create(description)` → `apiClient.post('/v1/todos', ...)` → Fastify route.
3. Route TypeBox-validates body → calls `todosRepo.create({ description, userId: null })`.
4. Repo builds Kysely insert with UUID v7 + `created_at = now()` → returns the inserted row.
5. Route responds `201` with the serialized `Todo`.
6. Hook's `onSuccess` invalidates `['todos']` → `useTodos` refetches → `TodoList` re-renders with the new row.

### File Organization Patterns

**Configuration:**
- Shared TS config: `tsconfig.base.json` at root; each app extends it.
- Per-app env: `.env.example` committed, `.env` gitignored; loaded via `@fastify/env` (api) or `import.meta.env` (web).
- CI config: `.github/workflows/ci.yml` only.

**Source organization:**
- API uses **layered architecture** (`routes → repositories → db`); web uses **flat feature-light structure** (`components/`, `hooks/`, `api/`) because the app has one screen and one domain.

**Test organization:**
- **Unit:** `*.test.ts(x)` co-located with the module under test.
- **Integration / contract (api):** `apps/api/test/*.test.ts`.
- **Accessibility (web):** `apps/web/test/a11y/*.a11y.test.tsx`.
- **Performance (web):** `apps/web/test/perf/journey4.perf.test.tsx`.

**Asset organization:**
- No images/fonts in MVP beyond a single empty-state illustration, which lives in `apps/web/src/assets/` if introduced. Fonts use system defaults.

### Development Workflow Integration

**Development:**
1. Clone → `npm install` at root.
2. `cp apps/api/.env.example apps/api/.env` + same for `web`.
3. `docker compose up -d postgres`.
4. `npm run migrate --workspace apps/api`.
5. In two terminals: `npm run dev --workspace apps/api` and `npm run dev --workspace apps/web`.
6. Web at `http://localhost:5173`, API at `http://localhost:3000`, docs at `http://localhost:3000/docs`.

**Build:**
- Web: `npm run build --workspace apps/web` → static assets in `apps/web/dist/`.
- API: `npm run build --workspace apps/api` → compiled JS in `apps/api/dist/`; run with `node dist/server.js`.

**Deployment (post-MVP, deferred):** web `dist/` served as static; API runs as a Node process; Postgres via managed service or container. Exact target TBD.

## Architecture Validation Results

### Coherence Validation ✅

**Decision Compatibility:**
- TypeScript 5 + React 19 + Vite 7 + Tailwind v4 (via `@tailwindcss/vite`) — all current, officially interoperable.
- Fastify 5 + TypeBox + `@fastify/swagger` + `@fastify/env` + `@fastify/cors`/`helmet`/`rate-limit` — all first-party plugins; Fastify 5 line is the active release line.
- Kysely + `pg` driver + Postgres 16 — Kysely's `PostgresDialect` is the canonical install; no incompatibilities.
- TanStack Query + React 19 — TanStack Query v5 has first-class TS + concurrent-React support.
- npm workspaces is a Node-core feature, requires no additional tool.
- No version conflicts identified.

**Pattern Consistency:**
- camelCase-on-the-wire + snake_case-in-DB is bridged by Kysely's CamelCasePlugin — naming patterns do not contradict the chosen stack.
- Layered API (`routes → repositories → db`) is a good fit for Fastify + Kysely and does not fight the framework.
- Flat web structure (`components/ + hooks/ + api/`) matches the single-screen scope; no conflict with React 19 / Vite.
- Test location rules (co-located unit, `test/` folder integration/a11y/perf) is Vitest-idiomatic.
- TanStack Query conventions (query-key tuples, invalidate-on-settle, optimistic factory) are consistent with the library's official guidance.

**Structure Alignment:**
- Every pattern rule has a home directory (schemas live in `schemas/`, error handler in `plugins/`, optimistic factory in `hooks/`).
- Boundaries (`routes` → `repositories` → `db`) match the folder structure 1:1.
- The fixed schema source-of-truth (`apps/api/src/schemas/todo.ts`) is the only bridge between API and web types, and its location is explicit.

### Requirements Coverage Validation ✅

**Functional Requirements (12/12 covered):**
- FR-001 through FR-012 each have a dedicated cell in the Requirements-to-Structure table. No FR has an unmapped primary file or unmapped test.

**Non-Functional Requirements (7/7 covered):**
- NFR-001..NFR-007 each have a location/mechanism and a verification path.
- NFR-001 & NFR-002 (latency) are anchored to Journey 4 + the perf test harness at `apps/web/test/perf/journey4.perf.test.tsx`.
- NFR-003 (durability) is anchored to `integration.persistence.test.ts` running against Docker Postgres locally and Postgres service in CI.
- NFR-005 (nullable `userId`) is pinned into the schema at three layers (TypeBox, Kysely `Database` interface, migration).
- NFR-007 (a11y) is enforced in CI via axe-core.

**User Journeys (4/4 covered):**
- J1 first-time create: covered by FR-001, FR-002, FR-007, FR-008 and their component set.
- J2 returning user management: covered by FR-002..FR-004 and optimistic-mutation hooks.
- J3 error recovery: covered by `plugins/error-handler.ts` + `InlineError.tsx` + `integration.errors.test.ts`.
- J4 performance under sustained use: covered by `React.memo(TodoRow)` + key-stable list + `journey4.perf.test.tsx`.

**SCs (4/4 traceable):**
- SC-001 (≤60 s first-use) → Journey 1 components + empty-state copy per PRD; testable via onboarding trial (not automated, but architecturally supported).
- SC-002 (persistence) → integration.persistence.test.ts.
- SC-003 (UI p95 ≤100ms, API p95 ≤200ms) → Journey 4 perf harness.
- SC-004 (responsive matrix) → Tailwind breakpoints + manual cross-browser smoke + axe-color-contrast step in CI.

### Implementation Readiness Validation ✅

**Decision Completeness:**
- All critical decisions have explicit choices and rationales: DB, access layer, validation, state management, styling, versioning.
- Versions verified via web search where relevant (Vite React-TS template, Tailwind v4 plugin path, Fastify TS reference).
- Deferred decisions (prod deployment, APM, caching, auth, component library) are listed explicitly so no agent mistakes them for undefined.

**Structure Completeness:**
- Directory tree names every file needed to implement the 12 FRs and 7 NFRs.
- Boundaries (routes/repo/db; hooks/api/apiClient; ErrorBoundary vs InlineError) are stated as rules, not suggestions.
- Integration points (web↔api via fetch, api↔db via Kysely) have named modules.

**Pattern Completeness:**
- Naming conventions cover DB, API, and TS/React.
- Communication patterns pin query keys, invalidation, optimistic-update order of operations.
- Process patterns define API error mapping, web error surfaces, and loading-state timing.
- Pattern examples include a full TypeBox schema + route + optimistic mutation.

### Gap Analysis Results

**Critical gaps:** none — architecture is implementation-ready.

**Important gaps:**

1. **`MAX_DESCRIPTION_LENGTH` duplication.** The 500-char limit exists in both `apps/api/src/schemas/todo.ts` (TypeBox `maxLength: 500`) and `apps/web/src/lib/constants.ts` (for UX feedback on the input). The API schema is the authority; the web constant is a derived mirror. **Resolution:** the web constant file must declare the schema is the source of truth in a one-line comment, or (future-work) the constant can be derived by importing the TypeBox schema directly. Flagged as a known duplication.
2. **ESLint/Prettier config is not pinned.** Vite's React-TS template ships with a default ESLint config; we haven't committed to extending it with any specific rule set (e.g., `eslint-plugin-react-hooks`, import sorting). **Resolution:** treat the Vite default + `@typescript-eslint/recommended` as the baseline; add more strict rules only if they earn their keep. No action blocking MVP.
3. **Journey-4 test fixture strategy.** The perf harness needs ≥50 seeded todos. We haven't specified whether seeding happens via direct DB insert, via API calls, or via a dedicated seed script. **Resolution:** recommend a `test/fixtures/seed50.ts` helper that inserts directly via `todosRepo` (fastest, deterministic). Low priority until the test is written.
4. **Postgres volume persistence in `docker-compose.yml`.** We haven't explicitly required a named volume for Postgres data, which matters for NFR-003's "survives server restart" — if the compose file is implicitly using a removed container, data is lost. **Resolution:** the compose file MUST define a named volume (e.g., `pg-data`) mounted at `/var/lib/postgresql/data` and it must not be declared as `tmpfs`. Called out here as a binding constraint for the first story.

**Nice-to-have gaps:**

1. **OpenAPI client generation for the web side.** `@fastify/swagger` produces an OpenAPI JSON; we could generate `apps/web/src/api/` types from it instead of re-exporting from `apps/api`. Out of scope for MVP — import path is acceptable.
2. **Pre-commit hook.** Intentionally skipped (see Category 5). Could add Husky+lint-staged later.
3. **Production deployment target.** Deferred by design. Re-open as an architectural question before first deploy.
4. **Logging ship target in prod.** pino stdout is fine for MVP; a prod log-aggregation decision is Deployment-phase work.

### Validation Issues Addressed

- **Inline PRD amendment (v1.2)** was issued during Step 4 to align FR-012 with the new `/v1` prefix — already resolved.
- **Important gaps 1–4** above are documented but require no change to this architecture doc; they become first-story constraints and a code comment.

### Architecture Completeness Checklist

**✅ Requirements Analysis**
- [x] Project context thoroughly analyzed
- [x] Scale and complexity assessed (low)
- [x] Technical constraints identified (data/API contract locks + NFR gates)
- [x] Cross-cutting concerns mapped (7 concerns named in Step 2)

**✅ Architectural Decisions**
- [x] Critical decisions documented with versions
- [x] Technology stack fully specified
- [x] Integration patterns defined
- [x] Performance considerations addressed (memoized list + perf harness)

**✅ Implementation Patterns**
- [x] Naming conventions established (DB / API / code)
- [x] Structure patterns defined (monorepo + two-app layouts)
- [x] Communication patterns specified (TanStack Query + optimistic factory)
- [x] Process patterns documented (error handling, loading states)

**✅ Project Structure**
- [x] Complete directory structure defined
- [x] Component boundaries established
- [x] Integration points mapped
- [x] Requirements-to-structure mapping complete (12 FR rows + 7 NFR rows)

### Architecture Readiness Assessment

**Overall Status:** **READY FOR IMPLEMENTATION**

**Confidence Level:** **High** — every FR/NFR has a home, every decision has an explicit chosen value + rationale, and the four gaps identified are either cosmetic (ESLint) or become first-story constraints (volume, seed strategy, length-constant comment).

**Key Strengths:**
- PRD contract is intact: fixed data model and API verbs are respected; only the `/v1` prefix amendment was needed, and that was reflected back into the PRD.
- Schema source-of-truth is singular (TypeBox), avoiding the common "three definitions of Todo" drift.
- Optimistic-update and error-handling patterns are pre-written, so UI story execution can be near-mechanical.
- NFR enforcement is automated (axe-core in CI, integration tests in CI, TS strict at compile time).
- Mainstream stack serves NFR-006 (15-min onboarding) and the training-project goal.

**Areas for Future Enhancement:**
- Extract a `packages/shared-types/` if the cross-app type import path becomes painful.
- Swap to OpenAPI-generated web types if API evolution starts drifting.
- Add pre-commit hooks (Husky + lint-staged) once the baseline CI is green.
- Re-open prod deployment as its own architectural decision before first deploy.
- Introduce a component library (shadcn/ui) only if component count materially grows.

### Implementation Handoff

**AI Agent Guidelines:**
- Follow all architectural decisions exactly as documented in the Core Architectural Decisions section.
- Apply the Enforcement Guidelines (8 MUST rules) without exception.
- Respect the layered boundaries (`routes → repositories → db`; `components → hooks → api → apiClient`).
- Add new TypeBox schemas to `apps/api/src/schemas/`, never inline in a route.
- Add an axe-core render test for every new web component.
- Do not introduce new wrappers, envelopes, or libraries that duplicate an existing decision.

**First Implementation Priority:**
Scaffold the repo per the Step 3 initialization commands + Step 6 directory tree, plus:
- Named `pg-data` volume in `docker-compose.yml` (NFR-003 binding constraint).
- `MAX_DESCRIPTION_LENGTH` comment in `apps/web/src/lib/constants.ts` identifying the TypeBox schema as source of truth.
