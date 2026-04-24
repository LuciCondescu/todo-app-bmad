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

describe('api.todos.update', () => {
  it('calls PATCH /v1/todos/:id with { completed } body and returns the parsed Todo', async () => {
    const serverTodo = {
      id: 'abc',
      description: 'x',
      completed: true,
      createdAt: '2026-04-20T10:00:00.000Z',
      userId: null,
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          ({
            ok: true,
            status: 200,
            statusText: 'OK',
            json: async () => serverTodo,
          }) as unknown as Response,
      ),
    );

    const result = await todos.update('abc', { completed: true });
    expect(result).toEqual(serverTodo);

    const fetchMock = globalThis.fetch as unknown as { mock: { calls: unknown[][] } };
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(`${API_BASE}/v1/todos/abc`);
    expect((init as RequestInit).method).toBe('PATCH');
    expect((init as RequestInit).body).toBe(JSON.stringify({ completed: true }));
    expect((init as RequestInit).headers).toEqual({ 'Content-Type': 'application/json' });
  });
});

describe('api.todos.delete', () => {
  it('calls DELETE /v1/todos/:id with no body and resolves undefined on 204', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          ({
            ok: true,
            status: 204,
            statusText: 'No Content',
          }) as unknown as Response,
      ),
    );

    const result = await todos.delete('abc');
    expect(result).toBeUndefined();

    const fetchMock = globalThis.fetch as unknown as { mock: { calls: unknown[][] } };
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(`${API_BASE}/v1/todos/abc`);
    expect((init as RequestInit).method).toBe('DELETE');
    expect((init as RequestInit).body).toBeUndefined();
    expect((init as RequestInit).headers).toBeUndefined();
  });
});
