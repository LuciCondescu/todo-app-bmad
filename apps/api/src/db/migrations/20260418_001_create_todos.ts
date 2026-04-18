import { sql, type Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('todos')
    .addColumn('id', 'uuid', (col) => col.primaryKey())
    .addColumn('description', sql`varchar(500)`, (col) => col.notNull())
    .addColumn('completed', 'boolean', (col) => col.notNull().defaultTo(false))
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('user_id', 'text')
    .execute();

  await db.schema
    .createIndex('idx_todos_completed_created_at')
    .on('todos')
    .columns(['completed', 'created_at'])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropIndex('idx_todos_completed_created_at').execute();
  await db.schema.dropTable('todos').execute();
}
