import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { FormatRegistry } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { TodoSchema } from '../src/schemas/todo.js';
import { migrateLatest, truncateTodos } from './setup.js';

const UUID_V7_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UUID_GENERIC_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_UTC_MS_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

// TypeBox's Value.Check consults FormatRegistry for `format` keywords. Register
// the two formats TodoSchema uses so contract tests can validate structurally.
if (!FormatRegistry.Has('uuid')) {
  FormatRegistry.Set('uuid', (value) => UUID_GENERIC_REGEX.test(value));
}
if (!FormatRegistry.Has('date-time')) {
  FormatRegistry.Set('date-time', (value) => ISO_UTC_MS_REGEX.test(value));
}

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

describe('POST /v1/todos — contract', () => {
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

describe('GET /v1/todos — contract', () => {
  it('returns 200 [] on an empty table', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/todos' });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('application/json; charset=utf-8');
    expect(res.json()).toEqual([]);
  });

  it('returns plain array (NOT {data}/{todos} wrapper)', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/todos' });

    const body = res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body).not.toHaveProperty('data');
    expect(body).not.toHaveProperty('todos');
  });

  it('returns [T1, T3, T2, T4] — active section (ASC) followed by completed section (ASC)', async () => {
    const ids = {
      T1: '01927f00-0000-7000-8000-000000000001',
      T2: '01927f00-0000-7000-8000-000000000002',
      T3: '01927f00-0000-7000-8000-000000000003',
      T4: '01927f00-0000-7000-8000-000000000004',
    };
    const now = new Date('2026-04-20T10:00:00.000Z').getTime();
    await app.db
      .insertInto('todos')
      .values([
        {
          id: ids.T1,
          description: 'T1 active',
          completed: false,
          userId: null,
          createdAt: new Date(now + 1000),
        },
        {
          id: ids.T2,
          description: 'T2 completed',
          completed: true,
          userId: null,
          createdAt: new Date(now + 2000),
        },
        {
          id: ids.T3,
          description: 'T3 active',
          completed: false,
          userId: null,
          createdAt: new Date(now + 3000),
        },
        {
          id: ids.T4,
          description: 'T4 completed',
          completed: true,
          userId: null,
          createdAt: new Date(now + 4000),
        },
      ])
      .execute();

    const res = await app.inject({ method: 'GET', url: '/v1/todos' });

    expect(res.statusCode).toBe(200);
    const body = res.json() as Array<{ id: string }>;
    expect(body.map((t) => t.id)).toEqual([ids.T1, ids.T3, ids.T2, ids.T4]);
  });

  it('every returned element satisfies TodoSchema (structural validation)', async () => {
    await app.db
      .insertInto('todos')
      .values({
        id: '01927f00-0000-7000-8000-0000000000aa',
        description: 'seed',
        completed: false,
        userId: null,
      })
      .execute();

    const res = await app.inject({ method: 'GET', url: '/v1/todos' });
    const body = res.json() as unknown[];

    expect(body.length).toBeGreaterThan(0);
    for (const item of body) {
      expect(Value.Check(TodoSchema, item)).toBe(true);
    }
  });

  it('createdAt on every element matches ISO 8601 UTC ms pattern with Z suffix', async () => {
    await app.db
      .insertInto('todos')
      .values([
        {
          id: '01927f00-0000-7000-8000-0000000000bb',
          description: 'a',
          completed: false,
          userId: null,
        },
        {
          id: '01927f00-0000-7000-8000-0000000000cc',
          description: 'b',
          completed: true,
          userId: null,
        },
      ])
      .execute();

    const res = await app.inject({ method: 'GET', url: '/v1/todos' });
    const body = res.json() as Array<{ createdAt: string }>;

    for (const item of body) {
      expect(item.createdAt).toMatch(ISO_UTC_MS_REGEX);
    }
  });
});
