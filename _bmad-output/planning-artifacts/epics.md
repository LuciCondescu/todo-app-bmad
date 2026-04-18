---
stepsCompleted: ['step-01-validate-prerequisites', 'step-02-design-epics', 'step-03-create-stories', 'step-04-final-validation']
status: 'complete'
completedAt: '2026-04-18'
inputDocuments:
  - _bmad-output/planning-artifacts/PRD.md
  - _bmad-output/planning-artifacts/architecture.md
  - _bmad-output/planning-artifacts/ux-design-specification.md
workflowType: 'epics-and-stories'
project_name: 'todo-app'
user_name: 'Lucian'
date: '2026-04-18'
---

# todo-app - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for todo-app, decomposing the requirements from the PRD, UX Design if it exists, and Architecture requirements into implementable stories.

## Requirements Inventory

### Functional Requirements

FR-001: Users can create a todo by entering a description (≤500 chars) and submitting via Enter or the "Add" button. Input rejects empty/whitespace-only submissions; description is trimmed; new todo appended to active list; input clears and re-focuses.
FR-002: Users can view the full todo list on load, with active items first (creation ASC) and completed items last (creation ASC). List renders on successful list fetch; ordering verified by automated test.
FR-003: Users can mark a todo complete by clicking its checkbox. Todo immediately renders with strike-through + 60% opacity; completion persists across reload; todo relocates to the completed section.
FR-004: Users can delete a todo via a row-level delete icon, gated by a modal confirmation. Modal copy: "Delete this todo? This cannot be undone." Cancel dismisses with no change. Delete removes the todo and persists. Hard delete — no soft-delete semantics in MVP.
FR-005: Users' todos are stored under a stable record shape — `id` (string/uuid), `description` (string ≤500 chars), `completed` (boolean), `createdAt` (ISO 8601 timestamp), `userId` (nullable string, reserved for Growth) — with no additional fields in MVP.
FR-006: Users see completed todos rendered with strike-through text, 60% opacity, and a checked checkbox icon, with text maintaining WCAG 2.1 AA contrast (≥4.5:1) against background at 60% opacity.
FR-007: Users see an empty state when the todo list is empty — illustration, copy "No todos yet. Add one below.", and a visible text input.
FR-008: Users see a loading state during the initial todo fetch — skeleton placeholder or spinner visible within 16ms of mount. No flash of empty state while fetch is pending.
FR-009: Users can access the app across the declared browser/device matrix (Chrome/Firefox/Safari evergreen + iOS 15+) with correct rendering at every supported viewport (≥320px, zero horizontal scroll).
FR-010: Users see an inline error at the point of failure for any failed CRUD action, with a Retry button and no loss of in-progress input.
FR-011: Users' todos persist across page refresh, browser close, and server restart.
FR-012: Users can perform CRUD on todos via `POST /v1/todos`, `GET /v1/todos`, `PATCH /v1/todos/:id`, `DELETE /v1/todos/:id` with JSON request/response bodies matching the FR-005 schema. The `/v1` prefix is the explicit API-version contract boundary. Status codes: 201, 200, 200, 204.

### NonFunctional Requirements

NFR-001: UI interaction response time p95 ≤100ms under single-user load, measured via Chrome DevTools Performance panel across create, complete, and delete actions.
NFR-002: API response time p95 ≤200ms for all four endpoints (FR-012) under single-user load, measured via APM or request-log aggregation over ≥100 requests per endpoint.
NFR-003: Data durability — zero todo loss across page refresh, browser close, and server restart. Verified by automated integration test.
NFR-004: On network or server error during any CRUD action, the app renders an inline error (FR-010) and preserves user input. Verified by fault-injection test (offline mode; simulated 5xx).
NFR-005: The data model carries a nullable `userId` field from MVP to enable the Growth-phase authentication addition without a schema migration. Verified by FR-005 contract test.
NFR-006: A new engineer can clone the repository, install dependencies, and run the app locally by following the README alone in ≤15 minutes.
NFR-007: All text elements meet WCAG 2.1 AA contrast (≥4.5:1 for normal text, ≥3:1 for large text), including completed-todo text at 60% opacity. Verified by axe-core in CI.

### Additional Requirements

Architecture-driven technical requirements that shape epic/story structure:

- **Starter template (Epic 1 Story 1):** Official Vite React-TS scaffold for `apps/web` + manual Fastify TypeScript setup for `apps/api`, wired as an npm-workspaces monorepo. Root `package.json` declares `"workspaces": ["apps/*"]`.
- **Local dev orchestration:** `docker-compose.yml` at repo root with `postgres:16-alpine` only (app processes run on host). Must declare a named `pg-data` volume mounted at `/var/lib/postgresql/data` (binding constraint for NFR-003). Must include a healthcheck.
- **Database & access layer:** PostgreSQL 16; Kysely (type-safe query builder) with PostgresDialect + CamelCasePlugin; Kysely migrator for schema versioning (migrations under `apps/api/src/db/migrations/`).
- **DB schema:** `todos` table with columns `id (uuid pk)`, `description (text, max 500)`, `completed (boolean)`, `created_at (timestamptz)`, `user_id (nullable text)` + index `idx_todos_completed_created_at` for FR-002 ordering.
- **API schema validation:** TypeBox schemas in `apps/api/src/schemas/` as the single source of truth driving Fastify validator, serializer, OpenAPI docs, and web-side TS types.
- **API plugins (registered in `app.ts`):** `@fastify/cors` (allow-list per env), `@fastify/helmet` (defaults), `@fastify/rate-limit` (~300 req/min/IP), `@fastify/env` (typed config: `DATABASE_URL`, `PORT`, `CORS_ORIGIN`, `LOG_LEVEL`, `NODE_ENV`), `@fastify/swagger` + `@fastify/swagger-ui` at `/docs`, bodyLimit 64 KB, global error-handler plugin mapping TypeBox/Postgres/NotFoundError → 400/409/404/500 with Fastify default envelope `{ statusCode, error, message }`.
- **API versioning:** `/v1` route prefix on all CRUD endpoints (one Fastify plugin registration); `GET /healthz` unversioned, returns `{ status, db }` after `SELECT 1`.
- **ID strategy:** UUID v7 generated API-side via `uuid` lib (never client-minted).
- **Layered API boundaries:** `routes/*.ts` → `repositories/todosRepo.ts` → `db/index.ts` (Kysely). Routes never import Kysely directly; repositories own all queries.
- **Web stack:** TanStack Query v5 for all server state (never `useState` + manual `fetch`); native `fetch` wrapped in typed `apiClient.ts`; typed per-endpoint functions in `api/todos.ts`; optimistic updates for complete/delete (shared `useOptimisticTodoMutation` factory) and non-optimistic for create.
- **Styling:** Tailwind CSS v4 via `@tailwindcss/vite`; `@import "tailwindcss";` in `src/styles/index.css`; no `tailwind.config.js`; design tokens declared via `@theme` (see UX Design Requirements).
- **Component library:** None. Native HTML + Tailwind utilities only.
- **Environment files:** `.env.example` committed for `apps/api` and `apps/web`; `.env` gitignored. Loaded via `@fastify/env` (api) and `import.meta.env.VITE_API_URL` (web).
- **Logging:** Fastify built-in pino (`info` dev, `warn` prod); `pino-pretty` in dev.
- **CI (GitHub Actions `.github/workflows/ci.yml`):** install → migrate (against Postgres service container) → typecheck → lint → test (Vitest + axe-core) → build.
- **Enforcement:** TypeScript `strict`, ESLint + `@typescript-eslint`, contract tests assert API envelope + status codes on every route, axe-core fails CI on a11y violations.
- **Schema source-of-truth mirror constraint:** `MAX_DESCRIPTION_LENGTH = 500` in `apps/web/src/lib/constants.ts` must carry a one-line comment identifying the TypeBox schema in `apps/api/src/schemas/todo.ts` as authoritative.
- **Journey-4 perf seed strategy:** `apps/web/test/perf/` (or equivalent test-fixtures helper) inserts ≥50 todos directly via `todosRepo` for the perf harness.

### UX Design Requirements

