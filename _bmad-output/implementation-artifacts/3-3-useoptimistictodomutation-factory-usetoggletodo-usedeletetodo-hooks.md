# Story 3.3: `useOptimisticTodoMutation` factory + `useToggleTodo` + `useDeleteTodo` hooks

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want toggle and delete actions to feel instant,
So that the row updates immediately in the UI and only reverts if the server actually fails.

## Acceptance Criteria

**AC1 — `apps/web/src/api/todos.ts` extended with typed `update` and `delete` endpoint functions**
- **Given** `apps/web/src/api/todos.ts` already exports `list` and `create` (Story 2.3) behind the `todos` namespace, and `api = { todos }` is the canonical namespace wrapper (architecture.md:599)
- **When** the engineer inspects the file
- **Then** two new properties are added to the `todos` object:
  ```ts
  update: (id: string, input: UpdateTodoInput): Promise<Todo> =>
    apiClient.patch<Todo>(`/v1/todos/${id}`, input),
  delete: (id: string): Promise<void> => apiClient.del<void>(`/v1/todos/${id}`),
  ```
- **And** the import at the top of the file is extended: `import type { Todo, UpdateTodoInput } from '../types.js';` (replacing the current `import type { Todo } from '../types.js';`)
- **And** `delete` is declared as an **object property**, not a standalone `const` or named `function` (`delete` is a reserved word in a function declaration but is a valid object property name in ES2015+). The call-site `api.todos.delete(id)` is a property access, not a `delete` operator — no syntax conflict
- **And** the return type of `delete` is `Promise<void>`; it relies on `apiClient.del<void>(...)` which already returns `undefined as T` on 204 (`apiClient.ts:33-35` — added in Story 2.3). No body-parsing logic runs on 204
- **And** `update` uses the **backtick template literal** `` `/v1/todos/${id}` `` for the URL — do NOT use string concatenation (`'/v1/todos/' + id`) or leave the `${id}` unescaped in a regular string. The id comes from component code that already has the string; no `encodeURIComponent` is needed (the id is a server-generated UUID, always safe in a URL path segment)
- **And** `list` and `create` remain untouched (no behavior change; only two new properties appended to the object literal)
- **And** the `api = { todos }` namespace wrapper at the bottom of the file is untouched — `api.todos.update` and `api.todos.delete` become available automatically through the existing aggregation

**AC2 — `apps/web/src/types.ts` re-exports `UpdateTodoInput`**
- **Given** `apps/web/src/types.ts` currently re-exports `Todo` and `CreateTodoInput` from `@todo-app/api/schemas/todo` as the canonical web-side type source (Story 2.3)
- **When** the engineer inspects the file
- **Then** the single `export type` line is extended to include `UpdateTodoInput`:
  ```ts
  export type { Todo, CreateTodoInput, UpdateTodoInput } from '@todo-app/api/schemas/todo';
  ```
- **And** the source-of-truth comment at the top of the file is updated to mention `UpdateTodoInput` alongside the others (optional but useful for future readers)
- **And** NO runtime values are introduced at this boundary — `export type { ... }` is a type-only re-export, stripped by TypeScript (`isolatedModules` safe; no runtime import cost)
- **And** `@todo-app/api`'s `exports` block in `apps/api/package.json` already resolves `./schemas/todo` to `./src/schemas/todo.ts` — no changes to that package.json are needed (Story 3.1 already added `UpdateTodoInputSchema` + `type UpdateTodoInput` to that source file)

**AC3 — `apps/web/src/hooks/useOptimisticTodoMutation.ts` factory created**
- **Given** the architecture mandates a shared optimistic-update factory for all `['todos']`-cache-affecting mutations (architecture.md:272, 386–389, 454–470)
- **When** the engineer creates the new file
- **Then** it exports a function `useOptimisticTodoMutation<TData, TVariables>(options: UseOptimisticTodoMutationOptions<TData, TVariables>): UseMutationResult<TData, ApiError, TVariables, TodoOptimisticContext>`
- **And** the options interface is:
  ```ts
  export interface UseOptimisticTodoMutationOptions<TData, TVariables> {
    mutationKey: readonly unknown[];
    mutationFn: (input: TVariables) => Promise<TData>;
    applyOptimistic: (prev: Todo[] | undefined, input: TVariables) => Todo[];
  }
  ```
- **And** the context type is exported (or named internally):
  ```ts
  type TodoOptimisticContext = { previous: Todo[] | undefined };
  ```
- **And** the factory's `useMutation` configuration implements the exact architecture-specified pattern:
  - `onMutate(input)`:
    1. `await queryClient.cancelQueries({ queryKey: ['todos'] })` — prevents an in-flight refetch from overwriting the optimistic write
    2. `const previous = queryClient.getQueryData<Todo[]>(['todos'])` — snapshot the prior cache (may be `undefined` if the query has never run)
    3. `queryClient.setQueryData<Todo[]>(['todos'], applyOptimistic(previous, input))` — apply the optimistic transform
    4. `return { previous }` — the returned value becomes the `context` in `onError` and `onSettled`
  - `onError(_err, _input, context)`:
    1. If `context` is defined (TanStack types it as `TContext | undefined`), restore: `queryClient.setQueryData(['todos'], context.previous)`
    2. Do NOT re-throw — TanStack's error contract already propagates to the mutation result
  - `onSettled()`: `queryClient.invalidateQueries({ queryKey: ['todos'] })` — triggers a refetch that converges the cache to server authority; runs on both success and failure
- **And** the hook internally calls `const queryClient = useQueryClient()` at the top of the function body (not captured in closures) — required by React's hook rules
- **And** the factory does **NOT** accept an `onSuccess` or `onError` user-override in its public API — the three lifecycle callbacks are architecture-mandated and opaque to callers. Callers who need success/error side-effects use `.mutateAsync()` / `.mutate()` return values or the mutation's `.onError` at the `useMutation` level via a wrapper (not in MVP scope). See Dev Notes → "Why the factory has no user-override lifecycle slots"
- **And** the hook returns the full `UseMutationResult` tuple verbatim from `useMutation` — no field filtering, no renaming. Callers access `.mutate`, `.mutateAsync`, `.isPending`, `.error`, etc. in the standard TanStack idiom
- **And** the factory does **NOT** reference `api.todos` directly — it's endpoint-agnostic. Mutation wiring is the caller's concern (see AC4 and AC5)

**AC4 — `apps/web/src/hooks/useToggleTodo.ts` consumes the factory**
- **Given** the factory from AC3
- **When** the engineer creates the new file
- **Then** it exports `useToggleTodo(): UseMutationResult<Todo, ApiError, ToggleTodoInput, TodoOptimisticContext>` where:
  ```ts
  type ToggleTodoInput = { id: string; completed: boolean };
  ```
  and the implementation is:
  ```ts
  export function useToggleTodo() {
    return useOptimisticTodoMutation<Todo, ToggleTodoInput>({
      mutationKey: ['todos', 'toggle'],
      mutationFn: ({ id, completed }) => api.todos.update(id, { completed }),
      applyOptimistic: (prev, input) =>
        (prev ?? []).map((t) => (t.id === input.id ? { ...t, completed: input.completed } : t)),
    });
  }
  ```
- **And** `applyOptimistic` returns a **new array** (never the input `prev` reference) — uses `.map(...)` which allocates a new array; never uses `.sort()`, `.splice()`, or direct index assignment; does not rely on the input array being non-null (handles `undefined` via `prev ?? []`)
- **And** when the matching row is not in `prev`, the returned array is a same-length copy of `prev` (no error, no throw) — the map predicate simply never matches. This tolerates races where a delete happened between cache read and toggle attempt, and the subsequent `invalidateQueries` will reconcile authoritative state
- **And** the `mutationKey` is the architecture-locked literal `['todos', 'toggle']` (architecture.md:384) — do NOT use `['todos', 'update']`, `['toggle', id]`, or include the `id` in the key. The key is a static namespace tuple; TanStack distinguishes parallel mutations within the same key via its internal queue
- **And** no separate `ToggleTodoInput` type is exported from the hook file if it's not consumed externally — declare it inside the file or export only if another module imports it. The epic's text "`mutationFn: ({ id, completed }) => api.todos.update(id, { completed })`" matches the inline shape; a named type aids readability but isn't mandatory for external use
- **And** on server error, the factory's `onError` restores the prior cache snapshot → the optimistic row reverts to its previous `completed` value automatically; the component consuming this hook gets an `ApiError` in `.error` and can render `InlineError` in Epic 4 (not this story)

