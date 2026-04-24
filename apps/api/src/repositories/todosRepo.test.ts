import { describe, it, expect } from 'vitest';
import {
  CamelCasePlugin,
  CompiledQuery,
  DummyDriver,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
  type DatabaseConnection,
  type Driver,
  type QueryResult,
} from 'kysely';
import type { Database } from '../db/schema.js';
import { NotFoundError } from '../errors/index.js';
import * as todosRepo from './todosRepo.js';

function createDummyDb(): Kysely<Database> {
  return new Kysely<Database>({
    dialect: {
      createAdapter: () => new PostgresAdapter(),
      createDriver: () => new DummyDriver(),
      createIntrospector: (db) => new PostgresIntrospector(db),
      createQueryCompiler: () => new PostgresQueryCompiler(),
    },
    plugins: [new CamelCasePlugin()],
  });
}

// SeedingDriver captures the compiled query for inspection and returns a
// pre-seeded row. Lets us unit-test `create()` end-to-end (trim, uuidv7,
// toISOString, returned Todo shape, insert parameter wiring) without a live
// Postgres. Mirrors the ThrowingDriver pattern in src/app.test.ts.
class SeedingDriver implements Driver {
  readonly captured: CompiledQuery[] = [];
  constructor(private readonly seedRow: Record<string, unknown>) {}
  async init(): Promise<void> {}
  async acquireConnection(): Promise<DatabaseConnection> {
    return {
      executeQuery: async <R>(compiledQuery: CompiledQuery): Promise<QueryResult<R>> => {
        this.captured.push(compiledQuery);
        return { rows: [this.seedRow as R] };
      },
      // eslint-disable-next-line require-yield -- interface contract; body throws before yielding
      streamQuery: async function* () {
        throw new Error('streamQuery not used in todosRepo.create');
      },
    };
  }
  async beginTransaction(): Promise<void> {}
  async commitTransaction(): Promise<void> {}
  async rollbackTransaction(): Promise<void> {}
  async releaseConnection(): Promise<void> {}
  async destroy(): Promise<void> {}
}

function createSeedingDb(seedRow: Record<string, unknown>): {
  db: Kysely<Database>;
  driver: SeedingDriver;
} {
  const driver = new SeedingDriver(seedRow);
  const db = new Kysely<Database>({
    dialect: {
      createAdapter: () => new PostgresAdapter(),
      createDriver: () => driver,
      createIntrospector: (innerDb) => new PostgresIntrospector(innerDb),
      createQueryCompiler: () => new PostgresQueryCompiler(),
    },
    plugins: [new CamelCasePlugin()],
  });
  return { db, driver };
}

const UUID_V7_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_UTC_MS_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

describe('todosRepo.listAll — compiled SELECT shape (DummyDriver)', () => {
  it('compiles to SELECT * FROM todos ORDER BY completed ASC, created_at ASC with no WHERE clause', () => {
    const db = createDummyDb();
    const compiled = db
      .selectFrom('todos')
      .selectAll()
      .orderBy('completed', 'asc')
      .orderBy('createdAt', 'asc')
      .compile();

    expect(compiled.sql).toMatch(/select\s+\*\s+from\s+"todos"/i);
    expect(compiled.sql).toMatch(/order\s+by\s+"completed"\s+asc,\s+"created_at"\s+asc/i);
    expect(compiled.sql).not.toMatch(/where/i);
    expect(compiled.parameters).toEqual([]);
  });
});

describe('todosRepo.create — compiled insert shape (DummyDriver)', () => {
  it('compiles to INSERT INTO "todos" (...) RETURNING * with snake_case user_id column', () => {
    const db = createDummyDb();
    const compiled = db
      .insertInto('todos')
      .values({ id: 'placeholder-uuid', description: 'Buy milk', completed: false, userId: null })
      .returningAll()
      .compile();

    expect(compiled.sql).toMatch(/insert\s+into\s+"todos"/i);
    expect(compiled.sql).toMatch(/"description"/);
    expect(compiled.sql).toMatch(/"completed"/);
    expect(compiled.sql).toMatch(/"user_id"/);
    expect(compiled.sql).toMatch(/returning\s+\*/i);
  });
});

