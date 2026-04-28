import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { migrateLatest, truncateTodos } from './setup.js';

type CreatedTodo = {
  id: string;
  description: string;
  completed: boolean;
  createdAt: string;
  userId: string | null;
};

describe('app close + rebuild preserves todos (FR-011 / NFR-003 boundary 2)', () => {
  it('3 todos created via POST survive app.close() + fresh buildApp() with identical shape and order', async () => {
    // Phase 1: build, migrate, truncate, create 3 todos, close.
    const first = await buildApp();
    const created: CreatedTodo[] = [];
    try {
      await migrateLatest(first.db);
      await truncateTodos(first.db);

      for (const description of ['First todo', 'Second todo', 'Third todo']) {
        const res = await first.inject({
          method: 'POST',
          url: '/v1/todos',
          payload: { description },
        });
        expect(res.statusCode).toBe(201);
        const body = res.json() as CreatedTodo;
        expect(body).toEqual(
          expect.objectContaining({
            id: expect.any(String),
            description,
            completed: false,
            createdAt: expect.any(String),
            userId: null,
          }),
        );
        created.push(body);
      }
      expect(created).toHaveLength(3);
    } finally {
      await first.close();
    }

    // Phase 2: fresh app instance against the SAME DATABASE_URL — proves the
    // pg-data is server-side, not in-process.
    const second = await buildApp();
    try {
      const res = await second.inject({ method: 'GET', url: '/v1/todos' });
      expect(res.statusCode).toBe(200);
      const listed = res.json() as CreatedTodo[];
      expect(listed).toHaveLength(3);

      // Deep equality on every field — any drift (timestamp reformatting, microsecond
      // rounding, userId coercion) fails the test.
      expect(listed).toEqual(created);

      // Order is FR-002 — completed ASC, createdAt ASC. All three have completed=false,
      // so insertion order is the expected order.
      expect(listed.map((t) => t.description)).toEqual(['First todo', 'Second todo', 'Third todo']);
    } finally {
      await second.close();
    }
  });
});
