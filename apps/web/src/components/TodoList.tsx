import type { Todo } from '../types.js';
import TodoRow from './TodoRow.js';

interface TodoListProps {
  todos: Todo[];
  onToggle: (id: string, completed: boolean) => void;
  onDeleteRequest: (todo: Todo) => void;
}

export default function TodoList({ todos, onToggle, onDeleteRequest }: TodoListProps) {
  const activeTodos = todos.filter((t) => !t.completed);
  const completedTodos = todos.filter((t) => t.completed);

  return (
    <div>
      <ul className="list-none">
        {activeTodos.map((todo) => (
          <TodoRow
            key={todo.id}
            todo={todo}
            onToggle={onToggle}
            onDeleteRequest={onDeleteRequest}
          />
        ))}
      </ul>

      {completedTodos.length > 0 && (
        <section className="mt-6">
          <h2 className="text-sm text-[--color-fg-muted] mb-2">Completed</h2>
          <ul className="list-none">
            {completedTodos.map((todo) => (
              <TodoRow
                key={todo.id}
                todo={todo}
                onToggle={onToggle}
                onDeleteRequest={onDeleteRequest}
              />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
