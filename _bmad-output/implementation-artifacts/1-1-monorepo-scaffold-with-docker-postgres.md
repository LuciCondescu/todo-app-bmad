# Story 1.1: Monorepo scaffold with Docker Postgres

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want a monorepo with workspace-aware Node tooling and a local Postgres service,
so that I can install and run the stack with a single command from a fresh clone.

## Acceptance Criteria

**AC1 — npm workspaces install from a fresh clone**
- **Given** a clean machine with Node LTS and Docker installed
- **When** the engineer runs `git clone` followed by `npm install` at the repo root
- **Then** npm installs workspaces without error
- **And** the root `package.json` declares `"workspaces": ["apps/*"]`

**AC2 — Postgres comes up via docker-compose with durable storage**
- **Given** the repo root contains `docker-compose.yml`
- **When** the engineer runs `docker compose up -d postgres`
- **Then** a `postgres:16-alpine` container starts with a healthcheck passing within 30 seconds
- **And** a named volume `pg-data` is mounted at `/var/lib/postgresql/data` (not `tmpfs`) so data survives `docker compose down` + `up`

**AC3 — Baseline scaffold files present**
- **Given** the scaffold is complete
- **When** the engineer inspects the repo
- **Then** `tsconfig.base.json` at root defines `"strict": true` and is extendable by each workspace
- **And** `.gitignore` excludes `node_modules/`, `.env`, `dist/`, `.DS_Store`
- **And** `.editorconfig` is present with sane defaults (LF line endings, 2-space indent)
- **And** a README skeleton exists with a "Local Development" heading (full onboarding content arrives in story 1.6)

## Tasks / Subtasks

- [x] **Task 1: Initialize npm workspaces root** (AC: 1)
  - [x] Create root `package.json` via `npm init -y`, then add `"private": true` and `"workspaces": ["apps/*"]`
  - [x] Set `"name": "todo-app"` and remove the auto-generated `main` field (no root entrypoint)
  - [x] Create empty `apps/` directory (add a `.gitkeep` so it is tracked until Story 1.2/1.5 populate it)
  - [x] Verify: `npm install` at root runs cleanly, creates a single root `node_modules/` and `package-lock.json`

- [x] **Task 2: Author `docker-compose.yml` with durable Postgres** (AC: 2)
  - [x] Define a single `postgres` service using image `postgres:16-alpine`
  - [x] Declare a top-level named volume `pg-data` and mount it at `/var/lib/postgresql/data` (NOT `tmpfs`, NOT a bind mount) — binding constraint for NFR-003
  - [x] Expose port `5432:5432`
  - [x] Configure env: `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` with local-dev defaults (e.g., `postgres` / `postgres` / `todo_app`)
  - [x] Add a healthcheck using `pg_isready -U $$POSTGRES_USER -d $$POSTGRES_DB` with interval/timeout/retries chosen so the check passes within 30 s of container start
  - [x] Verify: `docker compose config` exits 0 and prints both the service and the named volume
  - [x] Verify: `docker compose up -d postgres` → `docker inspect` on the container shows the `pg-data` volume bound to `/var/lib/postgresql/data`; `docker compose down` followed by `docker compose up -d postgres` preserves any rows written in between (quick manual check is fine; the formal durability test lands in Story 1.3)

- [x] **Task 3: Add shared TypeScript base config** (AC: 3)
  - [x] Create `tsconfig.base.json` at repo root with `"strict": true` and a sensible ES2022+/Node LTS target (`"target": "ES2022"`, `"module": "ESNext"`, `"moduleResolution": "Bundler"` or `"NodeNext"` — pick one consistent with the ESM-throughout decision in architecture.md)
  - [x] Keep it minimal: only compiler options that both `apps/api` and `apps/web` can safely extend. Do NOT set `include`/`exclude`/`rootDir`/`outDir` here — those belong in each workspace's `tsconfig.json`
  - [x] Do NOT create per-workspace `tsconfig.json` files — those are scoped to later stories (1.2 for api, 1.5 for web)

- [x] **Task 4: Add `.gitignore`** (AC: 3)
  - [x] At minimum, ignore: `node_modules/`, `.env` (but NOT `.env.example`), `dist/`, `.DS_Store`
  - [x] Also ignore common nuisances that will show up immediately: `*.log`, `npm-debug.log*`, editor folders (`.vscode/`, `.idea/`) — small, non-controversial additions keep the working tree clean
  - [x] Do not ignore `_bmad-output/` — those artifacts are checked in (confirmed by existing repo state)

