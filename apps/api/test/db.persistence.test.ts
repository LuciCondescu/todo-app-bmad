import { exec } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql, type Kysely } from 'kysely';
import { v7 as uuidv7 } from 'uuid';
import { createDb } from '../src/db/index.js';
import type { Database } from '../src/db/schema.js';
import { getTestDbUrl, migrateLatest, truncateTodos } from './setup.js';

const execAsync = promisify(exec);
const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url));

// Durability check requires docker-compose — skip on CI where Postgres runs as
// a service container instead. CI still exercises migrations + inserts against
// a fresh Postgres on every run, which covers data-at-rest correctness.
describe.skipIf(process.env.CI === 'true')('todos persistence across Postgres restart', () => {
  let db: Kysely<Database>;

  beforeAll(async () => {
    db = createDb(getTestDbUrl());
    await migrateLatest(db);
  });

  afterAll(async () => {
    await db.destroy();
  });

  beforeEach(async () => {
    await truncateTodos(db);
  });

  it('survives docker compose restart postgres (pg-data named volume)', async () => {
    const id = uuidv7();
    await db
      .insertInto('todos')
      .values({ id, description: 'survives restart', completed: false, userId: null })
      .execute();

    await execAsync('docker compose restart postgres', { cwd: REPO_ROOT });

    // Poll until Postgres accepts queries again (up to ~30s).
    let reconnected = false;
    for (let i = 0; i < 30; i++) {
      try {
        await sql`SELECT 1`.execute(db);
        reconnected = true;
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
    expect(reconnected).toBe(true);

    const rows = await db.selectFrom('todos').selectAll().where('id', '=', id).execute();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.description).toBe('survives restart');
    expect(rows[0]!.completed).toBe(false);
    expect(rows[0]!.userId).toBeNull();
  }, 60_000);
});
