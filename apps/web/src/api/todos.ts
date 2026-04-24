import { apiClient } from './apiClient.js';
import type { Todo, UpdateTodoInput } from '../types.js';

export const todos = {
  list: (): Promise<Todo[]> => apiClient.get<Todo[]>('/v1/todos'),
  create: (description: string): Promise<Todo> =>
    apiClient.post<Todo>('/v1/todos', { description }),
  update: (id: string, input: UpdateTodoInput): Promise<Todo> =>
    apiClient.patch<Todo>(`/v1/todos/${id}`, input),
  delete: (id: string): Promise<void> => apiClient.del<void>(`/v1/todos/${id}`),
};

// Namespace wrapper for `api.todos.list()` call sites (architecture.md:599).
export const api = { todos };