- [x] **Task 5: Add `.editorconfig`** (AC: 3)
  - [x] Root declaration `root = true`
  - [x] `[*]` block with `end_of_line = lf`, `indent_style = space`, `indent_size = 2`, `charset = utf-8`, `trim_trailing_whitespace = true`, `insert_final_newline = true`
  - [x] `[*.md]` block with `trim_trailing_whitespace = false` (Markdown treats trailing spaces as meaningful line breaks)

- [x] **Task 6: Add README skeleton** (AC: 3)
  - [x] Create `README.md` at repo root with a `# todo-app` title, one-sentence purpose line, and a `## Local Development` section header
  - [x] Under `## Local Development`, add a placeholder line such as `> Full onboarding instructions land in Story 1.6.` — this satisfies the AC literally (heading must exist) without pretending the story delivers NFR-006 content

- [x] **Task 7: Verify scaffold end-to-end**
  - [x] From repo root: `npm install` succeeds
  - [x] `docker compose config` exits 0 and lists the `postgres` service + `pg-data` volume
  - [x] `docker compose up -d postgres` → container reaches `healthy` state within 30 s (check via `docker ps` or `docker inspect --format='{{.State.Health.Status}}' <id>`)
  - [x] `docker compose down` cleans up the container; `pg-data` volume persists (visible via `docker volume ls`)
  - [x] `git status` shows no accidentally-committed `.env`, `node_modules/`, or `dist/`

## Dev Notes

### Scope discipline — what this story is and isn't

**This is an infrastructure-only story.** Scope hard stops:
- No `apps/api/` or `apps/web/` workspace files (those arrive in Stories 1.2 and 1.5). The `apps/` directory exists but is empty except for `.gitkeep`.
- No Fastify, no Vite, no Kysely, no TypeBox, no Tailwind, no CI workflow, no tests. Every dependency beyond npm workspaces (which is zero-dep) belongs to a later story.
- No `.env` / `.env.example` files — those are authored per-workspace in Stories 1.2 (api) and 1.5 (web).
- No migration directory, no `src/` directories, no route stubs.

If you find yourself creating files under `apps/api/` or `apps/web/`, stop — you have crossed into a later story.

### Root `package.json` shape

Expected fields only:
```json
{
  "name": "todo-app",
  "private": true,
  "version": "0.0.0",
  "workspaces": ["apps/*"]
}
```
- `"private": true` is mandatory — prevents an accidental publish of the root and is idiomatic for workspaces roots.
- Do NOT add `scripts` here yet. Root scripts (`dev`, `build`, `migrate` orchestration) land in later stories as those workspaces exist.
- Do NOT add `dependencies`/`devDependencies` at the root. Workspace deps live inside each workspace.

### `docker-compose.yml` — binding constraints and why they matter

From architecture.md §Infrastructure and §Gap Analysis (architecture.md:780):

> The compose file MUST define a named volume (e.g., `pg-data`) mounted at `/var/lib/postgresql/data` and it must not be declared as `tmpfs`. Called out here as a binding constraint for the first story.

Why: NFR-003 (Durability) requires zero data loss across `docker compose down` + `up`. A bind mount would work too, but a named volume is the portable, idiomatic choice and avoids polluting the working tree. `tmpfs` would silently violate the durability NFR.

Sketch (adjust syntax to taste, but preserve all the pinned details):

```yaml
services:
  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: todo_app
    ports:
      - "5432:5432"
    volumes:
      - pg-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U $${POSTGRES_USER} -d $${POSTGRES_DB}"]
      interval: 5s
      timeout: 5s
      retries: 6

volumes:
  pg-data:
```

Notes:
- The healthcheck uses doubled `$$` in a compose file because Docker Compose interpolates single-`$` vars from the *host* environment. We want the container's env to resolve `$POSTGRES_USER`/`$POSTGRES_DB`, so escape accordingly.
- `6 × 5s = 30s` budget for the healthcheck to pass, matching AC2's 30-second requirement. `postgres:16-alpine` usually starts in 2–4 s on a modern laptop; this is a generous safety margin.
- Do not add a `depends_on` to any other service — there are no other services yet.
- Do not add a `networks:` block — the default compose network is fine.

### `tsconfig.base.json` shape

