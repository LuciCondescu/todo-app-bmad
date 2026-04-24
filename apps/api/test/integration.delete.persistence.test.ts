import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { migrateLatest, truncateTodos } from './setup.js';

describe('DELETE /v1/todos/:id — persistence across app restart', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    if (app) {
      await app.close();
      app = undefined;
    }
  });

  it('a deleted row does not reappear after app close + rebuild (FR-011 / NFR-003)', async () => {
    app = await buildApp();
    await migrateLatest(app.db);
    await truncateTodos(app.db);

    const KEEP = '01927f00-0000-7000-8000-0000000000d1';
    const DELETE_ME = '01927f00-0000-7000-8000-0000000000d2';

    await app.db
      .insertInto('todos')
      .values([
        { id: KEEP, description: 'Keep me', completed: false, userId: null },
        { id: DELETE_ME, description: 'Delete me', completed: false, userId: null },
      ])
      .execute();

    const delRes = await app.inject({ method: 'DELETE', url: `/v1/todos/${DELETE_ME}` });
    expect(delRes.statusCode).toBe(204);

    // Simulated server restart: close the Fastify instance (drops the DB pool),
    // then build a fresh instance. The pg-data Docker volume preserves the
    // committed state of the prior DELETE.
    await app.close();
    app = await buildApp();

    const listRes = await app.inject({ method: 'GET', url: '/v1/todos' });
    expect(listRes.statusCode).toBe(200);
    const body = listRes.json() as Array<{ id: string }>;
    const ids = body.map((t) => t.id);
    expect(ids).toContain(KEEP);
    expect(ids).not.toContain(DELETE_ME);
  });
});
