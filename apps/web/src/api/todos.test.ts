import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { todos } from './todos.js';

const API_BASE = import.meta.env.VITE_API_URL;

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        ({
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => [],
        }) as unknown as Response,
    ),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('api.todos.list', () => {
  it('calls GET /v1/todos and returns the parsed array', async () => {
    const result = await todos.list();
    expect(result).toEqual([]);
    const fetchMock = globalThis.fetch as unknown as { mock: { calls: unknown[][] } };
    expect(fetchMock.mock.calls[0]![0]).toBe(`${API_BASE}/v1/todos`);
    expect((fetchMock.mock.calls[0]![1] as RequestInit).method).toBe('GET');
  });
});

describe('api.todos.create', () => {
  it('calls POST /v1/todos with { description } body', async () => {
    await todos.create('Buy milk');
    const fetchMock = globalThis.fetch as unknown as { mock: { calls: unknown[][] } };
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(`${API_BASE}/v1/todos`);
    expect((init as RequestInit).method).toBe('POST');
    expect((init as RequestInit).body).toBe(JSON.stringify({ description: 'Buy milk' }));
  });
});