**AC5 — `apps/web/src/hooks/useDeleteTodo.ts` consumes the factory**
- **Given** the factory from AC3
- **When** the engineer creates the new file
- **Then** it exports `useDeleteTodo(): UseMutationResult<void, ApiError, string, TodoOptimisticContext>` with:
  ```ts
  export function useDeleteTodo() {
    return useOptimisticTodoMutation<void, string>({
      mutationKey: ['todos', 'delete'],
      mutationFn: (id) => api.todos.delete(id),
      applyOptimistic: (prev, id) => (prev ?? []).filter((t) => t.id !== id),
    });
  }
  ```
- **And** the `TVariables` type is `string` (the raw id) — do NOT wrap the id in `{ id }` just for parity with `useToggleTodo`. The shape is chosen to match the endpoint signature: DELETE takes a path param only; wrapping in an object adds ceremony without benefit. Architecture example line 469 uses the bare id for delete
- **And** `applyOptimistic` returns a new array (never mutates `prev`) via `.filter(...)` — always allocates; always handles `undefined` via `prev ?? []`; filtering a non-matching id returns a same-length copy (same tolerant race behavior as toggle)
- **And** `mutationKey` is the architecture-locked literal `['todos', 'delete']` (architecture.md:384)
- **And** on server error, the factory's `onError` restores the prior cache → the deleted row reappears in the cache → the UI re-renders it. The user sees the row bounce back once the network request fails. Inline error copy lands in Epic 4 (Story 4.3)

**AC6 — Unit tests for the factory at `apps/web/src/hooks/useOptimisticTodoMutation.test.tsx`**
- **Given** the factory from AC3 and the `wrapperFactory()` pattern established in `useCreateTodo.test.tsx` (with `retry: false, gcTime: 0` defaults on `QueryClient`)
- **When** the engineer creates the new test file
- **Then** it uses a **dummy `mutationFn`** and a **dummy `applyOptimistic`** to exercise the factory's three lifecycle callbacks in isolation, without touching `api.todos`
- **And** the test suite asserts five behaviors:
  1. **`onMutate` cancels queries + snapshots + applies transform** — prime the cache via `queryClient.setQueryData(['todos'], initialList)`, spy on `queryClient.cancelQueries`, call `result.current.mutate(input)`, assert:
     - `cancelQueries` was called with `{ queryKey: ['todos'] }` exactly once
     - the cache (`queryClient.getQueryData(['todos'])`) now equals `applyOptimistic(initialList, input)` immediately after `mutate` runs (before the mutationFn settles)
  2. **`onError` restores the snapshot** — make the dummy `mutationFn` reject with an `ApiError`, await settlement via `waitFor(() => expect(result.current.isError).toBe(true))`, assert `queryClient.getQueryData(['todos'])` equals the original `initialList` (NOT the optimistic value)
  3. **`onSettled` invalidates on success** — make the dummy `mutationFn` resolve, spy on `invalidateQueries`, after `isSuccess` assert `invalidateQueries` was called with `{ queryKey: ['todos'] }`
  4. **`onSettled` invalidates on failure** — same as (3) but with a rejecting mutationFn; `invalidateQueries` still runs (idempotent with `onError` which already wrote the snapshot back; `onSettled` is fire-and-forget)
  5. **Undefined prior cache is safe** — do NOT `setQueryData` before `mutate`; `getQueryData(['todos'])` returns `undefined`; assert the hook does not throw and `applyOptimistic` receives `undefined` as its `prev` argument (the test's dummy `applyOptimistic` can `vi.fn((prev, input) => prev ?? [])` and then assert its first call received `[undefined, input]`)
- **And** the tests use `vi.fn()` spies on `mutationFn` and `applyOptimistic` (to capture call-counts and arguments); they do **NOT** mock `api.todos` (the factory never calls it)
- **And** the tests reuse the `wrapperFactory` pattern but can inline a small helper if preferred (the existing tests inline `wrapperFactory`; prefer that convention)
- **And** the tests import `useOptimisticTodoMutation` directly, not via the specific hooks (`useToggleTodo` / `useDeleteTodo`) — those are tested separately in AC7 / AC8 to keep the factory tests isolated from endpoint-binding concerns

**AC7 — Unit tests for `useToggleTodo` at `apps/web/src/hooks/useToggleTodo.test.tsx`**
- **Given** the hook from AC4 and the `api.todos.update` module boundary
- **When** the engineer creates the new test file
- **Then** the file uses `vi.mock('../api/todos.js', ...)` at module scope to replace `api.todos` with `vi.fn()` implementations — **this is the epic-mandated mock strategy** (AC from epics.md line 928: "mocking `api.todos` at the module boundary (not by mocking `fetch`)")
- **And** the mock is structured as:
  ```ts
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
  ```
  — all four endpoints are mocked (not just `update`) so the factory doesn't get a "function not found" error if any transitive code path touches another endpoint. `list` / `create` / `delete` default to rejecting `vi.fn()` which surfaces if touched accidentally
- **And** individual tests customize the relevant mock via `vi.mocked(api.todos.update).mockResolvedValueOnce({ ...serverTodo })` or `.mockRejectedValueOnce(new ApiError(500, 'boom'))`
- **And** the suite covers:
  1. **Happy-path optimistic + settle** — seed cache with 2 todos, one completed=false; `mockResolvedValueOnce` the server's authoritative response; call `mutate({ id: 'abc', completed: true })`; assert cache reflects the optimistic toggle synchronously (before `await waitFor`); after `isSuccess` + the automatic refetch mocked via `list.mockResolvedValueOnce`, assert cache matches the authoritative state
  2. **Optimistic update returns a new array reference** — capture `queryClient.getQueryData(['todos'])` before and after `mutate`; assert `before !== after` (strict reference inequality proves immutability)
  3. **applyOptimistic does not mutate input** — use `Object.freeze(seedList)` before `setQueryData`; `mutate`; assert no TypeError is thrown (frozen-array-mutation would throw in strict mode)
  4. **Error-path revert** — seed cache, `mockRejectedValueOnce(new ApiError(500, 'boom'))` on `update`, mock `list.mockResolvedValue([... the authoritative list ...])` for the post-settle invalidation refetch; after `isError`, assert cache equals the AUTHORITATIVE refetched state (because onSettled fired invalidateQueries, which triggered list fetch). A narrower assertion — that at the MOMENT of `onError` (before invalidation completes) the cache equals the `previous` snapshot — is harder to time and not required by the epic
  5. **Invalidation on settle** — spy on `queryClient.invalidateQueries`; assert it was called with `{ queryKey: ['todos'] }` at least once after `isSuccess` or `isError`
  6. **Non-matching id is a no-op** — seed cache without the target id; `mutate({ id: 'ghost', completed: true })`; the mocked `api.todos.update` rejects with `ApiError(404, 'Todo ghost not found')`; assert the factory's `onError` restores the cache (no row was added by the optimistic transform since the id wasn't in `prev`; the filter / map just returned a copy)
- **And** tests use `renderHook` + a `wrapperFactory`-style helper (inline or extracted); `waitFor` for async assertions; `act` wraps any synchronous cache peek that happens between `mutate` and settle (React 19 + testing-library/react 16 may emit warnings without it)
- **And** tests **do NOT** import `useOptimisticTodoMutation` directly — they test `useToggleTodo` as a black box. The factory's internals are covered by AC6

**AC8 — Unit tests for `useDeleteTodo` at `apps/web/src/hooks/useDeleteTodo.test.tsx`**
- **Given** the hook from AC5 and the `api.todos.delete` module boundary
- **When** the engineer creates the new test file
- **Then** the file uses the same `vi.mock('../api/todos.js', ...)` module-boundary mock strategy as AC7; structure the mock identically (all four endpoints mocked)
- **And** the suite covers:
  1. **Happy-path optimistic + settle** — seed cache with 2 todos `[{id:'a',...}, {id:'b',...}]`; `mockResolvedValueOnce(undefined)` on `delete` (204 returns void); mock `list.mockResolvedValueOnce([{id:'b',...}])` for the post-settle refetch; call `mutate('a')`; assert cache after mutate contains only `{id:'b',...}`; after `isSuccess`, cache still reflects the single row
  2. **Optimistic update returns a new array** — capture reference before/after, assert strict inequality
  3. **applyOptimistic does not mutate input** — frozen-array test
  4. **Error-path revert** — `mockRejectedValueOnce(new ApiError(500, 'boom'))` on `delete`; cache after `isError` + invalidation should reflect the AUTHORITATIVE refetched list (mock `list.mockResolvedValue([both todos])`), because `onError` restored the snapshot AND `onSettled` invalidated. The row reappears in the cache — the UX bounce-back is visible
  5. **Invalidation on settle** — same spy pattern as AC7 (5)
  6. **Non-matching id is a no-op** — seed cache without 'ghost', `mutate('ghost')`, `delete` mock rejects with 404; cache ends up unchanged (filter of a non-present id returns same-length copy; onError restores; invalidation refetches); assert no throw, no React error boundary catch
