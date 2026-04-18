import { existsSync, promises as fs, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';
import { FileMigrationProvider, Migrator, NO_MIGRATIONS } from 'kysely';
import { createDb } from './index.js';

const MIGRATIONS_FOLDER = fileURLToPath(new URL('./migrations', import.meta.url));
const WORKSPACE_ENV_FILE = fileURLToPath(new URL('../../.env', import.meta.url));

// Apply apps/api/.env without adding a dotenv dep. Existing process.env entries
// win (CI, explicit shell exports), so we never overwrite caller intent.
function loadWorkspaceEnv(): void {
  if (!existsSync(WORKSPACE_ENV_FILE)) return;
  for (const rawLine of readFileSync(WORKSPACE_ENV_FILE, 'utf8').split(/\r?\n/)) {
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

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }

  const args = new Set(process.argv.slice(2));
  const reset = args.has('--reset');

  if (reset && !(connectionString.includes('localhost') || connectionString.includes('127.0.0.1'))) {
    console.error('Refusing --reset against a non-local DATABASE_URL');
    process.exit(1);
  }

  const db = createDb(connectionString);

  try {
    const migrator = new Migrator({
      db,
      provider: new FileMigrationProvider({ fs, path, migrationFolder: MIGRATIONS_FOLDER }),
    });

    if (reset) {
      const { error: downErr, results: downResults } = await migrator.migrateTo(NO_MIGRATIONS);
      if (downErr) throw downErr;
      for (const r of downResults ?? []) {
        console.log(
          r.status === 'Success' ? `reverted ${r.migrationName}` : `failed to revert ${r.migrationName}`,
        );
      }
    }

    const { error, results } = await migrator.migrateToLatest();
    for (const r of results ?? []) {
      console.log(r.status === 'Success' ? `applied ${r.migrationName}` : `failed ${r.migrationName}`);
    }
    if (error) {
      console.error(error);
      process.exit(1);
    }
  } finally {
    await db.destroy();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
