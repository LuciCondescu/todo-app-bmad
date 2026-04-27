// Story 5.1 — Fixture unit test (AC3). Requires a real Postgres reachable via
// DATABASE_URL; locally that means `docker compose up -d postgres`. CI uses
// the services.postgres container declared in `.github/workflows/ci.yml`.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql, type Kysely } from 'kysely';
import type { Database } from '@todo-app/api/db/schema';
import { createTestDb, migrateLatest } from '../perf/test-db.js';
import { seed50, SEED_TOTAL, SEED_ACTIVE, SEED_COMPLETED } from './seed50.js';

let db: Kysely<Database>;

beforeAll(async () => {
  db = createTestDb();
  await migrateLatest(db);
});

afterAll(async () => {
  await db.destroy();
});

describe('seed50 fixture', () => {
  it('populates exactly 50 todos with the documented 35/15 active/completed split (AC1) and is idempotent (AC2)', async () => {
    await seed50(db);
    const firstCount = await sql<{ count: string }>`SELECT count(*)::text AS count FROM todos`.execute(db);
    expect(Number(firstCount.rows[0].count)).toBe(SEED_TOTAL);

    const distribution = await db
      .selectFrom('todos')
      .select(['completed'])
      .execute();
    const active = distribution.filter((t) => !t.completed).length;
    const completed = distribution.filter((t) => t.completed).length;
    expect(active).toBe(SEED_ACTIVE);
    expect(completed).toBe(SEED_COMPLETED);

    // Idempotence: a second invocation should not stack rows.
    await seed50(db);
    const secondCount = await sql<{ count: string }>`SELECT count(*)::text AS count FROM todos`.execute(db);
    expect(Number(secondCount.rows[0].count)).toBe(SEED_TOTAL);
  });
});