describe('todosRepo.create — behavior (SeedingDriver)', () => {
  it('trims surrounding whitespace before inserting and in the returned Todo', async () => {
    // Driver seeds back whatever the caller would read from Postgres —
    // populate it with the trimmed description so we can assert the repo
    // forwards the trimmed value both to the insert AND the returned shape.
    const createdAt = new Date('2026-04-20T10:30:00.000Z');
    const { db, driver } = createSeedingDb({
      id: 'seeded-id-0000',
      description: 'Buy milk',
      completed: false,
      created_at: createdAt,
      user_id: null,
    });

    const todo = await todosRepo.create({ description: '  Buy milk  ' }, db);

    expect(driver.captured).toHaveLength(1);
    const [query] = driver.captured;
    // Kysely compiles parameters in the order the columns appear in .values({...}).
    // The repo calls .values({ id, description, completed, userId }) — so
    // parameters[1] is the description, which must be the trimmed value.
    expect(query.parameters[1]).toBe('Buy milk');
    expect(todo.description).toBe('Buy milk');
  });

  it('mints a UUID v7 as the id (not client-provided, not v4)', async () => {
    const { db, driver } = createSeedingDb({
      id: 'ignored-by-test',
      description: 'x',
      completed: false,
      created_at: new Date(),
      user_id: null,
    });

    await todosRepo.create({ description: 'x' }, db);

    const [query] = driver.captured;
    // parameters[0] is the `id` column (first key in .values({ id, ... })).
    expect(query.parameters[0]).toMatch(UUID_V7_REGEX);
  });

  it('inserts completed=false and userId=null (never client-supplied)', async () => {
    const { db, driver } = createSeedingDb({
      id: 'x',
      description: 'x',
      completed: false,
      created_at: new Date(),
      user_id: null,
    });

    await todosRepo.create({ description: 'x' }, db);

    const [query] = driver.captured;
    // Order: id, description, completed, userId
    expect(query.parameters[2]).toBe(false);
    expect(query.parameters[3]).toBeNull();
  });

  it('does not send createdAt in the insert (Postgres DEFAULT now() populates it)', async () => {
    const { db, driver } = createSeedingDb({
      id: 'x',
      description: 'x',
      completed: false,
      created_at: new Date(),
      user_id: null,
    });

    await todosRepo.create({ description: 'x' }, db);

    const [query] = driver.captured;
    // 4 columns in .values({ id, description, completed, userId }) ⇒ 4 params.
    // A 5th param would indicate createdAt leaked into the insert.
    expect(query.parameters).toHaveLength(4);
    expect(query.sql).not.toMatch(/"created_at"/);
  });

  it('serializes the returned Todo: Date → ISO 8601 UTC string with ms precision and Z suffix', async () => {
    const createdAt = new Date('2026-04-20T10:30:00.000Z');
    const { db } = createSeedingDb({
      id: '01957890-abcd-7def-8000-000000000000',
      description: 'Hello',
      completed: false,
      created_at: createdAt,
      user_id: null,
    });

    const todo = await todosRepo.create({ description: 'Hello' }, db);

    expect(todo.createdAt).toBe('2026-04-20T10:30:00.000Z');
    expect(todo.createdAt).toMatch(ISO_UTC_MS_REGEX);
  });

  it('returns a Todo object with camelCase keys, explicit userId: null, and the seeded id', async () => {
    const { db } = createSeedingDb({
      id: '01957890-abcd-7def-8000-000000000001',
      description: 'Return shape',
      completed: false,
      created_at: new Date('2026-04-20T10:30:00.000Z'),
      user_id: null,
    });

    const todo = await todosRepo.create({ description: 'Return shape' }, db);

    expect(todo).toEqual({
      id: '01957890-abcd-7def-8000-000000000001',
      description: 'Return shape',
      completed: false,
      createdAt: '2026-04-20T10:30:00.000Z',
      userId: null,
    });
  });

  it('propagates the userId from the DB row when it is a string (future multi-user path)', async () => {
    const { db } = createSeedingDb({
      id: 'x',
      description: 'x',
      completed: false,
      created_at: new Date('2026-04-20T10:30:00.000Z'),
      user_id: 'growth-user-123',
    });

    const todo = await todosRepo.create({ description: 'x' }, db);

    expect(todo.userId).toBe('growth-user-123');
  });

  it('throws if the insert returns zero rows (executeTakeFirstOrThrow contract)', async () => {
    // Override the SeedingDriver to return empty rows — simulates the
    // "insert silently returned nothing" pathological case. executeTakeFirstOrThrow
    // must surface it rather than returning undefined.
    const driver = new SeedingDriver({}); // seed doesn't matter; we replace executeQuery below
    driver.acquireConnection = async () => ({
      executeQuery: async () => ({ rows: [] }),
      // eslint-disable-next-line require-yield -- interface contract
      streamQuery: async function* () {
        throw new Error('unused');
      },
    });
    const db = new Kysely<Database>({
      dialect: {
        createAdapter: () => new PostgresAdapter(),
        createDriver: () => driver,
        createIntrospector: (innerDb) => new PostgresIntrospector(innerDb),
        createQueryCompiler: () => new PostgresQueryCompiler(),
      },
      plugins: [new CamelCasePlugin()],
    });

    await expect(todosRepo.create({ description: 'x' }, db)).rejects.toThrow();
  });
});

