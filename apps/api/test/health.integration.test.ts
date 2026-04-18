import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { migrateLatest } from './setup.js';

describe('/healthz integration — real Kysely against Postgres', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    if (app) {
      await app.close();
      app = undefined;
    }
  });

  it('responds 200 { status: "ok", db: "ok" } when the DB probe succeeds', async () => {
    app = await buildApp();
    await migrateLatest(app.db);

    const res = await app.inject({ method: 'GET', url: '/healthz' });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('application/json; charset=utf-8');
    expect(res.json()).toEqual({ status: 'ok', db: 'ok' });
  });

  it('responds 503 { status: "degraded", db: "error" } when the DB pool is destroyed', async () => {
    app = await buildApp();
    await migrateLatest(app.db);
    // Force-close the pool before probing. The onClose hook still fires on
    // app.close(); destroying the same instance twice is a no-op.
    await app.db.destroy();

    const res = await app.inject({ method: 'GET', url: '/healthz' });

    expect(res.statusCode).toBe(503);
    expect(res.headers['content-type']).toBe('application/json; charset=utf-8');
    expect(res.json()).toEqual({ status: 'degraded', db: 'error' });
  });
});
