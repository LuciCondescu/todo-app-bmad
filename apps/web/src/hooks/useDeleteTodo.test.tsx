import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useDeleteTodo } from './useDeleteTodo.js';
import { api } from '../api/todos.js';
import { ApiError } from '../api/errors.js';
import type { Todo } from '../types.js';

vi.mock('../api/todos.js', () => ({
  api: {
    todos: {
      list: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

function wrapperFactory() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { wrapper, queryClient };
}

const makeTodo = (id: string, completed = false): Todo => ({
  id,
  description: `desc-${id}`,
  completed,
  createdAt: '2026-04-20T10:00:00.000Z',
  userId: null,
});

describe('useDeleteTodo', () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it('optimistically removes the row and invalidates on settle', async () => {
    const { wrapper, queryClient } = wrapperFactory();
    const seed = [makeTodo('a'), makeTodo('b')];
    queryClient.setQueryData<Todo[]>(['todos'], seed);

    vi.mocked(api.todos.delete).mockResolvedValueOnce(undefined);
    vi.mocked(api.todos.list).mockResolvedValueOnce([makeTodo('b')]);

    const { result } = renderHook(() => useDeleteTodo(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync('a');
    });

    const after = queryClient.getQueryData<Todo[]>(['todos']);
    expect(after?.map((t) => t.id)).not.toContain('a');
    expect(vi.mocked(api.todos.delete)).toHaveBeenCalledWith('a');
  });

  it('returns a new array reference (no in-place mutation)', async () => {
    const { wrapper, queryClient } = wrapperFactory();
    const seed = [makeTodo('a'), makeTodo('b')];
    queryClient.setQueryData<Todo[]>(['todos'], seed);
    const before = queryClient.getQueryData<Todo[]>(['todos']);

    vi.mocked(api.todos.delete).mockResolvedValueOnce(undefined);
    vi.mocked(api.todos.list).mockResolvedValueOnce([makeTodo('b')]);

    const { result } = renderHook(() => useDeleteTodo(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync('a');
    });

    const after = queryClient.getQueryData<Todo[]>(['todos']);
    expect(before).not.toBe(after);
  });

  it('does not mutate the input array (Object.freeze guard)', async () => {
    const { wrapper, queryClient } = wrapperFactory();
    const seed = Object.freeze([makeTodo('a')]) as unknown as Todo[];
    queryClient.setQueryData<Todo[]>(['todos'], seed);

    vi.mocked(api.todos.delete).mockResolvedValueOnce(undefined);
    vi.mocked(api.todos.list).mockResolvedValueOnce([]);

    const { result } = renderHook(() => useDeleteTodo(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync('a');
    });
  });

  it('reverts and invalidates on server error (row reappears via refetch)', async () => {
    const { wrapper, queryClient } = wrapperFactory();
    const seed = [makeTodo('a')];
    queryClient.setQueryData<Todo[]>(['todos'], seed);

    vi.mocked(api.todos.delete).mockRejectedValueOnce(new ApiError(500, 'boom'));
    vi.mocked(api.todos.list).mockResolvedValue(seed);

    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useDeleteTodo(), { wrapper });

    await act(async () => {
      try {
        await result.current.mutateAsync('a');
      } catch {
        /* expected */
      }
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(ApiError);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['todos'] });
  });

  it('tolerates non-matching id (404 from server → cache unchanged)', async () => {
    const { wrapper, queryClient } = wrapperFactory();
    const seed = [makeTodo('a')];
    queryClient.setQueryData<Todo[]>(['todos'], seed);

    vi.mocked(api.todos.delete).mockRejectedValueOnce(new ApiError(404, 'Todo ghost not found'));
    vi.mocked(api.todos.list).mockResolvedValue(seed);

    const { result } = renderHook(() => useDeleteTodo(), { wrapper });
    await act(async () => {
      try {
        await result.current.mutateAsync('ghost');
      } catch {
        /* expected */
      }
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.statusCode).toBe(404);
  });
});
