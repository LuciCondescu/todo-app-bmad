// Story 5.1 — perf/fixture test database utilities.
//
// Why this file exists (and not a re-export of `@todo-app/api/test-setup`):
// the api workspace's `test/setup.ts` resolves `MIGRATIONS_FOLDER` from
// `import.meta.url`, which Vite/vite-node rewrites to a non-`file:` URL when
// imported into a jsdom test pipeline. `fileURLToPath` then throws
// "The URL must be of scheme file". Inlining the small helpers here bypasses
// that toolchain mismatch — no functional drift, just direct local resolution.

import { existsSync, readFileSync, promises as fs } from 'node:fs';
import * as path from 'node:path';
import {
  Kysely,
  PostgresDialect,
  CamelCasePlugin,
  FileMigrationProvider,
  Migrator,
  sql,
} from 'kysely';
import pg from 'pg';
import type { Database } from '@todo-app/api/db/schema';

// We can't rely on `import.meta.url` here: when this module is loaded via
// vite-node's import pipeline (the path Vitest takes for non-test source files),
// `import.meta.url` is rewritten to a non-`file:` scheme and `fileURLToPath`
// throws "The URL must be of scheme file". Instead, anchor on `process.cwd()`,
// which Vitest sets to the workspace root (apps/web) when running tests via
// `npm test --workspace @todo-app/web`. From there, the api workspace is at
// `../api`. Walk up to repo root if cwd is somewhere else.
function repoRoot(): string {
  // Vitest's cwd is normally apps/web (npm workspace exec lands there).
  // If invoked from elsewhere, fall back to walking up looking for api/.
  let cur = process.cwd();
  for (let i = 0; i < 5; i += 1) {
    if (existsSync(path.join(cur, 'apps', 'api', 'src', 'db', 'migrations'))) {
      return cur;
    }
    if (existsSync(path.join(cur, '..', 'api', 'src', 'db', 'migrations'))) {
      return path.resolve(cur, '..', '..');
    }
    cur = path.dirname(cur);
  }
  throw new Error('Could not locate repo root from cwd=' + process.cwd());
}

const ROOT = repoRoot();
const MIGRATIONS_FOLDER = path.join(ROOT, 'apps', 'api', 'src', 'db', 'migrations');
const API_ENV_FILE = path.join(ROOT, 'apps', 'api', '.env');

// Vitest does not auto-load .env files. Mirror api/test/setup.ts so local devs
// don't have to export DATABASE_URL for every web test run. Variables already
// in process.env (CI) win — never overwrite.
function loadApiEnv(): void {
  if (!existsSync(API_ENV_FILE)) return;
  const contents = readFileSync(API_ENV_FILE, 'utf8');
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    const value = line
      .slice(eq + 1)
      .trim()
      .replace(/^["']|["']$/g, '');
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadApiEnv();

export function getTestDbUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL is required to run perf/fixture tests. ' +
        'Copy apps/api/.env.example to apps/api/.env and ensure docker compose up -d postgres is running.',
    );
  }
  return url;
}

export function createTestDb(): Kysely<Database> {
  return new Kysely<Database>({
    dialect: new PostgresDialect({ pool: new pg.Pool({ connectionString: getTestDbUrl() }) }),
    plugins: [new CamelCasePlugin()],
  });
}

export async function migrateLatest(db: Kysely<Database>): Promise<void> {
  const migrator = new Migrator({
    db,
    provider: new FileMigrationProvider({ fs, path, migrationFolder: MIGRATIONS_FOLDER }),
  });
  const { error, results } = await migrator.migrateToLatest();
  if (error) {
    throw error instanceof Error ? error : new Error(String(error));
  }
  for (const r of results ?? []) {
    if (r.status !== 'Success') {
      throw new Error(`Migration failed: ${r.migrationName}`);
    }
  }
}

export async function truncateTodos(db: Kysely<Database>): Promise<void> {
  await sql`TRUNCATE TABLE todos`.execute(db);
}
