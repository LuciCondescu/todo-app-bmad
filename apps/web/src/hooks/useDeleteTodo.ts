import type { UseMutationResult } from '@tanstack/react-query';
import { api } from '../api/todos.js';
import type { ApiError } from '../api/errors.js';
import {
  useOptimisticTodoMutation,
  type TodoOptimisticContext,
} from './useOptimisticTodoMutation.js';

export function useDeleteTodo(): UseMutationResult<void, ApiError, string, TodoOptimisticContext> {
  return useOptimisticTodoMutation<void, string>({
    mutationKey: ['todos', 'delete'],
    mutationFn: (id) => api.todos.delete(id),
    applyOptimistic: (prev, id) => (prev ?? []).filter((t) => t.id !== id),
  });
}