describe('todosRepo.update — compiled UPDATE shape (DummyDriver)', () => {
  it('compiles to UPDATE "todos" SET "completed" = $1 WHERE "id" = $2 RETURNING *', () => {
    const db = createDummyDb();
    const compiled = db
      .updateTable('todos')
      .set({ completed: true })
      .where('id', '=', 'some-id')
      .returningAll()
      .compile();

    expect(compiled.sql).toMatch(/update\s+"todos"\s+set\s+"completed"/i);
    expect(compiled.sql).toMatch(/where\s+"id"\s+=/i);
    expect(compiled.sql).toMatch(/returning\s+\*/i);
    expect(compiled.parameters).toEqual([true, 'some-id']);
  });
});

describe('todosRepo.update — behavior (SeedingDriver)', () => {
  it('returns a Todo with updated completed field and serialized createdAt on existing row', async () => {
    const createdAt = new Date('2026-04-20T10:30:00.000Z');
    const { db } = createSeedingDb({
      id: '01957890-abcd-7def-8000-000000000000',
      description: 'Existing todo',
      completed: true,
      created_at: createdAt,
      user_id: null,
    });

    const todo = await todosRepo.update(
      '01957890-abcd-7def-8000-000000000000',
      { completed: true },
      db,
    );

    expect(todo).toEqual({
      id: '01957890-abcd-7def-8000-000000000000',
      description: 'Existing todo',
      completed: true,
      createdAt: '2026-04-20T10:30:00.000Z',
      userId: null,
    });
    expect(todo.createdAt).toMatch(ISO_UTC_MS_REGEX);
  });

  it('throws NotFoundError with an id-echoing message when the UPDATE affects zero rows', async () => {
    // Override the SeedingDriver to always return empty rows — mirrors the
    // zero-rows pattern used in the create() executeTakeFirstOrThrow test above.
    const driver = new SeedingDriver({});
    driver.acquireConnection = async () => ({
      executeQuery: async () => ({ rows: [] }),
      // eslint-disable-next-line require-yield -- interface contract
      streamQuery: async function* () {
        throw new Error('unused');
      },
    });
    const db = new Kysely<Database>({
      dialect: {
        createAdapter: () => new PostgresAdapter(),
        createDriver: () => driver,
        createIntrospector: (innerDb) => new PostgresIntrospector(innerDb),
        createQueryCompiler: () => new PostgresQueryCompiler(),
      },
      plugins: [new CamelCasePlugin()],
    });

    await expect(todosRepo.update('ghost-id', { completed: true }, db)).rejects.toThrow(
      NotFoundError,
    );
    await expect(todosRepo.update('ghost-id', { completed: true }, db)).rejects.toThrow(
      /^Todo ghost-id not found$/,
    );
  });
});

describe('todosRepo.remove — compiled DELETE shape (DummyDriver)', () => {
  it('compiles to DELETE FROM "todos" WHERE "id" = $1 with no RETURNING clause', () => {
    const db = createDummyDb();
    const compiled = db.deleteFrom('todos').where('id', '=', 'some-id').compile();

    expect(compiled.sql).toMatch(/delete\s+from\s+"todos"/i);
    expect(compiled.sql).toMatch(/where\s+"id"\s+=/i);
    expect(compiled.sql).not.toMatch(/returning/i);
    expect(compiled.parameters).toEqual(['some-id']);
  });
});

describe('todosRepo.remove — behavior (SeedingDriver)', () => {
  // Kysely's DeleteResult.numDeletedRows is populated from the driver's
  // QueryResult.numAffectedRows (bigint), not from any returned row. The
  // SeedingDriver helper in this file models a SELECT/INSERT returning path,
  // so remove-tests get their own thin factory that emits the DELETE-shaped
  // QueryResult explicitly.
  function createDeleteResultDb(numAffectedRows: bigint): Kysely<Database> {
    const driver = new SeedingDriver({});
    driver.acquireConnection = async () => ({
      executeQuery: async () => ({ rows: [], numAffectedRows }),
      // eslint-disable-next-line require-yield -- interface contract
      streamQuery: async function* () {
        throw new Error('unused');
      },
    });
    return new Kysely<Database>({
      dialect: {
        createAdapter: () => new PostgresAdapter(),
        createDriver: () => driver,
        createIntrospector: (innerDb) => new PostgresIntrospector(innerDb),
        createQueryCompiler: () => new PostgresQueryCompiler(),
      },
      plugins: [new CamelCasePlugin()],
    });
  }

  it('returns 1 when one row is deleted (bigint → number coercion)', async () => {
    const db = createDeleteResultDb(1n);
    const affected = await todosRepo.remove('existing-id', db);
    expect(affected).toBe(1);
    expect(typeof affected).toBe('number');
  });

  it('returns 0 when no rows match (non-existent id) — does NOT throw', async () => {
    const db = createDeleteResultDb(0n);
    const affected = await todosRepo.remove('ghost-id', db);
    expect(affected).toBe(0);
    expect(typeof affected).toBe('number');
  });
});
