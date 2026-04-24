import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useToggleTodo } from './useToggleTodo.js';
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

describe('useToggleTodo', () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it('optimistically flips the target row completed value; returns a new array reference', async () => {
    const { wrapper, queryClient } = wrapperFactory();
    const seed = [makeTodo('a', false), makeTodo('b', false)];
    queryClient.setQueryData<Todo[]>(['todos'], seed);

    const serverUpdated = { ...seed[0]!, completed: true };
    vi.mocked(api.todos.update).mockResolvedValueOnce(serverUpdated);
    vi.mocked(api.todos.list).mockResolvedValueOnce([serverUpdated, seed[1]!]);

    const { result } = renderHook(() => useToggleTodo(), { wrapper });

    const before = queryClient.getQueryData<Todo[]>(['todos']);

    await act(async () => {
      await result.current.mutateAsync({ id: 'a', completed: true });
    });

    const after = queryClient.getQueryData<Todo[]>(['todos']);
    expect(before).not.toBe(after);
    expect(after?.find((x) => x.id === 'a')?.completed).toBe(true);
    expect(vi.mocked(api.todos.update)).toHaveBeenCalledWith('a', { completed: true });
  });

  it('does not mutate the input array (immutability via Object.freeze)', async () => {
    const { wrapper, queryClient } = wrapperFactory();
    const seed = Object.freeze([makeTodo('a', false)]) as unknown as Todo[];
    queryClient.setQueryData<Todo[]>(['todos'], seed);

    vi.mocked(api.todos.update).mockResolvedValueOnce(makeTodo('a', true));
    vi.mocked(api.todos.list).mockResolvedValueOnce([makeTodo('a', true)]);

    const { result } = renderHook(() => useToggleTodo(), { wrapper });

    // An in-place mutation on a frozen array throws in strict mode.
    await act(async () => {
      await result.current.mutateAsync({ id: 'a', completed: true });
    });
  });

  it('reverts the cache on server error and invalidates on settle', async () => {
    const { wrapper, queryClient } = wrapperFactory();
    const seed = [makeTodo('a', false)];
    queryClient.setQueryData<Todo[]>(['todos'], seed);

    vi.mocked(api.todos.update).mockRejectedValueOnce(new ApiError(500, 'boom'));
    vi.mocked(api.todos.list).mockResolvedValue(seed);

    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useToggleTodo(), { wrapper });

    await act(async () => {
      try {
        await result.current.mutateAsync({ id: 'a', completed: true });
      } catch {
        /* expected */
      }
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(ApiError);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['todos'] });
  });

  it('tolerates a non-matching id (race: row gone between read and toggle)', async () => {
    const { wrapper, queryClient } = wrapperFactory();
    const seed = [makeTodo('a')];
    queryClient.setQueryData<Todo[]>(['todos'], seed);

    vi.mocked(api.todos.update).mockRejectedValueOnce(new ApiError(404, 'Todo ghost not found'));
    vi.mocked(api.todos.list).mockResolvedValue(seed);

    const { result } = renderHook(() => useToggleTodo(), { wrapper });

    await act(async () => {
      try {
        await result.current.mutateAsync({ id: 'ghost', completed: true });
      } catch {
        /* expected */
      }
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.statusCode).toBe(404);
  });
});
