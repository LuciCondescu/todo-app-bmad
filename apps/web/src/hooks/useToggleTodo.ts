import type { UseMutationResult } from '@tanstack/react-query';
import { api } from '../api/todos.js';
import type { ApiError } from '../api/errors.js';
import type { Todo } from '../types.js';
import {
  useOptimisticTodoMutation,
  type TodoOptimisticContext,
} from './useOptimisticTodoMutation.js';

export type ToggleTodoInput = { id: string; completed: boolean };

export function useToggleTodo(): UseMutationResult<
  Todo,
  ApiError,
  ToggleTodoInput,
  TodoOptimisticContext
> {
  return useOptimisticTodoMutation<Todo, ToggleTodoInput>({
    mutationKey: ['todos', 'toggle'],
    mutationFn: ({ id, completed }) => api.todos.update(id, { completed }),
    applyOptimistic: (prev, input) =>
      (prev ?? []).map((t) => (t.id === input.id ? { ...t, completed: input.completed } : t)),
  });
}
