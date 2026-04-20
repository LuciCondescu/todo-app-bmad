import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { NotFoundError } from '../src/errors/index.js';
import { migrateLatest } from './setup.js';

describe('plugin stack integration — CORS, helmet, rate-limit, swagger, /v1 prefix, error envelope', () => {
  let app: FastifyInstance | undefined;

  beforeAll(async () => {
    // Apply 1.3 migration once per file so the real /healthz probe stays happy
    // across every test (harmless, matches the 1.3 convention).
    const primer = await buildApp();
    try {
      await migrateLatest(primer.db);
    } finally {
      await primer.close();
    }
  });

  afterEach(async () => {
    if (app) {
      await app.close();
      app = undefined;
    }
  });

  it('CORS preflight for /healthz emits Access-Control-Allow-Origin', async () => {
    app = await buildApp();

    const res = await app.inject({
      method: 'OPTIONS',
      url: '/healthz',
      headers: {
        origin: 'http://localhost:5173',
        'access-control-request-method': 'GET',
      },
    });

    expect([200, 204]).toContain(res.statusCode);
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });

  it('helmet default headers are present on /healthz (CSP intentionally disabled)', async () => {
    app = await buildApp();

    const res = await app.inject({ method: 'GET', url: '/healthz' });

    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBeTruthy();
    expect(res.headers['content-security-policy']).toBeUndefined();
  });

  it('rate-limit decorates responses with x-ratelimit-* headers', async () => {
    app = await buildApp();

    const res = await app.inject({ method: 'GET', url: '/healthz' });

    expect(res.headers['x-ratelimit-limit']).toBe('300');
    expect(res.headers['x-ratelimit-remaining']).toBeDefined();
  });

  it('GET /docs returns Swagger UI HTML', async () => {
    app = await buildApp();

    const res = await app.inject({ method: 'GET', url: '/docs' });

    expect(res.statusCode).toBeLessThan(400);
    // Swagger UI's HTML references the swagger-ui bundle; marker is stable across versions.
    expect(res.body).toContain('swagger-ui');
    expect(res.headers['content-security-policy']).toBeUndefined();
  });

  it('GET /docs/json returns an OpenAPI 3.x document with ErrorResponse schema', async () => {
    app = await buildApp();

    const res = await app.inject({ method: 'GET', url: '/docs/json' });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('application/json; charset=utf-8');

    const body = res.json();
    expect(body.openapi).toMatch(/^3\./);
    expect(body.info).toEqual({ title: 'todo-app API', version: '1.0.0' });
    expect(body.paths).toHaveProperty('/healthz');
    expect(body.components?.schemas).toHaveProperty('ErrorResponse');
    const errorSchema = body.components.schemas.ErrorResponse;
    expect(errorSchema.properties).toMatchObject({
      statusCode: expect.any(Object),
      error: expect.any(Object),
      message: expect.any(Object),
    });
  });

  it('POST /v1/todos with missing body returns the 400 envelope (schema validation active per story 2.1)', async () => {
    app = await buildApp();

    const res = await app.inject({ method: 'POST', url: '/v1/todos' });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ statusCode: 400, error: 'Bad Request' });
  });

  it('GET /healthz still returns 200 { status: "ok", db: "ok" } (regression guard for /v1 mount)', async () => {
    app = await buildApp();

    const res = await app.inject({ method: 'GET', url: '/healthz' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok', db: 'ok' });
  });

  it('unknown routes fall through to the default 404 envelope', async () => {
    app = await buildApp();

    const res = await app.inject({ method: 'GET', url: '/v99/nope' });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ statusCode: 404, error: 'Not Found' });
  });

  it('NotFoundError thrown from a route round-trips to the 404 envelope via the global handler', async () => {
    app = await buildApp({
      registerTestRoutes: async (testApp) => {
        testApp.get('/__explode/nf', async () => {
          throw new NotFoundError('Todo abc not found');
        });
      },
    });

    const res = await app.inject({ method: 'GET', url: '/__explode/nf' });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({
      statusCode: 404,
      error: 'Not Found',
      message: 'Todo abc not found',
    });
  });

  it('Postgres 23xxx errors round-trip to 409 with a safe generic message (no leakage)', async () => {
    app = await buildApp({
      registerTestRoutes: async (testApp) => {
        testApp.get('/__explode/23', async () => {
          throw Object.assign(
            new Error('duplicate key value violates unique constraint "todos_pkey"'),
            { code: '23505', detail: 'Key (id)=(abc) already exists.' },
          );
        });
      },
    });

    const res = await app.inject({ method: 'GET', url: '/__explode/23' });
    const body = res.json();

    expect(res.statusCode).toBe(409);
    expect(body).toMatchObject({ statusCode: 409, error: 'Conflict' });
    expect(body.message).not.toMatch(/todos_pkey/);
    expect(body.message).not.toMatch(/abc/);
    expect(body.message).not.toMatch(/duplicate key/);
  });

  it('generic errors round-trip to the 500 envelope', async () => {
    app = await buildApp({
      registerTestRoutes: async (testApp) => {
        testApp.get('/__explode/500', async () => {
          throw new Error('boom');
        });
      },
    });

    const res = await app.inject({ method: 'GET', url: '/__explode/500' });

    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'Internal server error',
    });
  });
});