- **And** the test file's structure parallels AC7's — keep the two files readable side-by-side so a reviewer can eyeball the toggle-vs-delete contract coverage parity

**AC9 — Contract tests for `api.todos.update` and `api.todos.delete` in `apps/web/src/api/todos.test.ts`**
- **Given** `apps/web/src/api/todos.test.ts` already tests `list` and `create` via `vi.stubGlobal('fetch', ...)`
- **When** the engineer extends the file
- **Then** two new `describe` blocks are added after the existing ones:
  1. **`api.todos.update`** — stubs `fetch` with a handler that returns `{ ok: true, status: 200, json: async () => ({...updated Todo}) }`; calls `todos.update('abc', { completed: true })`; asserts:
     - `fetch` was called once with `${API_BASE}/v1/todos/abc` as the URL
     - the request `init.method` is `'PATCH'`
     - the request `init.body` is `JSON.stringify({ completed: true })`
     - the request `init.headers` contains `'Content-Type': 'application/json'`
     - the returned value is the parsed JSON Todo
  2. **`api.todos.delete`** — stubs `fetch` with a handler that returns `{ ok: true, status: 204, statusText: 'No Content' }`; calls `todos.delete('abc')`; asserts:
     - `fetch` was called once with `${API_BASE}/v1/todos/abc`
     - the request `init.method` is `'DELETE'`
     - the request `init` has NO `body` and NO `'Content-Type'` header (the body-less request branch in `apiClient.ts:10-13`)
     - the returned value is `undefined` (the 204 branch in `apiClient.ts:33-35`)
- **And** the existing `list` and `create` tests are untouched — extend only
- **And** no changes are made to `apiClient.test.ts` or `apiClient.ts` — all wire-format concerns are already covered (the 204 branch was added in Story 2.3 anticipating this story; the `patch` method already exists)

## Tasks / Subtasks

