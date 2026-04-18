import { afterEach, describe, expect, it } from 'vitest';
import type { Kysely } from 'kysely';
import { createDb } from './index.js';
import type { Database } from './schema.js';

describe('createDb', () => {
  let db: Kysely<Database> | undefined;

  afterEach(async () => {
    if (db) {
      await db.destroy();
      db = undefined;
    }
  });

  it('translates camelCase column names to snake_case SQL via CamelCasePlugin', () => {
    db = createDb('postgresql://unused:unused@localhost/never');
    const compiled = db.selectFrom('todos').select(['createdAt', 'userId']).compile();

    expect(compiled.sql).toMatch(/select\s+"created_at",\s*"user_id"\s+from\s+"todos"/i);
  });
});
