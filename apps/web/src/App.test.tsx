import { beforeEach, describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App.js';
import { ErrorBoundary } from './components/ErrorBoundary.js';
import { ApiError } from './api/errors.js';

vi.mock('./hooks/useTodos.js', () => ({ useTodos: vi.fn() }));
vi.mock('./hooks/useCreateTodo.js', () => ({ useCreateTodo: vi.fn() }));
vi.mock('./hooks/useToggleTodo.js', () => ({ useToggleTodo: vi.fn() }));
vi.mock('./hooks/useDeleteTodo.js', () => ({ useDeleteTodo: vi.fn() }));

const { useTodos } = await import('./hooks/useTodos.js');
const { useCreateTodo } = await import('./hooks/useCreateTodo.js');
const { useToggleTodo } = await import('./hooks/useToggleTodo.js');
const { useDeleteTodo } = await import('./hooks/useDeleteTodo.js');

const useTodosMock = vi.mocked(useTodos);
const useCreateTodoMock = vi.mocked(useCreateTodo);
const useToggleTodoMock = vi.mocked(useToggleTodo);
const useDeleteTodoMock = vi.mocked(useDeleteTodo);

function stubMutation(overrides: Partial<ReturnType<typeof useCreateTodo>> = {}) {
  return {
    mutate: vi.fn(),
    isPending: false,
    error: null,
    ...overrides,
  } as unknown as ReturnType<typeof useCreateTodo>;
}

function stubToggleMutation() {
  return {
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
    isPending: false,
    error: null,
  } as unknown as ReturnType<typeof useToggleTodo>;
}

function stubDeleteMutation() {
  return {
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
    isPending: false,
    error: null,
  } as unknown as ReturnType<typeof useDeleteTodo>;
}

describe('<App /> mounted in the full provider tree', () => {
  beforeEach(() => {
    // Real-provider-tree test doesn't mock the hooks; reset to default stub behavior
    // so the mock factory returns a usable shape when this test runs.
    useTodosMock.mockReturnValue({
      isPending: true,
      data: undefined,
      isError: false,
    } as unknown as ReturnType<typeof useTodos>);
    useCreateTodoMock.mockReturnValue(stubMutation());
    useToggleTodoMock.mockReturnValue(stubToggleMutation());
    useDeleteTodoMock.mockReturnValue(stubDeleteMutation());
  });

  it('mounts without error and renders the Header', () => {
    const qc = new QueryClient();
    render(
      <ErrorBoundary>
        <QueryClientProvider client={qc}>
          <App />
        </QueryClientProvider>
      </ErrorBoundary>,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Todos' })).toBeInTheDocument();
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('main')).toBeInTheDocument();
  });
});

describe('<App /> list-area render policy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useCreateTodoMock.mockReturnValue(stubMutation());
    useToggleTodoMock.mockReturnValue(stubToggleMutation());
    useDeleteTodoMock.mockReturnValue(stubDeleteMutation());
  });

  it('renders LoadingSkeleton while useTodos is pending', () => {
    useTodosMock.mockReturnValue({
      isPending: true,
      data: undefined,
      isError: false,
    } as unknown as ReturnType<typeof useTodos>);
    render(<App />);
    expect(screen.getByLabelText('Loading your todos')).toBeInTheDocument();
    expect(screen.queryByText('No todos yet.')).toBeNull();
  });

  it('renders EmptyState when data is an empty array', () => {
    useTodosMock.mockReturnValue({
      isPending: false,
      data: [],
      isError: false,
    } as unknown as ReturnType<typeof useTodos>);
    render(<App />);
    expect(screen.getByText('No todos yet.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Loading your todos')).toBeNull();
  });

  it('renders TodoList with 2 rows when data has 2 todos', () => {
    const todoA = {
      id: 't-a',
      description: 'Buy milk',
      completed: false,
      createdAt: '2026-04-20T10:00:00.000Z',
      userId: null,
    };
    const todoB = { ...todoA, id: 't-b', description: 'Read book' };
    useTodosMock.mockReturnValue({
      isPending: false,
      data: [todoA, todoB],
      isError: false,
    } as unknown as ReturnType<typeof useTodos>);
    render(<App />);
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByText('Buy milk')).toBeInTheDocument();
    expect(screen.getByText('Read book')).toBeInTheDocument();
  });

  it('renders minimal error fallback when useTodos is in error state', () => {
    useTodosMock.mockReturnValue({
      isPending: false,
      data: undefined,
      isError: true,
      error: new ApiError(500, 'boom'),
    } as unknown as ReturnType<typeof useTodos>);
    render(<App />);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent("Couldn't load your todos.");
  });

  it('outermost <div> has the layout container classes', () => {
    useTodosMock.mockReturnValue({
      isPending: false,
      data: [],
      isError: false,
    } as unknown as ReturnType<typeof useTodos>);
    const { container } = render(<App />);
    const root = container.firstElementChild;
    expect(root).toHaveClass('max-w-xl', 'mx-auto', 'px-4', 'pt-8', 'lg:pt-16');
  });

  it('AddTodoInput reflects create mutation state: disabled + locked-copy error (raw server text never leaks)', () => {
    useTodosMock.mockReturnValue({
      isPending: false,
      data: [],
      isError: false,
    } as unknown as ReturnType<typeof useTodos>);
    useCreateTodoMock.mockReturnValue(
      stubMutation({
        isPending: true,
        isError: true,
        error: new ApiError(400, 'too long'),
      } as unknown as Partial<ReturnType<typeof useCreateTodo>>),
    );
    render(<App />);
    const addButton = screen.getByRole('button', { name: 'Add' }) as HTMLButtonElement;
    expect(addButton).toBeDisabled();
    const alert = screen.getByRole('alert');
    // Story 4.2 AC5: raw server text ("too long") must never appear; only the locked copy.
    expect(alert).toHaveTextContent("Couldn't save. Check your connection.");
    expect(alert).not.toHaveTextContent('too long');
  });
});