Keep it minimal and extendable. Recommended starting set (align with architecture.md's "ESM throughout" + strict TS stance):

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true
  }
}
```

- `strict: true` is **required by AC3** — do not soften it.
- `moduleResolution: "Bundler"` is the modern Vite/TS recommendation; `apps/api` (tsx + tsc) will override to `"NodeNext"` in Story 1.2 if needed — that is the whole point of keeping per-workspace `tsconfig.json` files that extend this one.
- Do NOT add `paths`, `baseUrl`, `outDir`, `rootDir`, or `include`/`exclude` here — those are workspace-scoped.

### `.gitignore` — minimum required entries

Anchored by AC3:

```
node_modules/
dist/
.env
.DS_Store
```

Sensible additions (feel free to include; they cost nothing):
```
*.log
npm-debug.log*
.vscode/
.idea/
```

Do not ignore `.env.example` — it must be committed (architecture.md:206 and :250).
Do not ignore `_bmad-output/` — BMad artifacts are tracked.

### `.editorconfig` — minimum required entries

Anchored by AC3:

```
root = true

[*]
end_of_line = lf
indent_style = space
indent_size = 2
charset = utf-8
trim_trailing_whitespace = true
insert_final_newline = true

[*.md]
trim_trailing_whitespace = false
```

### README skeleton

Bare minimum to satisfy AC3. Example:

```markdown
# todo-app

A single-user todo app — training project built on the BMad method.

## Local Development

> Full onboarding instructions land in Story 1.6.
```

Do NOT attempt to write the NFR-006 onboarding flow here; that is Story 1.6's deliverable and will include all the commands, env-file copies, migrate steps, etc. Writing that content now means it will be contradicted or overwritten in a few stories.

### Verification checklist (manual, pre-review)

Before marking the story complete:

1. `npm install` at repo root — exits 0, creates a single `node_modules/` and `package-lock.json`.
2. `docker compose config` — exits 0, prints the `postgres` service and `pg-data` volume definitions.
3. `docker compose up -d postgres` — container reaches `healthy` within 30 s (`docker inspect --format='{{.State.Health.Status}}' <container-id>` returns `healthy`).
4. `docker volume ls | grep pg-data` — the named volume exists.
5. `docker compose down` then `docker compose up -d postgres` again — the volume persists (visible in `docker volume ls`).
6. `git status` — no `.env`, `node_modules/`, `dist/`, or `.DS_Store` staged.
7. All required files exist at root: `package.json`, `docker-compose.yml`, `tsconfig.base.json`, `.gitignore`, `.editorconfig`, `README.md`.

### Project Structure Notes

Files created by this story (all at repo root):

```
todo-app/
├── README.md             ← skeleton with "Local Development" heading
├── package.json          ← "workspaces": ["apps/*"]
├── package-lock.json     ← generated by npm install
├── tsconfig.base.json    ← shared strict TS config
├── docker-compose.yml    ← postgres:16-alpine + pg-data named volume
├── .gitignore
├── .editorconfig
└── apps/
    └── .gitkeep          ← keeps the empty dir tracked until 1.2/1.5
