import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { api } from '../api/todos.js';
import type { Todo } from '../types.js';
import type { ApiError } from '../api/errors.js';

export function useTodos(): UseQueryResult<Todo[], ApiError> {
  return useQuery({
    queryKey: ['todos'],
    queryFn: api.todos.list,
  });
}
