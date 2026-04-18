// Hand-written DB interface. Matches migration 20260418_001 column set.
// Keys are camelCase — CamelCasePlugin maps to snake_case in SQL at query time.

import type { Generated } from 'kysely';

export interface TodoTable {
  id: string;
  description: string;
  completed: boolean;
  createdAt: Generated<Date>;
  userId: string | null;
}

export interface Database {
  todos: TodoTable;
}