```

This aligns 1:1 with the "Complete Project Directory Structure" in architecture.md:485–545, limited to the files explicitly called out in AC1/AC2/AC3. All other files in that structure belong to later stories.

**No detected conflicts** with the unified project structure — Story 1.1 is the foundation the rest of Epic 1 builds on.

### Testing Strategy for this story

Per epics.md:197–205:

- **Unit tests:** none — infrastructure-only story.
- **Integration tests:** verified manually via the checklist above. No automated shell test is required at this stage; the proper integration harness lands with Vitest in Story 1.2 and CI in Story 1.6. Per architecture.md, test code lives inside workspaces; there is no repo-root `test/` directory and we should not create one.
- **E2E tests:** none — Playwright harness arrives in Story 1.6.

Do not set up Vitest, shell-test frameworks, or CI workflows in this story. If a later reviewer asks "where are the tests for Story 1.1?" the correct answer is: the acceptance criteria are verified by the manual verification checklist above, and the durability guarantee that this scaffold enables is tested in Story 1.3 (`integration.persistence.test.ts`) once Kysely exists.

### References

- Epic + story source: [_bmad-output/planning-artifacts/epics.md#Story-1.1](../planning-artifacts/epics.md) (lines 168–205)
- Architecture — starter selection + init commands: [_bmad-output/planning-artifacts/architecture.md §Starter Template Evaluation](../planning-artifacts/architecture.md) (lines 75–153)
- Architecture — infrastructure & local dev orchestration: [architecture.md §Infrastructure & Deployment](../planning-artifacts/architecture.md) (lines 243–255)
- Architecture — complete project directory structure: [architecture.md §Project Structure & Boundaries](../planning-artifacts/architecture.md) (lines 485–585)
- Architecture — `pg-data` named-volume binding constraint: [architecture.md §Gap Analysis item 4](../planning-artifacts/architecture.md) (line 780)
- Architecture — dev workflow integration: [architecture.md §Development Workflow Integration](../planning-artifacts/architecture.md) (lines 689–703)

## Dev Agent Record

### Agent Model Used

claude-opus-4-7 (1M context)

### Debug Log References

- `npm install` at repo root → exits 0, `up to date, audited 1 package`. Produced `package-lock.json`. `node_modules/` not created because no workspaces populated yet and no root deps — expected.
- `docker compose config` → exits 0, prints `postgres` service under `name: todo-app` and top-level `volumes: { pg-data: { name: todo-app_pg-data } }`.
- `docker compose up -d postgres` → pulled `postgres:16-alpine`, created network `todo-app_default`, volume `todo-app_pg-data`, and container `todo-app-postgres`.
- Healthcheck reached `healthy` in ~8 seconds (well under the 30 s AC2 budget) — verified via `docker inspect --format='{{.State.Health.Status}}'`.
- Volume mount verified via `docker inspect`: `volume:todo-app_pg-data:/var/lib/docker/volumes/todo-app_pg-data/_data->/var/lib/postgresql/data` — named volume (not tmpfs, not bind mount), mounted at the exact path required by the NFR-003 binding constraint.
- Durability probe: created `story_1_1_probe` table in `todo_app` DB, inserted `id=42`, ran `docker compose down` (container + network removed, volume retained per `docker volume ls`), ran `docker compose up -d postgres` again, queried the table — row still present. Dropped the probe table afterwards; final state is `docker compose down` (container stopped, volume preserved).
- `git status --short` confirms no `.env`, `node_modules/`, `dist/`, or `.DS_Store` in the working tree. `.idea/` remains ignored.

### Completion Notes List

- All 3 AC groups verified. Infrastructure-only story — no application code or automated tests authored per scope guardrails in Dev Notes; verification was performed via the manual checklist in the Dev Notes.
- `apps/` directory created with a `.gitkeep` placeholder so the npm workspaces glob (`apps/*`) has something to track until Stories 1.2 and 1.5 populate `apps/api` and `apps/web`.
- `tsconfig.base.json` intentionally minimal (compiler options only, no `include`/`exclude`/paths). This is the shared base; per-workspace `tsconfig.json` files extend it in later stories.
- `.gitignore` includes the four AC-mandated entries plus a small set of standard additions (`*.log`, `npm-debug.log*`, `.vscode/`, `.idea/`, `.env.local`, `.env.*.local`). `.idea/` was already an entry prior to this story — preserved and expanded.
- `docker-compose.yml` healthcheck uses the `$$POSTGRES_USER` / `$$POSTGRES_DB` double-`$` escape so Compose passes the literal `$VAR` into the container for shell expansion at runtime.
- README.md is a deliberately thin skeleton — full onboarding content is Story 1.6's deliverable and will be authored there, not here.

### File List

**Added:**
- `package.json` (root — npm workspaces root, `"workspaces": ["apps/*"]`, private)
- `package-lock.json` (root — generated by `npm install`)
- `docker-compose.yml` (root — `postgres:16-alpine` service + `pg-data` named volume)
- `tsconfig.base.json` (root — shared strict TS config for workspace `tsconfig.json` files to extend)
- `.editorconfig` (root — LF, 2-space indent, UTF-8, final newline; markdown override for trailing whitespace)
- `README.md` (root — skeleton with `# todo-app` title and `## Local Development` heading placeholder)
- `apps/.gitkeep` (keeps the empty `apps/` directory tracked until 1.2/1.5 populate workspaces)

**Modified:**
- `.gitignore` (expanded from `.idea` only → `node_modules/`, `dist/`, `.env`, `.env.local`, `.env.*.local`, `.DS_Store`, `*.log`, `npm-debug.log*`, `.idea/`, `.vscode/`)

### Change Log

| Date       | Change                                                                 |
|------------|------------------------------------------------------------------------|
| 2026-04-18 | Initial scaffold: npm workspaces root, docker-compose Postgres, `tsconfig.base.json`, `.gitignore`, `.editorconfig`, README skeleton. All AC1/AC2/AC3 criteria verified. |
