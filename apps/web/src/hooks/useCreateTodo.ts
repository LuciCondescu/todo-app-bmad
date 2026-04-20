import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import { api } from '../api/todos.js';
import type { Todo } from '../types.js';
import type { ApiError } from '../api/errors.js';

export function useCreateTodo(): UseMutationResult<Todo, ApiError, string> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ['todos', 'create'],
    mutationFn: (description: string) => api.todos.create(description),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['todos'] });
    },
  });
}
