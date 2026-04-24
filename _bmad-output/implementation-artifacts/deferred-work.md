# Deferred Work

Review findings and engineering tasks that were deliberately postponed. Each entry records the source (story, review, etc.), the item, and a one-line rationale so future stories know what to pick up.

## Deferred from: code review of 1-1-monorepo-scaffold-with-docker-postgres (2026-04-18)

- **No Node version pinning** — no `.nvmrc` or `engines` field in root `package.json`. Spec treats "Node LTS installed" as a given; pin when CI arrives (Story 1.6) or sooner if a contributor hits a version-specific issue.
- **No `.npmrc`** — no lockfile/registry/engine-strict discipline. Add when dependencies start arriving (Stories 1.2+).
- **`.gitignore` will miss future build/cache artifacts** — `coverage/`, `.turbo/`, `*.tsbuildinfo`, `.cache/`, `.pnpm-store/`. Each later story should extend `.gitignore` as its tooling lands.
- **No `LICENSE` file or `license` field** — add if/when the repo becomes public or distributable.
- **No documented `db:reset` workflow** — natural home is Story 1.3 (Kysely migrations) or 1.6 (onboarding README).
- **Existing `pg-data` named volume from prior Postgres major could collide** — universal local-Postgres concern. If it bites, document `docker volume rm todo-app_pg-data` in onboarding (Story 1.6).
- **No `.gitattributes` enforcing LF line endings at the git layer** — `.editorconfig` only covers editors that respect it. Add when a cross-platform contributor joins or when CI lands.
- **`docker-compose.yml` additions beyond spec sketch** — `container_name: todo-app-postgres` and `restart: unless-stopped`. Not forbidden, low-risk ergonomic extras. Revisit if multi-environment compose overlays are introduced.

## Deferred from: code review of 1-2-fastify-api-skeleton-with-healthz (2026-04-18)

- **No SIGTERM/SIGINT graceful shutdown in `server.ts`** — in-flight requests drop on Ctrl-C / container stop. Natural home: deploy/CI hardening in Story 1.6 or a dedicated ops story.
- **No `unhandledRejection` / `uncaughtException` handlers** — Node 20+ non-zero-exits by default, which covers fail-fast for MVP. Revisit with observability work.
- **Invalid `LOG_LEVEL` raw-env value crashes pino before `@fastify/env` validates** — the error is still readable but not as friendly as a schema violation. Harden when a central logger config module lands.
- **`DATABASE_URL` has no URI `format` validation in env schema** — defer to Story 1.3 where the Kysely connection will surface real format errors at probe time. Adding `format: 'uri'` now requires `ajv-formats`.
- **`CORS_ORIGIN` has no URI `format` validation** — defer to Story 1.4 (`@fastify/cors` wire-up). Value is declared-but-unused in Story 1.2.
- **Tests don't stub `process.env` for `LOG_LEVEL` / `NODE_ENV`** — CI env could affect logger construction. Not a current failure, but a latent flake. Address when assertions depend on log output.
- **No direct unit coverage of `buildLoggerConfig` dev/prod branches** — helper is private to `app.ts`. Refactor for testability when Story 1.4 adds real plugin interactions or observability lands.
- **No `HEAD /healthz` assertion** — Fastify auto-registers HEAD for GET. Add when a real load balancer config depends on it.
- **Default `host: '0.0.0.0'` has no env-override (`HOST`)** — Dev Notes explicitly accept this for Docker/CI reachability at MVP. Revisit when a production deploy target is chosen (could expose the API on hostile networks in unusual dev setups).
- **No drift-protection test between `.env.example` keys and `envSchema.properties`** — low-value until the schema grows beyond 5 keys, at which point a snapshot/parse-and-compare test pays off.

## Deferred from: manual smoke after Story 3.4 + 3.5 (2026-04-24) — discovered post-implementation

- **`@fastify/cors` v11's default `methods: 'GET,HEAD,POST'` was shipping with PATCH + DELETE routes blocked at the browser preflight** — fixed in `apps/api/src/plugins/cors.ts` by explicitly declaring `methods: ['GET','HEAD','POST','PATCH','DELETE']`. Latent since Story 3.1 (PATCH) and 3.2 (DELETE); contract tests use `fastify.inject` which bypasses CORS, so the test suite never caught it. One-line fix; no story owns the retrospective action. Epic 3 retrospective should capture this + propose: (a) story template includes CORS update when a new HTTP method lands on a browser-reachable route; (b) at least one E2E test goes through the real CORS stack for PATCH/DELETE to prevent recurrence.
- **Tailwind v4 `bg-[--color-*]` / `text-[--color-*]` / `border-[--color-*]` arbitrary-value class syntax emits invalid CSS across the web app** — the square-bracket form does NOT auto-wrap `--color-name` in `var()`, so Tailwind emits `background-color: --color-danger;` which browsers discard. Affected files (as of end of Epic 3): `TodoRow.tsx`, `TodoList.tsx` (Completed `<h2>`), `App.tsx` (error fallback), `AddTodoInput.tsx`, `EmptyState.tsx`, `LoadingSkeleton.tsx`, `Header.tsx`, `ErrorBoundary.tsx`. Most uses are text colors that silently fall back to the inherited default from `html { color: var(--color-fg) }`, which is why the app has looked "close enough" since Story 1.5. The bug was surfaced in Story 3.5 when the Delete button's `bg-[--color-danger]` produced an invisible white-on-white button. Fixed only within `DeleteTodoModal.tsx` in Story 3.5. **Rolled into Story 4.3** (which needs the `InlineError` component to render in red anyway — touching the same class of styling issue). Fix pattern: replace `[--color-name]` → `[var(--color-name)]` (or the Tailwind v4 shorthand `(--color-name)`). Estimated: ~15 class references across 8 files; no test updates needed (jsdom doesn't apply Tailwind CSS; tests assert class presence, not computed style). Epic 4 retrospective should capture: this is the 13th library-drift instance in the sprint and the first one that shipped visible-but-not-obvious bugs to multiple prior stories; action item — when a story introduces Tailwind arbitrary-value syntax for a CSS variable, the spec's code samples should use the `[var(...)]` form, not the shorthand `[--name]`.
