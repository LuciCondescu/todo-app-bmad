import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useTodos } from './useTodos.js';
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

const SEED_TODOS = [
  {
    id: '01',
    description: 'a',
    completed: false,
    createdAt: '2026-04-20T10:00:00.000Z',
    userId: null,
  },
];

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        ({
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => SEED_TODOS,
        }) as unknown as Response,
    ),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useTodos', () => {
  it('fetches the todos array on first render', async () => {
    const { wrapper } = wrapperFactory();
    const { result } = renderHook(() => useTodos(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(SEED_TODOS);
    expect(result.current.error).toBeNull();
  });

  it('surfaces ApiError on fetch failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          ({
            ok: false,
            status: 500,
            statusText: 'Internal',
            json: async () => ({
              statusCode: 500,
              error: 'Internal Server Error',
              message: 'boom',
            }),
          }) as unknown as Response,
      ),
    );
    const { wrapper } = wrapperFactory();
    const { result } = renderHook(() => useTodos(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(ApiError);
    expect(result.current.error?.statusCode).toBe(500);
  });
});
