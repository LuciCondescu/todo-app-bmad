# todo-app

A single-user todo app — training project built on the BMad method. The repo is an npm-workspaces monorepo with a Fastify API (`apps/api`) and a Vite + React 19 web app (`apps/web`), both written in TypeScript and backed by Postgres 16.

## Prerequisites

- **Node.js 22 LTS** — see `.nvmrc`. If you use `nvm`, run `nvm use` in the repo and it will switch to the pinned version (install with `nvm install` if missing). Non-nvm users: [download Node 22](https://nodejs.org/).
- **npm ≥ 10** — ships with Node 22.
- **Docker Desktop** (or any Docker daemon) — used for the local Postgres container. [Get Docker](https://www.docker.com/products/docker-desktop).
- **git** — cloning the repo.

## Quick Start

From a fresh clone:

```bash
git clone <repo-url>
cd todo-app
nvm use                                   # or install Node 22.11.0 manually
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
docker compose up -d postgres
npm install
npm run migrate --workspace apps/api
npm run dev --workspace apps/api          # terminal 1
npm run dev --workspace apps/web          # terminal 2
```

Then:

- Open <http://localhost:5173> — you should see a **Todos** heading.
- `curl http://localhost:3000/healthz` → `{"status":"ok","db":"ok"}`.
- Swagger UI (API docs) → <http://localhost:3000/docs>.

Target: end-to-end in ≤15 minutes on a fresh machine (NFR-006).

## Workspaces

| Workspace | Responsibility |
|-----------|----------------|
| `apps/api` | Fastify 5 + Kysely + Postgres 16. Exposes `/healthz`, `/docs`, `/docs/json`, and (from Epic 2 onwards) the `/v1/todos` CRUD surface. |
| `apps/web` | Vite 7 + React 19 + Tailwind v4 + TanStack Query 5. Single-screen todo UI, consumes the `/v1` surface. |

## Scripts

All commands run from the repo root unless otherwise noted.

| Script | What it does |
|--------|--------------|
| `npm run typecheck` | `tsc --noEmit` across every workspace that declares the script. |
| `npm run lint` | ESLint (flat config) across both workspaces, including `jsx-a11y` on web code. |
| `npm run lint:fix` | Same as above, with auto-fix enabled. |
| `npm run format` | Prettier writes formatting fixes to disk. |
| `npm run format:check` | Prettier verifies formatting; fails on drift. |
| `npm test` | Vitest in both workspaces — API contract/integration suite + web unit/a11y suite. |
| `npm run test:e2e` | Playwright smoke spec against Chromium (see [Testing](#testing)). |
| `npm run build` | Production builds: `apps/web/dist/` via Vite; `apps/api` typecheck-build. |
| `npm run check` | Pre-push aggregate: `typecheck && lint && format:check && test`. |

## Testing

Two layers of automated tests run on every PR (see [CI](#ci)):

- **Vitest** — unit + integration + a11y (axe-core on every component) — `npm test`.
- **Playwright** — Chromium E2E smoke (`apps/web/e2e/`) — `npm run test:e2e`.

Running E2E locally the first time requires Chromium:

```bash
cd apps/web
npx playwright install --with-deps chromium
cd -
npm run test:e2e
```

Playwright starts both servers itself (`apps/api` dev + `apps/web` preview) — the database container still has to be up and migrated first.

## Local Endpoints

| URL | Served by | Notes |
|-----|-----------|-------|
| <http://localhost:5173> | `apps/web` (Vite dev) | React app. |
| <http://localhost:3000/healthz> | `apps/api` | `{ status, db }` liveness + DB probe. |
| <http://localhost:3000/docs> | `apps/api` | Swagger UI. |
| <http://localhost:3000/docs/json> | `apps/api` | Raw OpenAPI 3 doc. |
| `postgresql://postgres:postgres@localhost:5432/todo_app` | Docker | Matches `apps/api/.env.example`. |

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `npm run migrate` fails with `ECONNREFUSED` or `connection refused` | Postgres container isn't up (or hasn't finished healthchecking) | `docker compose up -d postgres`, wait ~5 s for the healthcheck, retry. |
| `/healthz` returns `503 { status: 'degraded', db: 'error' }` | `DATABASE_URL` doesn't match the running Postgres | Compare `apps/api/.env` with `docker-compose.yml`; they must align on user/password/db/port. |
| Vite refuses to start: `Port 5173 is in use` | Another dev server is running | `lsof -i:5173` (macOS) or `ss -ltnp` (Linux), kill the owner, retry. |
| Playwright fails: `browserType.launch: Executable doesn't exist` | One-time browser install was skipped | `cd apps/web && npx playwright install --with-deps chromium`. |
| `docker compose up` fails with a Postgres volume error after a Postgres major upgrade | Stale `pg-data` volume from a previous major | `docker compose down -v && docker compose up -d postgres && npm run migrate --workspace apps/api`. (This wipes dev DB contents; the `db:reset` script in `apps/api` does the same thing.) |

## Project Structure

```
todo-app/
├── apps/
│   ├── api/                  Fastify 5 + Kysely + Postgres
│   └── web/                  Vite 7 + React 19 + Tailwind v4
├── .github/workflows/        CI pipeline (ci.yml)
├── _bmad-output/             BMad planning + implementation artifacts (specs, epics, stories)
├── docker-compose.yml        Local Postgres 16
├── eslint.config.js          Flat config, both workspaces
├── .prettierrc.json          Formatting contract
├── .nvmrc                    Pinned Node LTS
└── README.md                 You are here.
```

## CI

GitHub Actions runs `.github/workflows/ci.yml` on every PR and on `push` to `main`. The job provisions a Postgres 16 service container, then executes: `npm ci` → migrations → `typecheck` → `lint` → `format:check` → `test` → `build` → Playwright install → `test:e2e`. A failing Playwright run uploads `apps/web/playwright-report/` as a CI artifact (retained 14 days) so you can inspect traces without reproducing locally.

## Contributing

This project uses the [BMad method](https://github.com/bmad-code-org/bmad-method) for planning + story execution. Specs live in `_bmad-output/`; each story is implemented via `/bmad-dev-story` and code-reviewed before merge.

## License

No `LICENSE` file — this is a private training project. If the repo becomes public, MIT is the intended license; add a `LICENSE` file at that point.
