import { ApiError } from './errors.js';

// Default to a relative base when VITE_API_URL is unset — this avoids the
// "undefined/v1/todos" pitfall in test/CI environments where no .env is loaded
// (template-literal coercion would otherwise inject the literal string
// "undefined" into the request URL).
const API_BASE = import.meta.env.VITE_API_URL ?? '';

async function request<T>(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<T> {
  const hasBody = body !== undefined;
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: hasBody ? { 'Content-Type': 'application/json' } : undefined,
    body: hasBody ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    // Error envelope from the Fastify global handler (Story 1.4):
    //   { statusCode, error, message }
    let message = response.statusText || `Request failed with status ${response.status}`;
    try {
      const envelope = (await response.json()) as { message?: unknown };
      if (typeof envelope.message === 'string') {
        message = envelope.message;
      }
    } catch {
      // Non-JSON error body — keep statusText fallback.
    }
    throw new ApiError(response.status, message);
  }

  // 204 No Content: never try to parse. Used by DELETE in Story 3.2.
  if (response.status === 204) {
    return undefined as T;
  }

  try {
    return (await response.json()) as T;
  } catch {
    throw new ApiError(response.status, 'Response was not valid JSON');
  }
}

export const apiClient = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body: unknown) => request<T>('POST', path, body),
  patch: <T>(path: string, body: unknown) => request<T>('PATCH', path, body),
  del: <T = void>(path: string) => request<T>('DELETE', path),
};
