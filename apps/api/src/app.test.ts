import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  DummyDriver,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
  type DatabaseConnection,
  type Driver,
} from 'kysely';
import { buildApp } from './app.js';
import type { Database } from './db/schema.js';

// DummyDriver returns empty results without hitting a network — lets unit tests
// use the real Kysely surface (compiler, adapter, plugins) with no live Postgres.
function createDummyDb(): Kysely<Database> {
  return new Kysely<Database>({
    dialect: {
      createAdapter: () => new PostgresAdapter(),
      createDriver: () => new DummyDriver(),
      createIntrospector: (db) => new PostgresIntrospector(db),
      createQueryCompiler: () => new PostgresQueryCompiler(),
    },
  });
}

// ThrowingDriver simulates the degraded-DB case: every query throws, no network.
// Matches the runtime behaviour of a broken connection without the teardown cost.
class ThrowingDriver implements Driver {
  async init(): Promise<void> {}
  async acquireConnection(): Promise<DatabaseConnection> {
    return {
      executeQuery: async () => {
        throw new Error('simulated DB probe failure');
      },
      // eslint-disable-next-line require-yield -- interface contract; body throws before yielding
      streamQuery: async function* () {
        throw new Error('simulated DB probe failure');
      },
    };
  }
  async beginTransaction(): Promise<void> {}
  async commitTransaction(): Promise<void> {}
  async rollbackTransaction(): Promise<void> {}
  async releaseConnection(): Promise<void> {}
  async destroy(): Promise<void> {}
}

function createThrowingDb(): Kysely<Database> {
  return new Kysely<Database>({
    dialect: {
      createAdapter: () => new PostgresAdapter(),
      createDriver: () => new ThrowingDriver(),
      createIntrospector: (db) => new PostgresIntrospector(db),
      createQueryCompiler: () => new PostgresQueryCompiler(),
    },
  });
}

describe('buildApp', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    if (app) {
      await app.close();
      app = undefined;
    }
  });

  it('registers the /healthz, /docs, and POST /v1/todos routes; GET /v1/todos still unregistered (story 2.2)', async () => {
    app = await buildApp({
      config: { DATABASE_URL: 'postgresql://test' },
      db: createDummyDb(),
    });
    expect(app.hasRoute({ method: 'GET', url: '/healthz' })).toBe(true);
    expect(app.hasRoute({ method: 'GET', url: '/docs' })).toBe(true);
    expect(app.hasRoute({ method: 'POST', url: '/v1/todos' })).toBe(true);
    expect(app.hasRoute({ method: 'GET', url: '/v1/todos' })).toBe(false);
  });

  it('responds to GET /healthz with 200 { status: "ok", db: "ok" } when the DB probe succeeds', async () => {
    app = await buildApp({
      config: { DATABASE_URL: 'postgresql://test' },
      db: createDummyDb(),
    });

    const res = await app.inject({ method: 'GET', url: '/healthz' });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('application/json; charset=utf-8');
    expect(res.json()).toEqual({ status: 'ok', db: 'ok' });
  });

  it('responds to GET /healthz with 503 { status: "degraded", db: "error" } when the DB probe throws', async () => {
    app = await buildApp({
      config: { DATABASE_URL: 'postgresql://test' },
      db: createThrowingDb(),
    });
    const errSpy = vi.spyOn(app.log, 'error').mockImplementation(() => {});

    const res = await app.inject({ method: 'GET', url: '/healthz' });

    expect(res.statusCode).toBe(503);
    expect(res.headers['content-type']).toBe('application/json; charset=utf-8');
    expect(res.json()).toEqual({ status: 'degraded', db: 'error' });
    expect(errSpy).toHaveBeenCalledTimes(1);
  });

  it('fails fast when DATABASE_URL is missing', async () => {
    await expect(buildApp({ config: {}, db: createDummyDb() })).rejects.toThrow(/DATABASE_URL/i);
  });

  it('fails fast when CORS_ORIGIN is not a valid URI (ajv-formats enforces format: uri)', async () => {
    await expect(
      buildApp({
        config: { DATABASE_URL: 'postgresql://ok', CORS_ORIGIN: 'not a uri' },
        db: createDummyDb(),
      }),
    ).rejects.toThrow(/format|uri/i);
  });

  it('returns a 400 envelope for POST /v1/todos with missing body (schema validation via TypeBox + AJV)', async () => {
    app = await buildApp({
      config: { DATABASE_URL: 'postgresql://test' },
      db: createDummyDb(),
    });

    const res = await app.inject({ method: 'POST', url: '/v1/todos' });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ statusCode: 400, error: 'Bad Request' });
  });

  it('returns a 400 envelope for POST /v1/todos with unknown keys (additionalProperties: false)', async () => {
    app = await buildApp({
      config: { DATABASE_URL: 'postgresql://test' },
      db: createDummyDb(),
    });

    const res = await app.inject({
      method: 'POST',
      url: '/v1/todos',
      payload: { description: 'ok', extra: 'field' },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ statusCode: 400, error: 'Bad Request' });
  });

  it('returns a 404 envelope for an unknown root path', async () => {
    app = await buildApp({
      config: { DATABASE_URL: 'postgresql://test' },
      db: createDummyDb(),
    });

    const res = await app.inject({ method: 'GET', url: '/unknown' });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ statusCode: 404, error: 'Not Found' });
  });
});