UX-DR1: Implement Tailwind v4 `@theme` design tokens in `apps/web/src/styles/index.css` — 8 color tokens (`--color-bg` #FAFAFA, `--color-surface` #FFFFFF, `--color-fg` #1A1A1A, `--color-fg-muted` #737373, `--color-border` #E5E5E5, `--color-accent` #2563EB, `--color-danger` #DC2626, `--color-completed-fg` #1A1A1A@60% opacity), type scale (`text-sm`/`text-base`/`text-lg`/`text-xl` + weights 400/500/600), system font stack, 4px spacing base, `rounded-md`/`rounded-lg`, `shadow-sm`, motion tokens (`duration-150 ease-out`, `duration-200`), 2px focus ring with 2px offset using `--color-accent`, Tailwind breakpoints (`sm: 640px`, `lg: 1024px`).

UX-DR2: Build `Header` component — single `<h1>` with app title "Todos", `text-xl font-semibold`, `mb-6` rhythm. No nav, logo, avatar, or settings icon.

UX-DR3: Build `AddTodoInput` component — `<form>` with `<input type="text" maxlength="500" autocomplete="off">` (16px font to prevent iOS auto-zoom, auto-focused on mount, `aria-label="Add a todo"`) + `<button type="submit">Add</button>` (44px min-height, 64px min-width). States: default, focus (2px accent outline), typing, submitting (`aria-busy`, button disabled), error. Empty/whitespace-only submission is a no-op with no error. On success: input cleared and re-focused. Flex row, `gap-2`.

UX-DR4: Build `TodoList` component — two `<ul>` groups (Active always rendered; Completed rendered only if non-empty with muted "Completed" label `text-sm text-fg-muted`, `mt-6` separation). Purely presentational; receives `Todo[]` via props; never fetches. Stable `key={todo.id}`; wraps `TodoRow` in `React.memo` for Journey 4 / NFR-001.

UX-DR5: Build `TodoRow` component — `<li>` flex row `[checkbox-wrap] [description] [delete-icon-button]` with `py-3 md:py-4 px-2`, `gap-3`, `border-b border-[--color-border]`. Native `<input type="checkbox">` with inverse `aria-label="Mark complete/incomplete: {description}"`; 44×44 hit area even if glyph is 20px. Delete `<button aria-label="Delete todo: {description}">` with SVG glyph in 44×44 container. States: default, hover (desktop only via `@media (hover: hover)`), keyboard focus (2px accent ring), completed (strike-through + 60% opacity + section move), mutating (`aria-busy`, pointer-events: none during PATCH), transient error (InlineError anchored below row). Completion transition: ~150–200ms ease-out CSS (no JS animation), disabled under `prefers-reduced-motion`.

UX-DR6: Build `DeleteTodoModal` component — native `<dialog>` with `role="dialog"`, `aria-modal="true"`, `aria-labelledby`, `aria-describedby`, `rounded-lg`, `shadow-sm`, `max-width 400px`, `p-6`, 30% black backdrop. Locked copy: title "Delete this todo?"; body "This cannot be undone."; Cancel "Cancel"; Delete "Delete"; error body "Couldn't delete. Check your connection."; Retry "Retry". Behavior: Cancel focused by default on open; Escape closes (native); backdrop click closes; focus returns to triggering delete icon on close. Cancel (`btn-secondary`) and Delete (`btn-danger`) same height + font-weight — no default-action styling. Modal transition: ~150ms ease-out (backdrop fade + modal scale 95% → 100%).

UX-DR7: Build `EmptyState` component — centered block, 64×64 abstract line-drawing SVG in `fg-muted` at opacity 0.7 (`aria-hidden="true"`), primary copy "No todos yet." (`text-base`), sub-copy "Add one below." (`text-sm text-fg-muted`), `py-12`. `AddTodoInput` remains above it, pre-focused. Renders only after initial fetch resolves with zero items (never during `isPending`).

UX-DR8: Build `LoadingSkeleton` component — 3–4 placeholder rows matching TodoRow layout (circle for checkbox, wide rectangle for description, square for delete icon), `bg-[--color-border]` with `animate-pulse` (disabled under `prefers-reduced-motion`), same `py-3 md:py-4 px-2` padding as TodoRow. `aria-busy="true"`, `aria-live="polite"`, visually-hidden "Loading your todos" text. Mounted within 16ms of app mount (FR-008); replaced by `TodoList` or `EmptyState` on fetch resolve.

UX-DR9: Build `InlineError` component — flex row `[icon + text] [Retry button]`, background `#fef2f2`, border `#fecaca`, text `#991b1b`, 16×16 SVG icon, `rounded-md px-3 py-3`, Retry button `btn-secondary` at 36px height. `role="alert"`, `aria-live="polite"`. Retry disabled with `aria-busy` while retrying. Copy patterns: "Couldn't save. Check your connection." (create/toggle); "Couldn't delete. Check your connection." (delete). Anchored at the failure site — below `AddTodoInput` for create; inline within the row for toggle; inside the modal body for delete.

UX-DR10: Build `ErrorBoundary` wrapper — wraps `<App />` in `main.tsx`, catches render errors, renders generic failure screen. Orthogonal to FR-010 inline errors.

UX-DR11: Implement button hierarchy — three variants only: **Primary** (solid `--color-accent` background, white text, `font-medium`; Add, Retry); **Secondary** (surface bg, neutral text, 1px `--color-border`; Cancel); **Danger** (solid `--color-danger` background, white text, `font-medium`; Delete). Rules: one Primary per surface; Danger + Secondary in modal are same height + weight; 44px min-height (36px exception inside InlineError); visible focus ring on all; disabled state = opacity 0.6 + pointer-events: none + `aria-busy` if in-flight.

UX-DR12: Implement global `prefers-reduced-motion` CSS rule disabling all transitions and animations application-wide (single rule in `styles/index.css`).

UX-DR13: Implement mobile-first responsive layout — single centered column, `max-w-xl` (~640px) on desktop with `mx-auto`, full-width below `sm: 640px` with `px-4`, vertical offset `pt-8` mobile / `pt-16` desktop. Hard floor 320px with zero horizontal scroll. Use Tailwind `sm:`/`lg:` prefixes only (never `@media (max-width: ...)`).

UX-DR14: Implement focus management discipline — input auto-focus on app mount; input re-focus after successful submit; modal default focus on Cancel; modal close returns focus to triggering delete icon (ref stored by parent).

UX-DR15: Implement semantic landmarks — `<header>` (app title), `<main>` (list + input), `<form>` (add input), `<ul>`/`<li>` for lists. Set `<html lang="en">`.

UX-DR16: Add axe-core render tests for every web component under `apps/web/test/a11y/*.a11y.test.tsx`; any violation fails CI.

UX-DR17: Add `eslint-plugin-jsx-a11y` to the ESLint config to catch missing `aria-label`, `alt`, and invalid ARIA at lint time.

UX-DR18: Verify WCAG 2.1 AA contrast pairs including `#1A1A1A` at 60% opacity on `#FAFAFA` (≥4.5:1), `#2563EB` focus ring on `#FAFAFA` (≥3:1 non-text), and `#DC2626` on `#FFFFFF` (≥4.5:1). Automated via axe-core color-contrast rule; manual spot-check on completed-row text.

### FR Coverage Map

| Requirement | Epic(s) | Notes |
|---|---|---|
| FR-001 Create | Epic 2 | AddTodoInput + POST endpoint |
| FR-002 View + ordering | Epic 2 (active) + Epic 3 (completed section) | Active section first, Completed last |
| FR-003 Complete toggle | Epic 3 | Optimistic PATCH with revert on failure |
| FR-004 Delete + modal | Epic 3 | DeleteTodoModal + DELETE endpoint |
| FR-005 Data model | Epic 1 | Kysely migration + TypeBox schema |
| FR-006 Completed styling + contrast | Epic 3 (styling) + Epic 5 (contrast verification) | Strike-through + 60% opacity + WCAG AA |
| FR-007 Empty state | Epic 2 | EmptyState component |
| FR-008 Loading state | Epic 2 | LoadingSkeleton component |
| FR-009 Responsive + matrix | Epic 1 (baseline tokens + breakpoints) + Epic 5 (matrix verification) | 320px floor; evergreen browser matrix |
| FR-010 Inline error + Retry | Epic 4 | InlineError component at all three failure sites |
| FR-011 Persistence | Epic 2 (wire-up) + Epic 4 (full integration test) | Docker Postgres + pg-data volume + server restart test |
| FR-012 REST API `/v1` | Epic 1 (prefix + infra) + Epic 2 (POST + GET) + Epic 3 (PATCH + DELETE) | `/v1/todos`, `/v1/todos/:id`, status 201/200/200/204 |
| NFR-001 UI p95 ≤100ms | Epic 5 | Journey-4 perf harness |
| NFR-002 API p95 ≤200ms | Epic 5 | Request-log aggregation in perf harness |
| NFR-003 Durability | Epic 1 (pg-data volume) + Epic 4 (integration test) | Zero loss across refresh/close/restart |
| NFR-004 Error resilience | Epic 4 | Fault-injection tests; preserved input |
| NFR-005 Nullable `userId` | Epic 1 | Schema + migration + contract test |
| NFR-006 Onboarding ≤15 min | Epic 1 | README + docker-compose + `.env.example` |
| NFR-007 WCAG 2.1 AA | Epic 1 (CI axe-core gate + jsx-a11y) + Epic 5 (full verification) | Every component has axe-core render test |

## Epic List

### Epic 1: Foundation & Walking Skeleton

**User outcome (developer-facing):** A new engineer clones the repo, runs `docker compose up -d postgres` + `npm run dev`, and sees the API respond at `/healthz` and the web app render a `Todos` header — with the CI pipeline (typecheck + lint + axe-core + build) green on every PR — all within ≤15 minutes of clone. Infrastructure is complete so Epic 2+ stories can add routes and components without scaffold work.

**FRs covered:** FR-005, FR-009 (responsive baseline), FR-012 (route prefix + routing infrastructure)
**NFRs covered:** NFR-005, NFR-006, NFR-007 (CI a11y gate)

### Epic 2: Create & View Todos

**User outcome:** User lands on the URL, sees an empty state (or loading skeleton), types a todo, presses Enter or taps Add, sees it appear in the active list — persisted across refresh. Delivers Journey 1 end-to-end and SC-001 (≤60s first-use).

**FRs covered:** FR-001, FR-002 (active section ordering), FR-007, FR-008, FR-011 (create persistence wire-up), FR-012 (POST + GET)

### Epic 3: Complete & Delete — Finish the Core Loop

**User outcome:** User completes Journey 2 — marks todos complete with strike-through + 60% opacity + section reorder (optimistic), un-checks to revert, and deletes via a modal confirmation. The full create → view → complete → delete loop is now working.

**FRs covered:** FR-002 (completed section), FR-003, FR-004, FR-006 (styling implementation), FR-012 (PATCH + DELETE)

### Epic 4: Failure-Proof User Experience

**User outcome:** Journey 3 — users never lose work when something fails. Errors appear at the exact failure site with Retry; input/state is preserved. Persistence verified end-to-end across server restart.

**FRs covered:** FR-010
**NFRs covered:** NFR-003 (full durability integration test), NFR-004

### Epic 5: Launch Quality — Accessibility, Responsive, Performance

**User outcome:** Every user — mobile (320px), keyboard-only, screen-reader, reduced-motion, 200% zoom, across the browser matrix — gets the same experience. The app stays responsive under sustained use at ≥50 todos (Journey 4). SC-003 and SC-004 verified.

**FRs covered:** FR-006 (contrast verification), FR-009 (matrix verification)
**NFRs covered:** NFR-001, NFR-002, NFR-007 (full verification)

## Epic 1: Foundation & Walking Skeleton

**Epic goal:** A new engineer clones the repo, runs `docker compose up -d postgres` + `npm run dev`, and sees the API respond at `/healthz` and the web app render a `Todos` header — with the CI pipeline (typecheck + lint + format-check + axe-core + build) green on every PR — all within ≤15 minutes of clone. Infrastructure is complete so Epic 2+ stories can add routes and components without scaffold work.

### Story 1.1: Monorepo scaffold with Docker Postgres

As a developer,
I want a monorepo with workspace-aware Node tooling and a local Postgres service,
So that I can install and run the stack with a single command from a fresh clone.

**Acceptance Criteria:**

**Given** a clean machine with Node LTS and Docker installed
**When** the engineer runs `git clone` followed by `npm install` at the repo root
**Then** npm installs workspaces without error
**And** the root `package.json` declares `"workspaces": ["apps/*"]`

**Given** the repo root contains `docker-compose.yml`
**When** the engineer runs `docker compose up -d postgres`
**Then** a `postgres:16-alpine` container starts with a healthcheck passing within 30 seconds
**And** a named volume `pg-data` is mounted at `/var/lib/postgresql/data` (not `tmpfs`) so data survives `docker compose down` + `up`

**Given** the scaffold is complete
**When** the engineer inspects the repo
**Then** `tsconfig.base.json` at root defines `"strict": true` and is extendable by each workspace
**And** `.gitignore` excludes `node_modules/`, `.env`, `dist/`, `.DS_Store`
**And** `.editorconfig` is present with sane defaults (LF line endings, 2-space indent)
**And** a README skeleton exists with a "Local Development" heading (completed in story 1.6)

**Test Scenarios:**

*Unit (co-located `*.test.ts(x)`, mocks at module boundaries):* none — infrastructure-only story.

*Integration (under `test/`, real Postgres for API; real TanStack Query + mocked fetch for web):*
- `docker compose up -d postgres` produces a healthy container with the `pg-data` named volume bound to `/var/lib/postgresql/data` (verified via `docker inspect` output assertion in a shell test).
- `docker compose config` exits 0 and reports the expected service + volume definitions.

*E2E (Playwright under `e2e/`):* none — harness arrives in Story 1.6.

### Story 1.2: Fastify API skeleton with `/healthz`

As a developer,
I want a Fastify API workspace that starts in dev mode and responds on `/healthz`,
So that I can confirm the API half of the stack is alive before adding business logic.

**Acceptance Criteria:**

**Given** `apps/api/` workspace exists with `package.json` + `tsconfig.json` extending `tsconfig.base.json`
**When** the engineer runs `npm run dev --workspace apps/api`
**Then** `tsx watch src/server.ts` starts Fastify listening on `PORT` (default 3000)
**And** the log line is pretty-printed via `pino-pretty` in dev

**Given** `@fastify/env` is registered with a typed config schema
**When** the server boots without a required env var
**Then** the server fails fast with a typed validation error referencing the missing key
**And** `.env.example` enumerates `DATABASE_URL`, `PORT`, `CORS_ORIGIN`, `LOG_LEVEL`, `NODE_ENV`
**And** `.env` is gitignored

**Given** the server is running
**When** a client issues `GET /healthz`
**Then** the response is `200 { "status": "ok" }` (DB probe added in story 1.3)

**Given** the codebase uses the factory pattern
**When** the engineer inspects the source
**Then** `src/app.ts` exports a `buildApp(config)` factory (testable) and `src/server.ts` is the entrypoint that loads config, builds the app, and calls `listen()`

**Test Scenarios:**

*Unit:*
- `buildApp(config)` returns a Fastify instance with the expected route count registered (assert via `app.printRoutes()` string match).
- The `@fastify/env` config schema rejects a config object missing a required key (assert via the schema's validate function in isolation).

*Integration:*
- `GET /healthz` via `app.inject({ method: 'GET', url: '/healthz' })` returns `200 { status: 'ok' }` with JSON content-type.
- Booting with `DATABASE_URL` missing causes `buildApp` to throw a typed validation error referencing the missing key.

*E2E:* none — Playwright harness arrives in Story 1.6.

### Story 1.3: Database layer — Kysely + todos migration + `/healthz` DB probe

As a developer,
I want Kysely wired to Postgres with the `todos` table migrated and `/healthz` reporting DB status,
So that subsequent stories can persist and query todos with full type safety and a verified connection.

**Acceptance Criteria:**

**Given** Kysely is installed with `pg` driver and `uuid` library
**When** the engineer inspects `apps/api/src/db/index.ts`
**Then** a Kysely factory constructs a `Kysely<Database>` instance with `PostgresDialect` (connection string from `DATABASE_URL`) and the `CamelCasePlugin` enabled
**And** `src/db/schema.ts` declares a `Database` interface with a `todos` table typed from the columns below

**Given** a migration file `src/db/migrations/20260418_001_create_todos.ts` exists
**When** the engineer runs `npm run migrate --workspace apps/api`
**Then** the `todos` table is created with columns: `id (uuid primary key)`, `description (text not null, length ≤500)`, `completed (boolean not null default false)`, `created_at (timestamptz not null default now())`, `user_id (text null)`
**And** an index `idx_todos_completed_created_at` exists on `(completed, created_at)`
**And** re-running `npm run migrate` is idempotent (no duplicate migrations applied)

**Given** a todo is inserted and the container is restarted via `docker compose restart postgres`
**When** the engineer reads from the table after restart
**Then** the previously inserted row is still present (verifies `pg-data` named volume — binding constraint for NFR-003)

**Given** `/healthz` has been upgraded
**When** a client issues `GET /healthz`
**Then** the handler runs `SELECT 1` against Postgres via Kysely
**And** returns `200 { "status": "ok", "db": "ok" }` on success
**And** returns `503 { "status": "degraded", "db": "error" }` if `SELECT 1` throws

**Test Scenarios:**

*Unit:*
- The Kysely factory function returns a `Kysely<Database>` instance with `CamelCasePlugin` active — assert by running a test query selecting a `snake_case` column and confirming the returned key is `camelCase` (using the Kysely compiler output or a driver-level mock).
- The `Database` interface in `db/schema.ts` matches the migration column set at compile time (a TS type-level test via `expect<Equal<...>>` or equivalent).

*Integration:*
- `npm run migrate --workspace apps/api` applies `20260418_001_create_todos` against a real Postgres test DB; inspect `information_schema.tables` and `information_schema.columns` to assert the `todos` table + its 5 columns + `idx_todos_completed_created_at` index exist.
- Re-running `npm run migrate` is idempotent — the second invocation exits 0 with no new migration applied (verified via `kysely_migration` table row count).
- Insert a row, run `docker compose restart postgres`, query for the row again — still present (verifies `pg-data` volume binding).
- `GET /healthz` against a live Postgres returns `200 { status: 'ok', db: 'ok' }` via `app.inject`; shutting the DB pool and re-requesting returns `503 { status: 'degraded', db: 'error' }`.

*E2E:* none — Playwright harness arrives in Story 1.6.

### Story 1.4: API plugin stack + `/v1` prefix + global error handler

As a developer,
I want the Fastify plugin stack, `/v1` route prefix, TypeBox error schema, and global error handler registered,
So that every route added in subsequent stories inherits CORS, security headers, rate limiting, docs, and a consistent error envelope without per-route wiring.

**Acceptance Criteria:**

**Given** Fastify plugins are registered in `apps/api/src/app.ts`
**When** the server boots
**Then** `@fastify/cors` is registered with an allow-list sourced from `CORS_ORIGIN`
**And** `@fastify/helmet` is registered with defaults
**And** `@fastify/rate-limit` is registered with a limit of ~300 req/min/IP
**And** `bodyLimit` is set to 64 KB on the Fastify instance

**Given** Swagger plugins are registered
**When** a client issues `GET /docs`
**Then** Swagger UI renders and lists `/healthz` (and any other registered routes)
**And** the OpenAPI JSON is available at `/docs/json`

**Given** the `/v1` route prefix is registered via a Fastify plugin mounting `src/routes/todos.ts`
**When** the engineer inspects `src/app.ts`
**Then** the todos routes module is registered under `{ prefix: '/v1' }`
**And** the `todos.ts` file exists with no handlers registered yet (added in Epic 2)
**And** `/healthz` is registered unversioned (not under `/v1`)

**Given** a `NotFoundError` class exists at `src/errors/index.ts` and the global error handler is registered at `src/plugins/error-handler.ts`
**When** a route throws a TypeBox validation error
**Then** the response is `400 { "statusCode": 400, "error": "Bad Request", "message": <detail> }`
**And** when a route throws `NotFoundError('Todo abc not found')` the response is `404 { "statusCode": 404, "error": "Not Found", "message": "Todo abc not found" }`
**And** when a Postgres error with SQLSTATE `23xxx` is thrown the response is `409 { "statusCode": 409, "error": "Conflict", ... }` with a safe message (raw Postgres text never leaked)
**And** when any other error is thrown the response is `500` with a generic message and the full error is logged via pino

**Given** a TypeBox `ErrorResponse` schema exists at `src/schemas/errors.ts`
**When** the engineer inspects the Swagger docs
**Then** every registered route references the shared `ErrorResponse` schema for non-2xx responses

**Test Scenarios:**

*Unit:*
- The global error-handler function, called in isolation with a TypeBox validation error object, produces the Fastify default envelope `{ statusCode: 400, error: 'Bad Request', message }`.
- The same function with a `NotFoundError('Todo abc not found')` produces `{ statusCode: 404, error: 'Not Found', message: 'Todo abc not found' }`.
- The same function with a crafted error `{ code: '23505' }` (Postgres unique-violation) produces `409` with a safe message (never the raw Postgres error text).
- The same function with a plain `Error('boom')` produces `500` with a generic message AND calls the logger with the original error.

*Integration:*
- A throwaway route registered in a test-only Fastify instance that throws each error type verifies the envelope + status code via `app.inject` (round-trips through the real handler chain, not just the function in isolation).
- `GET /docs` returns HTML containing "Swagger UI" markers.
- `GET /docs/json` returns a valid OpenAPI 3.x document referencing the shared `ErrorResponse` schema.
- A dummy route mounted under the `/v1` plugin is reachable at `/v1/<path>` and NOT at `/<path>` (prefix contract).
- `GET /healthz` remains unversioned (not under `/v1`).

*E2E:* none — Playwright harness arrives in Story 1.6.

### Story 1.5: Web app scaffold — Vite + Tailwind v4 + design tokens + ErrorBoundary + Header

As a developer,
I want the web app workspace scaffolded with Tailwind v4, design tokens, TanStack Query, ErrorBoundary, and the Header component,
So that the first user-visible pixel ("Todos") renders with the locked visual system in place and all subsequent component stories can be pure feature work.

**Acceptance Criteria:**

**Given** `apps/web/` is scaffolded via `npm create vite@latest apps/web -- --template react-ts`
**When** the engineer runs `npm run dev --workspace apps/web`
**Then** Vite serves the app at `http://localhost:5173`
**And** the page renders an `<h1>Todos</h1>` inside a `<header>` element, `<main>` below it, and `<html lang="en">` set
**And** `.env.example` declares `VITE_API_URL` and `.env` is gitignored

**Given** Tailwind v4 is wired via `@tailwindcss/vite`
**When** the engineer inspects `apps/web/src/styles/index.css`
**Then** the file contains `@import "tailwindcss";` and a `@theme` block declaring the design tokens from UX-DR1:
  - colors: `--color-bg` `#FAFAFA`, `--color-surface` `#FFFFFF`, `--color-fg` `#1A1A1A`, `--color-fg-muted` `#737373`, `--color-border` `#E5E5E5`, `--color-accent` `#2563EB`, `--color-danger` `#DC2626`
  - system font stack
  - spacing base 4px (Tailwind default)
  - focus ring defined via `--color-accent` with 2px width + 2px offset
**And** no `tailwind.config.js` exists (Tailwind v4 reads tokens from `@theme`)

**Given** a global reduced-motion rule is in place
**When** the OS toggles `prefers-reduced-motion: reduce`
**Then** the following CSS rule in `styles/index.css` disables all transitions and animations app-wide:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { transition-duration: 0ms !important; animation-duration: 0ms !important; }
}
```

**Given** `QueryClientProvider` is wired
**When** the engineer inspects `apps/web/src/main.tsx`
**Then** a single `QueryClient` is instantiated and provided once via `QueryClientProvider`
**And** `<ErrorBoundary>` wraps `<App />`
**And** `<App />` renders the `<Header />` component as its first child

**Given** the `ErrorBoundary` component exists at `src/components/ErrorBoundary.tsx`
**When** a descendant component throws during render
**Then** the boundary catches the error, logs it to `console.error`, and renders a generic `<main><p>Something went wrong.</p></main>` fallback UI (FR-010 inline errors are orthogonal — handled in Epic 4)

**Given** the `Header` component exists at `src/components/Header.tsx`
**When** the engineer inspects the component
**Then** it renders a single `<h1 className="text-xl font-semibold mb-6">Todos</h1>` and nothing else (no nav, logo, avatar, or settings)

**Test Scenarios:**

*Unit:*
- `<Header />` renders a single `<h1>` with exact text "Todos".
- `<ErrorBoundary>` rendered around a component that throws during render catches the throw and renders its fallback UI (verified via React Testing Library with a test component that throws on mount).
- `<ErrorBoundary>` calls `console.error` with the captured error.

*Integration:*
- Full App tree (`<ErrorBoundary><QueryClientProvider><App /></QueryClientProvider></ErrorBoundary>`) mounts without error and renders the Header.
- A sample element with `color: var(--color-fg)` has a computed color of `#1A1A1A` at runtime, confirming `@theme` tokens are wired via the Tailwind Vite plugin.
- `<Header />` axe-core render test reports zero violations (smoke test scheduled in Story 1.6 using this component).

*E2E:* none — Playwright harness arrives in Story 1.6 and exercises `<Header />` in its first smoke spec.

### Story 1.6: CI pipeline + code-quality gate (ESLint, Prettier, a11y) + Playwright E2E scaffold + onboarding README

As a developer,
I want a GitHub Actions pipeline that enforces typecheck, lint, format-check, a11y, E2E smoke, and build on every PR, plus a complete onboarding README,
So that every subsequent story lands on a trunk with continuously verified quality and a new engineer can get productive in ≤15 minutes.

**Acceptance Criteria:**

**Given** `.github/workflows/ci.yml` exists
**When** a PR is pushed
**Then** the workflow runs on `ubuntu-latest` with a `services.postgres` container (`postgres:16-alpine`) healthchecked before test steps
**And** the steps run in order: checkout → setup Node LTS with npm cache → `npm ci` → `npm run migrate --workspace apps/api` → `npm run typecheck` → `npm run lint` → `npm run format:check` → `npm test` (Vitest + axe-core) → `npm run build` → `npm run test:e2e` (Playwright smoke against a preview server)
**And** any step failing fails the workflow

**Given** ESLint is configured at repo root
**When** the engineer runs `npm run lint`
**Then** the config extends `@typescript-eslint/recommended` + `eslint-plugin-jsx-a11y/recommended` + `eslint-config-prettier` (to disable rules that fight Prettier)
**And** `npm run lint` fails on a web component that uses `<button>` with no accessible name (proves jsx-a11y is active)

**Given** Prettier is configured at repo root
**When** the engineer inspects the repo
**Then** `.prettierrc` declares the shared format config (single quotes, semi, trailing-comma, print-width 100) and `.prettierignore` excludes `dist/`, `node_modules/`, `coverage/`
**And** `package.json` defines `format` (`prettier --write .`) and `format:check` (`prettier --check .`) scripts at root
**And** `npm run format:check` exits 0 on a fresh clean repo

**Given** Vitest is configured in both apps
**When** the engineer runs `npm test`
**Then** Vitest executes in both workspaces
**And** `apps/web/test/setup.ts` registers jsdom + `axe-core` (via `vitest-axe` or equivalent)
**And** a smoke a11y test at `apps/web/test/a11y/Header.a11y.test.tsx` renders `<Header />` and asserts `axe` reports zero violations

**Given** Playwright is installed as the E2E harness
**When** the engineer inspects the repo
**Then** `apps/web/e2e/` contains a `playwright.config.ts` (Chromium browser only in this story — Firefox + WebKit expansion lives in Story 5.2) and a `smoke.spec.ts`
**And** the `smoke.spec.ts` starts the API + web preview servers, loads `http://localhost:5173`, asserts the `Todos` header is visible, and asserts `GET http://localhost:3000/healthz` returns `200 { status: 'ok', db: 'ok' }`
**And** `package.json` defines a root `test:e2e` script that runs `playwright test` within the `apps/web` workspace
**And** the CI job includes the `test:e2e` step gated behind the fast checks; a failing E2E fails the workflow

**Given** the README is completed
**When** a new engineer follows only the README
**Then** they can clone → `cp apps/api/.env.example apps/api/.env` + same for web → `docker compose up -d postgres` → `npm install` → `npm run migrate --workspace apps/api` → `npm run dev --workspace apps/api` + `npm run dev --workspace apps/web` → see the `Todos` header render at `localhost:5173` and `/healthz` return `{ status: 'ok', db: 'ok' }`
**And** the onboarding wall-clock time is ≤15 minutes (NFR-006)

**Test Scenarios:**

*Unit:* none — this story wires configuration; the behaviors it enables are tested by later stories.

*Integration:*
- `npm run lint` on a deliberately-broken branch with a `<button>` missing an accessible name exits non-zero (proves `jsx-a11y` is active).
- `npm run format:check` on a file with inconsistent formatting exits non-zero (proves Prettier is wired).
- `npm test` runs Vitest across both workspaces; the Header axe-core smoke test at `apps/web/test/a11y/Header.a11y.test.tsx` passes with zero violations.
- `npm run typecheck` on a deliberately-typed-wrong file exits non-zero (proves TS strict is active end-to-end).

*E2E:*
- `smoke.spec.ts` boots the stack and asserts the "Todos" header renders at `http://localhost:5173` AND `/healthz` returns a healthy envelope — this is the first Playwright spec in the repo and the foundation all later E2E specs build on.
- The CI `test:e2e` job reports a passing smoke on every PR that didn't touch app code (baseline proof the harness works).

## Epic 2: Create & View Todos

**Epic goal:** User lands on the URL, sees an empty state (or loading skeleton), types a todo, presses Enter or taps Add, sees it appear in the active list — persisted across refresh. Delivers Journey 1 end-to-end and SC-001 (≤60s first-use).

### Story 2.1: TypeBox schemas + `todosRepo.create` + `POST /v1/todos`

As a user,
I want to create a todo via the API,
So that my typed description is stored with a server-assigned id and timestamp.

**Acceptance Criteria:**

**Given** TypeBox schemas are defined at `apps/api/src/schemas/todo.ts`
**When** the engineer inspects the file
**Then** a `Todo` schema is declared with fields `id (uuid)`, `description (string 1..500)`, `completed (boolean)`, `createdAt (date-time)`, `userId (string | null)`
**And** a `CreateTodoInput` schema accepts `{ description: string, minLength 1, maxLength 500 }` and nothing else
**And** static TS types are exported via `Static<typeof Todo>` and `Static<typeof CreateTodoInput>`

**Given** `apps/api/src/repositories/todosRepo.ts` exports a `create({ description })` function
**When** `create` is called
**Then** it inserts a row via Kysely with a newly generated UUID v7 `id`, the trimmed `description`, `completed = false`, `created_at = now()` (TIMESTAMPTZ UTC), `user_id = null`
**And** it returns the inserted row serialized to the `Todo` shape (camelCase, ISO 8601 `createdAt`)

**Given** `POST /v1/todos` is registered in `apps/api/src/routes/todos.ts`
**When** a client issues `POST /v1/todos` with body `{ "description": "Buy milk" }`
**Then** the response is `201` with body matching the `Todo` schema
**And** the body's `userId` is `null` (explicit, not omitted)
**And** the body's `createdAt` is an ISO 8601 UTC string with `Z` suffix

**Given** the validation rules on `CreateTodoInput`
**When** a client issues `POST /v1/todos` with body `{ "description": "" }` or `{}` or `{ "description": "<501-char string>" }`
**Then** the response is `400` with the Fastify default error envelope `{ statusCode, error, message }`

**Given** a contract test at `apps/api/test/contract.todos.test.ts`
**When** the test runs (CI or local)
**Then** it asserts `POST /v1/todos` returns `201` + `Todo` shape on a valid payload
**And** it asserts `400` on the three invalid payloads above
**And** the test runs against a real Postgres (CI service or local Docker), not a mock

**Test Scenarios:**

*Unit:*
- TypeBox `Todo` schema rejects `{ description: '' }`, `{ description: <501 chars> }`, missing keys, unknown keys; accepts a well-formed payload.
- TypeBox `CreateTodoInput` rejects the same inputs and accepts `{ description: 'Buy milk' }`.
- `todosRepo.create` called with `{ description: '  Buy milk  ' }` (surrounding whitespace) invokes the Kysely insert with the trimmed string, a newly generated UUID v7, `completed: false`, `created_at: now()`, `user_id: null` — verified with a mocked query builder that captures the compiled insert.

*Integration:*
- `POST /v1/todos` via `app.inject` against real Postgres with `{ description: 'Buy milk' }` returns `201` + `Todo` shape; `userId` is `null` explicitly; `createdAt` matches the ISO 8601 pattern with `Z`.
- `POST /v1/todos` with `{ description: '' }`, `{}`, and `{ description: <501 chars> }` each return `400` with Fastify default envelope.
- The created row is queryable via `todosRepo.listAll` with the same id and timestamp.

*E2E:* none — first user-visible creation E2E is Journey 1 in Story 2.6.

### Story 2.2: `todosRepo.listAll` + `GET /v1/todos` with active-ASC ordering

As a user,
I want to fetch the full todo list in a deterministic order,
So that active items appear first (creation ASC) and completed items appear last (creation ASC).

**Acceptance Criteria:**

**Given** `todosRepo.listAll()` is exported from `apps/api/src/repositories/todosRepo.ts`
**When** the function is called
**Then** it executes a single Kysely query selecting all columns from `todos`
**And** the result is ordered by `completed ASC, created_at ASC`
**And** each row is serialized to the `Todo` shape (camelCase, ISO 8601 `createdAt`)

**Given** `GET /v1/todos` is registered in `apps/api/src/routes/todos.ts`
**When** a client issues `GET /v1/todos`
**Then** the response is `200` with body `Todo[]` (array directly; no `{data: ...}` wrapper)
**And** the response schema is declared via TypeBox `Type.Array(Todo)` so Fastify serializes with the schema
**And** an empty table returns `200 []`

**Given** the database contains todos created in this order: T1 (active), T2 (completed), T3 (active), T4 (completed)
**When** a client issues `GET /v1/todos`
**Then** the response order is `[T1, T3, T2, T4]` (active section first, each section ordered by creation ASC)

**Given** the contract test file
**When** the test runs
**Then** it seeds the four todos above, calls `GET /v1/todos`, and asserts the exact order above
**And** it asserts the response is a plain array (not an object)
**And** it asserts each element matches the `Todo` schema

**Test Scenarios:**

*Unit:*
- `todosRepo.listAll` builds a Kysely select with `orderBy('completed', 'asc').orderBy('created_at', 'asc')` — verified via mocked query builder capturing the compiled SQL / operation nodes.

*Integration:*
- Seed four todos (T1 active, T2 completed, T3 active, T4 completed) via `todosRepo.create` + `todosRepo.update`; `GET /v1/todos` via `app.inject` returns an array whose ids are in the exact order `[T1, T3, T2, T4]`.
- `GET /v1/todos` on an empty table returns `200 []` (array, not wrapped object).
- Each element passes TypeBox `Type.Array(Todo)` validation.

*E2E:* none — first user-visible list-read E2E is Journey 1 in Story 2.6.

### Story 2.3: Web API client + typed endpoints + `useTodos` / `useCreateTodo` hooks

As a user,
I want the web app to have a type-safe data layer for todos,
So that every UI component consuming server state gets the same `Todo` type, error handling, and query invalidation behavior.

**Acceptance Criteria:**

**Given** `apps/web/src/api/apiClient.ts` exists
**When** the engineer inspects it
**Then** it exports functions (`get`, `post`, `patch`, `del`) wrapping native `fetch`
**And** each function prefixes paths with `import.meta.env.VITE_API_URL`
**And** each function throws an `ApiError` (from `api/errors.ts`) carrying `statusCode` and `message` on any non-2xx response
**And** each function parses JSON on 2xx and returns the typed body

**Given** `apps/web/src/api/errors.ts` exists
**When** the engineer inspects it
**Then** `ApiError extends Error` with `statusCode: number` and `message: string`
**And** a helper `isApiError(err): err is ApiError` exists

**Given** `apps/web/src/api/todos.ts` exists
**When** the engineer inspects it
**Then** it exports `list(): Promise<Todo[]>` calling `apiClient.get('/v1/todos')`
**And** it exports `create(description: string): Promise<Todo>` calling `apiClient.post('/v1/todos', { description })`
**And** the `Todo` type is imported from `apps/web/src/types.ts` which re-exports from `apps/api/src/schemas/todo.ts`

**Given** `apps/web/src/hooks/useTodos.ts` exports a `useTodos()` hook
**When** a component calls `useTodos()`
**Then** it returns the result of `useQuery({ queryKey: ['todos'], queryFn: api.todos.list })`
**And** the query key is a tuple (not an ad-hoc string)

**Given** `apps/web/src/hooks/useCreateTodo.ts` exports a `useCreateTodo()` hook
**When** a component calls `useCreateTodo()`
**Then** it returns a `useMutation` with `mutationKey: ['todos', 'create']` and `mutationFn: (description) => api.todos.create(description)`
**And** `onSettled` invalidates `['todos']` via `queryClient.invalidateQueries`
**And** the mutation is NOT optimistic (server-assigned id required per architecture)

**Given** `apps/web/src/lib/constants.ts` exists
**When** the engineer inspects it
**Then** it exports `MAX_DESCRIPTION_LENGTH = 500`
**And** a one-line comment above the constant identifies `apps/api/src/schemas/todo.ts` as the authoritative source

**Test Scenarios:**

*Unit:*
- `apiClient.get('/v1/todos')` with `fetch` mocked to resolve `200` + JSON body returns the parsed body typed as `Todo[]`.
- `apiClient.post('/v1/todos', body)` with `fetch` mocked to resolve `400 { statusCode, error, message }` throws `ApiError` carrying `statusCode: 400` and the message.
- `apiClient` prefixes requests with `import.meta.env.VITE_API_URL` (assert via captured fetch URL).
- `isApiError(err)` narrows correctly for `ApiError` instances and returns `false` for plain `Error`.
- `api.todos.list()` and `api.todos.create(description)` call the correct paths with correct methods.
- `useCreateTodo`'s mutation config calls `queryClient.invalidateQueries({ queryKey: ['todos'] })` on settle (verified by a mocked `queryClient`).

*Integration:*
- `useTodos()` rendered within a real `QueryClientProvider` with `fetch` mocked at the network boundary fetches and caches `['todos']` data; a second render reuses the cache.
- `useCreateTodo()` mutation within the real `QueryClientProvider`: calling `mutate('Buy milk')` triggers `POST /v1/todos`; on success, the `['todos']` query refetches (mocked to return the new row) and the cache updates.
- `ApiError` thrown from `apiClient` surfaces via the mutation's `error` property unchanged (type preserved through TanStack Query).

*E2E:* none — data-layer behavior composes into Journey 1 E2E in Story 2.6.

### Story 2.4: `AddTodoInput` component

As a user,
I want a text input with an Add button that commits on Enter or tap,
So that I can create a todo without taking my hands off the keyboard and without any extra click.

**Acceptance Criteria:**

**Given** the `AddTodoInput` component at `apps/web/src/components/AddTodoInput.tsx`
**When** the component mounts
**Then** the input is auto-focused within 16ms
**And** the input has `maxlength="500"`, `autocomplete="off"`, `aria-label="Add a todo"`, and `type="text"` with a font-size ≥16px (prevents iOS auto-zoom)

**Given** the component props are `onSubmit(description: string)`, `disabled?: boolean`, `error?: string | null`
**When** the user types "Buy milk" and presses Enter (or taps Add)
**Then** `onSubmit("Buy milk")` is called once
**And** while the submission is in flight, the button is disabled with `aria-busy="true"` and the input keeps its value
**And** on a successful submit (parent triggers), the input clears and re-focuses

**Given** the user submits an empty or whitespace-only string
**When** Enter or Add is triggered
**Then** `onSubmit` is NOT called
**And** no error is rendered
**And** the input keeps focus

**Given** a parent passes `error="Couldn't save. Check your connection."`
**When** the component renders
**Then** an `InlineError`-shaped slot is rendered below the input (detailed `InlineError` component lives in Epic 4; for this story, a minimal inline error region is acceptable that Epic 4 replaces)
**And** the input value is preserved (never cleared on error)
**And** the Add button is re-enabled

**Given** the component layout
**When** the engineer inspects the rendered DOM
**Then** the wrapper is a `<form>` with `onSubmit` preventing default
**And** the flex row is `gap-2`, input is `flex-1`, and button has min-width ~64px and min-height 44px
**And** the Add button is styled as the Primary variant (solid `--color-accent` background, white text, `font-medium`)

**Given** an axe-core render test at `apps/web/test/a11y/AddTodoInput.a11y.test.tsx`
**When** the test runs
**Then** it renders `<AddTodoInput onSubmit={() => {}} />` and asserts `axe` reports zero violations

**Test Scenarios:**

*Unit:*
- On mount, the `<input>` is the `document.activeElement` (auto-focus).
- Typing "Buy milk" then pressing Enter calls `onSubmit("Buy milk")` exactly once.
- Clicking the Add button calls `onSubmit` with the current value.
- Submitting `""`, `"   "`, or all-whitespace does NOT call `onSubmit` and does not render any error.
- Submitting succeeds (parent flips `disabled` to `false` after success) — the input's value is cleared and focus returns to the input.
- While `disabled={true}`, the Add button has `aria-busy="true"` and is non-interactive; the input retains its value.
- With `error="Couldn't save. Check your connection."`, an error region renders below the input with the exact message; the input value is preserved.
- The input has `maxlength="500"`, `autocomplete="off"`, `aria-label="Add a todo"`, and a computed font-size ≥16px.
- axe-core render test reports zero violations in default, error, and submitting states.

*Integration:* none at this layer — composed with data layer in Story 2.6.

*E2E:* none — covered indirectly by Journey 1 E2E in Story 2.6.

### Story 2.5: `TodoRow` (non-completed) + `TodoList` (active section) + `LoadingSkeleton` + `EmptyState`

As a user,
I want the todo list to render active items, a loading skeleton during fetch, and an empty state when there are none,
So that the list area always shows the right thing and never flashes from empty to content.

**Acceptance Criteria:**

**Given** `TodoRow` at `apps/web/src/components/TodoRow.tsx` receives props `{ todo: Todo, onToggle(id, completed): void, onDeleteRequest(todo): void, isMutating?: boolean }`
**When** the component renders
**Then** the `<li>` is a flex row `[checkbox-wrap] [description] [delete-icon-button]` with `py-3 md:py-4 px-2`, `gap-3`, `border-b border-[--color-border]`
**And** the checkbox is a native `<input type="checkbox">` with `aria-label` derived from the row's `completed` state (`"Mark complete: {description}"` or `"Mark incomplete: {description}"`)
**And** the delete button is a real `<button aria-label="Delete todo: {description}">` wrapping an SVG glyph
**And** both the checkbox wrapper and the delete button container are ≥44×44px (tap targets via padding)
**And** `onToggle` and `onDeleteRequest` wire-ups exist but clicking them is a no-op stub for this epic (full toggle/delete handled in Epic 3)
**And** the component is wrapped in `React.memo`
**And** completed-state styling (strike-through, 60% opacity, section-move) is NOT implemented in this story (deferred to Epic 3)

**Given** `TodoList` at `apps/web/src/components/TodoList.tsx` receives props `{ todos: Todo[], onToggle, onDeleteRequest }`
**When** the component renders
**Then** it renders a single `<ul>` of active todos (those with `completed === false`) in received order using `key={todo.id}`
**And** it is purely presentational — it never calls `fetch`, `useQuery`, or reads `localStorage`
**And** the Completed section is NOT rendered in this story (deferred to Epic 3)

**Given** `LoadingSkeleton` at `apps/web/src/components/LoadingSkeleton.tsx` receives optional `{ rows?: number }` (default 3)
**When** the component renders
**Then** it renders the specified number of placeholder rows matching `TodoRow` layout (circle for checkbox, wide rectangle for description, square for delete icon)
**And** placeholder blocks use `bg-[--color-border]` with `animate-pulse`, same `py-3 md:py-4 px-2` padding as TodoRow
**And** the container sets `aria-busy="true"` and `aria-live="polite"` and includes a visually-hidden "Loading your todos" label
**And** the `animate-pulse` is disabled under `prefers-reduced-motion` (via the global CSS rule from story 1.5)

**Given** `EmptyState` at `apps/web/src/components/EmptyState.tsx`
**When** the component renders
**Then** it renders a centered block with a 64×64 decorative SVG (line-drawing, `aria-hidden="true"`, `opacity: 0.7`, stroke color `--color-fg-muted`)
**And** the primary copy is the exact string `"No todos yet."` in `text-base`
**And** the sub-copy is the exact string `"Add one below."` in `text-sm text-[--color-fg-muted]`
**And** the container has `py-12` and is centered
**And** the component contains no buttons or CTAs (the `AddTodoInput` already sits above it)

**Given** axe-core render tests at `apps/web/test/a11y/TodoRow.a11y.test.tsx`, `TodoList.a11y.test.tsx`, `LoadingSkeleton.a11y.test.tsx`, `EmptyState.a11y.test.tsx`
**When** each test runs
**Then** it renders the component with minimal props and asserts `axe` reports zero violations

**Test Scenarios:**

*Unit:*
- `TodoRow` renders `<li>` with flex row containing `[checkbox wrapper] [description] [delete button]`; computed checkbox-wrapper dimensions ≥44×44; computed delete-button dimensions ≥44×44.
- `TodoRow` checkbox has `aria-label="Mark complete: {description}"` when `completed: false`.
- `TodoRow` delete button has `aria-label="Delete todo: {description}"`.
- `TodoRow` re-renders only when `todo`, `onToggle`, `onDeleteRequest`, or `isMutating` change (React.memo working) — verified by counting renders with a spy on the component function.
- `TodoList` renders `<ul>` with only `completed === false` todos in the received order, using stable `key={todo.id}`.
- `TodoList` with a mixed list renders only the active section (Completed section deferred to Epic 3).
- `LoadingSkeleton` with default props renders 3 placeholder rows; with `rows={4}` renders 4.
- `LoadingSkeleton` container has `aria-busy="true"`, `aria-live="polite"`, and a visually-hidden "Loading your todos" label accessible to screen readers.
- `EmptyState` renders exactly the strings `"No todos yet."` and `"Add one below."` in the specified typography.
- `EmptyState` SVG has `aria-hidden="true"` (decorative).
- axe-core render test for each component reports zero violations.

*Integration:* none at this layer — components are presentational; full wire-up in Story 2.6.

*E2E:* none — covered indirectly by Journey 1 E2E in Story 2.6.

### Story 2.6: End-to-end wire-up in `App.tsx` — Journey 1 complete

As a user,
I want to land on the app, type a todo, press Enter, and see it appear in a persisted list,
So that Journey 1 works end-to-end under SC-001 (≤60 seconds from landing).

**Acceptance Criteria:**

**Given** `apps/web/src/App.tsx` composes the page
**When** the app mounts
**Then** it renders `<Header />`, then `<AddTodoInput onSubmit={createMutation.mutate} disabled={createMutation.isPending} error={createError} />`, then the list area below
**And** the page container is a single centered column with `max-w-xl mx-auto`, `px-4` on mobile, `pt-8 lg:pt-16` (UX-DR13)

**Given** `useTodos` is consumed at the top of the list area
**When** `isPending` is true
**Then** `<LoadingSkeleton />` is rendered in the list area (no `EmptyState` flash)
**When** `isPending` is false and `data.length === 0`
**Then** `<EmptyState />` is rendered in the list area
**When** `isPending` is false and `data.length > 0`
**Then** `<TodoList todos={data} ... />` is rendered (active section only in this epic)

**Given** `useCreateTodo` is consumed at the top level
**When** the user types "Buy milk" and presses Enter in `AddTodoInput`
**Then** a `POST /v1/todos` is issued
**And** on `201`, `['todos']` is invalidated, `useTodos` refetches, and the new row appears at the end of the active list
**And** the input clears and re-focuses for the next entry
**And** if the POST fails (network or 5xx), `createError.message` is passed to `AddTodoInput` and the typed text is preserved (inline error polish happens in Epic 4)

**Given** the Journey 1 manual smoke
**When** the engineer opens `http://localhost:5173` on a fresh DB, types "Buy milk", presses Enter, then refreshes the page
**Then** the row appears immediately after submit (input re-focuses) and survives the refresh
**And** at 320px viewport width there is zero horizontal scroll and all elements are readable

**Given** the total clone-to-Journey-1 time
**When** a new engineer follows the README and exercises Journey 1
**Then** they complete "type first todo and see it persist" in ≤60 seconds from the app URL loading (SC-001, single-user, unmoderated smoke — formal n=5 usability test lives in Epic 5)

**Test Scenarios:**

*Unit:*
- `<App />` rendered with a mocked `useTodos` returning `{ isPending: true }` renders `<LoadingSkeleton />` in the list area.
- `<App />` rendered with `useTodos` returning `{ isPending: false, data: [] }` renders `<EmptyState />`.
- `<App />` rendered with `useTodos` returning `{ isPending: false, data: [todo1, todo2] }` renders `<TodoList todos={...} />`.
- Container has computed classes `max-w-xl mx-auto`, `px-4` on mobile, `pt-8 lg:pt-16`.

*Integration:*
- Full App tree (`ErrorBoundary + QueryClientProvider + App`) mounted with `fetch` mocked to return `[]`: after initial pending state resolves, `<EmptyState />` is visible.
- Same mount with `fetch` returning 2 todos: after resolve, 2 rows render.
- Typing "Buy milk" + Enter with `fetch` mocked to return `201 { ... new todo }`, then mocked GET returning the original list + the new todo: the new row appears in the UI after invalidation + refetch; input clears and re-focuses.
- Typing "Buy milk" + Enter with `fetch` mocked to reject the POST: `AddTodoInput` shows its error region; typed text preserved; no new row.

*E2E (Playwright, `apps/web/e2e/journey-1.spec.ts`):*
- Open app on a freshly-migrated (empty) DB; assert the `Todos` header and the `EmptyState` copy "No todos yet." are visible.
- Type "Buy milk" in the input; press Enter; assert a row containing "Buy milk" is visible in the Active section within 1s.
- Reload the page; assert the row is still visible (persistence across refresh — FR-011 boundary 1).
- Set viewport to 320px × 800px; assert `document.documentElement.scrollWidth <= 320` (no horizontal scroll); assert input + Add button + row remain functional.

## Epic 3: Complete & Delete — Finish the Core Loop

**Epic goal:** User completes Journey 2 — marks todos complete with strike-through + 60% opacity + section reorder (optimistic), un-checks to revert, and deletes via a modal confirmation. The full create → view → complete → delete loop is now working.

### Story 3.1: `UpdateTodoInput` schema + `todosRepo.update` + `PATCH /v1/todos/:id`

As a user,
I want to toggle a todo's completion via the API,
So that my marking-complete action persists and returns the updated record.

**Acceptance Criteria:**

**Given** `apps/api/src/schemas/todo.ts` is extended
**When** the engineer inspects the file
**Then** an `UpdateTodoInput` schema is declared accepting exactly `{ completed: boolean }` (strict — no other keys; `description` is immutable in MVP)
**And** `additionalProperties: false` is enforced on the schema
**And** the static TS type is exported via `Static<typeof UpdateTodoInput>`

**Given** `todosRepo.update(id: string, { completed }: UpdateTodoInput)` is exported
**When** `update` is called with an existing `id`
**Then** it updates the row's `completed` column via Kysely
**And** returns the updated row serialized to the `Todo` shape (camelCase, ISO 8601 `createdAt`)
**When** `update` is called with a non-existent `id`
**Then** it throws `NotFoundError('Todo {id} not found')`

**Given** `PATCH /v1/todos/:id` is registered in `apps/api/src/routes/todos.ts`
**When** a client issues `PATCH /v1/todos/<valid-id>` with body `{ "completed": true }`
**Then** the response is `200` with body matching the `Todo` schema and `completed: true`
**When** the same endpoint is called with body `{ "completed": false }`
**Then** the response is `200` with body `completed: false`

**Given** the request-validation rules
**When** a client issues `PATCH /v1/todos/<valid-id>` with an unknown key or missing `completed`
**Then** the response is `400` with the Fastify default error envelope
**When** a client issues `PATCH /v1/todos/<non-existent-id>` with a valid body
**Then** the response is `404` with message `Todo <id> not found` via the global error handler

**Given** the contract test at `apps/api/test/contract.todos.test.ts` is extended
**When** the test runs
**Then** it asserts `PATCH` returns `200` + `Todo` shape with `completed` flipped on a valid payload
**And** it asserts `400` on an invalid body
**And** it asserts `404` on a non-existent id

**Test Scenarios:**

*Unit:*
- TypeBox `UpdateTodoInput` rejects extra keys (e.g., `{ completed: true, description: 'x' }`), rejects missing `completed`, rejects non-boolean `completed`; accepts `{ completed: true }` and `{ completed: false }`.
- `todosRepo.update` with a mocked Kysely that reports 0 affected rows throws `NotFoundError('Todo {id} not found')`.
- `todosRepo.update` with a mocked Kysely that reports 1 affected row returns the serialized `Todo` shape (camelCase, ISO 8601).

*Integration:*
- `PATCH /v1/todos/<existing-id>` with `{ completed: true }` against real Postgres returns `200` + `Todo` with `completed: true`; the row in Postgres reflects the change.
- `PATCH /v1/todos/<existing-id>` with `{ completed: false }` on an already-completed row flips it back.
- `PATCH /v1/todos/<existing-id>` with invalid body (`{}`, `{ completed: 'true' }`, `{ description: 'x' }`) returns `400`.
- `PATCH /v1/todos/00000000-0000-0000-0000-000000000000` (non-existent UUID) returns `404` with message `Todo 00000000-0000-0000-0000-000000000000 not found`.

*E2E:* none — first user-visible toggle E2E is Story 3.4.

### Story 3.2: `todosRepo.remove` + `DELETE /v1/todos/:id`

As a user,
I want to delete a todo via the API,
So that confirmed deletions remove the record permanently.

**Acceptance Criteria:**

**Given** `todosRepo.remove(id: string)` is exported
**When** `remove` is called with an existing `id`
**Then** it issues a hard-delete via Kysely (no soft-delete in MVP)
**And** returns the number of affected rows (`1` on success)
**When** `remove` is called with a non-existent `id`
**Then** it returns `0` (or the route throws `NotFoundError` if the route is the one mapping `0` → 404)

**Given** `DELETE /v1/todos/:id` is registered in `apps/api/src/routes/todos.ts`
**When** a client issues `DELETE /v1/todos/<valid-id>`
**Then** the response is `204` with no body
**When** a client issues `DELETE /v1/todos/<non-existent-id>`
**Then** the response is `404` with message `Todo <id> not found` via the global error handler

**Given** a row is deleted and the server is restarted
**When** `GET /v1/todos` is called after restart
**Then** the deleted row does NOT appear in the response (verifies hard-delete + persistence)

**Given** the contract test is extended
**When** the test runs
**Then** it asserts `DELETE` returns `204` with empty body on a valid id
**And** it asserts the `Content-Length: 0` or equivalent empty-response semantics
**And** it asserts `404` on a non-existent id

**Test Scenarios:**

*Unit:*
- `todosRepo.remove` with a mocked Kysely reporting 1 affected row returns `1`.
- `todosRepo.remove` with a mocked Kysely reporting 0 affected rows returns `0`.

*Integration:*
- `DELETE /v1/todos/<existing-id>` against real Postgres returns `204` with empty body; a subsequent `GET /v1/todos` does not include the deleted row.
- `DELETE /v1/todos/<non-existent-id>` returns `404` with the Fastify envelope.
- Delete a row, close the app via `app.close()`, rebuild via `buildApp(config)`, `GET /v1/todos` — the deleted row remains absent (persistence of deletion across restart).

*E2E:* none — first user-visible delete E2E is Story 3.5.

### Story 3.3: `useOptimisticTodoMutation` factory + `useToggleTodo` + `useDeleteTodo` hooks

As a user,
I want toggle and delete actions to feel instant,
So that the row updates immediately in the UI and only reverts if the server actually fails.

**Acceptance Criteria:**

**Given** `apps/web/src/hooks/useOptimisticTodoMutation.ts` exports a factory
**When** the engineer inspects the factory
**Then** it accepts `{ mutationKey, mutationFn, applyOptimistic: (prev: Todo[], input) => Todo[] }` and returns a `useMutation(...)` configured with the architecture-specified pattern:
  - `onMutate(input)` cancels in-flight `['todos']` queries, snapshots `previous = queryClient.getQueryData<Todo[]>(['todos'])`, calls `queryClient.setQueryData(['todos'], applyOptimistic(previous, input))`, returns `{ previous }`
  - `onError(err, input, ctx)` calls `queryClient.setQueryData(['todos'], ctx.previous)` to restore the snapshot
  - `onSettled()` calls `queryClient.invalidateQueries({ queryKey: ['todos'] })`

**Given** `apps/web/src/hooks/useToggleTodo.ts` consumes the factory
**When** a component calls `useToggleTodo()`
**Then** it returns a mutation with `mutationKey: ['todos', 'toggle']`, `mutationFn: ({ id, completed }) => api.todos.update(id, { completed })`
**And** `applyOptimistic` returns a new array where the matching `id` has its `completed` flipped to the input value (no in-place mutation, no `sort()`)
**And** on server error, the snapshot is restored (optimistic row reverts to its prior state)

**Given** `apps/web/src/hooks/useDeleteTodo.ts` consumes the factory
**When** a component calls `useDeleteTodo()`
**Then** it returns a mutation with `mutationKey: ['todos', 'delete']`, `mutationFn: (id: string) => api.todos.delete(id)`
**And** `applyOptimistic` returns a new array with the matching `id` filtered out
**And** on server error, the snapshot is restored (row reappears)

**Given** `apps/web/src/api/todos.ts` is extended
**When** the engineer inspects the file
**Then** it exports `update(id: string, input: UpdateTodoInput): Promise<Todo>` calling `apiClient.patch('/v1/todos/${id}', input)`
**And** it exports `delete(id: string): Promise<void>` calling `apiClient.del('/v1/todos/${id}')` and resolving void on `204`

**Given** unit tests for the two hooks co-located as `useToggleTodo.test.ts(x)` and `useDeleteTodo.test.ts(x)`
**When** the tests run under Vitest
**Then** they assert the optimistic-then-revert behavior by mocking `api.todos` at the module boundary (not by mocking `fetch`)
**And** they assert `['todos']` is invalidated on settle

**Test Scenarios:**

*Unit:*
- `useOptimisticTodoMutation` factory composed with a dummy `applyOptimistic`: on mutate, cancels in-flight `['todos']` queries, snapshots prior cache, applies the optimistic transform (verified via spies on a mocked queryClient).
- Same factory on error: restores the snapshot (cache value after rejection equals the snapshot).
- Same factory on settled (success or failure): calls `invalidateQueries({ queryKey: ['todos'] })`.
- `useToggleTodo`'s `applyOptimistic({ id: 'abc', completed: true })` on `[{ id: 'abc', completed: false, ... }]` returns a new array (different reference) with the matching row's `completed` flipped.
- `useDeleteTodo`'s `applyOptimistic('abc')` on `[{ id: 'abc', ... }, { id: 'xyz', ... }]` returns a new array with only the `xyz` row.
- Neither `applyOptimistic` mutates the input array (immutability check via frozen-object test).

*Integration:*
- `useToggleTodo` within a real `QueryClientProvider` + mocked `api.todos.update` rejecting: cache shows optimistic state mid-flight; on rejection, cache reverts; after settle, cache is invalidated.
- `useToggleTodo` with `api.todos.update` resolving: cache shows optimistic state; on resolve, cache still shows the same state; after settle, cache is invalidated and refetch returns the same authoritative state.
- `useDeleteTodo` within real `QueryClientProvider` + rejecting mock: row removed optimistically, then reappears on revert.
- `useDeleteTodo` with resolving mock: row removed optimistically, then invalidation refetches without the row.

*E2E:* none — optimistic behavior surfaces in user-facing E2E specs in Stories 3.4 and 3.5.

### Story 3.4: `TodoRow` completed state + `TodoList` completed section + `App.tsx` sectioning

As a user,
I want checking a todo's checkbox to strike it through, fade it to 60% opacity, and move it to the Completed section — instantly,
So that completion feels like a satisfying, reinforcing gesture while remaining accessible.

**Acceptance Criteria:**

**Given** `TodoRow` is extended for the completed state
**When** `todo.completed === true`
**Then** the description renders with `line-through` + opacity `0.6` (per `--color-completed-fg` token)
**And** the checkbox is rendered in its checked state via native `<input type="checkbox" checked>` (no custom checkbox)
**And** the `aria-label` on the checkbox reads `"Mark incomplete: {description}"`
**And** the transition between default and completed uses `transition-property: opacity, text-decoration-color` with `duration-200 ease-out` (CSS only — no JS animation)
**And** under `prefers-reduced-motion: reduce` the transition is instant (global CSS rule already in place from story 1.5)

**Given** `TodoList` is extended to render both sections
**When** `todos` is a mixed list
**Then** the Active section is rendered as a single `<ul>` containing all todos where `completed === false` (in received order)
**And** the Completed section is rendered only when at least one todo has `completed === true`
**And** the Completed section has an `mt-6` separator and a preceding `<h2>` (or equivalent) with text `"Completed"` in `text-sm text-[--color-fg-muted]` (no border/line)
**And** the Completed `<ul>` contains all todos where `completed === true` (in received order)
**And** stable keys `key={todo.id}` are used across both sections so React preserves row identity during the optimistic section-move

**Given** `App.tsx` wires toggling
**When** a user clicks a checkbox on a row
**Then** `useToggleTodo().mutate({ id, completed: !todo.completed })` is called
**And** the row immediately reflects the new state in the correct section (optimistic)
**And** on success, the invalidation causes a refetch that matches the optimistic state
**And** on failure, the row reverts to its prior state (toggle UI remains — inline error comes in Epic 4)

**Given** the contrast audit
**When** the axe-core test at `apps/web/test/a11y/TodoList.a11y.test.tsx` renders a list with at least one completed row
**Then** the `color-contrast` rule reports zero violations against `--color-completed-fg` (the effective ratio for `#1A1A1A` at 60% opacity over `#FAFAFA` must be ≥4.5:1 per FR-006/NFR-007)
**And** the axe-core test at `TodoRow.a11y.test.tsx` covers both `completed: false` and `completed: true` states

**Given** Journey 2's toggle section manual smoke
**When** the engineer opens the app with an existing todo, clicks its checkbox, then unchecks it
**Then** the row moves to the Completed section on check and back to Active on uncheck
**And** the transition is a single perceived gesture (no stuttered re-renders)
**And** no network latency is visible to the user (optimistic update)

**Test Scenarios:**

*Unit:*
- `TodoRow` with `todo.completed === true` renders the description with computed `text-decoration: line-through` and computed `opacity: 0.6`.
- `TodoRow` with `completed === true` renders the checkbox with `aria-label="Mark incomplete: {description}"` and `checked` set.
- `TodoList` with a mixed list renders two `<ul>` groups: the first contains only `completed: false` rows in received order; the second contains only `completed: true` rows in received order.
- `TodoList` with all-completed list renders the Completed section with its "Completed" label; `TodoList` with all-active list does NOT render the Completed section.
- `TodoList` keys remain stable across a toggle (React preserves row identity).

*Integration:*
- Full App tree + real TanStack Query + mocked fetch: mount with 2 active + 1 completed todo; click a checkbox on an active row; assert the row moves to the Completed section synchronously (before the fetch resolves).
- Same setup + PATCH mocked to resolve: after settle, the row remains in the Completed section.
- Same setup + PATCH mocked to reject: the row reverts to the Active section after rejection.
- axe-core render test for `TodoList` with at least one completed row: `color-contrast` reports zero violations (FR-006 / NFR-007).
- axe-core render test for `TodoRow` in both `completed: false` and `completed: true` states.

*E2E (Playwright, `apps/web/e2e/journey-2-toggle.spec.ts`):*
- Seed 3 todos via the API; open the app; assert 3 rows in the Active section.
- Click the first row's checkbox; assert within 300ms the row appears in the Completed section with visible strike-through and 60% opacity.
- Reload the page; assert the row is still in the Completed section.
- Click the row's checkbox again; assert the row returns to the Active section.
- Verify at 320px viewport: toggle works without horizontal scroll; row layout remains readable.

### Story 3.5: `DeleteTodoModal` component + `App.tsx` delete flow — Journey 2 complete

As a user,
I want a confirmation modal before deletion,
So that I cannot accidentally lose a todo with a stray tap, and the destructive action is deliberate.

**Acceptance Criteria:**

**Given** `DeleteTodoModal` at `apps/web/src/components/DeleteTodoModal.tsx`
**When** the component renders with `todo !== null`
**Then** a native `<dialog open>` is mounted with `role="dialog"`, `aria-modal="true"`, `aria-labelledby={titleId}`, `aria-describedby={bodyId}`
**And** the surface is `#FFFFFF`, `rounded-lg`, `shadow-sm`, `max-width: 400px`, `p-6`, centered, with a 30% black backdrop
**And** the modal transition on open/close is `~150ms ease-out` (backdrop fade + modal scale 95% → 100%); respects `prefers-reduced-motion`

**Given** the locked copy commitments
**When** the engineer inspects the rendered modal
**Then** the title reads exactly `"Delete this todo?"` in `text-lg font-semibold` (18px)
**And** the body reads exactly `"This cannot be undone."`
**And** the Cancel button reads exactly `"Cancel"` and is styled as the Secondary variant
**And** the Delete button reads exactly `"Delete"` and is styled as the Danger variant
**And** both buttons are the same height (44px min) and same font-weight (`font-medium`) — no default-action styling

**Given** the focus-management contract
**When** the modal opens
**Then** focus moves to the Cancel button by default (least-destructive action)
**And** Tab/Shift-Tab stays trapped within the modal (native `<dialog>` behavior)
**When** the user presses Escape
**Then** the modal closes and focus returns to the delete icon button that opened it (ref stored by `App.tsx`)
**When** the user clicks the backdrop (outside the modal content)
**Then** the modal closes (same behavior as Cancel)

**Given** `App.tsx` owns modal state via `useState<Todo | null>(null)` (`todoPendingDelete`)
**When** a user clicks a row's delete icon
**Then** `App.tsx` stores the todo in state, which opens the modal
**And** the ref to the clicked delete icon is stored so focus can return on close
**When** the user clicks Cancel or presses Escape or clicks the backdrop
**Then** `todoPendingDelete` is set to `null` and the modal unmounts
**When** the user clicks Delete
**Then** `useDeleteTodo().mutate(todo.id)` is called
**And** the row is optimistically removed from the list
**And** the modal closes and focus returns to a sensible landing spot (e.g., `AddTodoInput`, since the originating delete icon no longer exists after optimistic removal)

**Given** failure handling is scoped to Epic 4
**When** the DELETE fails during this epic
**Then** the optimistic factory reverts the removal (row reappears)
**And** the modal is already closed (detailed modal-error UX with `"Couldn't delete. Check your connection."` + Retry is built in Epic 4)
**And** this deferred behavior is explicitly noted in code comments so Epic 4 finds the right extension point

**Given** an axe-core render test at `apps/web/test/a11y/DeleteTodoModal.a11y.test.tsx`
**When** the test renders the modal open
**Then** `axe` reports zero violations
**And** the `aria-labelledby` and `aria-describedby` targets exist in the DOM

**Given** Journey 2 manual smoke (end-to-end)
**When** the engineer opens the app on a populated list and exercises: check one todo → it moves to Completed; uncheck it → it moves back; click delete icon → modal opens with Cancel focused; press Escape → modal closes, focus returns; click delete icon → modal opens; click Delete → row disappears, modal closes; refresh the page
**Then** all state transitions resolve without perceived lag
**And** after refresh, the list reflects exactly the final state from the session (persistence is real)
**And** at 320px viewport width, the modal is full-width minus 32px margin, no horizontal scroll, tap targets are ≥44×44

**Test Scenarios:**

*Unit:*
- `DeleteTodoModal` with `todo: null` renders nothing.
- `DeleteTodoModal` with `todo: <todo>` renders `<dialog open>` with `role="dialog"`, `aria-modal="true"`, the locked title, body, Cancel button, and Delete button.
- `DeleteTodoModal` has matching `aria-labelledby` / `aria-describedby` id references that point to existing DOM elements.
- Pressing Escape fires `onCancel` once.
- Clicking the backdrop (outside the modal content) fires `onCancel`.
- Cancel button has initial focus after `onOpen`.
- Cancel and Delete buttons have identical computed height and font-weight.
- axe-core render test reports zero violations.

*Integration:*
- Full App tree + real TanStack Query + mocked `api.todos.delete` resolving: render with a populated list; click a row's delete icon; assert the modal opens; click Delete; assert the row is removed from the list cache and the modal unmounts.
- Same setup + Escape keypress instead of Cancel click: the modal closes with no mutation fired.
- Focus-return assertion: before opening, focus is on a delete icon; after modal opens → close (Cancel / Escape / backdrop), focus returns to that delete icon (when it still exists in DOM).

*E2E (Playwright, `apps/web/e2e/journey-2-delete.spec.ts`):*
- Seed 3 todos via the API; open the app; click the first row's delete icon; assert the modal is visible with the exact title "Delete this todo?" and body "This cannot be undone.".
- Assert the Cancel button is focused.
- Press Escape; assert the modal closes and the row is still in the list.
- Open the modal again; click Delete; assert the row is removed from the UI and the modal closes.
- Reload the page; assert the deleted row does not reappear.
- At 320px viewport, the modal width equals `viewport - 32px`; Cancel + Delete buttons are each ≥44×44.

## Epic 4: Failure-Proof User Experience

**Epic goal:** Journey 3 — users never lose work when something fails. Errors appear at the exact failure site with Retry; input/state is preserved. Persistence verified end-to-end across server restart.

### Story 4.1: `InlineError` component

As a user,
I want any failed action to show me a clear, accessible error with a way to retry,
So that I can recover without losing work and without confusion about what went wrong.

**Acceptance Criteria:**

**Given** the `InlineError` component at `apps/web/src/components/InlineError.tsx`
**When** the engineer inspects the file
**Then** the component accepts props `{ message: string, onRetry?: () => void, isRetrying?: boolean }`
**And** it renders a flex row: `[icon + message]` on the left, `[Retry button]` on the right
**And** the icon is a 16×16 decorative SVG with `aria-hidden="true"`
**And** the layout rules: `rounded-md`, `px-3`, `py-3`, background `#fef2f2`, 1px border `#fecaca`, text `#991b1b`

**Given** the rendered output
**When** the component mounts
**Then** the wrapper has `role="alert"` and `aria-live="polite"` (screen-readers announce the error)
**And** the message text renders verbatim from the `message` prop (no template injection, no newline stripping)

**Given** `onRetry` is provided
**When** the Retry button renders
**Then** it is styled as the Secondary variant at 36px height (documented inline exception to the 44px rule for inline errors)
**And** it reads exactly `"Retry"`
**And** clicking it calls `onRetry()` once
**When** `isRetrying` is `true`
**Then** the Retry button is `disabled` with `aria-busy="true"`

**Given** `onRetry` is not provided
**When** the component renders
**Then** no Retry button is rendered (error remains visible until the parent unmounts the component)

**Given** an axe-core test at `apps/web/test/a11y/InlineError.a11y.test.tsx`
**When** the test runs
**Then** it renders `<InlineError message="Couldn't save. Check your connection." onRetry={() => {}} />` and asserts `axe` reports zero violations
**And** the `color-contrast` check passes for `#991b1b` on `#fef2f2`

**Test Scenarios:**

*Unit:*
- `<InlineError message="X" />` renders message "X" verbatim, no Retry button, no icon action.
- `<InlineError message="X" onRetry={fn} />` renders a Retry button; clicking it calls `fn` exactly once.
- `<InlineError message="X" onRetry={fn} isRetrying={true} />` renders Retry with `disabled` and `aria-busy="true"`.
- Wrapper has `role="alert"` and `aria-live="polite"`.
- Icon has `aria-hidden="true"`.
- Computed Retry button height is 36px (documented inline-error exception).
- axe-core render test reports zero violations; the `color-contrast` rule passes for `#991b1b` on `#fef2f2`.

*Integration:* none at this layer — `InlineError` is a pure presentational component.

*E2E:* none — user-facing error flows land in Stories 4.2 and 4.3 E2E specs.

### Story 4.2: Create-failure flow — `AddTodoInput` inline error with preserved input + Retry

As a user,
I want a failed create to show an inline error under the input, preserve my typed text, and offer Retry,
So that I can recover from a network blip without retyping.

**Acceptance Criteria:**

**Given** `AddTodoInput` is extended to render `InlineError` below the input when a parent passes `error`
**When** the parent passes `error="Couldn't save. Check your connection."` and `onRetry={...}`
**Then** the minimal inline-error region from story 2.4 is replaced by the real `InlineError` component
**And** the Retry button in the `InlineError` calls the parent's `onRetry`
**And** the input's typed text is NOT cleared (it was never cleared on error per story 2.4)
**And** the Add button is re-enabled (not `aria-busy`)

**Given** `App.tsx` is extended to own create-error state
**When** a user submits "Buy milk" and the POST fails (network or 5xx)
**Then** `App.tsx` captures the last-attempted description in local state (`lastCreateAttempt`)
**And** passes `error=createMutation.error.message || "Couldn't save. Check your connection."` to `AddTodoInput`
**And** passes `onRetry={() => createMutation.mutate(lastCreateAttempt)}` to `AddTodoInput`
**And** on any successful submit (retry or fresh submit), `lastCreateAttempt` is cleared and `error` becomes `null`

**Given** the copy commitment
**When** the `InlineError` renders for a create failure
**Then** the message reads exactly `"Couldn't save. Check your connection."` (mapped from any non-2xx or network error — raw server error text is never shown)

**Given** a fault-injection test at `apps/web/src/components/AddTodoInput.test.tsx` (or co-located equivalent)
**When** the test renders the composition with `api.todos.create` mocked to reject with a network-like error
**Then** the user submits a description; the test asserts the `InlineError` appears below the input with the locked copy and a visible Retry
**And** the input retains its typed value
**And** the test asserts clicking Retry calls the mutation again with the same description
**And** the test asserts that on a subsequent successful `create`, the input clears, re-focuses, and the error disappears

**Test Scenarios:**

*Unit:*
- `AddTodoInput` with `error="Couldn't save. Check your connection."` renders the `InlineError` component below the input with that exact message.
- With a non-null `error` and `onRetry` provided, the Retry button is visible inside the error region.
- The input retains its typed value when `error` transitions from `null` to a string (no clear on error).
- When `error` transitions from a string to `null` (parent clears it), the error region unmounts.

*Integration:*
- Full App tree + real TanStack Query + mocked `api.todos.create` rejecting once: submit "Buy milk"; assert `InlineError` appears below the input with the locked copy; assert the input still contains "Buy milk"; assert Retry is visible.
- Same setup, then mock `api.todos.create` to resolve on the second call; click Retry; assert POST fires with body `{ description: 'Buy milk' }`; assert the row is added, the input clears and re-focuses, and the error unmounts.
- `App.tsx` clears `lastCreateAttempt` on successful submit (including Retry success AND on any subsequent fresh successful submit).

*E2E (Playwright, `apps/web/e2e/journey-3-create-fail.spec.ts`):*
- Intercept `POST /v1/todos` to return `500` once, then pass through to real handler on subsequent calls.
- Open the app (empty DB); type "Buy milk" + Enter.
- Assert within 1s: the `InlineError` with exact copy "Couldn't save. Check your connection." is visible below the input; the input still contains "Buy milk"; no row has been added.
- Click Retry; assert the row "Buy milk" appears; the input clears and re-focuses; the error disappears.

### Story 4.3: Toggle-failure row-anchored error + delete-failure modal-anchored error

As a user,
I want a failed toggle to surface an inline error on the affected row, and a failed delete to surface the error inside the still-open modal,
So that errors appear exactly where I took the action and I can retry without re-navigating.

**Acceptance Criteria:**

**Given** `TodoRow` is extended
**When** props `{ error?: string | null, onRetry?: () => void, isRetrying?: boolean }` are provided
**Then** an `<InlineError>` renders as a second row directly below the TodoRow's main content (still inside the same `<li>`)
**And** the error only renders when `error` is a non-empty string
**And** when `error` is `null` or absent, the row renders normally (no error region)

**Given** `App.tsx` tracks toggle-failure state
**When** a toggle mutation rejects
**Then** `App.tsx` records `{ id, desiredCompleted }` in a local `Map<string, ToggleAttempt>` keyed by `todo.id`
**And** passes `error="Couldn't save. Check your connection."` and `onRetry={() => toggleMutation.mutate({ id, completed: desiredCompleted })}` to the affected `TodoRow`
**And** the optimistic factory has already reverted the row to its prior state (per story 3.3)
**When** a retry succeeds
**Then** the `Map` entry for that id is deleted
**And** the row renders without error
**When** a fresh toggle on the same row succeeds before retry
**Then** the pending error for that id is also cleared

**Given** `DeleteTodoModal` is extended to render an in-modal error state
**When** a parent passes `error="Couldn't delete. Check your connection."` and `isDeleting: false`
**Then** the modal BODY text is replaced by the `InlineError` component (same `role="alert"` region)
**And** the Delete button label flips to `"Retry"` while still Danger-styled
**And** the Cancel button remains enabled and dismisses the modal
**And** the modal stays open until the user cancels or retry succeeds

**Given** `App.tsx` wires the delete-failure path
**When** the user clicks Delete in the modal and the DELETE mutation rejects
**Then** the modal does NOT close (overriding the auto-close from story 3.5)
**And** the modal transitions into the error state (body replaced by `InlineError`; Delete → Retry)
**And** the optimistic factory has already reverted the row removal (row reappears in the list behind the modal)
**When** the user clicks Retry and the retry succeeds
**Then** the row is removed and the modal closes (focus returns per story 3.5)
**When** the user clicks Cancel in the error state
**Then** the modal closes with no further action

**Given** the copy commitments
**When** each error branch renders
**Then** toggle failure reads exactly `"Couldn't save. Check your connection."`
**And** delete failure reads exactly `"Couldn't delete. Check your connection."`

**Given** fault-injection tests
**When** `apps/web/test/a11y/DeleteTodoModal.a11y.test.tsx` and a co-located `TodoRow.test.tsx` are extended
**Then** they mock `api.todos.update` / `api.todos.delete` to reject
**And** assert the error UI renders in the correct anchor (row vs modal)
**And** assert Retry re-fires the original mutation with identical arguments
**And** axe-core still reports zero violations on the error states

**Given** Journey 3 manual smoke
**When** the engineer uses DevTools to go offline and exercises: create → see error under input, text preserved, Retry succeeds when back online; toggle a row → see error under row, row reverts; delete → modal shows error + Retry
**Then** in all three paths no data is lost and Retry succeeds after going back online

**Test Scenarios:**

*Unit:*
- `TodoRow` with `error="Couldn't save. Check your connection."` and `onRetry` renders an `InlineError` below the row content, inside the same `<li>`.
- `TodoRow` with `error: null` (or absent) renders normally (no error region).
- `DeleteTodoModal` with `error="Couldn't delete. Check your connection."` replaces the body text with the `InlineError` region; the Delete button label becomes "Retry" (still Danger styled, same height/weight as Cancel).
- `DeleteTodoModal` with error active: Cancel remains enabled and closes the modal on click.
- axe-core render tests on both error states (TodoRow with error, DeleteTodoModal with error) report zero violations.

*Integration:*
- Full App tree + real TanStack Query + mocked `api.todos.update` rejecting: click a row checkbox; assert the optimistic state is visible briefly; assert after rejection the row reverts AND the `InlineError` appears below that row with the locked toggle copy.
- Same setup, then mock `api.todos.update` to resolve on the second call; click Retry on the row; assert PATCH fires with identical arguments; assert on success the row reflects the requested state and the error disappears.
- Full App tree + mocked `api.todos.delete` rejecting: open the modal; click Delete; assert the optimistic removal briefly; assert after rejection the row reappears in the list; assert the modal is still open with body replaced by `InlineError` and the button labeled "Retry".
- Same setup, then mock `api.todos.delete` to resolve on retry; click Retry; assert the row is removed and the modal closes.
- Cancel in the modal's error state closes the modal without any further action; the row remains in the list (reverted state).

*E2E (Playwright, split across two specs):*
- `apps/web/e2e/journey-3-toggle-fail.spec.ts`: seed 1 todo; intercept `PATCH /v1/todos/*` to return `500` once; click its checkbox; assert the row briefly appears in Completed, then reverts to Active with an `InlineError` below the row (locked copy) and a Retry button; click Retry; assert the row moves to Completed and the error disappears.
- `apps/web/e2e/journey-3-delete-fail.spec.ts`: seed 1 todo; intercept `DELETE /v1/todos/*` to return `500` once; open the modal; click Delete; assert the modal stays open with body replaced by the locked delete-failure copy and Retry button; click Retry; assert the row is removed and the modal closes.

### Story 4.4: API global error handler coverage + persistence integration test (NFR-003)

As a developer,
I want the API's global error handler and persistence contract verified by integration tests,
So that NFR-003 (zero loss across refresh/close/restart) and NFR-004 (error resilience) are proven, not assumed.

**Acceptance Criteria:**

**Given** `apps/api/test/integration.errors.test.ts` exists
**When** the test runs against a real Postgres instance (CI service or local Docker)
**Then** it asserts `PATCH /v1/todos/<non-existent-id>` with a valid body returns `404` with Fastify default envelope and message `Todo <id> not found`
**And** asserts `DELETE /v1/todos/<non-existent-id>` returns `404` with the same envelope
**And** asserts `POST /v1/todos` with a TypeBox-invalid body returns `400` with a structured message (no stack trace, no raw error object leaked)
**And** asserts that a simulated Postgres `23xxx` constraint violation (forced via a crafted migration conflict or a direct repo call) is mapped to `409` with a safe message (never the raw Postgres error text)
**And** asserts that any unexpected thrown error maps to `500` with a generic message AND the full error is logged via pino (capture logger output; assert the log record contains the original error)

**Given** `apps/api/test/integration.persistence.test.ts` exists
**When** the test runs
**Then** it boots the Fastify app against the real Postgres instance via `buildApp(config)`
**And** creates three todos via `POST /v1/todos`
**And** tears down the app instance (calls `app.close()`) — simulating a server process stop
**And** boots a fresh `buildApp(config)` instance (same `DATABASE_URL`)
**And** issues `GET /v1/todos` and asserts all three todos are returned with identical `id`, `description`, `completed`, `createdAt`, `userId` values
**And** asserts the order is the same as before the restart (FR-002 ordering stable across restarts)

**Given** the CI pipeline from story 1.6
**When** the CI runs on a PR touching these integration tests
**Then** the `services.postgres` container is healthchecked before tests start
**And** `npm run migrate --workspace apps/api` runs against the service container before tests
**And** both integration test files execute as part of `npm test` and fail CI on any assertion miss
**And** the CI job is not silently green when Postgres is unreachable (Vitest must fail fast on a connection error, never skip)

**Given** the `pg-data` named volume contract from story 1.3
**When** the engineer runs a manual smoke: create a todo locally, `docker compose down` (no `-v`), `docker compose up -d postgres`, issue `GET /v1/todos`
**Then** the todo is still present (complements the automated integration test by proving the volume binding survives container recreate — NFR-003 boundary 3: server restart)

**Given** NFR-004 coverage
**When** the Journey 3 tests across stories 4.2, 4.3, and this story's `integration.errors.test.ts` are considered together
**Then** every CRUD verb has at least one happy-path contract test AND one fault-injection test
**And** every fault-injection test asserts the user-facing error envelope shape AND (where applicable) that no data was lost or corrupted

**Test Scenarios:**

*Unit:*
- The error-handler mapping function, called in isolation with crafted shapes (TypeBox validation, `NotFoundError`, `{ code: '23505' }`, generic `Error`), produces the expected envelope + status (extends Story 1.4 unit scenarios with Postgres-specific and NotFoundError paths).
- The logger receives the full original error for the generic path (verified via a captured pino stream).

*Integration:*
- `integration.errors.test.ts`: `PATCH /v1/todos/<non-existent-id>` → `404` + envelope with correct message.
- Same file: `DELETE /v1/todos/<non-existent-id>` → `404` + envelope.
- Same file: `POST /v1/todos` with TypeBox-invalid body → `400` + envelope (no raw stack trace).
- Same file: a forced Postgres `23xxx` error (via a crafted repo call or direct insert violating a constraint) → `409` with safe message (raw Postgres text not leaked).
- Same file: a thrown generic `Error` in a dummy route → `500` + generic message + full error captured in the log stream.
- `integration.persistence.test.ts`: boot `buildApp`, create 3 todos, `app.close()`, rebuild `buildApp` with same `DATABASE_URL`, `GET /v1/todos` returns all 3 with identical `id`, `description`, `completed`, `createdAt`, `userId`, and ordering matches pre-restart.
- CI enforcement: both integration test files run against the `services.postgres` container; a connection failure produces a fast Vitest failure (not a skip).

*E2E:* none — user-visible fault recovery is covered by Story 4.2 and 4.3 E2E specs; this story's integration coverage is the API-side backstop.

## Epic 5: Launch Quality — Accessibility, Responsive, Performance

**Epic goal:** Every user — mobile (320px), keyboard-only, screen-reader, reduced-motion, 200% zoom, across the browser matrix — gets the same experience. The app stays responsive under sustained use at ≥50 todos (Journey 4). SC-003 and SC-004 verified.

### Story 5.1: Journey-4 perf harness — NFR-001 / NFR-002 verification

As a developer,
I want an automated performance harness that exercises Journey 4 with 50+ seeded todos,
So that NFR-001 (UI p95 ≤100ms) and NFR-002 (API p95 ≤200ms) are gated, not hoped-for.

**Acceptance Criteria:**

**Given** a seed fixture at `apps/web/test/fixtures/seed50.ts`
**When** the fixture runs
**Then** it inserts 50 todos (mixed active and completed) directly via a test helper that calls `todosRepo.create` + `todosRepo.update` against the test database (NOT via the API, per architecture gap resolution — fastest + deterministic)
**And** the fixture is idempotent (running twice does not produce 100 rows; it resets to 50)

**Given** the perf harness at `apps/web/test/perf/journey4.perf.test.tsx`
**When** the test runs
**Then** it seeds 50 todos via the fixture
**And** renders `<App />` with the seeded state
**And** records wall-clock durations for each of: (a) initial fetch + render, (b) a batch of 5 rapid toggle clicks on different rows, (c) a batch of 3 create submissions in quick succession, (d) a batch of 3 delete-via-modal interactions
**And** computes p95 across each batch separately
**And** asserts UI interaction p95 ≤100ms for (b), (c), (d) measured from click/submit to visible DOM update
**And** asserts API round-trip p95 ≤200ms measured from mutation start to server response (from the test harness's perspective; server lives in-process or via test transport)

**Given** the cumulative-degradation check
**When** the test runs a sequence of 40 interactions (mix of toggle/create/delete) in sequence
**Then** it asserts the 40th interaction's duration is within 2× the 1st interaction's duration (no cumulative jank from unmounted listeners, leaked timers, or growing subscriber counts)

**Given** `apps/web/test/perf/README.md` exists
**When** the engineer reads it
**Then** it documents how to run the harness locally (`npm run test:perf --workspace apps/web` or equivalent)
**And** it documents the thresholds (NFR-001 / NFR-002) and what failing them means
**And** it notes that the harness runs in jsdom (not a real browser) so timings are indicative; formal SC-003 validation uses Chrome DevTools on a real device per PRD

**Given** the CI pipeline
**When** the perf harness is added to the test run
**Then** `npm test` (used by CI from story 1.6) includes the perf test by default
**And** a perf failure fails CI with a message identifying which batch's p95 exceeded threshold

**Test Scenarios:**

*Unit:*
- `seed50.ts` inserts exactly 50 rows when called on an empty test DB (assert row count after).
- `seed50.ts` is idempotent — calling it twice in the same run produces 50 rows, not 100 (via truncate-then-seed or `ON CONFLICT DO NOTHING` pattern).
- The latency-measurement helper computes p95 correctly on a fixed input sample (unit test against a deterministic array).

*Integration:*
- Perf harness at `apps/web/test/perf/journey4.perf.test.tsx`: after seeding 50 todos and mounting `<App />`, records durations for (b) 5 toggle clicks on different rows, (c) 3 create submissions, (d) 3 delete-via-modal flows; asserts each batch's p95 ≤ 100ms (UI) and ≤ 200ms (API round-trip).
- 40-interaction cumulative-degradation check: assert 40th interaction duration ≤ 2× the 1st interaction duration.
- Failure report on threshold miss names the specific batch and measured p95 in the error message.

*E2E (Playwright, optional `apps/web/e2e/journey-4-perf.spec.ts` — documented in `test/perf/README.md`):*
- Seed 50 todos via the API; open the app in Chromium; rapid-toggle 5 different rows using `page.click`; measure each click-to-visual-update via `page.evaluate(() => performance.now())` bracketing; report p95.
- Note: browser-engine measurements are indicative; the formal SC-003 validation still requires Chrome DevTools Performance panel on a real mid-tier 2022 laptop per PRD. This spec is NOT in default CI.

### Story 5.2: Responsive smoke test + cross-browser matrix — FR-009 / SC-004 verification

As a user on any supported browser or viewport,
I want the app to render correctly across the full declared matrix,
So that FR-009 and SC-004 are verified, not assumed.

**Acceptance Criteria:**

**Given** `apps/web/test/responsive/responsive.test.tsx` exists
**When** the test runs in jsdom
**Then** it renders `<App />` at viewport widths 320px, 375px, 640px, 1024px, 1440px (stubbed via `window.innerWidth` + `matchMedia` shims)
**And** at each width asserts: the body has no horizontal scrollbar (document width ≤ viewport width)
**And** asserts `max-w-xl` container width kicks in at widths ≥640px (via computed style assertion on the container)
**And** asserts `pt-16` applies at widths ≥1024px (`pt-8` below)
**And** asserts tap targets on `AddTodoInput` Add button, checkbox wrapper, and delete icon button each have a computed height AND width ≥44px at all widths

**Given** the modal responsive contract
**When** the test renders `<DeleteTodoModal todo={...} />` at each viewport width
**Then** at widths ≤640px the modal width is `100vw - 32px` (full-width minus 32px total margin)
**And** at widths >640px the modal width is the declared `max-width: 400px`
**And** the modal is centered on the vertical axis in both cases

**Given** the existing Playwright harness from Story 1.6 is extended to cover the full browser matrix
**When** the engineer inspects `apps/web/e2e/playwright.config.ts`
**Then** the `projects` array now enables Chromium, Firefox, AND WebKit (story 1.6 shipped Chromium only)
**And** `apps/web/e2e/browser-matrix.spec.ts` is added: at 320px and 1024px viewports, runs a scripted Journey 1 (assert Empty State → type "buy milk" → press Enter → assert the row appears → reload → assert persistence)
**And** the spec's `projects` matrix produces a pass/fail line per `{ browser × viewport }` combination
**And** the Playwright exit code is non-zero if any combination fails
**And** a root `test:browsers` script invokes Playwright filtered to the `browser-matrix.spec.ts` file across all three engines

**Given** `docs/browser-matrix.md` is created
**When** the engineer inspects it
**Then** it lists the supported matrix from PRD (Chrome/Firefox/Safari evergreen + iOS 15+), the Playwright browser engines used as proxies, and the results of the most recent run
**And** it documents the manual-only checks (real Safari on macOS + iOS 15+ device) that Playwright cannot cover
**And** it notes IE and legacy Edge are explicitly unsupported (per PRD)

**Given** the CI pipeline
**When** the responsive smoke test is added
**Then** `npm test` runs `responsive.test.tsx` as part of the default test suite (fast, jsdom-based)
**And** the Chromium-only `test:e2e` (from Story 1.6) remains in default CI
**And** the multi-browser `test:browsers` is NOT in the default CI run (expensive); it runs via `npm run test:browsers` locally and is scheduled to run pre-release (documented in `docs/browser-matrix.md`)

**Test Scenarios:**

*Unit:* none — computed-style assertions belong in integration.

*Integration:*
- `responsive.test.tsx` renders `<App />` at each viewport width (320/375/640/1024/1440) using `window.innerWidth` + `matchMedia` stubs; asserts `document.documentElement.scrollWidth ≤ innerWidth` at every width.
- Same file asserts: `max-w-xl` applies at widths ≥640px (via the container's computed `max-width`); `pt-16` applies at widths ≥1024px.
- Same file asserts: computed dimensions of the Add button, each checkbox wrapper, and each delete icon button are ≥44×44 at every breakpoint.
- Modal responsive: `<DeleteTodoModal todo={...} />` rendered at ≤640px has computed width `innerWidth - 32px`; at >640px width equals the declared `max-width: 400px`; modal is vertically centered in both cases.

*E2E (Playwright, `apps/web/e2e/browser-matrix.spec.ts`):*
- For each Playwright project × viewport combination (Chromium@320, Chromium@1024, Firefox@320, Firefox@1024, WebKit@320, WebKit@1024): run a scripted Journey 1 (open app → assert EmptyState → type "buy milk" + Enter → assert row appears → reload → assert persistence).
- Assert no horizontal scroll (`document.documentElement.scrollWidth <= window.innerWidth`) on every page load.
- Assert Cancel/Delete modal buttons reachable and sized correctly at 320px in WebKit (closest proxy for iOS Safari; real-device verification is the manual checklist).

### Story 5.3: Keyboard-only + screen-reader walkthroughs — manual accessibility verification

As a keyboard-only or screen-reader user,
I want to complete every user journey without a mouse and with assistive tech correctly announcing state changes,
So that the app meets its NFR-007 commitment beyond what axe-core can automatically verify.

**Acceptance Criteria:**

**Given** `docs/manual-accessibility.md` exists
**When** the engineer inspects it
**Then** it contains three checklists, one for each: keyboard-only, macOS VoiceOver + Safari, iOS VoiceOver + Safari (Windows NVDA listed as optional)
**And** each checklist walks through Journeys 1, 2, and 3 step-by-step with expected assistive-tech behavior at each step

**Given** the keyboard-only checklist
**When** the engineer follows it
**Then** every interactive element on the page is reachable via Tab or Shift-Tab in DOM order (no mouse)
**And** pressing Enter in `AddTodoInput` submits the create
**And** pressing Space on a focused checkbox toggles it (and the row section-moves optimistically)
**And** pressing Enter on a focused delete icon opens the modal
**And** Tab is trapped within the open modal
**And** Escape closes the modal and focus returns to the triggering delete icon
**And** a visible focus ring (2px `--color-accent`, 2px offset) is present on every focused element
**And** `outline: none` without a replacement does NOT appear anywhere (grep check documented in the doc)

**Given** the VoiceOver walkthroughs
**When** the engineer follows them
**Then** the app title is announced as "Todos, heading level 1"
**And** `AddTodoInput` is announced via its `aria-label` "Add a todo, edit text"
**And** each row's checkbox is announced as "Mark complete: {description}, checkbox" or "Mark incomplete: {description}, checkbox, checked"
**And** each row's delete button is announced as "Delete todo: {description}, button"
**And** `LoadingSkeleton` causes VoiceOver to announce "Loading your todos" on mount (via `aria-live="polite"`)
**And** `InlineError` announcements fire on error (via `role="alert"`)
**And** the modal is announced as "dialog, Delete this todo?" with the body "This cannot be undone." read from `aria-describedby`

**Given** the 200% browser zoom check
**When** the engineer zooms the browser to 200%
**Then** the layout does not break
**And** no content is clipped
**And** all interactive elements remain usable
**And** the document flows reasonably (no side-by-side content collisions)

**Given** the reduced-motion OS toggle
**When** the engineer enables `prefers-reduced-motion: reduce` at the OS level and exercises Journey 2
**Then** all transitions (completion, modal open/close, skeleton pulse) resolve instantly
**And** the functional outcome is identical to the animated path (state changes complete; just no motion)

**Given** `docs/release-a11y-audit.md` is created after each completed walkthrough
**When** the engineer records results
**Then** it captures: date, tester, browser + AT versions, checklist pass/fail per item, and any issues found (with links to created tickets)
**And** a "release sign-off" row captures whether this audit gates a release

**Test Scenarios:**

*Unit:* none — this is a manual-verification story.

*Integration:* none.

*E2E (Playwright, `apps/web/e2e/a11y-keyboard.spec.ts`):*
- Run Journey 1 end-to-end using only `page.keyboard.press` (Tab, Enter, Space, Escape) — no mouse interactions.
- After each focus change, assert the focused element has a visible focus outline (`getComputedStyle(focused).outlineWidth !== '0px'` or equivalent).
- Tab order walked through the page matches DOM order (no focus traps outside modals, no `tabindex` gymnastics).
- Modal opens via Enter on delete icon; Escape closes; focus returns to the delete icon.
- This spec automates the keyboard-only walkthrough; the VoiceOver/iOS VoiceOver/NVDA walkthroughs remain MANUAL (no automation feasible) and are logged in `docs/release-a11y-audit.md` per release.

*Manual (documented in `docs/manual-accessibility.md`, not automated):*
- macOS VoiceOver + Safari walkthrough of Journeys 1–3.
- iOS VoiceOver + Safari walkthrough (iOS 15+ device).
- NVDA + Firefox/Chrome (Windows, optional).
- 200% browser zoom smoke.
- OS-level `prefers-reduced-motion: reduce` toggle verification.

### Story 5.4: WCAG contrast audit + launch-quality checklist

As a developer,
I want explicit WCAG contrast verification for every token pair and a consolidated launch checklist,
So that NFR-007 has a quantitative audit trail and the team has one document answering "are we ready to ship?"

**Acceptance Criteria:**

**Given** `apps/web/test/a11y/contrast.a11y.test.tsx` exists
**When** the test runs
**Then** it renders small sample components exposing each declared contrast pair from the PRD + architecture + UX spec:
  - `#1A1A1A` on `#FAFAFA` (body) — expected ≥16:1 (AAA)
  - `#737373` on `#FAFAFA` (secondary) — expected ≥4.5:1 (AA)
  - `#1A1A1A` at 60% opacity on `#FAFAFA` (completed text) — effective ratio expected ≥4.5:1 (AA)
  - `#2563EB` focus ring on `#FAFAFA` — expected ≥3:1 (UI non-text)
  - `#2563EB` on `#FFFFFF` (Primary button text) — expected ≥4.5:1 (AA)
  - `#DC2626` on `#FFFFFF` (Danger button text) — expected ≥4.5:1 (AA)
  - `#991b1b` on `#fef2f2` (error text) — expected ≥7:1 (AAA)
**And** axe-core's `color-contrast` rule is configured to assert each pair
**And** the test fails CI on any missed threshold

**Given** `docs/contrast-audit.md` exists
**When** the engineer inspects it
**Then** it lists each pair, the computed contrast ratio (from axe-core output or manual calculation), the WCAG level achieved, and the source token names
**And** the 60%-opacity completed-text row includes a note explaining the effective-ratio calculation method (alpha composite over `#FAFAFA` → effective RGB → contrast computation)
**And** any future token changes trigger an update to this doc (documented convention)

**Given** `docs/launch-checklist.md` exists
**When** the engineer inspects it
**Then** it contains a go/no-go table with at minimum these rows:
  - All 12 FR contract tests green (Epics 1–3)
  - All 7 NFR integration tests green (Epics 1, 4, 5)
  - SC-001 ≤60-second first-use — either unmoderated smoke completed (Epic 2.6) OR formal n=5 usability test completed (documented with participant count, % completion)
  - SC-002 persistence across three boundaries green (Story 4.4)
  - SC-003 UI p95 ≤100ms + API p95 ≤200ms green (Story 5.1)
  - SC-004 responsive + browser matrix green (Story 5.2)
  - NFR-006 onboarding ≤15 min verified (Story 1.6 README trial)
  - NFR-007 WCAG 2.1 AA: axe-core in CI green (Story 1.6) + contrast audit green (this story) + keyboard/VoiceOver walkthroughs green (Story 5.3)
  - No known critical defects open
**And** each row has columns: "Gate", "Status", "Evidence (link)", "Sign-off (initials + date)"
**And** the header includes a single "Overall go/no-go" verdict line determined by all rows

**Given** the launch checklist is consulted before release
**When** all rows are green AND Overall verdict is "GO"
**Then** the MVP is ready to ship under the PRD + architecture + UX scope
**When** any row is red
**Then** that row identifies the blocker and the MVP is not ready

**Test Scenarios:**

*Unit:*
- If a contrast math helper is introduced (e.g., alpha-composite RGB → contrast ratio), unit-test it against known input/output pairs derived from WCAG examples.

*Integration:*
- `contrast.a11y.test.tsx` renders small sample components exposing each declared token pair; configures axe-core's `color-contrast` rule; asserts zero violations across all pairs.
- Per-pair ratio is logged/output (for `docs/contrast-audit.md` harvest) — test framework captures computed ratios for the doc.
- Specifically covers the completed-text-at-60%-opacity edge case: render a sample with `color: #1A1A1A; opacity: 0.6` on `#FAFAFA` bg; axe-core computes the effective ratio ≥4.5:1.

*E2E:* none — this story delivers documentation + expanded automated contrast checks; user-facing behavior is already exercised by earlier E2E specs.
