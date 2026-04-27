// Story 5.1 — Journey 4 perf-harness seed fixture.
//
// Populates the `todos` table with EXACTLY 50 deterministic rows via the api
// workspace's `todosRepo` (the AC1-recommended path: direct DB, NOT via the
// HTTP API). 35 active + 15 completed (70/30 split — within the 60/40–70/30
// band the AC permits). Descriptions are stable across runs (`Perf todo #00`
// through `#49`), and idempotent: a second invocation yields 50 rows, not 100,
// because every call begins with `truncateTodos`.

import type { Kysely } from 'kysely';
import type { Database } from '@todo-app/api/db/schema';
import * as todosRepo from '@todo-app/api/repositories/todosRepo';
import { truncateTodos } from '../perf/test-db.js';

export const SEED_TOTAL = 50;
export const SEED_ACTIVE = 35;
export const SEED_COMPLETED = 15;

export async function seed50(db: Kysely<Database>): Promise<void> {
  await truncateTodos(db);
  const created: string[] = [];
  for (let i = 0; i < SEED_TOTAL; i += 1) {
    const description = `Perf todo #${String(i).padStart(2, '0')}`;
    const todo = await todosRepo.create({ description }, db);
    created.push(todo.id);
  }
  // Mark the last 15 as completed (indices 35..49) → 35 active + 15 completed.
  for (let i = SEED_ACTIVE; i < SEED_TOTAL; i += 1) {
    await todosRepo.update(created[i], { completed: true }, db);
  }
}
