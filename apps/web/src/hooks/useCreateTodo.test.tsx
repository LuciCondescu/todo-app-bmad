import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useCreateTodo } from './useCreateTodo.js';
import { ApiError } from '../api/errors.js';
import type { ReactNode } from 'react';

function wrapperFactory() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { wrapper, queryClient };
}

describe('useCreateTodo', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('POSTs /v1/todos, invalidates ["todos"] on success, populates cache via refetch', async () => {
    const created = {
      id: '01',
      description: 'Buy milk',
      completed: false,
      createdAt: '2026-04-20T10:00:00.000Z',
      userId: null,
    };
    const fetchFn = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        return {
          ok: true,
          status: 201,
          statusText: 'Created',
          json: async () => created,
        } as unknown as Response;
      }
      // Invalidation triggers a refetch of ['todos'] → GET
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => [created],
      } as unknown as Response;
    });
    vi.stubGlobal('fetch', fetchFn);

    const { wrapper, queryClient } = wrapperFactory();
    queryClient.setQueryData(['todos'], []);
    const { result } = renderHook(() => useCreateTodo(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync('Buy milk');
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const postCall = fetchFn.mock.calls.find((c) => (c[1] as RequestInit).method === 'POST');
    expect(postCall).toBeDefined();
    expect((postCall![1] as RequestInit).body).toBe(JSON.stringify({ description: 'Buy milk' }));
  });

  it('surfaces ApiError on POST failure AND still invalidates ["todos"]', async () => {
    const fetchFn = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        return {
          ok: false,
          status: 400,
          statusText: 'Bad Request',
          json: async () => ({
            statusCode: 400,
            error: 'Bad Request',
            message: 'description required',
          }),
        } as unknown as Response;
      }
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => [],
      } as unknown as Response;
    });
    vi.stubGlobal('fetch', fetchFn);

    const { wrapper, queryClient } = wrapperFactory();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useCreateTodo(), { wrapper });

    await act(async () => {
      try {
        await result.current.mutateAsync('');
      } catch {
        // expected
      }
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(ApiError);
    expect(result.current.error?.statusCode).toBe(400);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['todos'] });
  });
});
