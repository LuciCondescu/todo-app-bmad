import { Type, type Static } from '@sinclair/typebox';

export const TodoSchema = Type.Object(
  {
    id: Type.String({ format: 'uuid' }),
    description: Type.String({ minLength: 1, maxLength: 500 }),
    completed: Type.Boolean(),
    createdAt: Type.String({ format: 'date-time' }),
    userId: Type.Union([Type.String(), Type.Null()]),
  },
  { $id: 'Todo', additionalProperties: false },
);
export type Todo = Static<typeof TodoSchema>;

export const CreateTodoInputSchema = Type.Object(
  {
    description: Type.String({ minLength: 1, maxLength: 500 }),
  },
  { $id: 'CreateTodoInput', additionalProperties: false },
);
export type CreateTodoInput = Static<typeof CreateTodoInputSchema>;
