import { useCallback, useRef, useState } from 'react';
import type { Todo } from './types.js';
import Header from './components/Header.js';
import AddTodoInput from './components/AddTodoInput.js';
import TodoList from './components/TodoList.js';
import LoadingSkeleton from './components/LoadingSkeleton.js';
import EmptyState from './components/EmptyState.js';
import DeleteTodoModal from './components/DeleteTodoModal.js';
import { useTodos } from './hooks/useTodos.js';
import { useCreateTodo } from './hooks/useCreateTodo.js';
import { useToggleTodo } from './hooks/useToggleTodo.js';
import { useDeleteTodo } from './hooks/useDeleteTodo.js';

export default function App() {
  const { data, isPending, isError } = useTodos();
  const createMutation = useCreateTodo();
  const { mutate: toggleMutate } = useToggleTodo();
  const { mutate: deleteMutate } = useDeleteTodo();

  const [todoPendingDelete, setTodoPendingDelete] = useState<Todo | null>(null);
  const [lastCreateAttempt, setLastCreateAttempt] = useState<string | null>(null);
  const deleteTriggerRef = useRef<HTMLElement | null>(null);

  const handleCreate = useCallback(
    (description: string) => {
      setLastCreateAttempt(description);
      createMutation.mutate(description, {
        onSuccess: () => setLastCreateAttempt(null),
      });
    },
    [createMutation],
  );

  const handleRetry = useCallback(() => {
    if (lastCreateAttempt !== null) {
      createMutation.mutate(lastCreateAttempt, {
        onSuccess: () => setLastCreateAttempt(null),
      });
    }
  }, [createMutation, lastCreateAttempt]);

  const handleToggle = useCallback(
    (id: string, completed: boolean) => toggleMutate({ id, completed }),
    [toggleMutate],
  );

  const handleDeleteRequest = useCallback((todo: Todo) => {
    // Capture the currently-focused element (the clicked delete icon) so we can
    // restore focus on Cancel / Escape / backdrop dismissal.
    deleteTriggerRef.current = document.activeElement as HTMLElement | null;
    setTodoPendingDelete(todo);
  }, []);

  const handleCancel = useCallback(() => {
    setTodoPendingDelete(null);
    queueMicrotask(() => {
      // Restore focus after React unmounts the modal and the dialog's focus-trap
      // releases. queueMicrotask suffices because React's commit phase flushes
      // before microtasks.
      deleteTriggerRef.current?.focus();
    });
  }, []);

  const handleConfirmDelete = useCallback(
    (todo: Todo) => {
      deleteMutate(todo.id);
      setTodoPendingDelete(null);
      // The triggering row is optimistically removed; the delete icon is detached
      // from the DOM, so focus falls to document.body. Epic 4 may revisit focus
      // routing (e.g., to AddTodoInput) — acceptable per epic's "sensible landing
      // spot" wording.
    },
    [deleteMutate],
  );

  return (
    <div className="max-w-xl mx-auto px-4 pt-8 lg:pt-16">
      <Header />
      <main>
        <AddTodoInput
          onSubmit={handleCreate}
          disabled={createMutation.isPending}
          error={createMutation.isError ? "Couldn't save. Check your connection." : null}
          onRetry={createMutation.isError && lastCreateAttempt !== null ? handleRetry : undefined}
          isRetrying={createMutation.isPending}
        />
        <div className="mt-6">
          {renderListArea({
            data,
            isPending,
            isError,
            onToggle: handleToggle,
            onDeleteRequest: handleDeleteRequest,
          })}
        </div>
      </main>
      <DeleteTodoModal
        todo={todoPendingDelete}
        onCancel={handleCancel}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}

function renderListArea({
  data,
  isPending,
  isError,
  onToggle,
  onDeleteRequest,
}: {
  data: Todo[] | undefined;
  isPending: boolean;
  isError: boolean;
  onToggle: (id: string, completed: boolean) => void;
  onDeleteRequest: (todo: Todo) => void;
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
  return <TodoList todos={data} onToggle={onToggle} onDeleteRequest={onDeleteRequest} />;
}
