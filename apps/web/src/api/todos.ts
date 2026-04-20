import { apiClient } from './apiClient.js';
import type { Todo } from '../types.js';

export const todos = {
  list: (): Promise<Todo[]> => apiClient.get<Todo[]>('/v1/todos'),
  create: (description: string): Promise<Todo> =>
    apiClient.post<Todo>('/v1/todos', { description }),
};

// Namespace wrapper for `api.todos.list()` call sites (architecture.md:599).
export const api = { todos };
