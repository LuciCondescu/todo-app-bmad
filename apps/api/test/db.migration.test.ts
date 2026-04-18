import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql, type Kysely } from 'kysely';
import { createDb } from '../src/db/index.js';
import type { Database } from '../src/db/schema.js';
import { createMigrator, getTestDbUrl, migrateLatest } from './setup.js';

describe('todos migration (20260418_001_create_todos)', () => {
  let db: Kysely<Database>;

  beforeAll(async () => {
    db = createDb(getTestDbUrl());
    await migrateLatest(db);
  });

  afterAll(async () => {
    await db.destroy();
  });

  it('creates the todos table with the expected columns', async () => {
    // CamelCasePlugin transforms raw-sql result keys too, so column_name → columnName etc.
    const { rows } = await sql<{ columnName: string; dataType: string; isNullable: string }>`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'todos'
      ORDER BY ordinal_position
    `.execute(db);

    expect(rows.map((r) => r.columnName)).toEqual([
      'id',
      'description',
      'completed',
      'created_at',
      'user_id',
    ]);

    const byName = Object.fromEntries(rows.map((r) => [r.columnName, r]));
    expect(byName.id?.dataType).toBe('uuid');
    expect(byName.description?.dataType).toBe('character varying');
    expect(byName.completed?.dataType).toBe('boolean');
    expect(byName.created_at?.dataType).toBe('timestamp with time zone');
    expect(byName.user_id?.dataType).toBe('text');

    // Nullability: only user_id is nullable.
    expect(byName.id?.isNullable).toBe('NO');
    expect(byName.description?.isNullable).toBe('NO');
    expect(byName.completed?.isNullable).toBe('NO');
    expect(byName.created_at?.isNullable).toBe('NO');
    expect(byName.user_id?.isNullable).toBe('YES');
  });

  it('creates idx_todos_completed_created_at on (completed, created_at)', async () => {
    // pg_indexes is single-word-lowercase already (no snake_case), so CamelCasePlugin is a no-op here.
    const { rows } = await sql<{ indexdef: string }>`
      SELECT indexdef
      FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = 'todos' AND indexname = 'idx_todos_completed_created_at'
    `.execute(db);

    expect(rows).toHaveLength(1);
    expect(rows[0]!.indexdef).toMatch(/\(completed,\s*created_at\)/);
  });

  it('applies description length constraint (varchar(500))', async () => {
    const { rows } = await sql<{ characterMaximumLength: number | null }>`
      SELECT character_maximum_length
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'todos' AND column_name = 'description'
    `.execute(db);

    expect(rows[0]!.characterMaximumLength).toBe(500);
  });

  it('is idempotent — a second migrateToLatest applies no new migrations', async () => {
    const migrator = createMigrator(db);
    const { error, results } = await migrator.migrateToLatest();
    expect(error).toBeUndefined();
    expect(results ?? []).toHaveLength(0);
  });
});
