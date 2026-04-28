import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { migrateLatest, truncateTodos } from './setup.js';

const MISSING_ID = '00000000-0000-7000-8000-000000000000';
// UUID-v7-shaped synthetic id; the `c0ffee` tail makes it grep-friendly in failure output
// AND lets AC5 assert the id never round-trips into the 409 envelope.
const DUPLICATE_ID = '01927f00-0000-7000-8000-000000c0ffee';
const SYNTHETIC_ERROR_MARKER = 'synthetic-boom-4-4';

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp({
    registerTestRoutes: async (testApp) => {
      testApp.get('/__explode/pg-duplicate', async () => {
        await app.db
          .insertInto('todos')
          .values({ id: DUPLICATE_ID, description: 'A', completed: false, userId: null })
          .execute();
        await app.db
          .insertInto('todos')
          .values({ id: DUPLICATE_ID, description: 'B', completed: false, userId: null })
          .execute();
        return { ok: true };
      });
      testApp.get('/__explode/generic', async () => {
        throw new Error(SYNTHETIC_ERROR_MARKER);
      });
    },
  });
  await migrateLatest(app.db);
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await truncateTodos(app.db);
});

describe('global error handler — real-route + real-Postgres integration coverage', () => {
  it('PATCH /v1/todos/<non-existent-uuid> → 404 with NotFoundError envelope (AC2 — repo-layer NotFoundError)', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/v1/todos/${MISSING_ID}`,
      payload: { completed: true },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({
      statusCode: 404,
      error: 'Not Found',
      message: `Todo ${MISSING_ID} not found`,
    });
  });

  it('DELETE /v1/todos/<non-existent-uuid> → 404 with NotFoundError envelope (AC3 — route-layer NotFoundError)', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/v1/todos/${MISSING_ID}`,
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({
      statusCode: 404,
      error: 'Not Found',
      message: `Todo ${MISSING_ID} not found`,
    });
  });

  it.each([
    ['missing description', {}],
    ['empty string', { description: '' }],
    ['501-char description', { description: 'x'.repeat(501) }],
    ['unknown key', { description: 'ok', extra: 'field' }],
  ])(
    'POST /v1/todos with %s → 400 envelope; no stack/Ajv/TypeBox leakage (AC4)',
    async (_label, payload) => {
      const res = await app.inject({ method: 'POST', url: '/v1/todos', payload });
      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body).toMatchObject({ statusCode: 400, error: 'Bad Request' });
      expect(typeof body.message).toBe('string');
      const raw = res.body;
      expect(raw).not.toMatch(/stack/i);
      expect(raw).not.toMatch(/Ajv/i);
      expect(raw).not.toMatch(/TypeBox/i);
    },
  );

  it('real Postgres 23505 (PK violation) → 409 with safe message; no leakage (AC5)', async () => {
    const res = await app.inject({ method: 'GET', url: '/__explode/pg-duplicate' });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({
      statusCode: 409,
      error: 'Conflict',
      message: 'Conflict — the request violates a database constraint.',
    });
    const raw = res.body;
    expect(raw).not.toMatch(/todos_pkey/i);
    expect(raw).not.toMatch(/duplicate key/i);
    expect(raw).not.toMatch(/\bdetail\b/i);
    expect(raw).not.toMatch(/c0ffee/i);
  });

  it('generic Error thrown in a test route → 500 generic envelope; pino logger receives the original error (AC6)', async () => {
    const logSpy = vi.spyOn(app.log, 'error');
    try {
      const res = await app.inject({ method: 'GET', url: '/__explode/generic' });
      expect(res.statusCode).toBe(500);
      expect(res.json()).toEqual({
        statusCode: 500,
        error: 'Internal Server Error',
        message: 'Internal server error',
      });
      expect(res.body).not.toContain(SYNTHETIC_ERROR_MARKER);

      const matchingCall = logSpy.mock.calls.find(([arg]) => {
        return (
          typeof arg === 'object' &&
          arg !== null &&
          'err' in arg &&
          (arg as { err?: unknown }).err instanceof Error &&
          (arg as { err: Error }).err.message === SYNTHETIC_ERROR_MARKER
        );
      });
      expect(matchingCall, 'expected pino to receive the original Error via { err }').toBeDefined();
    } finally {
      logSpy.mockRestore();
    }
  });
});
