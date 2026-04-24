import { v7 as uuidv7 } from 'uuid';
import type { Kysely } from 'kysely';
import type { Database } from '../db/schema.js';
import { NotFoundError } from '../errors/index.js';
import type { Todo, UpdateTodoInput } from '../schemas/todo.js';

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

export async function listAll(db: Kysely<Database>): Promise<Todo[]> {
  const rows = await db
    .selectFrom('todos')
    .selectAll()
    .orderBy('completed', 'asc')
    .orderBy('createdAt', 'asc')
    .execute();

  return rows.map((row) => ({
    id: row.id,
    description: row.description,
    completed: row.completed,
    createdAt: row.createdAt.toISOString(),
    userId: row.userId,
  }));
}

export async function update(
  id: string,
  input: UpdateTodoInput,
  db: Kysely<Database>,
): Promise<Todo> {
  const row = await db
    .updateTable('todos')
    .set({ completed: input.completed })
    .where('id', '=', id)
    .returningAll()
    .executeTakeFirst();

  if (!row) {
    throw new NotFoundError(`Todo ${id} not found`);
  }

  return {
    id: row.id,
    description: row.description,
    completed: row.completed,
    createdAt: row.createdAt.toISOString(),
    userId: row.userId,
  };
}
