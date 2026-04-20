import type { Todo } from '../types.js';
import TodoRow from './TodoRow.js';

interface TodoListProps {
  todos: Todo[];
  onToggle: (id: string, completed: boolean) => void;
  onDeleteRequest: (todo: Todo) => void;
}

export default function TodoList({ todos, onToggle, onDeleteRequest }: TodoListProps) {
  const activeTodos = todos.filter((t) => !t.completed);
  return (
    <ul className="list-none">
      {activeTodos.map((todo) => (
        <TodoRow key={todo.id} todo={todo} onToggle={onToggle} onDeleteRequest={onDeleteRequest} />
      ))}
    </ul>
  );
}
