import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useOptimisticTodoMutation } from './useOptimisticTodoMutation.js';
import type { Todo } from '../types.js';
import { ApiError } from '../api/errors.js';

function wrapperFactory() {
  const queryClient = new QueryClient({
    defaultOptions: {
      // gcTime: Infinity — we assert post-settle cache state (e.g., snapshot-restored
      // after onError) with no active query observer. The default `gcTime: 0` would
      // garbage-collect the ['todos'] entry as soon as onSettled fires invalidation,
      // making `getQueryData` return undefined by the time the assertion runs.
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false },
    },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { wrapper, queryClient };
}

const t = (id: string, overrides: Partial<Todo> = {}): Todo => ({
  id,
  description: `desc-${id}`,
  completed: false,
  createdAt: '2026-04-20T10:00:00.000Z',
  userId: null,
  ...overrides,
});

describe('useOptimisticTodoMutation', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('onMutate cancels queries, snapshots cache, applies optimistic transform', async () => {
    const { wrapper, queryClient } = wrapperFactory();
    const initial = [t('a'), t('b')];
    queryClient.setQueryData<Todo[]>(['todos'], initial);

    const cancelSpy = vi.spyOn(queryClient, 'cancelQueries');
    const mutationFn = vi.fn().mockResolvedValue({ ok: true });
    const applyOptimistic = vi.fn((prev: Todo[] | undefined, input: { id: string }) =>
      (prev ?? []).filter((x) => x.id !== input.id),
    );

    const { result } = renderHook(
      () =>
        useOptimisticTodoMutation<{ ok: true }, { id: string }>({
          mutationKey: ['todos', 'test'],
          mutationFn,
          applyOptimistic,
        }),
      { wrapper },
    );

    await act(async () => {
      await result.current.mutateAsync({ id: 'a' });
    });

    expect(cancelSpy).toHaveBeenCalledWith({ queryKey: ['todos'] });
    expect(applyOptimistic).toHaveBeenCalledWith(initial, { id: 'a' });
  });

  it('onError restores the snapshot after a rejecting mutationFn', async () => {
    const { wrapper, queryClient } = wrapperFactory();
    const initial = [t('a')];
    queryClient.setQueryData<Todo[]>(['todos'], initial);

    const mutationFn = vi.fn().mockRejectedValue(new ApiError(500, 'boom'));
    const applyOptimistic = (prev: Todo[] | undefined) => (prev ?? []).slice(1);

    const { result } = renderHook(
      () =>
        useOptimisticTodoMutation<void, void>({
          mutationKey: ['todos', 'test'],
          mutationFn,
          applyOptimistic,
        }),
      { wrapper },
    );

    await act(async () => {
      try {
        await result.current.mutateAsync();
      } catch {
        /* expected */
      }
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    // No useTodos consumer is mounted, so invalidateQueries does not trigger a
    // fetch. The snapshot restored by onError is therefore the final cache state.
    expect(queryClient.getQueryData<Todo[]>(['todos'])).toEqual(initial);
  });

  it('onSettled calls invalidateQueries({ queryKey: ["todos"] }) on success', async () => {
    const { wrapper, queryClient } = wrapperFactory();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(
      () =>
        useOptimisticTodoMutation<void, void>({
          mutationKey: ['todos', 'test'],
          mutationFn: vi.fn().mockResolvedValue(undefined),
          applyOptimistic: (prev) => prev ?? [],
        }),
      { wrapper },
    );

    await act(async () => {
      await result.current.mutateAsync();
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['todos'] });
  });

  it('onSettled calls invalidateQueries on failure as well', async () => {
    const { wrapper, queryClient } = wrapperFactory();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(
      () =>
        useOptimisticTodoMutation<void, void>({
          mutationKey: ['todos', 'test'],
          mutationFn: vi.fn().mockRejectedValue(new ApiError(400, 'bad')),
          applyOptimistic: (prev) => prev ?? [],
        }),
      { wrapper },
    );

    await act(async () => {
      try {
        await result.current.mutateAsync();
      } catch {
        /* expected */
      }
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['todos'] });
  });

  it('handles undefined prior cache (applyOptimistic receives undefined)', async () => {
    const { wrapper } = wrapperFactory();
    const applyOptimistic = vi.fn((prev: Todo[] | undefined) => prev ?? []);

    const { result } = renderHook(
      () =>
        useOptimisticTodoMutation<void, void>({
          mutationKey: ['todos', 'test'],
          mutationFn: vi.fn().mockResolvedValue(undefined),
          applyOptimistic,
        }),
      { wrapper },
    );

    await act(async () => {
      await result.current.mutateAsync();
    });

    expect(applyOptimistic).toHaveBeenCalledWith(undefined, undefined);
  });
});
