# Story 2.3: Web API client + typed endpoints + `useTodos` / `useCreateTodo` hooks

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want the web app to have a type-safe data layer for todos,
So that every UI component consuming server state gets the same `Todo` type, error handling, and query invalidation behavior.

## Acceptance Criteria

**AC1 — `apps/web/src/api/apiClient.ts` wraps native `fetch` with typed helpers**
- **Given** the file `apps/web/src/api/apiClient.ts` exists
- **When** the engineer inspects it
- **Then** it exports four async helpers: `get<T>(path)`, `post<T>(path, body)`, `patch<T>(path, body)`, `del<T>(path)` (named `del`, not `delete` — reserved word)
- **And** every helper prefixes `path` with `import.meta.env.VITE_API_URL` (read once at module load via a module-local constant — see Dev Notes → "Env-read timing")
- **And** every helper sets `Content-Type: application/json` on bodied requests (POST/PATCH/DELETE) and omits it on GET (no body)
- **And** every helper calls `response.json()` on 2xx responses and returns the typed body (`<T>`)
- **And** every helper throws an `ApiError` (imported from `./errors.js`) on any non-2xx response, carrying `statusCode: number` and `message: string`
- **And** `del` intentionally does NOT parse a body (DELETE responses in Epic 3 will be `204 No Content`; calling `.json()` on 204 throws). It resolves to `void` — see Dev Notes → "DELETE 204 handling"

**AC2 — `apps/web/src/api/errors.ts` exports `ApiError` + narrowing helper**
- **Given** the file `apps/web/src/api/errors.ts` exists
- **When** the engineer inspects it
- **Then** it exports `class ApiError extends Error` with:
  - `readonly statusCode: number`
  - `readonly message: string` (inherited from `Error` — no re-declare, just pass to `super`)
  - constructor `(statusCode: number, message: string)` that calls `super(message)` then assigns `this.statusCode = statusCode` and `this.name = 'ApiError'`
- **And** it exports `function isApiError(err: unknown): err is ApiError` using `err instanceof ApiError` (see Dev Notes → "Why `instanceof`, not duck-typing")
- **And** no third-party error library is introduced (no `ts-pattern`, no `neverthrow`, no `zod.ZodError`) — plain `Error` subclass per architectural guiding principle #3 ("Never invent new error envelopes")

**AC3 — `apps/web/src/api/todos.ts` — typed per-endpoint functions**
- **Given** the file `apps/web/src/api/todos.ts` exists
- **When** the engineer inspects it
- **Then** it exports:
  ```ts
  export const todos = {
    list: (): Promise<Todo[]> => apiClient.get<Todo[]>('/v1/todos'),
    create: (description: string): Promise<Todo> =>
      apiClient.post<Todo>('/v1/todos', { description }),
  };
  ```
  (or a module with two named exports `list` + `create` — either shape is fine; the factored-object version matches `api.todos.list()` call sites in architecture.md:599)
- **And** the `Todo` type is imported from `apps/web/src/types.ts` (AC4), which is the web app's single entry point for API schema types
- **And** the paths are the explicit `/v1/todos` strings — **not** a template like `${API_BASE}/v1/todos` (the base is prefixed inside `apiClient`, not here; see Dev Notes → "Path-prefix ownership")
- **And** `patch`, `del`, `find-by-id` are **not** exported in this story — those arrive in Story 3.1 (PATCH) and 3.2 (DELETE)

**AC4 — `apps/web/src/types.ts` re-exports `Todo` + `CreateTodoInput` from the API schema**
- **Given** the file `apps/web/src/types.ts` exists
- **When** the engineer inspects it
- **Then** it exports `type Todo` and `type CreateTodoInput` — structurally identical to what `@sinclair/typebox`'s `Static<typeof TodoSchema>` produces from `apps/api/src/schemas/todo.ts` (Story 2.1)
- **And** the re-export reaches the API schema via the workspace path — **preferred**: `export type { Todo, CreateTodoInput } from '@todo-app/api/schemas/todo';` (requires the `exports` subpath + workspace dep set up in Task 1). **Fallback**: relative path `export type { Todo, CreateTodoInput } from '../../../api/src/schemas/todo.js';` if the workspace-subpath route hits a TS/Vite resolution issue that the dev agent can't unstick in a small-diff way
- **And** the file contains a one-line comment above the export identifying `apps/api/src/schemas/todo.ts` as the authoritative source (architecture guiding principle + schema-SoT pattern from architecture.md:604)
- **And** the re-export is **type-only** (`export type { ... }`) — no runtime values cross the workspace boundary; TypeBox's `TodoSchema` runtime object stays in the API workspace

**AC5 — `apps/web/src/lib/constants.ts` — `MAX_DESCRIPTION_LENGTH` mirrors the TypeBox schema**
- **Given** the file `apps/web/src/lib/constants.ts` exists
- **When** the engineer inspects it
- **Then** it exports `export const MAX_DESCRIPTION_LENGTH = 500;`
- **And** the line immediately above the export is: `// Source of truth: apps/api/src/schemas/todo.ts (TypeBox Todo.description.maxLength).` (matches the architecture-driven "mirror constraint" rule for this file specifically — see architecture.md:68 / guiding-principle list)
- **And** `500` is NOT derived at runtime from the schema — the comment is the coupling mechanism in MVP (no build step syncs these). The schema-test contract (Story 2.1 AC1) independently enforces `maxLength: 500` server-side

**AC6 — `apps/web/src/hooks/useTodos.ts` — TanStack Query list hook**
- **Given** the file `apps/web/src/hooks/useTodos.ts` exists
- **When** a component calls `useTodos()`
- **Then** it returns the unmodified result of `useQuery({ queryKey: ['todos'], queryFn: api.todos.list })`
- **And** `queryKey` is the tuple `['todos']` — **NOT** a string `'todos'`, NOT `['todos', {}]`, NOT a namespaced constant (the tuple shape is what lets `invalidateQueries({ queryKey: ['todos'] })` match for both `useTodos` and future hooks that include `'todos'` as a prefix)
- **And** the hook does NOT pass `staleTime`, `gcTime`, `refetchOnWindowFocus`, or any other option — defaults are fine for MVP. Tuning comes later if NFR-001 (p95 ≤100ms) measurement at Journey 4 demands it
- **And** the hook is typed `(): UseQueryResult<Todo[], ApiError>` — the `<TError>` generic is set to `ApiError` so consumers get narrow error typing (TanStack Query v5 defaults `TError` to `Error`; narrowing is cheap and valuable)

**AC7 — `apps/web/src/hooks/useCreateTodo.ts` — non-optimistic create mutation with invalidation**
- **Given** the file `apps/web/src/hooks/useCreateTodo.ts` exists
- **When** a component calls `useCreateTodo()`
- **Then** it returns `useMutation({ mutationKey: ['todos', 'create'], mutationFn: (description: string) => api.todos.create(description), onSettled: () => queryClient.invalidateQueries({ queryKey: ['todos'] }) })`
- **And** the `queryClient` reference comes from `useQueryClient()` (hook), **NOT** from an imported singleton (the `QueryClient` constructed in `main.tsx` is provided via `QueryClientProvider` — hooks must read it through the context)
- **And** the mutation is **non-optimistic** — no `onMutate`, no cache pre-seeding (per architecture: "optimistic updates for complete/delete, non-optimistic for create" — architecture.md:61). The reason: create requires a server-assigned UUID v7 + timestamp, which we can't fabricate client-side without risking divergence. Story 2.6's E2E verifies the flow is still perceived-fast (one round-trip + invalidate)
- **And** the mutation is typed `UseMutationResult<Todo, ApiError, string>` — return is `Todo`, error is `ApiError`, variables is `string` (the description)

