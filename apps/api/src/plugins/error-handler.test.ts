import { describe, it, expect, vi } from 'vitest';
import Fastify from 'fastify';
import errorHandlerPlugin from './error-handler.js';
import { NotFoundError } from '../errors/index.js';

async function buildTestApp() {
  const app = Fastify({ logger: false });
  await app.register(errorHandlerPlugin);
  return app;
}

describe('global error handler', () => {
  it('maps Fastify validation errors to 400 with Bad Request envelope', async () => {
    const app = await buildTestApp();
    app.post(
      '/v',
      {
        schema: {
          body: {
            type: 'object',
            required: ['x'],
            properties: { x: { type: 'string' } },
          },
        },
      },
      async () => ({ ok: true }),
    );

    const res = await app.inject({ method: 'POST', url: '/v', payload: {} });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ statusCode: 400, error: 'Bad Request' });
    await app.close();
  });

  it('maps NotFoundError to 404 with the supplied message', async () => {
    const app = await buildTestApp();
    app.get('/nf', async () => {
      throw new NotFoundError('Todo abc not found');
    });

    const res = await app.inject({ method: 'GET', url: '/nf' });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({
      statusCode: 404,
      error: 'Not Found',
      message: 'Todo abc not found',
    });
    await app.close();
  });

  it('maps Postgres 23xxx errors to 409 with a safe message (no raw detail leaked)', async () => {
    const app = await buildTestApp();
    app.get('/pg', async () => {
      const err = Object.assign(
        new Error('duplicate key value violates unique constraint "todos_pkey"'),
        {
          code: '23505',
          detail: 'Key (id)=(abc) already exists.',
        },
      );
      throw err;
    });

    const res = await app.inject({ method: 'GET', url: '/pg' });
    const body = res.json();

    expect(res.statusCode).toBe(409);
    expect(body.statusCode).toBe(409);
    expect(body.error).toBe('Conflict');
    expect(body.message).not.toMatch(/todos_pkey/);
    expect(body.message).not.toMatch(/abc/);
    expect(body.message).not.toMatch(/duplicate key/);
    await app.close();
  });

  it('maps generic errors to 500 and logs the original error', async () => {
    const app = Fastify({ logger: false });
    const logErrorSpy = vi.spyOn(app.log, 'error');
    await app.register(errorHandlerPlugin);
    app.get('/boom', async () => {
      throw new Error('boom');
    });

    const res = await app.inject({ method: 'GET', url: '/boom' });

    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'Internal server error',
    });
    expect(logErrorSpy).toHaveBeenCalled();
    await app.close();
  });
});
