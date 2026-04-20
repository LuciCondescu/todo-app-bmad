import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { migrateLatest, truncateTodos } from './setup.js';

const UUID_V7_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_UTC_MS_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

describe('POST /v1/todos — contract', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await migrateLatest(app.db);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await truncateTodos(app.db);
  });

  it('returns 201 with Todo shape on valid body', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/todos',
      payload: { description: 'Buy milk' },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.id).toMatch(UUID_V7_REGEX);
    expect(body.description).toBe('Buy milk');
    expect(body.completed).toBe(false);
    expect(body.createdAt).toMatch(ISO_UTC_MS_REGEX);
    expect(body.userId).toBeNull();
  });

  it('trims surrounding whitespace from description', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/todos',
      payload: { description: '  Buy milk  ' },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json().description).toBe('Buy milk');
  });

  it.each([
    ['empty string', { description: '' }],
    ['missing description', {}],
    ['501-char description', { description: 'x'.repeat(501) }],
    ['unknown key', { description: 'ok', extra: 'field' }],
  ])('returns 400 on %s', async (_label, payload) => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/todos',
      payload,
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ statusCode: 400, error: 'Bad Request' });
  });

  it('persists the row so a direct Kysely query finds it (FR-011 / NFR-003 seed)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/todos',
      payload: { description: 'Persists' },
    });
    const { id } = res.json();

    const row = await app.db
      .selectFrom('todos')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirstOrThrow();

    expect(row.description).toBe('Persists');
    expect(row.completed).toBe(false);
    expect(row.userId).toBeNull();
    expect(row.createdAt).toBeInstanceOf(Date);
  });

  it('exposes Todo and CreateTodoInput in /docs/json components.schemas', async () => {
    const res = await app.inject({ method: 'GET', url: '/docs/json' });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.components.schemas).toHaveProperty('Todo');
    expect(body.components.schemas).toHaveProperty('CreateTodoInput');
    expect(body.components.schemas.Todo.properties).toMatchObject({
      id: expect.any(Object),
      description: expect.any(Object),
      completed: expect.any(Object),
      createdAt: expect.any(Object),
      userId: expect.any(Object),
    });
  });
});