- [x] **Task 1: Extend `apps/web/src/types.ts` with `UpdateTodoInput` re-export** (AC: 2)
  - [x] Replace the single `export type` line to include `UpdateTodoInput`:
    ```ts
    // Source of truth: apps/api/src/schemas/todo.ts (TypeBox Todo, CreateTodoInput, UpdateTodoInput).
    // Type-only re-export — no runtime values cross the workspace boundary.
    export type { Todo, CreateTodoInput, UpdateTodoInput } from '@todo-app/api/schemas/todo';
    ```
  - [x] Verify typecheck: `npm run typecheck --workspace apps/web` — `UpdateTodoInput` resolves to `{ completed: boolean }` (Story 3.1's `Static<typeof UpdateTodoInputSchema>`)
  - [x] **Do NOT** re-export any TypeBox schema *values* (e.g., `UpdateTodoInputSchema`) — the web side consumes types only; the schema value lives exclusively on the API side and is used there for Fastify validation + OpenAPI
  - [x] **Do NOT** duplicate `UpdateTodoInput` as a local type in the web workspace — the type lives on the API side and is re-exported to enforce the single-source-of-truth rule (architecture.md:604–609)

- [x] **Task 2: Extend `apps/web/src/api/todos.ts` with `update` and `delete`** (AC: 1)
  - [x] Update the import:
    ```ts
    import type { Todo, UpdateTodoInput } from '../types.js';
    ```
  - [x] Replace the `todos` object literal with:
    ```ts
    export const todos = {
      list: (): Promise<Todo[]> => apiClient.get<Todo[]>('/v1/todos'),
      create: (description: string): Promise<Todo> =>
        apiClient.post<Todo>('/v1/todos', { description }),
      update: (id: string, input: UpdateTodoInput): Promise<Todo> =>
        apiClient.patch<Todo>(`/v1/todos/${id}`, input),
      delete: (id: string): Promise<void> => apiClient.del<void>(`/v1/todos/${id}`),
    };
    ```
  - [x] Leave the namespace wrapper line `export const api = { todos };` untouched
  - [x] Run typecheck: `npm run typecheck --workspace apps/web` — `apiClient.patch<Todo>` and `apiClient.del<void>` are already typed from `apiClient.ts` (Story 2.3)
  - [x] **Why backtick template literal for the URL:** the single-quote alternative `'/v1/todos/' + id` is syntactically valid but noisier; template literals are the established project convention (architecture.md code samples consistently use them)
  - [x] **Why `apiClient.del<void>(...)` with explicit generic:** `del`'s signature is `<T = void>(path: string)`, so the explicit `<void>` is technically redundant. Making it explicit documents intent — the caller expects no body and no type inference accident to widen the return type if the signature ever changes
  - [x] **Why `update` passes `input` (not just `input.completed`) to `apiClient.patch`:** the shape-pass-through keeps `update` endpoint-agnostic about which fields `UpdateTodoInput` contains. Today it's `{ completed }`; if a post-MVP story adds `{ description? }` to the API schema, no change is needed here (types propagate)
  - [x] **Do NOT** wrap either call in a try/catch — `apiClient.request()` throws `ApiError` on non-2xx (`apiClient.ts:17-30`); TanStack Query's mutation machinery catches it and routes it to `.error`
  - [x] **Do NOT** add a second `apiClient` variant for body-less requests; the existing `del` already handles that branch
  - [x] **Do NOT** `encodeURIComponent(id)` — UUID characters (`0-9`, `a-f`, `-`) are all URL-safe in path segments (RFC 3986 unreserved chars). Adding the encoder is a no-op at best and hides a potentially meaningful encoding bug if the id ever gets malformed

- [x] **Task 3: Create `apps/web/src/hooks/useOptimisticTodoMutation.ts`** (AC: 3)
  - [x] Create the file with this content (the `TodoOptimisticContext` type is exported to allow callers to import the full 4-tuple `UseMutationResult<T, ApiError, V, TodoOptimisticContext>`):
    ```ts
    import {
      useMutation,
      useQueryClient,
      type UseMutationResult,
    } from '@tanstack/react-query';
    import type { Todo } from '../types.js';
    import type { ApiError } from '../api/errors.js';

    export type TodoOptimisticContext = { previous: Todo[] | undefined };

    export interface UseOptimisticTodoMutationOptions<TData, TVariables> {
      mutationKey: readonly unknown[];
      mutationFn: (input: TVariables) => Promise<TData>;
      applyOptimistic: (prev: Todo[] | undefined, input: TVariables) => Todo[];
    }

    export function useOptimisticTodoMutation<TData, TVariables>(
      options: UseOptimisticTodoMutationOptions<TData, TVariables>,
    ): UseMutationResult<TData, ApiError, TVariables, TodoOptimisticContext> {
      const queryClient = useQueryClient();

      return useMutation<TData, ApiError, TVariables, TodoOptimisticContext>({
        mutationKey: options.mutationKey,
        mutationFn: options.mutationFn,
        onMutate: async (input) => {
          await queryClient.cancelQueries({ queryKey: ['todos'] });
          const previous = queryClient.getQueryData<Todo[]>(['todos']);
          queryClient.setQueryData<Todo[]>(['todos'], options.applyOptimistic(previous, input));
          return { previous };
        },
        onError: (_err, _input, context) => {
          if (context) {
            queryClient.setQueryData(['todos'], context.previous);
          }
        },
        onSettled: () => {
          queryClient.invalidateQueries({ queryKey: ['todos'] });
        },
      });
    }
    ```
  - [x] **Why the return-type annotation is explicit (`: UseMutationResult<...>`):** TanStack v5's inference for `useMutation` generics can get loose when callbacks are passed as object fields rather than type arguments. The explicit return type + the `useMutation<TData, ApiError, TVariables, TodoOptimisticContext>` generic-tuple-on-the-call lock in the exact types for `.error: ApiError | null`, `.data: TData | undefined`, and the `context` argument in callbacks. Without this, `.error` might narrow to `Error` (losing the `statusCode` field) and `context` might widen to `unknown`
  - [x] **Why `onMutate` is `async`:** `cancelQueries` returns a `Promise<void>`. TanStack awaits `onMutate`'s returned promise before calling `mutationFn`, so `await`ing inside guarantees the cancellation completes before the mutation fires — critical for racing refetch-vs-optimistic-write correctness. A non-async version would let the mutation start with stale in-flight queries possibly overwriting the cache later
  - [x] **Why `previous` can be `undefined`:** if the `useTodos` query hasn't run (e.g., user mutates before first fetch — unlikely but possible during `App.tsx` mount ordering), `getQueryData` returns `undefined`. The factory type models this (`Todo[] | undefined`); `applyOptimistic` handles it via `prev ?? []`; `onError`'s `setQueryData(['todos'], undefined)` is valid (TanStack stores it as "query has no data"; the next refetch populates it)
  - [x] **Why the `if (context)` guard in `onError`:** TanStack's types make `context` `TContext | undefined` because `onMutate` might throw (e.g., `cancelQueries` rejecting, though unlikely with queryClient's always-resolving implementation). The guard protects against that narrow case; the alternative `context!.previous` asserts a non-null at a point where TS cannot prove it
  - [x] **Why `invalidateQueries` uses `{ queryKey: ['todos'] }` not just `['todos']`:** TanStack v5's `invalidateQueries` takes an options object; passing the array form directly would be a runtime error (invalidates the wrong filter). Same for `cancelQueries` above
  - [x] **Do NOT** spread `...options` at the top of the `useMutation` config — that would let a caller override `onMutate` / `onError` / `onSettled` and break the optimistic guarantee (AC3 forbids this). Explicitly pick `mutationKey` and `mutationFn` only
  - [x] **Do NOT** declare `const api` or otherwise import `api.todos` here — the factory is endpoint-agnostic. Wiring `mutationFn` to a specific endpoint is the caller's responsibility
  - [x] **Do NOT** add a `retry: false` option — retry policy is a consumer concern (the existing `useCreateTodo` doesn't set it; QueryClient defaults apply). Individual hooks can layer it on if needed via a future wrapper

- [x] **Task 4: Create `apps/web/src/hooks/useToggleTodo.ts`** (AC: 4)
  - [x] Create the file:
    ```ts
    import { api } from '../api/todos.js';
    import type { Todo } from '../types.js';
    import type { ApiError } from '../api/errors.js';
    import type { UseMutationResult } from '@tanstack/react-query';
    import {
      useOptimisticTodoMutation,
      type TodoOptimisticContext,
    } from './useOptimisticTodoMutation.js';

    export type ToggleTodoInput = { id: string; completed: boolean };

    export function useToggleTodo(): UseMutationResult<
      Todo,
      ApiError,
      ToggleTodoInput,
      TodoOptimisticContext
    > {
      return useOptimisticTodoMutation<Todo, ToggleTodoInput>({
        mutationKey: ['todos', 'toggle'],
        mutationFn: ({ id, completed }) => api.todos.update(id, { completed }),
        applyOptimistic: (prev, input) =>
          (prev ?? []).map((t) => (t.id === input.id ? { ...t, completed: input.completed } : t)),
      });
    }
    ```
  - [x] **Why `ToggleTodoInput` is exported:** the consuming component (`TodoRow` in Story 3.4) will type the `onClick` handler's argument; importing `ToggleTodoInput` from the hook file keeps that type chain one-directional
  - [x] **Why `t.id === input.id ? { ...t, completed } : t`:** ternary returns either a new object spread (changed row) or the original reference (unchanged row) — minimizes re-renders in `React.memo`'d `TodoRow`s since only the changed row gets a new reference
  - [x] **Why `(prev ?? []).map(...)` and not `prev.map(...)`:** `prev` is typed `Todo[] | undefined` at the factory boundary; skipping the `?? []` would fail typecheck AND crash at runtime on the first-mutation-before-first-fetch race
  - [x] **Why not `prev?.map(...)`:** returns `Todo[] | undefined`, but `applyOptimistic` must return `Todo[]`. The `?? []` + `.map` path is equivalent at the null case and type-clean
  - [x] **Do NOT** `.sort()` the result — Story 3.4 will re-section the list by `completed` status at the component layer (using filter-based section splits), not via sort. Sorting here would fight the section-move animation
  - [x] **Do NOT** add `enabled: true` or any options beyond the three the factory accepts — the factory's API is locked
  - [x] **Do NOT** call `api.todos.update(input.id, input)` (passing the full `{id, completed}` as the body) — the API's `UpdateTodoInput` schema rejects unknown keys (Story 3.1 AC1 — `additionalProperties: false`). Pass `{ completed }` only

- [x] **Task 5: Create `apps/web/src/hooks/useDeleteTodo.ts`** (AC: 5)
  - [x] Create the file:
    ```ts
    import { api } from '../api/todos.js';
    import type { ApiError } from '../api/errors.js';
    import type { UseMutationResult } from '@tanstack/react-query';
    import {
      useOptimisticTodoMutation,
      type TodoOptimisticContext,
    } from './useOptimisticTodoMutation.js';

    export function useDeleteTodo(): UseMutationResult<
      void,
      ApiError,
      string,
      TodoOptimisticContext
    > {
      return useOptimisticTodoMutation<void, string>({
        mutationKey: ['todos', 'delete'],
        mutationFn: (id) => api.todos.delete(id),
        applyOptimistic: (prev, id) => (prev ?? []).filter((t) => t.id !== id),
      });
    }
    ```
  - [x] **Why `TVariables = string` (not an object):** the API endpoint takes only the id; wrapping adds ceremony. If a future endpoint takes `{ id, soft?: boolean }`, the hook signature changes then — don't future-proof now
  - [x] **Why `.filter(t => t.id !== id)`:** returns a new array; omits the target row; returns a same-length copy if no match. Never throws, never reorders other rows
  - [x] **Why `api.todos.delete(id)` returns `Promise<void>`:** `apiClient.del<void>` returns `undefined as T` on 204; the mutation's `TData` is `void`; callers get `.data: void | undefined` (effectively useless) — the mutation signals success via `isSuccess`, not `data`
  - [x] **Do NOT** add a confirmation UI here — modal confirmation is `DeleteTodoModal`'s concern (Story 3.5). This hook commits to the delete immediately on `.mutate(id)`; the consumer is responsible for getting user confirmation first
  - [x] **Do NOT** export a `DeleteTodoInput` type — there is no input object shape; exporting `type DeleteTodoInput = string` would be a type alias for a primitive, conventionally not worth exporting

- [x] **Task 6: Create `apps/web/src/hooks/useOptimisticTodoMutation.test.tsx`** (AC: 6)
  - [x] Create the test file. Template (adapt test names / assertion wording as appropriate, keep assertion intent):
    ```tsx
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
          queries: { retry: false, gcTime: 0 },
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
        const applyOptimistic = vi.fn(
          (prev: Todo[] | undefined, input: { id: string }) =>
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
        // Note: onSettled fires invalidateQueries, which triggers a refetch.
        // In this test no `useTodos` consumer is mounted → no active observer →
        // invalidation does not trigger a fetch here. Snapshot is the final state.
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
    ```
  - [x] **Why `vi.restoreAllMocks()` in `afterEach`:** the spy-heavy tests in this file use `vi.spyOn` on queryClient methods. Without restoration, the spies persist into the next test's queryClient (fresh instance but still with accumulated call history on reused prototypes). `restoreAllMocks` also clears `mockResolvedValue` / `mockRejectedValue` per-call history
  - [x] **Why `act(async () => { await mutateAsync() })` wrapping:** TanStack's mutation lifecycle (onMutate → mutationFn → onSuccess/onError → onSettled) all fire within React's effect queue. Without `act`, React 19 + testing-library logs "not wrapped in act" warnings. `mutateAsync()` also needs the wrapping because it awaits the settle, which flushes effects
  - [x] **Why the `onError restores the snapshot` test doesn't assert mid-flight cache state:** TanStack pushes the optimistic write synchronously inside `onMutate`, then the `mutationFn` runs, then `onError` restores. Asserting the mid-flight optimistic value is theoretically possible but timing-fragile — you'd need to unblock the mutationFn promise manually. The final `onError`-restored state is what the UI sees; that's the observable contract
  - [x] **Do NOT** mock `api.todos` in this test file — the factory doesn't call it. Testing with `vi.mock('../api/todos.js', ...)` at module scope would mislead future readers about the factory's surface area
  - [x] **Do NOT** assert internal `useMutation` config fields (e.g., `result.current.__internal__.mutationKey`) — TanStack's internal state is not part of its public API. Test behavior, not shape

- [x] **Task 7: Create `apps/web/src/hooks/useToggleTodo.test.tsx`** (AC: 7)
  - [x] Create the test file. Key setup blocks:
    ```tsx
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
        // invalidate → refetch fires api.todos.list with authoritative state
        vi.mocked(api.todos.list).mockResolvedValueOnce([serverUpdated, seed[1]!]);

        const { result } = renderHook(() => useToggleTodo(), { wrapper });

        const before = queryClient.getQueryData<Todo[]>(['todos']);

        await act(async () => {
          await result.current.mutateAsync({ id: 'a', completed: true });
        });

        const after = queryClient.getQueryData<Todo[]>(['todos']);
        expect(before).not.toBe(after); // new reference
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

        // Must not throw — any in-place mutation on a frozen array would throw
        // TypeError("Cannot assign to read only property...") in strict mode.
        await act(async () => {
          await result.current.mutateAsync({ id: 'a', completed: true });
        });
      });

      it('reverts the cache on server error and invalidates on settle', async () => {
        const { wrapper, queryClient } = wrapperFactory();
        const seed = [makeTodo('a', false)];
        queryClient.setQueryData<Todo[]>(['todos'], seed);

        vi.mocked(api.todos.update).mockRejectedValueOnce(new ApiError(500, 'boom'));
        vi.mocked(api.todos.list).mockResolvedValue(seed); // authoritative post-invalidate

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

        vi.mocked(api.todos.update).mockRejectedValueOnce(
          new ApiError(404, 'Todo ghost not found'),
        );
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
    ```
  - [x] **Why `vi.mock('../api/todos.js', ...)` at module scope:** epic line 928 explicitly mandates mocking `api.todos` at the module boundary, not `fetch`. Module-scoped `vi.mock` hoists above imports; downstream `import { api } from '../api/todos.js'` resolves to the mock. Use `vi.mocked(api.todos.update)` inside tests to customize per-case behavior
  - [x] **Why all four endpoints are mocked (not just `update`):** the post-settle invalidation triggers `api.todos.list` (via the `useTodos` query's cache key refetch, if mounted). If `list` isn't mocked, invalidation schedules a refetch against a `vi.fn()` returning undefined → the cache ends up as `undefined` and subsequent assertions get messy. Mocking all four keeps the surface consistent and lets each test assert only the calls it cares about
  - [x] **Why `vi.mocked(api.todos.list).mockResolvedValueOnce(...)` / `mockResolvedValue(...)`:** the happy-path test wants the list to resolve once (for the post-settle refetch) and then be inert; the error-path test uses `mockResolvedValue` so any subsequent invalidation-triggered refetch returns the seed state. Choose `Once` vs default per the number of expected calls
  - [x] **Why assertions focus on cache state rather than component DOM:** this is a hook-level test. Component DOM behavior is Story 3.4 / 3.5's concern. Hook tests assert: (1) correct mutationFn invocation, (2) correct optimistic cache transition, (3) correct revert on error, (4) correct invalidation
  - [x] **Why `Object.freeze(seed)` + `as unknown as Todo[]`:** TypeScript types `Object.freeze([...])` as `readonly Todo[]`; `setQueryData<Todo[]>` wants `Todo[]`. The cast bridges the gap; the test's *intent* is to prove no in-place mutation, not to advertise a readonly contract through the system
  - [x] **Why `vi.resetAllMocks()` (not `clearAllMocks` or `restoreAllMocks`):** `resetAllMocks` clears implementations AND call history between tests, which is what we want for `vi.mocked(api.todos.update).mockResolvedValueOnce(...)` per-test setup. `clearAllMocks` only clears call history; `restoreAllMocks` restores originals (which would kill the module mock setup). `reset` is the Goldilocks option
  - [x] **Do NOT** use `waitFor(() => expect(result.current.isSuccess).toBe(true))` universally — use it only when the assertion needs the settled state. The happy-path test above uses `mutateAsync` (which returns only on settle), so `isSuccess` is already true at assertion time; adding `waitFor` is redundant but harmless. Prefer the simpler form
  - [x] **Do NOT** call `vi.mock` inside a test or inside `beforeEach` — `vi.mock` is hoisted; calling it at non-module scope is a no-op (fails silently). The module-scope declaration at top-of-file is the only way

- [x] **Task 8: Create `apps/web/src/hooks/useDeleteTodo.test.tsx`** (AC: 8)
  - [x] Create the test file mirroring Task 7's structure, substituting:
    - Hook under test: `useDeleteTodo`
    - Mutation invocation: `mutate('a')` (plain id, not object)
    - Endpoint mock: `vi.mocked(api.todos.delete).mockResolvedValueOnce(undefined)` for 204 resolve
    - Optimistic transform: row-removed, NOT row-flipped
  - [x] Key test cases (match AC8's numbered list):
    ```tsx
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

      expect(result.current.error).toBeInstanceOf(ApiError);
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['todos'] });
    });

    it('tolerates non-matching id (404 from server → cache unchanged)', async () => {
      const { wrapper, queryClient } = wrapperFactory();
      const seed = [makeTodo('a')];
      queryClient.setQueryData<Todo[]>(['todos'], seed);

      vi.mocked(api.todos.delete).mockRejectedValueOnce(
        new ApiError(404, 'Todo ghost not found'),
      );
      vi.mocked(api.todos.list).mockResolvedValue(seed);

      const { result } = renderHook(() => useDeleteTodo(), { wrapper });
      await act(async () => {
        try {
          await result.current.mutateAsync('ghost');
        } catch {
          /* expected */
        }
      });

      expect(result.current.error?.statusCode).toBe(404);
    });
    ```
  - [x] Same setup boilerplate as Task 7 (`vi.mock('../api/todos.js', ...)` at module scope, `wrapperFactory`, `makeTodo` helper, `afterEach(vi.resetAllMocks)`)

- [x] **Task 9: Extend `apps/web/src/api/todos.test.ts` with contract tests for `update` and `delete`** (AC: 9)
  - [x] Append after the existing `api.todos.create` describe block:
    ```ts
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
    ```
  - [x] **Why `json` is omitted from the 204 fetch stub:** `apiClient.ts:33-35` checks `response.status === 204` and returns `undefined as T` before attempting `response.json()`. If the code path ever regressed (tried to parse), the stub would throw "response.json is not a function" — the test would catch it. But stubbing `json: async () => undefined` would mask that regression. Deliberately omit
  - [x] **Why assert `(init).body).toBeUndefined()` and `headers.toBeUndefined()`:** `apiClient.ts:10-13` sets `headers: hasBody ? {...} : undefined` and `body: hasBody ? JSON.stringify(body) : undefined`. For DELETE, `hasBody === false` → both fields become `undefined`. Asserting this locks the contract: future refactors that always set headers (e.g., always `Accept: application/json`) would fail the test and prompt a deliberate review
  - [x] **Why no test for error path on `update` / `delete`:** `apiClient`'s error-envelope parsing is tested exhaustively in `apiClient.test.ts` (Story 2.3) — adding per-endpoint error tests here would be duplicative. Coverage of the happy-path wire format is the contract this file locks
  - [x] **Do NOT** mock `apiClient` — the file's purpose is to test the wire format end-to-end through `apiClient`; mocking it would turn these into trivial "api calls apiClient" tests with no value
  - [x] **Do NOT** rewrite the existing `list` or `create` tests — append only

- [x] **Task 10: Run the full check script and finalize** (AC: 1–9)
  - [x] `npm run typecheck` — clean across both workspaces (web gains `UpdateTodoInput` imports + two new hooks; API is untouched)
  - [x] `npm run lint` — clean (the pre-existing `apps/api/src/db/index.ts:14` warning stays; out of scope per `deferred-work.md`)
  - [x] `npm run format:check` — clean; run `npm run format` if Prettier flags anything (contract: `singleQuote: true`, `semi: true`, `trailingComma: 'all'`, `printWidth: 100`)
  - [x] `npm test` — all suites pass:
    - api: unchanged from Story 3.2 (API code not touched by this story)
    - web: +7 new test files' worth of cases (`useOptimisticTodoMutation.test.tsx` ~5 cases, `useToggleTodo.test.tsx` ~4 cases, `useDeleteTodo.test.tsx` ~5 cases, `todos.test.ts` +2 cases) — target: no regressions in existing `useTodos` / `useCreateTodo` / `todos.test.ts` / `App.test.tsx` / `App.integration.test.tsx`
  - [x] `npm run check` — exits 0
  - [x] **Manual smoke** (optional but recommended): run `npm run dev` at repo root. Open the app at http://localhost:5173. There is no UI calling `useToggleTodo` / `useDeleteTodo` yet (Stories 3.4 and 3.5 wire them in). Browser-devtools React-Query inspector should show `['todos']` query populated from `useTodos`; the new hooks are inert until mounted. This story is a hooks-only story — no visible UI change
  - [x] **Do NOT** push to `main` or open a PR from within this task — CI handles it on PR creation; Story 3.3 lands as a single `feat: story 3.3 implemented` commit
  - [x] **Do NOT** touch `apps/api/` — the API endpoints PATCH and DELETE already ship from Stories 3.1 and 3.2. Any apparent need to modify API code means a misreading of the story
  - [x] **Do NOT** wire the new hooks into `App.tsx` or any component — that is Story 3.4 (toggle) and Story 3.5 (delete). This story is strictly hooks + `api/todos.ts` + `types.ts`
  - [x] **Do NOT** add a `useOptimisticTodoMutation` to the list of exports from a new barrel file — barrel files (e.g., `hooks/index.ts`) are not used elsewhere in the project; introducing one now for three hooks would be premature abstraction

## Dev Notes

### Why the factory has no user-override lifecycle slots

The architecture mandates a single, locked optimistic-update pattern for all `['todos']`-cache mutations (architecture.md:272, 386–389). The three callbacks — `onMutate`, `onError`, `onSettled` — are the contract:

- `onMutate` — cancel + snapshot + optimistic write (fixed behavior).
- `onError` — restore snapshot (fixed behavior).
- `onSettled` — invalidate `['todos']` (fixed behavior).

Allowing a caller to override any of these via an options object would break the invariants:
- An override of `onMutate` could skip the `cancelQueries` call → in-flight refetch wins the race → cache desynchronizes from optimistic state → revert on error restores the wrong baseline.
- An override of `onError` could suppress the snapshot restore → the UI stays in the optimistic state forever after a failure → the user sees "save confirmed" on a row that's actually stale.
- An override of `onSettled` could skip invalidation → server-authoritative state never rejoins the cache → permanent drift.

Consumers that need success/error side-effects have two options:
1. Call `.mutateAsync(input).then(...).catch(...)` at the call site — per-call handling, no factory pollution.
2. Compose a wrapper hook that spreads the factory's mutation result and layers its own `useEffect(() => { if (isSuccess) ... }, [isSuccess])` — not needed in MVP, but possible without changing the factory.

The Story 3.3 scope keeps the factory locked. If a future story (e.g., Epic 4's inline-error surface) needs an `onError` hook, that story will revisit the design. Likely outcome: a second factory or a composition primitive; NOT an option-flag that weakens this one's guarantees.

### Why all three hooks live in `hooks/` and not one consolidated file

The architecture's project structure (architecture.md:554–561) lists each hook as its own file:
- `useTodos.ts`
- `useCreateTodo.ts`
- `useToggleTodo.ts`
- `useDeleteTodo.ts`
- `useOptimisticTodoMutation.ts`

One file per hook keeps imports granular (TodoRow imports only `useToggleTodo`; DeleteTodoModal imports only `useDeleteTodo`), aids tree-shaking, and matches the existing `useTodos.ts` / `useCreateTodo.ts` convention from Story 2.3. A consolidated `hooks/todoMutations.ts` would mix concerns and make per-hook unit testing harder to scope.

### Why `api.todos.delete` is an object property, not a named function

`delete` is a reserved word in JavaScript — you cannot write:
```ts
function delete(id: string): Promise<void> { ... }
```
But object property names can be any valid identifier OR a reserved word (ES5+):
```ts
const todos = {
  delete: (id: string) => { ... },  // ✅ valid
};
```
The call site `api.todos.delete(id)` is a property access, not a `delete` operator on an object. The `delete` operator takes an unparenthesized target (`delete obj.prop`); a function call with parens (`obj.delete()`) is always a property access + invocation.

ESLint / Prettier / TypeScript all accept `delete:` as a property name. Some strict linters warn, but none in this project's config do.

### Why `update` passes the full `UpdateTodoInput` object (not just the boolean)

```ts
// Current (Story 3.3):
update: (id, input: UpdateTodoInput) => apiClient.patch<Todo>(`/v1/todos/${id}`, input)

// Alternative (rejected):
update: (id, completed: boolean) => apiClient.patch<Todo>(`/v1/todos/${id}`, { completed })
```

The object-passing signature wins because:
1. **Schema-typed correctness.** `UpdateTodoInput` is a TypeBox-derived type. If the schema ever gains a second field (e.g., `{ completed: boolean; pinned?: boolean }`), callers continue to work — they just widen what they pass. The alternative requires a new positional parameter each time, and old call sites silently miss the new field.
2. **Shape symmetry with `create`.** `create(description)` takes the one-field input directly; `update(id, input)` takes the structured input. The contrast tells a caller "update takes a structured body; create is one field". Positional primitives obscure this.
3. **API parity.** The API's body is `{ completed }` on the wire; the web-side function mirrors that JSON shape. Translating at the web layer makes the mental model `input → wire` identical.

### Why the `mutationKey` includes `'toggle'` / `'delete'` but not the row id

TanStack's `mutationKey` is a namespace, not an identifier. Including the id (`['todos', 'toggle', id]`) would:
- Prevent TanStack's internal queuing from batching concurrent toggles on different rows (each gets its own key → no dedupe, no ordering).
- Make invalidation selectors match too narrowly (`invalidateMutations({ mutationKey: ['todos', 'toggle'] })` would miss id-keyed mutations).

The architecture's convention (architecture.md:384) is a **namespace-only** key. Per-invocation uniqueness is TanStack's internal concern; the `input` argument to `.mutate(...)` carries the id.

### Why `cancelQueries` is `await`ed inside `onMutate`

Without `await`:
```ts
onMutate: (input) => {
  queryClient.cancelQueries({ queryKey: ['todos'] }); // fire-and-forget
  const previous = queryClient.getQueryData<Todo[]>(['todos']);
  queryClient.setQueryData<Todo[]>(['todos'], applyOptimistic(previous, input));
  return { previous };
}
```

`cancelQueries` returns a Promise that resolves once any in-flight `['todos']` queries (e.g., a `useTodos` refetch) have been aborted. If we don't wait:
1. Cancel is scheduled but hasn't taken effect.
2. We snapshot the CURRENT cache (pre-refetch).
3. We apply the optimistic transform.
4. The in-flight refetch resolves a moment later → overwrites our optimistic state with stale server data.
5. Mutation's `onSettled` invalidates → triggers another refetch → converges eventually.

The visible symptom is a UI flash where the row flips, un-flips (when the racing fetch lands), then flips again (after invalidation refetches the authoritative post-mutation state). `await` prevents this: we don't snapshot or write until cancellation has landed.

This is the same pattern TanStack's own optimistic-update recipe uses (https://tanstack.com/query/v5/docs/framework/react/guides/optimistic-updates). Our implementation matches it faithfully.

### Why `setQueryData(['todos'], undefined)` on restore is safe

If `previous` is `undefined` (first-ever mutation before first fetch):
- `setQueryData(['todos'], undefined)` tells TanStack "this query has no data".
- Next access via `getQueryData` returns `undefined`.
- The next refetch (triggered by `invalidateQueries` in `onSettled`) repopulates the cache from the server.

The alternative — conditionally skipping the restore if `previous === undefined` — would let the optimistic state linger in the cache on error. The current behavior (always restore) is more predictable: "error → cache is exactly what it was when mutation started".

### Why tests mock `api.todos` at the module boundary (not `fetch`)

Epic 3.3 AC explicitly mandates: "asserting the optimistic-then-revert behavior by mocking `api.todos` at the module boundary (not by mocking `fetch`)".

Rationale:
- **Scope.** Hook tests exercise `useToggleTodo` / `useDeleteTodo` behavior — how they compose with TanStack Query, not how they serialize over the network. `fetch` mocks at the HTTP boundary would force re-asserting URLs, methods, headers, etc. — concerns already covered in `api/todos.test.ts`.
- **Clarity.** A failing test with `vi.mocked(api.todos.update).mockRejectedValueOnce(...)` reads as "when the update endpoint fails, the cache reverts". A fetch-mock equivalent reads as "when POST /v1/todos/abc returns 500, the cache reverts" — same intent, more mental hops.
- **Decoupling.** If the api module's call site changes (e.g., adds logging, adds a request-id), fetch-level mocks would need updates. Module-boundary mocks absorb internal changes — the hook contract is what's being tested.

The existing `useCreateTodo.test.tsx` and `useTodos.test.tsx` (Story 2.3) DO mock `fetch`. That's a deviation from this story's new standard. **Do NOT refactor those existing tests** in this story — their coverage is still valid, and touching them expands the PR scope. A future cleanup story may align them with the new convention.

### Previous Story Intelligence

**From Story 3.1 (PATCH API) — load-bearing:**
- `UpdateTodoInputSchema` + `type UpdateTodoInput = { completed: boolean }` exported from `apps/api/src/schemas/todo.ts`. Web types re-export adds `UpdateTodoInput` to the same boundary.
- PATCH returns the updated `Todo` body (200) — hence `mutationFn` for toggle returns `Promise<Todo>`.
- 400 / 404 envelopes are locked — `ApiError` surfaces `statusCode` + `message` (validated by contract tests already).

**From Story 3.2 (DELETE API) — load-bearing:**
- DELETE returns 204 with no body. The web `apiClient.del<void>` path returns `undefined` on 204 (added in Story 2.3 preemptively for this flow).
- 404 on non-existent id carries `Todo <id> not found` message — the error-path test in Task 8 asserts the exact status code but not the message (the message is an API contract already asserted in Story 3.2 AC6).
- **Dependency note:** Stories 3.1 and 3.2 must be merged before this story runs end-to-end against a dev server. Unit/hook tests don't require the API; the mocks stand in. But a manual smoke test would fail if the API is in an older state.

**From Story 2.3 (web API client + initial hooks) — directly reused:**
- `apiClient.ts` is already complete: `get`, `post`, `patch`, `del` all implemented, 204 branch handled.
- `api/todos.ts` namespace pattern (`export const todos = { ... }; export const api = { todos };`) is the established wiring.
- `wrapperFactory()` helper pattern with `retry: false, gcTime: 0` defaults is the test idiom (re-declare inline per test file — no shared helper module yet).
- `ApiError` class + `isApiError` typeguard at `api/errors.ts` — referenced via import; do not extend.
- `useTodos`, `useCreateTodo` establish the `UseMutationResult<TData, ApiError, TVariables>` typing convention; the factory adds the 4th generic (`TContext`) to carry the snapshot through lifecycle callbacks.

**From Story 2.4 (AddTodoInput component) — indirectly informative:**
- Component integrates `useCreateTodo().mutate(description)`. Components in Stories 3.4 and 3.5 will integrate `useToggleTodo().mutate({ id, completed })` and `useDeleteTodo().mutate(id)` similarly — no `mutateAsync` needed in components (no need to await; callbacks handle side-effects).

**From Story 2.6 (Journey 1 E2E) — context:**
- The E2E suite at `apps/web/e2e/` is set up but will only grow in Stories 3.4 and 3.5 (toggle and delete journeys). This story's work is invisible to E2E until components consume the hooks.

### Git Intelligence

- Commit rhythm: one story per commit, `feat: story X.Y implemented`. Target: `feat: story 3.3 implemented`.
- **Dependency order:** this story is web-only but logically depends on Stories 3.1 and 3.2 being merged (the API endpoints PATCH and DELETE must exist for manual smoke / eventual E2E). Work on the hooks can start anytime because:
  - Hook unit tests mock `api.todos` (no API needed).
  - `api/todos.test.ts` tests mock `fetch` (no API needed).
  - Typecheck resolves `UpdateTodoInput` from `apps/api/src/schemas/todo.ts` — that type was committed in Story 3.1's implementation.
- File-scope discipline: Story 3.3 touches exactly these files:
  1. `apps/web/src/types.ts` (extended — one line)
  2. `apps/web/src/api/todos.ts` (extended — two new methods)
  3. `apps/web/src/api/todos.test.ts` (extended — two new describe blocks)
  4. `apps/web/src/hooks/useOptimisticTodoMutation.ts` (NEW)
  5. `apps/web/src/hooks/useOptimisticTodoMutation.test.tsx` (NEW)
  6. `apps/web/src/hooks/useToggleTodo.ts` (NEW)
  7. `apps/web/src/hooks/useToggleTodo.test.tsx` (NEW)
  8. `apps/web/src/hooks/useDeleteTodo.ts` (NEW)
  9. `apps/web/src/hooks/useDeleteTodo.test.tsx` (NEW)
  10. `_bmad-output/implementation-artifacts/sprint-status.yaml` (status transition)
  11. `_bmad-output/implementation-artifacts/3-3-useoptimistictodomutation-factory-usetoggletodo-usedeletetodo-hooks.md` (this file — dev record updates)
- **No new dependencies.** `@tanstack/react-query` ^5.60.0 is already installed (Story 2.3); `vitest` + `@testing-library/react` already set up.
- **No API changes.** **No component changes.** **No migration changes.** **No CI changes.**

### Latest Tech Information

**TanStack Query v5 (`@tanstack/react-query` ^5.60.0):**
- `useMutation<TData, TError, TVariables, TContext>({ mutationKey, mutationFn, onMutate, onError, onSuccess, onSettled })` — four generics; `TContext` is the return type of `onMutate`.
- `queryClient.cancelQueries({ queryKey })` — takes options object; v4-era calling with a bare array is a runtime no-op.
- `queryClient.setQueryData<T>(queryKey, updater)` — updater can be a value or a `(prev: T | undefined) => T | undefined` function. We use the value form (already-computed via `applyOptimistic`).
- `queryClient.invalidateQueries({ queryKey })` — triggers refetch on all queries matching the prefix; a `['todos']` filter matches `['todos']` but NOT `['todos', id]` unless `exact: false` (the default for prefix match).
- **Generic inference gotcha:** TypeScript's inference on `useMutation` is strongest when generics are supplied inline; omitting them and relying on callback inference can widen `error` to `Error` and `context` to `unknown`. Explicit generics on `useMutation<TData, ApiError, TVariables, TodoOptimisticContext>` fix this (see Task 3 rationale).

**React 19 + `@testing-library/react` ^16.1.0:**
- `renderHook` still exists and returns `{ result: { current }, rerender, unmount }`.
- `act(async () => { ... })` is required to wrap state-updating async work (React 19 is stricter than 18 about the "not wrapped in act" warning).
- `waitFor(() => expect(...))` is the right primitive for "eventually true" assertions; avoid raw `await new Promise(r => setTimeout(r, 50))` as a timing hack.

**Vitest 3.x:**
- `vi.mock(path, factory)` — hoisted above imports. Must be at module scope (not inside `describe` / `beforeEach`).
- `vi.mocked(fn)` — returns the mock with type-preserving `mockResolvedValueOnce` / `mockRejectedValueOnce` helpers.
- `vi.resetAllMocks()` — clears call history AND implementations (resets `mockResolvedValue` setups).
- `vi.restoreAllMocks()` — restores spy targets to originals (useful for `vi.spyOn` cases).
- For `vi.mock` cases specifically, `resetAllMocks` is the right companion (keeps the mock active, clears per-test setup).

**Vite env typing (`import.meta.env.VITE_API_URL`):**
- Already wired via `vite.config.ts` + `vite/client` types (Story 1.5).
- `api/todos.test.ts` reads it via the same path as `apiClient.ts`; no new typing work.

### Project Structure Notes

**Extended files (3):**
- `apps/web/src/types.ts` — add `UpdateTodoInput` to the re-export line
- `apps/web/src/api/todos.ts` — add `update` and `delete` methods; extend the type import
- `apps/web/src/api/todos.test.ts` — append two describe blocks

**New files (6):**
- `apps/web/src/hooks/useOptimisticTodoMutation.ts` — factory
- `apps/web/src/hooks/useOptimisticTodoMutation.test.tsx` — factory tests
- `apps/web/src/hooks/useToggleTodo.ts` — toggle hook
- `apps/web/src/hooks/useToggleTodo.test.tsx` — toggle tests
- `apps/web/src/hooks/useDeleteTodo.ts` — delete hook
- `apps/web/src/hooks/useDeleteTodo.test.tsx` — delete tests

**No API changes.** **No component changes.** **No `@todo-app/api`'s `exports` field changes.**

**Alignment with `architecture.md:554–561`:** the `hooks/` directory inventory (`useTodos`, `useCreateTodo`, `useToggleTodo`, `useDeleteTodo`, `useOptimisticTodoMutation`) becomes complete after this story. Components in Stories 3.4 and 3.5 are the consumers.

**Alignment with `architecture.md:386–389`:** the optimistic-factory pattern is implemented verbatim — `cancelQueries` → snapshot → optimistic write → on error restore → on settle invalidate. The architecture's code sample at line 454–470 is the canonical reference.

### Testing Standards

- **Unit tests:** co-located (`*.test.ts[x]` next to `*.ts[x]`). Four new test files (factory + two hooks + extended api/todos tests). No integration or a11y tests are needed for this story — the optimistic cache wiring is logic, not visual (UX coverage comes in Stories 3.4 and 3.5 when components render optimistic state).
- **Mock boundary:** hook tests mock `api.todos` at module boundary (`vi.mock('../api/todos.js', ...)`). The factory test mocks nothing (uses inline `vi.fn()` spies). The api/todos contract test mocks `fetch` (existing pattern).
- **QueryClient per test:** every test creates a fresh `QueryClient` via `wrapperFactory()` — no shared client state across tests. `gcTime: 0` prevents cache retention between tests (on top of the fresh-instance guarantee).
- **`retry: false`:** both queries and mutations disable retry — a rejection in a test should fail immediately, not retry three times and time out Vitest.
- **Coverage target:** both hooks should hit 100% statement coverage through the factory + their own `applyOptimistic` + their `mutationFn` wiring. The factory file covers all four callbacks via the five AC6 test cases.
- **No E2E coverage in this story.** The first user-visible toggle E2E is Story 3.4 (`journey-2-toggle.spec.ts`); the first delete E2E is Story 3.5.

### References

- Epic requirements: [epics.md § Story 3.3](../planning-artifacts/epics.md) (lines 894–947)
- Architecture — Optimistic update pattern + factory: [architecture.md § Communication Patterns (TanStack Query conventions)](../planning-artifacts/architecture.md) (lines 382–390, 454–470)
- Architecture — Frontend stack (TanStack Query, typed apiClient, hooks-only data-fetching): [architecture.md § Frontend Architecture](../planning-artifacts/architecture.md) (lines 224–239)
- Architecture — Component boundaries (hooks are the only callers of `api/todos.ts`): [architecture.md § Architectural Boundaries](../planning-artifacts/architecture.md) (lines 595–601)
- Architecture — Full hooks inventory: [architecture.md § Complete Project Directory Structure](../planning-artifacts/architecture.md) (lines 555–561)
- Architecture — Shared types via re-export from API schemas: [architecture.md § Data Boundaries](../planning-artifacts/architecture.md) (lines 604–609)
- PRD — FR-003 (complete toggle, optimistic), FR-004 (delete with modal confirm), FR-010 (inline error — Epic 4): [PRD.md § Functional Requirements](../planning-artifacts/PRD.md)
- UX Spec — Toggle and Delete interaction details: [ux-design-specification.md](../planning-artifacts/ux-design-specification.md)
- Previous story: [3-1 UpdateTodoInput schema + todosRepo.update + PATCH /v1/todos/:id](./3-1-updatetodoinput-schema-todosrepo-update-patch-v1-todos-id.md) — API PATCH contract + UpdateTodoInput type
- Previous story: [3-2 todosRepo.remove + DELETE /v1/todos/:id](./3-2-todosrepo-remove-delete-v1-todos-id.md) — API DELETE contract (204, 404 envelope)
- Previous story: [2-3 Web API client + typed endpoints + useTodos/useCreateTodo](./2-3-web-api-client-typed-endpoints-usetodos-usecreatetodo-hooks.md) — `apiClient.ts`, `api/todos.ts` namespace, wrapperFactory test pattern, mutation test precedent (retry:false, gcTime:0)
- Previous story: [1-6 CI + code-quality gate](./1-6-ci-pipeline-code-quality-gate-eslint-prettier-a11y-playwright-e2e-scaffold-onboarding-readme.md) — `npm run check` + Prettier contract

## Dev Agent Record

### Agent Model Used

Claude Opus 4.7 (1M context)

### Debug Log References

- `npm run typecheck` — clean across both workspaces on first try
- `npm run lint` — only the long-standing `apps/api/src/db/index.ts:14` warning remains
- `npm run format:check` — clean after one `prettier --write` pass on 3 new hook/test files (purely whitespace)
- `npm test --workspace apps/web` — 24 files, 116 tests green (100 → 116, +16 new: 5 factory + 4 toggle + 5 delete + 2 contract)
- `npm test --workspace apps/api` — 96 tests (unchanged, API not touched)
- `npm run check` — exits 0

### Completion Notes List

- **All 9 ACs satisfied.** `UpdateTodoInput` re-exported in `types.ts` (AC2). `api.todos.update` + `api.todos.delete` added (AC1). Factory `useOptimisticTodoMutation` with locked `onMutate/onError/onSettled` three-step pattern (AC3). `useToggleTodo` + `useDeleteTodo` consume the factory with architecture-locked mutation keys and immutable `applyOptimistic` transforms (AC4, AC5). Full test coverage at three layers: factory unit tests via dummy `mutationFn` (AC6), hook unit tests via module-boundary `vi.mock('../api/todos.js', ...)` per epic mandate (AC7, AC8), wire-format contract tests against `fetch` stubs (AC9).
- **One test failure on first pass, fixed with a targeted `gcTime` adjustment.** The factory test "onError restores the snapshot" asserted `queryClient.getQueryData(['todos'])` equals the pre-mutation snapshot, but got `undefined`. Root cause: with `gcTime: 0` on the wrapperFactory's QueryClient, the `['todos']` cache entry has no active observer (no `useQuery` mounted), so when `onSettled` fires `invalidateQueries`, TanStack marks the entry stale and — because there's no observer to keep it alive and `gcTime` has already elapsed — garbage-collects it before the assertion runs. Fix: changed `gcTime: 0` → `gcTime: Infinity` in `useOptimisticTodoMutation.test.tsx`'s wrapperFactory only; added an inline comment explaining the why. The other test files (`useToggleTodo.test.tsx`, `useDeleteTodo.test.tsx`) keep `gcTime: 0` because their assertions don't depend on post-invalidation cache survival — they check spy calls and mutation-result state, not long-lived cache data. Follows the pattern from `useCreateTodo.test.tsx` which also uses `gcTime: 0`.
- **Prettier normalized 3 files** (`useDeleteTodo.ts`, `useDeleteTodo.test.tsx`, `useToggleTodo.test.tsx`) — collapsed some multi-line expressions that fit under `printWidth: 100`. One `prettier --write` pass, no semantic changes, `npm run check` green on the rerun.
- **File-scope discipline held perfectly.** Touched exactly the declared files (`types.ts` + `api/todos.ts`) and created exactly the declared files (3 new hooks + 3 new test files). No changes to `apps/api/`, `apiClient.ts`, `apiClient.test.ts`, or `errors.ts`. No new dependencies. No barrel file. No wiring into any component (that's Story 3.4 / 3.5).
- **Cleaner story than 3.1 or 3.2** — no library-behavior drift, no out-of-scope config changes, no typecheck blips. One isolated `gcTime` adjustment in a test file, rigorously scoped with a comment. Third Epic 3 story, first "no new lessons required" story of the sprint.

### File List

**Extended:**
- `apps/web/src/types.ts` — `UpdateTodoInput` added to the single type-only re-export line; comment updated
- `apps/web/src/api/todos.ts` — `update` and `delete` methods added to the `todos` object literal; import extended with `UpdateTodoInput`
- `apps/web/src/api/todos.test.ts` — two new describe blocks: `api.todos.update` (PATCH wire format) + `api.todos.delete` (DELETE wire format, no body, 204 → undefined)

**New:**
- `apps/web/src/hooks/useOptimisticTodoMutation.ts` — factory with `UseOptimisticTodoMutationOptions` interface + `TodoOptimisticContext` type + locked three-callback implementation
- `apps/web/src/hooks/useToggleTodo.ts` — consumes the factory with `['todos', 'toggle']` key and id-targeted `.map(t => t.id === input.id ? {...t, completed} : t)`
- `apps/web/src/hooks/useDeleteTodo.ts` — consumes the factory with `['todos', 'delete']` key and `.filter(t => t.id !== id)`
- `apps/web/src/hooks/useOptimisticTodoMutation.test.tsx` — 5 factory-behavior tests with dummy `mutationFn` + spied `cancelQueries` / `invalidateQueries` + `gcTime: Infinity` (see Completion Notes)
- `apps/web/src/hooks/useToggleTodo.test.tsx` — 4 tests with module-boundary `vi.mock('../api/todos.js', ...)` per epic mandate (happy path + immutability via `Object.freeze` + error revert + non-matching-id race)
- `apps/web/src/hooks/useDeleteTodo.test.tsx` — 5 tests paralleling the toggle file's structure, substituting filter-based optimistic transform

**Story artifacts:**
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — story 3.3 transitions (ready-for-dev → in-progress → review)
- `_bmad-output/implementation-artifacts/3-3-useoptimistictodomutation-factory-usetoggletodo-usedeletetodo-hooks.md` — this story file

### Change Log

- 2026-04-24 — Implemented Story 3.3: `useOptimisticTodoMutation` factory + `useToggleTodo` + `useDeleteTodo`. All 9 ACs satisfied; 16 new web tests added (5 factory + 4 toggle + 5 delete + 2 wire-format contract); web suite 100 → 116. No API changes. One minor test-infrastructure decision documented: the factory test uses `gcTime: Infinity` (vs the canonical `gcTime: 0`) because it asserts post-invalidation cache-snapshot survival with no active observer.