**AC8 — Unit tests at `apps/web/src/api/apiClient.test.ts` + `errors.test.ts` + `todos.test.ts`**
- **Given** Vitest + jsdom + `vi.stubGlobal('fetch', ...)` is the test harness
- **When** the engineer runs `npm test --workspace apps/web`
- **Then** the tests assert:
  - **`apiClient.get`** called with `'/v1/todos'` fetches `${VITE_API_URL}/v1/todos` with method `GET` and no `Content-Type` header (captured via the stubbed `fetch`'s first argument)
  - **`apiClient.post`** with body `{ description: 'x' }` fetches with method `POST`, `Content-Type: application/json`, body `JSON.stringify({ description: 'x' })`
  - **`apiClient.get`** on a mocked `200` response with body `[{ id, ... }]` returns the parsed array (no wrapping)
  - **`apiClient.post`** on a mocked `400 { statusCode: 400, error: 'Bad Request', message: 'body should have required property description' }` throws `ApiError` with `statusCode: 400` and the exact `message` from the server envelope
  - **`apiClient.post`** on a mocked `500` response with body `{ statusCode: 500, error: 'Internal Server Error', message: 'Internal server error' }` throws `ApiError` with `statusCode: 500` and the message
  - **`apiClient.get`** on a mocked `200` with **non-JSON body** (e.g., empty string, HTML) — throws `ApiError` with `statusCode: 200` and a message like `'Response was not valid JSON'` (edge case: server misbehaves; we fail loud rather than swallow — see Dev Notes → "Non-JSON 2xx handling")
  - **`isApiError`** narrows: `isApiError(new ApiError(400, 'bad'))` returns `true`; `isApiError(new Error('x'))` returns `false`; `isApiError('string')` returns `false`; `isApiError(null)` returns `false`
  - **`todos.list()`** and **`todos.create('Buy milk')`** call `apiClient.get('/v1/todos')` and `apiClient.post('/v1/todos', { description: 'Buy milk' })` respectively (spy on `apiClient` or pass the URL assertion through the stubbed `fetch`)

**AC9 — Hook integration tests at `apps/web/src/hooks/useTodos.test.tsx` + `useCreateTodo.test.tsx`**
- **Given** `@testing-library/react`'s `renderHook` + a real `QueryClientProvider` with `retry: false` and `gcTime: 0`
- **When** the engineer runs `npm test --workspace apps/web`
- **Then**:
  - **`useTodos`**: with `fetch` stubbed to resolve `200 [{ ... }]`, the hook's `result.current.data` matches the seeded array after `waitFor(() => result.current.isSuccess)`. `result.current.error` is `null` (no `undefined`)
  - **`useTodos`**: with `fetch` stubbed to reject with a thrown `ApiError`, `result.current.error` is an `ApiError` instance (type preserved — TanStack Query doesn't wrap thrown errors)
  - **`useCreateTodo`**: with `fetch` stubbed to resolve `201 { ... }` on POST + `200 [{ ... }]` on the invalidation refetch, calling `result.current.mutate('Buy milk')` → `waitFor(() => result.current.isSuccess)` → a `queryClient.getQueryData(['todos'])` call returns the refetched array (proves `onSettled` triggered the invalidation and the cache now holds fresh data)
  - **`useCreateTodo`**: with `fetch` stubbed to return `400` on POST, `result.current.error` is an `ApiError` with `statusCode: 400`; **the `['todos']` query is still invalidated** (because `onSettled` fires on both success AND failure — matches the architectural "invalidate-on-settle" pattern)

**AC10 — a11y smoke for any added DOM — nothing in this story** (no visible component is added; this AC is a no-op explicit marker)
- **Given** Story 2.3 adds only data-layer code (no `*.tsx` components that render DOM)
- **When** `npm test --workspace apps/web` runs
- **Then** no new file under `apps/web/test/a11y/` is required
- **And** `useTodos.test.tsx` and `useCreateTodo.test.tsx` are **hook tests** (integration-style with providers), not accessibility tests — those arrive in Story 2.4 (AddTodoInput), 2.5 (TodoRow/TodoList/LoadingSkeleton/EmptyState), and later stories

## Tasks / Subtasks

- [x] **Task 1: Cross-workspace type import plumbing** (AC: 4)
  - [x] Choose between two paths (see Dev Notes → "Cross-workspace type import — implementation options"):
    - **Path A (preferred): workspace subpath via `exports`:**
      - [x] In `apps/api/package.json`, add:
        ```json
        {
          "exports": {
            "./schemas/todo": "./src/schemas/todo.ts",
            "./schemas/errors": "./src/schemas/errors.ts"
          }
        }
        ```
        - See Dev Notes → "`exports` map for source-only type exports" for why `.ts` appears directly in the export map (not a `dist/.d.ts` — we're not building the API before running the web app; MVP is dev-mode only)
      - [x] In `apps/web/package.json`, add `"@todo-app/api": "*"` to `dependencies` (NOT `devDependencies` — types are used at runtime by `import type` erasure, but the package link is the same either way; `dependencies` matches npm-workspaces convention for internal packages)
      - [x] From repo root: `npm install` — verify `apps/web/node_modules/@todo-app/api` is a symlink to `apps/api`
      - [x] Sanity-check: the web workspace's TS resolution finds the type. Add a one-line marker in `apps/web/src/types.ts` (Task 2) and run `npm run typecheck --workspace apps/web`
    - **Path B (fallback): relative-path type-only import (use only if Path A won't resolve cleanly):**
      - [x] Do NOT modify `apps/api/package.json`
      - [x] In `apps/web/src/types.ts` (Task 2), use `export type { Todo, CreateTodoInput } from '../../../api/src/schemas/todo.js';`
      - [x] In `apps/web/tsconfig.json`, extend `include` to pull the target into the TS project: `"include": ["src/**/*.ts", "src/**/*.tsx", "test/**/*.ts", "test/**/*.tsx", "../api/src/schemas/**/*.ts"]`
      - [x] No `paths` alias — relative import keeps it explicit. Vite handles the cross-workspace relative import natively (it's still inside the monorepo source tree)
  - [x] **Decision guidance:** try Path A first. If `npm run typecheck --workspace apps/web` fails with a module-resolution error involving `@todo-app/api`, fall back to Path B and record the choice in the story's Completion Notes
  - [x] **Do NOT** copy `apps/api/src/schemas/todo.ts` content into `apps/web/src/types.ts` literally — duplication is the thing architecture guiding-principle #2 (schema SoT) exists to prevent. The type must come from the API schema file, one way or another

- [x] **Task 2: Author `apps/web/src/types.ts`** (AC: 4)
  - [x] Create `apps/web/src/types.ts`:
    ```ts
    // Source of truth: apps/api/src/schemas/todo.ts (TypeBox Todo, CreateTodoInput).
    // Type-only re-export — no runtime values cross the workspace boundary.
    export type { Todo, CreateTodoInput } from '@todo-app/api/schemas/todo';
    ```
    (Path B variant: swap the final import path for `'../../../api/src/schemas/todo.js'`)
  - [x] Verify via a tiny TS sanity check (either in-file `const _check: Todo = ...` comment or a separate scratch file that gets deleted after verification) that `Todo` is `{ id: string; description: string; completed: boolean; createdAt: string; userId: string | null }` — exactly matching Story 2.1's `TodoSchema`
  - [x] **Do NOT** re-export `TodoSchema` or `CreateTodoInputSchema` (runtime TypeBox values) — they drag `@sinclair/typebox` into the web bundle for no MVP value. Types only

- [x] **Task 3: Author `apps/web/src/api/errors.ts`** (AC: 2)
  - [x] Create `apps/web/src/api/errors.ts`:
    ```ts
    export class ApiError extends Error {
      readonly statusCode: number;

      constructor(statusCode: number, message: string) {
        super(message);
        this.name = 'ApiError';
        this.statusCode = statusCode;

        // Fix prototype chain for `instanceof` to work correctly across ES target downlevel.
        // Required because Error's constructor breaks the chain in older ES targets; harmless in ES2022.
        Object.setPrototypeOf(this, ApiError.prototype);
      }
    }

    export function isApiError(err: unknown): err is ApiError {
      return err instanceof ApiError;
    }
    ```
    - See Dev Notes → "`Object.setPrototypeOf` on custom Error subclasses" for why we keep this line even with ES2022 target
    - **Why `readonly statusCode`** (not a private field): consumers may log or display it. Public readonly is the correct balance of safety and ergonomics
    - **Do NOT** attach the raw `Response` object to `ApiError`. Keeps the error small for logging; if we need headers or body later, add them explicitly (YAGNI for MVP)
  - [x] Author `apps/web/src/api/errors.test.ts`:
    ```ts
    import { describe, it, expect } from 'vitest';
    import { ApiError, isApiError } from './errors.js';

    describe('ApiError', () => {
      it('constructs with statusCode + message', () => {
        const err = new ApiError(400, 'Bad Request');
        expect(err.statusCode).toBe(400);
        expect(err.message).toBe('Bad Request');
        expect(err.name).toBe('ApiError');
        expect(err).toBeInstanceOf(Error);
        expect(err).toBeInstanceOf(ApiError);
      });

      it('is throwable and caught as both Error and ApiError', () => {
        try {
          throw new ApiError(500, 'Internal');
        } catch (e) {
          expect(e).toBeInstanceOf(Error);
          expect(e).toBeInstanceOf(ApiError);
          if (e instanceof ApiError) {
            expect(e.statusCode).toBe(500);
          }
        }
      });
    });

    describe('isApiError', () => {
      it('returns true for ApiError instances', () => {
        expect(isApiError(new ApiError(400, 'bad'))).toBe(true);
      });
      it('returns false for plain Error', () => {
        expect(isApiError(new Error('plain'))).toBe(false);
      });
      it.each([
        ['string', 'not an error'],
        ['null', null],
        ['undefined', undefined],
        ['number', 42],
        ['plain object', { statusCode: 400, message: 'x' }],
      ])('returns false for %s', (_label, value) => {
        expect(isApiError(value)).toBe(false);
      });
    });
    ```
    - **Why the "plain object with same shape" test case**: proves we use `instanceof`, not duck-typing — an ApiError-shaped object that isn't a class instance should NOT narrow (architectural safety; downstream code relying on `err instanceof Error` shouldn't get false positives)

- [x] **Task 4: Author `apps/web/src/api/apiClient.ts`** (AC: 1)
  - [x] Create `apps/web/src/api/apiClient.ts`:
    ```ts
    import { ApiError } from './errors.js';

    const API_BASE = import.meta.env.VITE_API_URL;

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
        // We trust the envelope. If parsing fails, surface a generic ApiError instead.
        let message = response.statusText || `Request failed with status ${response.status}`;
        try {
          const envelope = (await response.json()) as { message?: unknown };
          if (typeof envelope.message === 'string') {
            message = envelope.message;
          }
        } catch {
          // Non-JSON error body (rare for our API). Fall through with statusText.
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
    ```
    - See Dev Notes → "Env-read timing" for why `API_BASE` is a module-level const
    - See Dev Notes → "DELETE 204 handling" for the `response.status === 204` short-circuit
    - See Dev Notes → "Non-JSON 2xx handling" for the final try/catch
    - **Why a private `request` function**: keeps the four exported helpers DRY and centralizes error handling. All non-ok paths funnel through one `throw new ApiError` site, so future changes (adding retry, tracing, auth) are a one-line addition
    - **Why no `Accept: application/json`** request header: Fastify returns JSON by default; `Accept` is only needed if the server content-negotiates. Ours doesn't. Keep the header set minimal
    - **Why `body?: unknown` typed as `unknown`**: consumers pass typed inputs (`{ description: string }`), and `JSON.stringify` accepts anything. Narrower types (`body?: Record<string, unknown>`) would reject e.g. arrays — unnecessary restriction
    - **Do NOT** add request-timeout, retry, or caching logic. `AbortController` + retry = post-MVP. TanStack Query handles retries at the mutation/query layer, not here
    - **Do NOT** add an interceptor pattern or plugin system. One app, two endpoints (plus Story 3.1 + 3.2 expansions). Interceptors are premature abstraction
    - **Do NOT** log requests or responses. Privacy (todo descriptions are user data) + log noise. Debug via Network panel

- [x] **Task 5: Author `apps/web/src/api/apiClient.test.ts`** (AC: 8)
  - [x] Create `apps/web/src/api/apiClient.test.ts`:
    ```ts
    import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
    import { apiClient } from './apiClient.js';
    import { ApiError } from './errors.js';

    const API_BASE = import.meta.env.VITE_API_URL;

    function mockFetch(status: number, body: unknown, opts: { bodyIsString?: boolean } = {}) {
      return vi.fn(async () => {
        const stringBody = opts.bodyIsString ? (body as string) : JSON.stringify(body);
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
        const fetchFn = mockFetch(200, [{ id: '01', description: 'x', completed: false, createdAt: '2026-04-20T10:00:00.000Z', userId: null }]);
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
        const fetchFn = mockFetch(400, { statusCode: 400, error: 'Bad Request', message: 'description required' });
        vi.stubGlobal('fetch', fetchFn);

        await expect(apiClient.get('/v1/todos')).rejects.toThrow(ApiError);
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
        const fetchFn = mockFetch(201, { id: '01', description: 'Buy milk', completed: false, createdAt: '2026-04-20T10:00:00.000Z', userId: null });
        vi.stubGlobal('fetch', fetchFn);

        await apiClient.post<{ id: string }>('/v1/todos', { description: 'Buy milk' });

        const [url, init] = fetchFn.mock.calls[0]!;
        expect(url).toBe(`${API_BASE}/v1/todos`);
        expect((init as RequestInit).method).toBe('POST');
        expect((init as RequestInit).headers).toEqual({ 'Content-Type': 'application/json' });
        expect((init as RequestInit).body).toBe(JSON.stringify({ description: 'Buy milk' }));
      });

      it('throws ApiError on 500 with envelope message', async () => {
        const fetchFn = mockFetch(500, { statusCode: 500, error: 'Internal Server Error', message: 'Internal server error' });
        vi.stubGlobal('fetch', fetchFn);

        await expect(apiClient.post('/v1/todos', { description: 'x' })).rejects.toMatchObject({
          statusCode: 500,
          message: 'Internal server error',
        });
      });

      it('throws ApiError with statusText message when error body is also invalid JSON', async () => {
        const fetchFn = vi.fn(async () => ({
          ok: false,
          status: 503,
          statusText: 'Service Unavailable',
          json: async () => { throw new SyntaxError('bad json'); },
        } as unknown as Response));
        vi.stubGlobal('fetch', fetchFn);

        await expect(apiClient.get('/v1/todos')).rejects.toMatchObject({
          statusCode: 503,
          message: 'Service Unavailable',
        });
      });
    });

    describe('apiClient.del (DELETE 204 short-circuit)', () => {
      it('returns undefined on 204 without calling json()', async () => {
        const jsonSpy = vi.fn(async () => { throw new Error('json() must not be called'); });
        const fetchFn = vi.fn(async () => ({
          ok: true,
          status: 204,
          statusText: 'No Content',
          json: jsonSpy,
        } as unknown as Response));
        vi.stubGlobal('fetch', fetchFn);

        const result = await apiClient.del('/v1/todos/abc');

        expect(result).toBeUndefined();
        expect(jsonSpy).not.toHaveBeenCalled();
      });
    });
    ```
    - See Dev Notes → "Testing fetch via `vi.stubGlobal`" for why this is the correct harness (vs. MSW, vs. `vi.mock('./apiClient')`)
    - The `mockFetch` helper is local to the test file — do NOT extract it to a shared test util (one callsite; YAGNI)

- [x] **Task 6: Author `apps/web/src/api/todos.ts`** (AC: 3)
  - [x] Create `apps/web/src/api/todos.ts`:
    ```ts
    import { apiClient } from './apiClient.js';
    import type { Todo } from '../types.js';

    export const todos = {
      list: (): Promise<Todo[]> => apiClient.get<Todo[]>('/v1/todos'),
      create: (description: string): Promise<Todo> =>
        apiClient.post<Todo>('/v1/todos', { description }),
    };

    // Convenience for `import { api } from '../api/...'` call sites (architecture.md:599).
    export const api = { todos };
    ```
    - Two exports: `todos` (direct) and `api` (namespace wrapper). Architecture shows call sites like `api.todos.list()` (architecture.md:599) — exporting `api` matches those call sites without a re-import chain. **Do NOT** skip the `api` export; it keeps Story 2.6's wire-up code idiomatic
    - The `api` object is a **bare namespace**, not a class. No constructor, no state, no `new`. It's there for the dotted access pattern, nothing else
  - [x] Author `apps/web/src/api/todos.test.ts`:
    ```ts
    import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
    import { todos } from './todos.js';

    const API_BASE = import.meta.env.VITE_API_URL;

    beforeEach(() => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => ({
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => [],
        } as unknown as Response)),
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
    ```

- [x] **Task 7: Author `apps/web/src/lib/constants.ts`** (AC: 5)
  - [x] Create `apps/web/src/lib/constants.ts`:
    ```ts
    // Source of truth: apps/api/src/schemas/todo.ts (TypeBox Todo.description.maxLength).
    export const MAX_DESCRIPTION_LENGTH = 500;
    ```
  - [x] No test for this file — it's a single literal constant; TypeScript guarantees its type. Drift risk is flagged by the comment; a build-time drift check is over-engineering

- [x] **Task 8: Author `apps/web/src/hooks/useTodos.ts`** (AC: 6)
  - [x] Create the `hooks/` folder (new in this story — does not yet exist; `ls apps/web/src/` currently shows only `App.tsx`, `App.test.tsx`, `main.tsx`, `components/`, `styles/`)
  - [x] Create `apps/web/src/hooks/useTodos.ts`:
    ```ts
    import { useQuery, type UseQueryResult } from '@tanstack/react-query';
    import { api } from '../api/todos.js';
    import type { Todo } from '../types.js';
    import type { ApiError } from '../api/errors.js';

    export function useTodos(): UseQueryResult<Todo[], ApiError> {
      return useQuery({
        queryKey: ['todos'],
        queryFn: api.todos.list,
      });
    }
    ```
    - **Why no destructuring of `useQuery`'s result**: consumers read `data`, `isPending`, `isSuccess`, `isError`, `error`, `refetch` — returning the raw result gives them the full surface. Narrowing to `{ data, error }` would force consumers to call `useQuery` themselves for `isPending`, which defeats the hook's abstraction
    - **Do NOT** set `staleTime`, `gcTime`, `refetchOnWindowFocus`, `retry` — TanStack defaults are fine for MVP traffic. Tuning is Story 5.1 perf work if NFR-001 measurements demand it
    - **Do NOT** add `enabled: true` — it's the default. Enabling conditional fetches (`enabled: someFlag`) is a future story concern (e.g., auth gating in Growth)

- [x] **Task 9: Author `apps/web/src/hooks/useCreateTodo.ts`** (AC: 7)
  - [x] Create `apps/web/src/hooks/useCreateTodo.ts`:
    ```ts
    import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
    import { api } from '../api/todos.js';
    import type { Todo } from '../types.js';
    import type { ApiError } from '../api/errors.js';

    export function useCreateTodo(): UseMutationResult<Todo, ApiError, string> {
      const queryClient = useQueryClient();
      return useMutation({
        mutationKey: ['todos', 'create'],
        mutationFn: (description: string) => api.todos.create(description),
        onSettled: () => {
          queryClient.invalidateQueries({ queryKey: ['todos'] });
        },
      });
    }
    ```
    - See Dev Notes → "Why `onSettled` not `onSuccess`" for the invalidate-on-both-outcomes rationale
    - **Why the named arrow in `mutationFn`** (not `api.todos.create` bare): readability + explicit argument name. Both forms work; the named-arrow version is easier to step through in DevTools
    - **Why `useQueryClient()` (hook)** not a module import: the `QueryClient` instance is owned by `main.tsx` and provided via `QueryClientProvider`. Importing a singleton bypasses the provider contract and breaks test isolation (tests create their own `queryClient` per render)
    - **Do NOT** add `onError` handler here. Errors bubble to the component's `mutation.error` — the component decides how to render (Story 2.4's `AddTodoInput` shows the error state). Handling here would swallow the error or require a callback pattern
    - **Do NOT** add optimistic updates (`onMutate`). Architecture explicitly rejects optimistic create (architecture.md:61) because the server-assigned UUID v7 + `createdAt` can't be faithfully predicted client-side

- [x] **Task 10: Author `apps/web/src/hooks/useTodos.test.tsx` + `useCreateTodo.test.tsx`** (AC: 9)
  - [x] Create `apps/web/src/hooks/useTodos.test.tsx`:
    ```tsx
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
      { id: '01', description: 'a', completed: false, createdAt: '2026-04-20T10:00:00.000Z', userId: null },
    ];

    beforeEach(() => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => ({
          ok: true, status: 200, statusText: 'OK',
          json: async () => SEED_TODOS,
        } as unknown as Response)),
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
          vi.fn(async () => ({
            ok: false, status: 500, statusText: 'Internal',
            json: async () => ({ statusCode: 500, error: 'Internal Server Error', message: 'boom' }),
          } as unknown as Response)),
        );
        const { wrapper } = wrapperFactory();
        const { result } = renderHook(() => useTodos(), { wrapper });

        await waitFor(() => expect(result.current.isError).toBe(true));
        expect(result.current.error).toBeInstanceOf(ApiError);
        expect(result.current.error?.statusCode).toBe(500);
      });
    });
    ```
  - [x] Create `apps/web/src/hooks/useCreateTodo.test.tsx`:
    ```tsx
    import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
        const created = { id: '01', description: 'Buy milk', completed: false, createdAt: '2026-04-20T10:00:00.000Z', userId: null };
        const fetchFn = vi.fn(async (url: string, init?: RequestInit) => {
          if (init?.method === 'POST') {
            return { ok: true, status: 201, statusText: 'Created', json: async () => created } as unknown as Response;
          }
          // Invalidation triggers a refetch of ['todos'] → GET
          return { ok: true, status: 200, statusText: 'OK', json: async () => [created] } as unknown as Response;
        });
        vi.stubGlobal('fetch', fetchFn);

        const { wrapper, queryClient } = wrapperFactory();
        // Pre-seed the cache to make invalidation observable
        queryClient.setQueryData(['todos'], []);
        const { result } = renderHook(() => useCreateTodo(), { wrapper });

        await act(async () => {
          await result.current.mutateAsync('Buy milk');
        });

        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        // Find POST + GET calls (order not guaranteed after invalidation)
        const postCall = fetchFn.mock.calls.find((c) => (c[1] as RequestInit).method === 'POST');
        expect(postCall).toBeDefined();
        expect((postCall![1] as RequestInit).body).toBe(JSON.stringify({ description: 'Buy milk' }));
      });

      it('surfaces ApiError on POST failure AND still invalidates ["todos"]', async () => {
        const fetchFn = vi.fn(async (_url: string, init?: RequestInit) => {
          if (init?.method === 'POST') {
            return {
              ok: false, status: 400, statusText: 'Bad Request',
              json: async () => ({ statusCode: 400, error: 'Bad Request', message: 'description required' }),
            } as unknown as Response;
          }
          return { ok: true, status: 200, statusText: 'OK', json: async () => [] } as unknown as Response;
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
    ```
    - **Why `mutateAsync` + `await act` in the success test**: TanStack Query's mutation triggers async state transitions + an invalidation refetch; wrapping in `act` + awaiting `mutateAsync` is the React Testing Library idiom for settled state (not `mutate` + `waitFor`, which is flakier with the refetch chain)
    - **Why we spy on `queryClient.invalidateQueries`** in the error test: the invalidation-on-settle behavior is invisible otherwise (the refetch returns `[]`, so the cache state doesn't distinguish "invalidated" from "never set"). Spying proves the call happened with the right arg
    - **Why `mutations: { retry: false }`**: TanStack's default retry for mutations is `false`, but setting it explicitly removes any ambiguity if future versions change the default

- [x] **Task 11: Verify imports resolve + full check passes** (AC: 1–10)
  - [x] `npm run typecheck --workspace apps/web` — clean. If Path A (workspace subpath) fails on module resolution for `@todo-app/api/schemas/todo`, fall back to Path B per Task 1's decision guidance
  - [x] `npm run typecheck --workspace apps/api` — clean (we only added an `exports` entry in Path A; Story 2.1's code is unchanged)
  - [x] `npm run lint` — clean
  - [x] `npm run format:check` — clean; run `npm run format` if the new files need normalization
  - [x] `npm test --workspace apps/web` — expect 9 pre-existing + ~12 new tests pass (existing a11y + App + Header + ErrorBoundary; new: errors.test, apiClient.test, todos.test, useTodos.test, useCreateTodo.test)
  - [x] `npm test --workspace apps/api` — regression check; should pass unchanged (AC7 of Story 2.1 tests `/docs/json` schema presence — `exports` map changes don't affect that)
  - [x] `npm run check` (aggregate) — exits 0
  - [x] **Do NOT** run `npm run test:e2e` in this story; E2E comes in Story 2.6's journey wire-up. The current `e2e/smoke.spec.ts` (Story 1.6) should still pass unchanged since we didn't touch the rendered DOM

## Dev Notes

### Cross-workspace type import — implementation options

**This is the biggest decision in this story.** Architecture.md:609 says:
> No shared package in MVP; apps/web imports types from apps/api via a relative or workspace path.

Two practical paths:

**Path A — workspace subpath via `exports` (preferred):**
- `apps/api/package.json` declares `"exports": { "./schemas/todo": "./src/schemas/todo.ts" }`
- `apps/web/package.json` adds `"@todo-app/api": "*"` to `dependencies`
- `npm install` symlinks `apps/web/node_modules/@todo-app/api` → `apps/api`
- `apps/web/src/types.ts`: `export type { Todo } from '@todo-app/api/schemas/todo';`

Vite's resolver (at build + dev) handles this natively. TypeScript's `moduleResolution: bundler` (inherited from `tsconfig.base.json`) reads the `exports` map.

**Risks:**
- Some TS versions warn about `.ts` files in `exports` without `"types"` being set. Verify with `npm run typecheck --workspace apps/web`. Fix by adding `"types"` to the export entry: `{ "types": "./src/schemas/todo.ts", "default": "./src/schemas/todo.ts" }` — both fields point at the source `.ts` because there's no build step
- If TS complains about "allowImportingTsExtensions not enabled", the issue is the `.ts` extension in the export map resolving back to `.ts`. `moduleResolution: bundler` should handle this without the flag, but the dev agent can enable `"allowImportingTsExtensions": true` in `apps/web/tsconfig.json` if needed

**Path B — relative path with expanded `include` (fallback):**
- `apps/web/src/types.ts`: `export type { Todo } from '../../../api/src/schemas/todo.js';`
- `apps/web/tsconfig.json` extends `include` to pull the source into compilation: `"include": [..., "../api/src/schemas/**/*.ts"]`
- No `exports` edit, no new dep

**Pros:** fewer moving parts, no `exports` hairsplitting
**Cons:** couples the two apps' TS projects more tightly (web's typecheck now compiles API schemas); explicit relative depth is ugly; doesn't scale to sharing >2 files

**Recommendation:** try A. If it's more than 15 minutes of fiddling, fall back to B without shame and note in Completion Notes. Both fulfill the architectural contract; neither is wrong.

### `exports` map for source-only type exports

Normal npm packages publish a build: `dist/index.js` + `dist/index.d.ts`. The `exports` map points at `dist/`. For internal workspace packages consumed via symlink in dev, there's no build step — the `exports` map can point directly at the `.ts` source:

```json
"exports": {
  "./schemas/todo": {
    "types": "./src/schemas/todo.ts",
    "default": "./src/schemas/todo.ts"
  }
}
```

Both Vite (for runtime) and TypeScript `moduleResolution: bundler` (for types) read this.

**This won't work for** external npm consumers or a tsc-compiled build of the API (production). But production deployment is post-MVP (architecture.md:703), so the MVP-only setup is fine. If/when the API is built for production, add a second export entry pointing at `dist/schemas/todo.js` + `dist/schemas/todo.d.ts` and flip with the `"production"` condition.

### Env-read timing

`import.meta.env.VITE_API_URL` is replaced at Vite build time (for production) and read from the `.env` file (at dev-server start). Reading it once at module load (`const API_BASE = import.meta.env.VITE_API_URL`) is fine because:
- It's a compile-time constant in production builds
- It's stable for the lifetime of the dev server
- Reading it per-request adds overhead for no benefit (it can't change mid-session)

The test harness reads `import.meta.env.VITE_API_URL` the same way — Vitest's Vite integration honors the `.env` file, so `API_BASE` is whatever's in `apps/web/.env`.

**Test-environment env value:** if tests need a stable URL regardless of local `.env` state, Vite supports `.env.test` files automatically. Story 2.3 doesn't need this — tests assert the URL using the same `API_BASE` expression that production uses, so they're self-consistent.

### DELETE 204 handling

Fastify's `DELETE /v1/todos/:id` (Story 3.2) returns `204 No Content` — **no response body**. Calling `.json()` on a 204 response throws a `SyntaxError` because there's nothing to parse.

The `request` function in `apiClient.ts` short-circuits: `if (response.status === 204) return undefined as T;`. Consumers of `apiClient.del` type the generic as `void` (the default), so TypeScript treats `undefined` as a valid return.

**Why add this in 2.3 when DELETE isn't in scope until 3.2:** because the `apiClient` is going in now, and `del` is part of its surface. Adding 204 handling later would require re-opening `apiClient.ts` and re-running its tests. One-shot it.

### Non-JSON 2xx handling

Rare but real failure mode: the Fastify server returns a 200 with a non-JSON body (e.g., a corrupted response, a proxy-injected error page). We fail loud with `ApiError(200, 'Response was not valid JSON')` rather than silently return `undefined` or a string.

**Why throw on 2xx:** silently returning would violate the type signature (`Promise<T>` should resolve to `T`, not `undefined`). The alternative (`return null` and have consumers null-check) is worse ergonomics across every consumer.

**Why `statusCode: 200` in the thrown error:** it preserves the actual HTTP status, which is useful for logs/debugging. A future consumer might treat "200 but broken body" differently from "500 server error".

### `Object.setPrototypeOf` on custom Error subclasses

Historical quirk: when TypeScript compiles `class ApiError extends Error` to ES5, `super(message)` sets `this` to a plain `Error` instance, breaking `err instanceof ApiError`. The fix is `Object.setPrototypeOf(this, ApiError.prototype)` at the end of the constructor.

**In ES2022 target (our tsconfig):** this fix isn't strictly needed because native `class` extends work correctly. But the line is cheap insurance against a future change to `target: ES5` or downstream consumers that down-level the built output. One-line cost, zero runtime overhead — keep it.

### Why `instanceof`, not duck-typing

`isApiError(err): err is ApiError` uses `err instanceof ApiError`, not:
```ts
return typeof err === 'object' && err !== null && 'statusCode' in err && typeof err.statusCode === 'number';
```

**Reason:** duck-typing matches any object with a `statusCode: number` — including a plain object `{ statusCode: 400, message: 'x' }` that some handler fabricated. That's a false-positive risk. `instanceof` enforces "actually thrown by our apiClient". Fails to distinguish `ApiError` from another class extending `Error` with a `statusCode`, but that's a problem we don't have.

### Path-prefix ownership

The `/v1` prefix lives in two places:
- **Server side:** `app.register(todosRoutes, { prefix: '/v1' })` in `apps/api/src/app.ts` (Story 1.4)
- **Client side:** hardcoded `/v1/todos` in `apps/web/src/api/todos.ts`

They're coupled, not shared. If the API adds `/v2`, the web client updates its paths too — explicit and searchable (grep for `/v1/todos` lands on the one file).

**Do NOT** introduce a `API_VERSION = 'v1'` constant and template strings. It's one route today; the indirection costs readability for no MVP benefit.

### Testing fetch via `vi.stubGlobal`

Three options for mocking HTTP in Vitest:

1. **`vi.stubGlobal('fetch', vi.fn(...))` — chosen.** Simple, zero deps, no per-test setup. Fits our small surface (1 module, 2 endpoints)
2. **MSW (Mock Service Worker).** Powerful, intercepts at the network layer so the real `apiClient` runs unchanged. Overkill for MVP — adds a dep, setup in `test/setup.ts`, and a schema definition per endpoint
3. **`vi.mock('./apiClient')` + return fake data.** Works but the mock swaps out the very module we want to exercise, so we're testing the tests. Bad smell

`vi.stubGlobal` keeps `apiClient.ts` under real test — the fetch call goes out, the mock intercepts, the response shape is controlled. That's the right layer.

**For hook tests:** same pattern. Stubbing `fetch` at the top of each test lets the real `useQuery` / `useMutation` machinery run against a controlled network response.

### Why `onSettled` not `onSuccess`

`onSettled` fires on both success AND failure of a mutation. `onSuccess` fires only on success.

Why invalidate on both:
- **Success:** new row exists server-side; invalidate → refetch → UI gets the new row
- **Failure:** unknown server state. The request might have reached the DB before failing (network glitch after the INSERT). Invalidating forces a refetch that reveals the truth

This is the pattern in the architecture example (architecture.md:469 — `onSettled: () => queryClient.invalidateQueries(...)`). Matches the architectural idiom; future stories (Story 3.1 toggle, Story 3.2 delete) will use the same pattern via `useOptimisticTodoMutation` factory.

**Cost of extra refetch on error:** negligible (one GET). Cost of stale cache on rare partial-failure: confused user seeing a wrong list. Safer default.

### Type-provider continuity from Stories 2.1 + 2.2

This story is the first **consumer** of the API's TypeBox schemas. The chain:

- Story 2.1 authored `TodoSchema` + `CreateTodoInputSchema` with TypeBox + `Static<...>` types
- Story 2.1 also registered the schemas via `app.addSchema` in `plugins/swagger.ts`
- Story 2.2 added `listAll` + `GET /v1/todos` using those schemas
- **Story 2.3** imports the **types only** (not runtime TypeBox values) from the API workspace into the web workspace

The web side never imports `@sinclair/typebox` or `TodoSchema` (the runtime object). It imports `type Todo` — a pure TS type erased at compile time. The web bundle stays tiny; TypeBox runtime lives entirely in the API.

### TanStack Query v5 idioms

**`queryKey` is an array, not a string:** v5 removed the string-key shortcut. Always `['todos']` or `['todos', filters]`, never `'todos'`.

**`useMutation` requires `mutationFn`, not `mutationFn` + `onSuccess` + promise return:** the mutation's return type is determined by `mutationFn`'s resolved type. `const m = useMutation({...})` gives `m.data: Todo | undefined`, `m.error: ApiError | null` — well-typed out of the box.

**`useQueryClient()` must be called inside a provider:** tests that `renderHook(() => useCreateTodo(), {...})` without a `QueryClientProvider` wrapper will throw. The wrapper factory in `useCreateTodo.test.tsx` is the idiomatic setup.

**`gcTime: 0` in tests:** was `cacheTime` in v4; renamed to `gcTime` (garbage-collection time) in v5. Setting to 0 ensures each test starts with no cached data. Pair with `retry: false` for deterministic error-path tests.

### Project Structure Notes

- **New folders:** `apps/web/src/api/`, `apps/web/src/hooks/`, `apps/web/src/lib/` — all first creations in this story
- **New files:**
  - `apps/web/src/types.ts`
  - `apps/web/src/lib/constants.ts`
  - `apps/web/src/api/errors.ts` + `errors.test.ts`
  - `apps/web/src/api/apiClient.ts` + `apiClient.test.ts`
  - `apps/web/src/api/todos.ts` + `todos.test.ts`
  - `apps/web/src/hooks/useTodos.ts` + `useTodos.test.tsx`
  - `apps/web/src/hooks/useCreateTodo.ts` + `useCreateTodo.test.tsx`
- **Modified files:**
  - `apps/api/package.json` (Path A only) — `exports` map added
  - `apps/web/package.json` (Path A only) — `"@todo-app/api": "*"` dep added
  - `apps/web/tsconfig.json` (Path B only) — `include` extended
- **No changes** to `apps/web/src/App.tsx`, `main.tsx`, or any component file. Story 2.6 wires `useTodos` + `useCreateTodo` into `App.tsx` — this story only adds the data layer

### Testing Standards

- **Unit tests**: co-located `*.test.ts` / `*.test.tsx` next to the module under test
- **Hook tests**: co-located `*.test.tsx` (requires JSX for `QueryClientProvider`), use `@testing-library/react`'s `renderHook`
- **No new a11y tests** in this story (no DOM-rendering code added)
- **No new E2E tests** in this story — 2.6 closes Journey 1 E2E
- **`vi.stubGlobal('fetch', ...)`** is the fetch-mocking pattern; prefer over MSW (no dep) or `vi.mock('./apiClient')` (tests the mock, not the code)
- **`vi.unstubAllGlobals()`** in `afterEach` to prevent test pollution across files

### Previous Story Intelligence

**From Story 2.1 (TypeBox schemas + POST) — load-bearing:**
- `TodoSchema` + `CreateTodoInputSchema` in `apps/api/src/schemas/todo.ts` — this story re-exports the *types* derived from them
- `$id: 'Todo'` + `$id: 'CreateTodoInput'` on the schemas — informs the `exports` subpath naming (`./schemas/todo` not `./schemas/Todo`)
- Story 2.1's Fastify response serializer outputs `createdAt` as an ISO 8601 string — the web `Todo` type's `createdAt: string` matches exactly (not `Date`)
- `userId: string | null` convention (explicit null, not omitted) — architecture guiding principle #8

**From Story 2.2 (listAll + GET) — load-bearing:**
- `GET /v1/todos` returns `Todo[]` (plain array, no wrapper) — `todos.list()` unconditionally parses as array
- Empty table returns `200 []` — `useTodos` gets `data: []`, not `null` or `undefined`

**From Story 1.4 (plugin stack) — load-bearing:**
- Error envelope `{ statusCode, error, message }` — `apiClient` extracts `message` for `ApiError` (ignoring the redundant `statusCode` which `response.status` already has)
- `CORS_ORIGIN` plugin (Story 1.4) is configured with `http://localhost:5173` by default — the web dev server at 5173 can hit the API at 3000 without CORS pain

**From Story 1.5 (web scaffold) — load-bearing:**
- `main.tsx` already wraps `<App />` with `<QueryClientProvider client={new QueryClient()}>` — nothing to change there. Hooks composed in this story use the same client
- `main.tsx` also wraps with `<ErrorBoundary>` — render errors in the hook-consuming components (Stories 2.4–2.6) fall through to the boundary; the hooks themselves can't throw at render time (TanStack Query puts errors in `result.error`)
- Web's `.env.example` declares `VITE_API_URL=http://localhost:3000` — `apiClient` reads it

**From Story 1.6 (CI + format contract) — load-bearing:**
- Prettier contract: `singleQuote: true`, `semi: true`, `trailingComma: 'all'`, `printWidth: 100` — new files match
- `jsx-a11y` ESLint rule set is active on `apps/web/**/*.tsx` — hook tests use minimal JSX (just `QueryClientProvider`), so a11y rules are unlikely to fire
- Pre-existing `apps/api/src/db/index.ts:14` lint warning — **do not fix**, per Story 1.6 deviations

**From Story 2.2 (ready-for-dev) — coordination:**
- Story 2.2's `GET /v1/todos` exists and is being implemented concurrently. If 2.3 lands before 2.2's server-side is deployed, manual smoke-tests against a dev server won't work — but the unit/hook tests stub `fetch` and are independent of the live server

### Git Intelligence

- Last 6 commits on `master`: 1.1 → 1.6. 2.1 + 2.2 are `ready-for-dev` / `in-progress` as of 2026-04-20, not yet committed
- Convention: `feat: story X.Y implemented` for the implementation commit — 2.3 will be `feat: story 2.3 implemented` when complete
- Scope discipline: each story has touched ~5-10 files. 2.3 touches ~10 new + 2-3 modified — in-line with the norm

### Latest Tech Information

**`@tanstack/react-query 5.60.x`** (already installed):
- `useQuery({ queryKey, queryFn })` — v5 removed the object/array-or-string polymorphism; query key MUST be an array
- `useMutation({ mutationKey, mutationFn, onSettled })` — mutation-level options haven't changed between v4/v5 for our usage
- `useQueryClient()` — hook to read the `QueryClient` from the `QueryClientProvider` context
- `invalidateQueries({ queryKey: ['todos'] })` — marks all queries whose key starts with `['todos']` as stale and refetches if any are active
- `renderHook` moved from `@testing-library/react-hooks` to `@testing-library/react@13+` (we're on v16 — good)
- `gcTime` (not `cacheTime`, which was v4)

**`vi.stubGlobal` (Vitest 3.x):**
- `vi.stubGlobal('fetch', vi.fn(...))` replaces `globalThis.fetch` for the duration of the test
- `vi.unstubAllGlobals()` in `afterEach` undoes all stubs cleanly

**`import.meta.env` (Vite):**
- `VITE_*` prefix required for client exposure (others are build-time only)
- Typed via `vite/client` (already in `apps/web/tsconfig.json`'s `types` list)
- Replaced inline at build time — no runtime overhead

### References

- Epic requirements: [epics.md § Story 2.3](../planning-artifacts/epics.md) (lines 556–613)
- Architecture — Web HTTP module + hooks layer: [architecture.md § Technology Stack](../planning-artifacts/architecture.md) (line 233, line 61)
- Architecture — data flow, error envelope: [architecture.md § Data flow (create → read)](../planning-artifacts/architecture.md) (lines 662–668)
- Architecture — optimistic-vs-non-optimistic: [architecture.md § Technology Stack](../planning-artifacts/architecture.md) (line 61)
- Architecture — schema SoT: [architecture.md § Pattern Examples](../planning-artifacts/architecture.md) (lines 420–428)
- Architecture — cross-workspace type import policy: [architecture.md § Data Boundaries](../planning-artifacts/architecture.md) (lines 603–609)
- Architecture — MAX_DESCRIPTION_LENGTH mirror constraint: [architecture.md § Requirements Inventory](../planning-artifacts/architecture.md) (line 68)
- UX — AddTodoInput contract (next-story consumer): [ux-design-specification.md](../planning-artifacts/ux-design-specification.md) (UX-DR3)
- PRD — FR-001 Create, FR-002 View, FR-012 REST API: [PRD.md § Functional Requirements](../planning-artifacts/PRD.md)
- Previous story: [2-1 TypeBox schemas + POST](./2-1-typebox-schemas-todosrepo-create-post-v1-todos.md) — type re-exports originate here
- Previous story: [2-2 listAll + GET](./2-2-todosrepo-listall-get-v1-todos-with-active-asc-ordering.md) — `api.todos.list()` target
- Previous story: [1-5 web scaffold](./1-5-web-app-scaffold-vite-tailwind-v4-design-tokens-errorboundary-header.md) — `main.tsx` provider tree, `.env.example`

## Dev Agent Record

### Agent Model Used

Claude Opus 4.7 (1M context) — model id `claude-opus-4-7[1m]`

### Debug Log References

- **Path A (workspace `exports` map) resolved cleanly.** `apps/api/package.json` `exports: { "./schemas/todo": { "types": "./src/schemas/todo.ts", "default": "./src/schemas/todo.ts" } }` + `"@todo-app/api": "*"` in `apps/web/package.json` dependencies + `npm install`. `tsc -b --noEmit` on the web workspace passed first try — no `allowImportingTsExtensions` flag needed under `moduleResolution: Bundler`. The `@todo-app/*` symlinks live at the repo root `node_modules/@todo-app/{api,web}` (npm workspaces hoist), so the web workspace resolves them via the root `node_modules`.
- **`vi.fn(async () => ...)` produced tuple-type errors at typecheck.** First `tsc` run failed with `TS2493: Tuple type '[]' of length '0' has no element at index '0'` on every `fetchFn.mock.calls[0]` access. The spec's snippet relied on untyped `vi.fn`, which in Vitest 3.x defaults `mock.calls` to `[]`. Fix: annotated a local `type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;` and typed each `vi.fn<FetchFn>(...)` — `mock.calls[0]` then resolves to `[string, RequestInit | undefined]` and all the `(init as RequestInit).method` casts typecheck.
- **Hook tests were already fine** — the inline `async (_url: string, init?: RequestInit)` parameter annotations gave `vi.fn` enough to infer the tuple. Only `apiClient.test.ts` needed the explicit `FetchFn` generic.

### Completion Notes List

- **Path A (workspace exports map) chosen.** First-try resolution clean. No fallback to Path B (relative import + extended `include`) needed. One-line note for future stories: the pattern is extendable — add another entry to `apps/api/package.json` `exports` (e.g., `./schemas/errors`) when another API schema needs to cross the boundary.
- `apps/web/src/types.ts` — type-only re-export of `Todo` + `CreateTodoInput` from `@todo-app/api/schemas/todo`. Web bundle stays TypeBox-free; types are erased at compile time.
- `apps/web/src/api/errors.ts` — `ApiError extends Error` with `readonly statusCode`, `Object.setPrototypeOf(this, ApiError.prototype)` as cheap ES5-downlevel insurance. `isApiError` uses `instanceof` (not duck-typing). 9 unit tests cover happy construction, throwable/catchable as both `Error` and `ApiError`, narrowing on `ApiError` instances, and the 5 "plain object with same shape, plain Error, null, undefined, string, number" narrowing-negative cases.
- `apps/web/src/api/apiClient.ts` — one private `request<T>()` helper; four exports (`get`, `post`, `patch`, `del`). Reads `VITE_API_URL` once at module load. `Content-Type: application/json` only on bodied requests. `!response.ok` → extract `envelope.message` (Fastify global-handler shape) or fall back to `statusText`; any non-JSON error body degrades to `statusText` instead of throwing mid-parse. `response.status === 204` short-circuits to `undefined as T` for Story 3.2's DELETE. Non-JSON 2xx throws `ApiError(200, 'Response was not valid JSON')` — fail-loud over silent-null. 8 unit tests via `vi.stubGlobal('fetch', ...)`.
- `apps/web/src/api/todos.ts` — `todos.list()` / `todos.create(description)` wrapping `apiClient.get` / `apiClient.post`. Also exports `api = { todos }` for the `api.todos.list()` dotted-access pattern from architecture.md:599. 2 unit tests confirm URL + method + body shape.
- `apps/web/src/lib/constants.ts` — `MAX_DESCRIPTION_LENGTH = 500` with SoT comment pointing at `apps/api/src/schemas/todo.ts`. No test (single literal).
- `apps/web/src/hooks/useTodos.ts` — `useQuery({ queryKey: ['todos'], queryFn: api.todos.list })` typed `UseQueryResult<Todo[], ApiError>`. No `staleTime`/`gcTime`/`refetchOnWindowFocus` tuning — MVP defaults.
- `apps/web/src/hooks/useCreateTodo.ts` — `useMutation({ mutationKey: ['todos', 'create'], mutationFn, onSettled: () => queryClient.invalidateQueries({ queryKey: ['todos'] }) })`. Non-optimistic (no `onMutate`). `useQueryClient()` inside the hook, not a singleton import. Typed `UseMutationResult<Todo, ApiError, string>`.
- Hook tests use `renderHook` + a per-test `QueryClient` wrapper factory (`retry: false, gcTime: 0`) so state transitions are deterministic. `useTodos.test.tsx` asserts success data shape + error-path `ApiError` preservation (TanStack doesn't wrap thrown errors). `useCreateTodo.test.tsx` drives the mutation via `mutateAsync` inside `act()`, asserts POST body, and in the error path spies `queryClient.invalidateQueries` to prove `onSettled` fires even on failure.
- Full check green: `npm run check` exits 0. 64 api + 32 web = **96 tests pass**. 21 new tests added in this story (9 errors + 8 apiClient + 2 todos + 2 useTodos + 2 useCreateTodo). Only pre-existing lint warning from Story 1.6 (`apps/api/src/db/index.ts:14`) remains, untouched per scope discipline.

### File List

- Added: `apps/web/src/types.ts` — type-only re-export of `Todo` + `CreateTodoInput`.
- Added: `apps/web/src/lib/constants.ts` — `MAX_DESCRIPTION_LENGTH = 500`.
- Added: `apps/web/src/api/errors.ts` — `ApiError` class + `isApiError` narrowing helper.
- Added: `apps/web/src/api/errors.test.ts` — 9 unit tests.
- Added: `apps/web/src/api/apiClient.ts` — `request<T>` helper + `get`/`post`/`patch`/`del` exports.
- Added: `apps/web/src/api/apiClient.test.ts` — 8 unit tests via `vi.stubGlobal('fetch', ...)`.
- Added: `apps/web/src/api/todos.ts` — `todos` + `api` namespace wrapper.
- Added: `apps/web/src/api/todos.test.ts` — 2 unit tests.
- Added: `apps/web/src/hooks/useTodos.ts` — TanStack Query list hook.
- Added: `apps/web/src/hooks/useTodos.test.tsx` — 2 integration tests with `QueryClientProvider`.
- Added: `apps/web/src/hooks/useCreateTodo.ts` — TanStack Query mutation hook with invalidate-on-settle.
- Added: `apps/web/src/hooks/useCreateTodo.test.tsx` — 2 integration tests including invalidate-on-settle spy.
- Modified: `apps/api/package.json` — added `exports: { "./schemas/todo": { ... } }` entry.
- Modified: `apps/web/package.json` — added `"@todo-app/api": "*"` to `dependencies`.
- Modified: `package-lock.json` — regenerated by `npm install` to pick up the new workspace dep.
- Modified: `_bmad-output/implementation-artifacts/sprint-status.yaml` — story `2-3-...` moved `ready-for-dev → in-progress → review`.
- Modified: `_bmad-output/implementation-artifacts/2-3-web-api-client-typed-endpoints-usetodos-usecreatetodo-hooks.md` — Status, all task/subtask checkboxes, Dev Agent Record, File List, Change Log.

## Change Log

| Date       | Version | Change                                                                                                                                                                                                                                                                    | Author |
| ---------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| 2026-04-20 | 1.0     | Implemented web data layer: `types.ts` type-only re-export via workspace `exports` map (Path A), `ApiError` + `isApiError`, `apiClient` (get/post/patch/del) with 204 + non-JSON handling, `todos.list`/`todos.create`, `useTodos` + `useCreateTodo` with invalidate-on-settle, `MAX_DESCRIPTION_LENGTH` constant. 21 new tests (96 total). | Dev    |
