import type { Todo } from './types.js';
import Header from './components/Header.js';
import AddTodoInput from './components/AddTodoInput.js';
import TodoList from './components/TodoList.js';
import LoadingSkeleton from './components/LoadingSkeleton.js';
import EmptyState from './components/EmptyState.js';
import { useTodos } from './hooks/useTodos.js';
import { useCreateTodo } from './hooks/useCreateTodo.js';

// Epic 3 replaces these with real handlers from useToggleTodo / useDeleteTodo (Stories 3.3, 3.5).
function noopToggle(_id: string, _completed: boolean): void {}
function noopDeleteRequest(_todo: Todo): void {}

export default function App() {
  const { data, isPending, isError } = useTodos();
  const createMutation = useCreateTodo();

  return (
    <div className="max-w-xl mx-auto px-4 pt-8 lg:pt-16">
      <Header />
      <main>
        <AddTodoInput
          onSubmit={createMutation.mutate}
          disabled={createMutation.isPending}
          error={createMutation.error?.message ?? null}
        />
        <div className="mt-6">{renderListArea({ data, isPending, isError })}</div>
      </main>
    </div>
  );
}

function renderListArea({
  data,
  isPending,
  isError,
}: {
  data: Todo[] | undefined;
  isPending: boolean;
  isError: boolean;
}) {
  if (isPending) return <LoadingSkeleton />;
  if (isError) {
    // Minimal error region — replaced by <InlineError /> with Retry in Epic 4 (Story 4.1).
    return (
      <div
        role="alert"
        aria-live="polite"
        className="text-[--color-danger] text-sm py-12 text-center"
      >
        Couldn&apos;t load your todos.
      </div>
    );
  }
  if (!data || data.length === 0) return <EmptyState />;
  return <TodoList todos={data} onToggle={noopToggle} onDeleteRequest={noopDeleteRequest} />;
}
