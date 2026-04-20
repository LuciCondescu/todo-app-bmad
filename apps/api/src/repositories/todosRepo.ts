import { v7 as uuidv7 } from 'uuid';
import type { Kysely } from 'kysely';
import type { Database } from '../db/schema.js';
import type { Todo } from '../schemas/todo.js';

export async function create(input: { description: string }, db: Kysely<Database>): Promise<Todo> {
  const description = input.description.trim();
  const id = uuidv7();

  const row = await db
    .insertInto('todos')
    .values({ id, description, completed: false, userId: null })
    .returningAll()
    .executeTakeFirstOrThrow();

  return {
    id: row.id,
    description: row.description,
    completed: row.completed,
    createdAt: row.createdAt.toISOString(),
    userId: row.userId,
  };
}
