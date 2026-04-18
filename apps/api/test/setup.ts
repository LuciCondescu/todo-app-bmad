import { existsSync, readFileSync, promises as fs } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FileMigrationProvider, Migrator, sql, type Kysely } from 'kysely';

const MIGRATIONS_FOLDER = fileURLToPath(
  new URL('../src/db/migrations', import.meta.url),
);

const WORKSPACE_ENV_FILE = fileURLToPath(new URL('../.env', import.meta.url));

// Vitest does not auto-load .env files. Apply them manually so local devs don't
// have to export DATABASE_URL for every test run. Variables already present in
// process.env (e.g. in CI) win — we never overwrite.
function loadWorkspaceEnv(): void {
  if (!existsSync(WORKSPACE_ENV_FILE)) return;
  const contents = readFileSync(WORKSPACE_ENV_FILE, 'utf8');
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadWorkspaceEnv();

export function getTestDbUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL is required to run integration tests. ' +
        'Copy apps/api/.env.example to apps/api/.env and ensure docker compose up -d postgres is running.',
    );
  }
  return url;
}

export async function migrateLatest<T>(db: Kysely<T>): Promise<void> {
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

export function createMigrator<T>(db: Kysely<T>): Migrator {
  return new Migrator({
    db,
    provider: new FileMigrationProvider({ fs, path, migrationFolder: MIGRATIONS_FOLDER }),
  });
}

export async function truncateTodos<T>(db: Kysely<T>): Promise<void> {
  await sql`TRUNCATE TABLE todos`.execute(db);
}
