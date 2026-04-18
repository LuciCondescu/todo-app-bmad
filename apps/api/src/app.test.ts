import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './app.js';

describe('buildApp', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    if (app) {
      await app.close();
      app = undefined;
    }
  });

  it('registers the /healthz route', async () => {
    app = await buildApp({ config: { DATABASE_URL: 'postgresql://test' } });
    expect(app.hasRoute({ method: 'GET', url: '/healthz' })).toBe(true);
  });

  it('responds to GET /healthz with 200 { status: "ok" }', async () => {
    app = await buildApp({ config: { DATABASE_URL: 'postgresql://test' } });

    const res = await app.inject({ method: 'GET', url: '/healthz' });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('application/json; charset=utf-8');
    expect(res.json()).toEqual({ status: 'ok' });
  });

  it('fails fast when DATABASE_URL is missing', async () => {
    await expect(buildApp({ config: {} })).rejects.toThrow(/DATABASE_URL/i);
  });
});
