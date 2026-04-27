import type { Todo } from '../types.js';
import TodoRow from './TodoRow.js';

interface TodoListProps {
  todos: Todo[];
  onToggle: (id: string, completed: boolean) => void;
  onDeleteRequest: (todo: Todo) => void;
  toggleErrors?: Map<string, { desiredCompleted: boolean; message: string }>;
  onToggleRetry?: (id: string) => void;
  retryingIds?: Set<string>;
}

export default function TodoList({
  todos,
  onToggle,
  onDeleteRequest,
  toggleErrors,
  onToggleRetry,
  retryingIds,
}: TodoListProps) {
  const activeTodos = todos.filter((t) => !t.completed);
  const completedTodos = todos.filter((t) => t.completed);

  const renderRow = (todo: Todo) => {
    const entry = toggleErrors?.get(todo.id);
    const error = entry?.message ?? null;
    const isRetrying = retryingIds?.has(todo.id) ?? false;
    const rowRetry = error && onToggleRetry ? () => onToggleRetry(todo.id) : undefined;
    return (
      <TodoRow
        key={todo.id}
        todo={todo}
        onToggle={onToggle}
        onDeleteRequest={onDeleteRequest}
        error={error}
        onRetry={rowRetry}
        isRetrying={isRetrying}
      />
    );
  };

  return (
    <div>
      <ul className="list-none">{activeTodos.map(renderRow)}</ul>

      {completedTodos.length > 0 && (
        <section className="mt-6">
          <h2 className="text-sm text-[--color-fg-muted] mb-2">Completed</h2>
          <ul className="list-none">{completedTodos.map(renderRow)}</ul>
        </section>
      )}
    </div>
  );
}
