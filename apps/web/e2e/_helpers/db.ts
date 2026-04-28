import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

// e2e specs reset DB state between tests by truncating the todos table. The
// previous implementation shelled out to `docker compose exec postgres psql`,
// which only works locally — CI runs Postgres as a GitHub Actions service
// container, with no docker-compose project to attach to. Speak to Postgres
// directly via DATABASE_URL: identical in both environments.

const API_ENV_FILE = fileURLToPath(new URL('../../../api/.env', import.meta.url));

function loadApiEnv(): void {
  if (!existsSync(API_ENV_FILE)) return;
  for (const rawLine of readFileSync(API_ENV_FILE, 'utf8').split(/\r?\n/)) {
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

function getConnectionString(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL is required for e2e DB resets. ' +
        'Copy apps/api/.env.example to apps/api/.env, or set DATABASE_URL in the environment.',
    );
  }
  return url;
}

export async function truncateTodos(): Promise<void> {
  const client = new pg.Client({ connectionString: getConnectionString() });
  await client.connect();
  try {
    await client.query('TRUNCATE TABLE todos');
  } finally {
    await client.end();
  }
}
