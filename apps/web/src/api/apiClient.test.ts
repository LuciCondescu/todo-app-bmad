import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from './apiClient.js';
import { ApiError } from './errors.js';

const API_BASE = import.meta.env.VITE_API_URL;

type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

function mockFetch(status: number, body: unknown, opts: { bodyIsString?: boolean } = {}) {
  return vi.fn<FetchFn>(async () => {
    return {
      ok: status >= 200 && status < 300,
      status,
      statusText: 'OK',
      json: async () => {
        if (opts.bodyIsString) throw new SyntaxError('Unexpected token');
        return body;
      },
    } as unknown as Response;
  });
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('apiClient.get', () => {
  it('calls fetch with GET + base-prefixed URL + no Content-Type', async () => {
    const fetchFn = mockFetch(200, [
      {
        id: '01',
        description: 'x',
        completed: false,
        createdAt: '2026-04-20T10:00:00.000Z',
        userId: null,
      },
    ]);
    vi.stubGlobal('fetch', fetchFn);

    const result = await apiClient.get<Array<{ id: string }>>('/v1/todos');

    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe(`${API_BASE}/v1/todos`);
    expect((init as RequestInit).method).toBe('GET');
    expect((init as RequestInit).headers).toBeUndefined();
    expect((init as RequestInit).body).toBeUndefined();
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe('01');
  });

  it('throws ApiError on non-2xx with the server envelope message', async () => {
    const fetchFn = mockFetch(400, {
      statusCode: 400,
      error: 'Bad Request',
      message: 'description required',
    });
    vi.stubGlobal('fetch', fetchFn);

    await expect(apiClient.get('/v1/todos')).rejects.toThrow(ApiError);
  });

  it('ApiError carries statusCode + envelope message', async () => {
    const fetchFn = mockFetch(400, {
      statusCode: 400,
      error: 'Bad Request',
      message: 'description required',
    });
    vi.stubGlobal('fetch', fetchFn);

    await expect(apiClient.get('/v1/todos')).rejects.toMatchObject({
      statusCode: 400,
      message: 'description required',
    });
  });

  it('throws ApiError with generic message when 2xx body is not valid JSON', async () => {
    const fetchFn = mockFetch(200, '<html>not json</html>', { bodyIsString: true });
    vi.stubGlobal('fetch', fetchFn);

    await expect(apiClient.get('/v1/todos')).rejects.toMatchObject({
      statusCode: 200,
      message: 'Response was not valid JSON',
    });
  });
});

describe('apiClient.post', () => {
  it('calls fetch with POST + Content-Type: application/json + stringified body', async () => {
    const fetchFn = mockFetch(201, {
      id: '01',
      description: 'Buy milk',
      completed: false,
      createdAt: '2026-04-20T10:00:00.000Z',
      userId: null,
    });
    vi.stubGlobal('fetch', fetchFn);

    await apiClient.post<{ id: string }>('/v1/todos', { description: 'Buy milk' });

    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe(`${API_BASE}/v1/todos`);
    expect((init as RequestInit).method).toBe('POST');
    expect((init as RequestInit).headers).toEqual({ 'Content-Type': 'application/json' });
    expect((init as RequestInit).body).toBe(JSON.stringify({ description: 'Buy milk' }));
  });

  it('throws ApiError on 500 with envelope message', async () => {
    const fetchFn = mockFetch(500, {
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'Internal server error',
    });
    vi.stubGlobal('fetch', fetchFn);

    await expect(apiClient.post('/v1/todos', { description: 'x' })).rejects.toMatchObject({
      statusCode: 500,
      message: 'Internal server error',
    });
  });

  it('throws ApiError with statusText message when error body is also invalid JSON', async () => {
    const fetchFn = vi.fn<FetchFn>(
      async () =>
        ({
          ok: false,
          status: 503,
          statusText: 'Service Unavailable',
          json: async () => {
            throw new SyntaxError('bad json');
          },
        }) as unknown as Response,
    );
    vi.stubGlobal('fetch', fetchFn);

    await expect(apiClient.get('/v1/todos')).rejects.toMatchObject({
      statusCode: 503,
      message: 'Service Unavailable',
    });
  });
});

describe('apiClient.del (DELETE 204 short-circuit)', () => {
  it('returns undefined on 204 without calling json()', async () => {
    const jsonSpy = vi.fn(async () => {
      throw new Error('json() must not be called');
    });
    const fetchFn = vi.fn<FetchFn>(
      async () =>
        ({
          ok: true,
          status: 204,
          statusText: 'No Content',
          json: jsonSpy,
        }) as unknown as Response,
    );
    vi.stubGlobal('fetch', fetchFn);

    const result = await apiClient.del('/v1/todos/abc');

    expect(result).toBeUndefined();
    expect(jsonSpy).not.toHaveBeenCalled();
  });
});
