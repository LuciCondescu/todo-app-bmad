import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App.js';
import { ErrorBoundary } from './components/ErrorBoundary.js';

type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
}

function mountApp() {
  const client = makeClient();
  return render(
    <ErrorBoundary>
      <QueryClientProvider client={client}>
        <App />
      </QueryClientProvider>
    </ErrorBoundary>,
  );
}

describe('<App /> integration — full tree with mocked fetch', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('shows EmptyState when GET /v1/todos returns []', async () => {
    const fetchFn = vi.fn<FetchFn>(
      async () =>
        ({
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => [],
        }) as unknown as Response,
    );
    vi.stubGlobal('fetch', fetchFn);
    mountApp();
    await waitFor(() => expect(screen.queryByLabelText('Loading your todos')).toBeNull());
    expect(screen.getByText('No todos yet.')).toBeInTheDocument();
  });

  it('renders TodoList with 2 rows when GET /v1/todos returns 2 todos', async () => {
    const todos = [
      {
        id: '01',
        description: 'Buy milk',
        completed: false,
        createdAt: '2026-04-20T10:00:00.000Z',
        userId: null,
      },
      {
        id: '02',
        description: 'Read book',
        completed: false,
        createdAt: '2026-04-20T10:00:01.000Z',
        userId: null,
      },
    ];
    const fetchFn = vi.fn<FetchFn>(
      async () =>
        ({
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => todos,
        }) as unknown as Response,
    );
    vi.stubGlobal('fetch', fetchFn);
    mountApp();
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(2));
    expect(screen.getByText('Buy milk')).toBeInTheDocument();
    expect(screen.getByText('Read book')).toBeInTheDocument();
  });

  it('create-then-refetch: typed todo appears after POST + invalidation', async () => {
    const user = userEvent.setup();
    const newTodo = {
      id: '01',
      description: 'Buy milk',
      completed: false,
      createdAt: '2026-04-20T10:00:00.000Z',
      userId: null,
    };
    let state: 'initial' | 'after-post' = 'initial';
    const fetchFn = vi.fn<FetchFn>(async (_url, init) => {
      if (init?.method === 'POST') {
        // Yield to the event loop so React can commit the mutation's
        // isPending=true state before the POST resolves. Without this, React
        // auto-batching can coalesce isPending: false→true→false into a single
        // commit, and AddTodoInput's clear-and-refocus effect (which requires
        // observing disabled=true in a prior render) never fires.
        await new Promise((resolve) => setTimeout(resolve, 0));
        state = 'after-post';
        return {
          ok: true,
          status: 201,
          statusText: 'Created',
          json: async () => newTodo,
        } as unknown as Response;
      }
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => (state === 'after-post' ? [newTodo] : []),
      } as unknown as Response;
    });
    vi.stubGlobal('fetch', fetchFn);
    mountApp();
    await waitFor(() => expect(screen.getByText('No todos yet.')).toBeInTheDocument());
    const input = screen.getByRole('textbox', { name: 'Add a todo' }) as HTMLInputElement;
    await user.type(input, 'Buy milk{Enter}');
    // One waitFor encompassing all post-settle assertions: the row appears in the list,
    // AddTodoInput clears, and focus returns to the input. Combining lets React
    // flush the mutation's isPending true→false transition + the invalidation refetch
    // + AddTodoInput's clear-and-refocus effect across multiple render cycles.
    await waitFor(
      () => {
        expect(screen.getByText('Buy milk')).toBeInTheDocument();
        expect(input.value).toBe('');
        expect(input).toHaveFocus();
      },
      { timeout: 3000 },
    );
  });

  it('create failure: error region shown, typed text preserved, no new row', async () => {
    const user = userEvent.setup();
    const fetchFn = vi.fn<FetchFn>(async (_url, init) => {
      if (init?.method === 'POST') {
        return {
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
          json: async () => ({
            statusCode: 500,
            error: 'Internal Server Error',
            message: 'boom',
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
    mountApp();
    await waitFor(() => expect(screen.getByText('No todos yet.')).toBeInTheDocument());
    const input = screen.getByRole('textbox', { name: 'Add a todo' }) as HTMLInputElement;
    await user.type(input, 'Buy milk{Enter}');
    await waitFor(() => {
      const alert = screen.getByRole('alert');
      expect(alert).toHaveTextContent('boom');
    });
    expect(input.value).toBe('Buy milk');
    // The EmptyState copy is still present — no new row appeared in the list.
    expect(screen.getByText('No todos yet.')).toBeInTheDocument();
  });

  it('toggle active→completed renders optimistically and persists after refetch', async () => {
    const user = userEvent.setup();
    const T1 = {
      id: '01',
      description: 'Buy milk',
      completed: false,
      createdAt: '2026-04-20T10:00:00.000Z',
      userId: null,
    };
    const T2 = {
      id: '02',
      description: 'Read book',
      completed: false,
      createdAt: '2026-04-20T10:00:01.000Z',
      userId: null,
    };
    let patchResolved = false;
    const fetchFn = vi.fn<FetchFn>(async (_url, init) => {
      if (init?.method === 'PATCH') {
        patchResolved = true;
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => ({ ...T1, completed: true }),
        } as unknown as Response;
      }
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => (patchResolved ? [{ ...T1, completed: true }, T2] : [T1, T2]),
      } as unknown as Response;
    });
    vi.stubGlobal('fetch', fetchFn);
    mountApp();
    await waitFor(() => expect(screen.getByText('Buy milk')).toBeInTheDocument());

    const firstCheckbox = screen.getByLabelText('Mark complete: Buy milk');
    await user.click(firstCheckbox);

    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 2, name: 'Completed' })).toBeInTheDocument(),
    );
    expect(screen.getByLabelText('Mark incomplete: Buy milk')).toBeInTheDocument();

    const patchCall = fetchFn.mock.calls.find((c) => (c[1] as RequestInit).method === 'PATCH');
    expect(patchCall).toBeDefined();
    expect(patchCall![0]).toContain('/v1/todos/01');
    expect((patchCall![1] as RequestInit).body).toBe(JSON.stringify({ completed: true }));
  });

  it('toggle completed→active moves the row back to the Active section', async () => {
    const user = userEvent.setup();
    const T1 = {
      id: '01',
      description: 'Buy milk',
      completed: true,
      createdAt: '2026-04-20T10:00:00.000Z',
      userId: null,
    };
    let patchResolved = false;
    const fetchFn = vi.fn<FetchFn>(async (_url, init) => {
      if (init?.method === 'PATCH') {
        patchResolved = true;
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => ({ ...T1, completed: false }),
        } as unknown as Response;
      }
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => (patchResolved ? [{ ...T1, completed: false }] : [T1]),
      } as unknown as Response;
    });
    vi.stubGlobal('fetch', fetchFn);
    mountApp();
    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 2, name: 'Completed' })).toBeInTheDocument(),
    );

    const checkbox = screen.getByLabelText('Mark incomplete: Buy milk');
    await user.click(checkbox);

    await waitFor(() => {
      expect(screen.queryByRole('heading', { level: 2, name: 'Completed' })).toBeNull();
    });
    expect(screen.getByLabelText('Mark complete: Buy milk')).toBeInTheDocument();
  });

  it('clicking a row delete icon opens the modal with Cancel focused', async () => {
    const user = userEvent.setup();
    const T1 = {
      id: '01',
      description: 'Delete me',
      completed: false,
      createdAt: '2026-04-20T10:00:00.000Z',
      userId: null,
    };
    const fetchFn = vi.fn<FetchFn>(
      async () =>
        ({
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => [T1],
        }) as unknown as Response,
    );
    vi.stubGlobal('fetch', fetchFn);
    mountApp();
    await waitFor(() => expect(screen.getByText('Delete me')).toBeInTheDocument());

    await user.click(screen.getByLabelText('Delete todo: Delete me'));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Delete this todo?' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus());
  });

  it('clicking Delete removes the row and closes the modal (DELETE fetch fired)', async () => {
    const user = userEvent.setup();
    const T1 = {
      id: '01',
      description: 'Delete me',
      completed: false,
      createdAt: '2026-04-20T10:00:00.000Z',
      userId: null,
    };
    let deleted = false;
    const fetchFn = vi.fn<FetchFn>(async (_url, init) => {
      if (init?.method === 'DELETE') {
        deleted = true;
        return {
          ok: true,
          status: 204,
          statusText: 'No Content',
        } as unknown as Response;
      }
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => (deleted ? [] : [T1]),
      } as unknown as Response;
    });
    vi.stubGlobal('fetch', fetchFn);
    mountApp();
    await waitFor(() => expect(screen.getByText('Delete me')).toBeInTheDocument());

    await user.click(screen.getByLabelText('Delete todo: Delete me'));
    await user.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(screen.queryByText('Delete me')).toBeNull());
    expect(screen.queryByRole('dialog')).toBeNull();

    const deleteCall = fetchFn.mock.calls.find((c) => (c[1] as RequestInit).method === 'DELETE');
    expect(deleteCall).toBeDefined();
    expect(deleteCall![0]).toContain('/v1/todos/01');
  });

  it('Escape (cancel event) closes the modal without firing DELETE', async () => {
    const user = userEvent.setup();
    const T1 = {
      id: '01',
      description: 'Keep me',
      completed: false,
      createdAt: '2026-04-20T10:00:00.000Z',
      userId: null,
    };
    const fetchFn = vi.fn<FetchFn>(
      async () =>
        ({
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => [T1],
        }) as unknown as Response,
    );
    vi.stubGlobal('fetch', fetchFn);
    mountApp();
    await waitFor(() => expect(screen.getByText('Keep me')).toBeInTheDocument());

    await user.click(screen.getByLabelText('Delete todo: Keep me'));
    const dialog = screen.getByRole('dialog');
    fireEvent(dialog, new Event('cancel', { cancelable: true, bubbles: true }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByText('Keep me')).toBeInTheDocument();

    const deleteCalls = fetchFn.mock.calls.filter((c) => (c[1] as RequestInit).method === 'DELETE');
    expect(deleteCalls).toHaveLength(0);
  });

  it('Cancel button closes the modal without firing DELETE', async () => {
    const user = userEvent.setup();
    const T1 = {
      id: '01',
      description: 'Keep me',
      completed: false,
      createdAt: '2026-04-20T10:00:00.000Z',
      userId: null,
    };
    const fetchFn = vi.fn<FetchFn>(
      async () =>
        ({
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => [T1],
        }) as unknown as Response,
    );
    vi.stubGlobal('fetch', fetchFn);
    mountApp();
    await waitFor(() => expect(screen.getByText('Keep me')).toBeInTheDocument());

    await user.click(screen.getByLabelText('Delete todo: Keep me'));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByText('Keep me')).toBeInTheDocument();

    const deleteCalls = fetchFn.mock.calls.filter((c) => (c[1] as RequestInit).method === 'DELETE');
    expect(deleteCalls).toHaveLength(0);
  });

  it('toggle failure reverts the row to its prior state (invalidation refetch authoritative)', async () => {
    const user = userEvent.setup();
    const T1 = {
      id: '01',
      description: 'Buy milk',
      completed: false,
      createdAt: '2026-04-20T10:00:00.000Z',
      userId: null,
    };
    const fetchFn = vi.fn<FetchFn>(async (_url, init) => {
      if (init?.method === 'PATCH') {
        return {
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
          json: async () => ({
            statusCode: 500,
            error: 'Internal Server Error',
            message: 'boom',
          }),
        } as unknown as Response;
      }
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => [T1],
      } as unknown as Response;
    });
    vi.stubGlobal('fetch', fetchFn);
    mountApp();
    await waitFor(() => expect(screen.getByText('Buy milk')).toBeInTheDocument());

    const checkbox = screen.getByLabelText('Mark complete: Buy milk');
    await user.click(checkbox);

    // After settle (error + invalidation refetch), the row is back in Active.
    await waitFor(() => {
      expect(screen.queryByRole('heading', { level: 2, name: 'Completed' })).toBeNull();
    });
    expect(screen.getByLabelText('Mark complete: Buy milk')).toBeInTheDocument();
  });
});
