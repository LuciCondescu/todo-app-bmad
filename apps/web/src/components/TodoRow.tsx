import { memo } from 'react';
import type { Todo } from '../types.js';
import InlineError from './InlineError.js';

interface TodoRowProps {
  todo: Todo;
  onToggle: (id: string, completed: boolean) => void;
  onDeleteRequest: (todo: Todo) => void;
  isMutating?: boolean;
  error?: string | null;
  onRetry?: () => void;
  isRetrying?: boolean;
}

function TodoRowImpl({
  todo,
  onToggle,
  onDeleteRequest,
  isMutating = false,
  error = null,
  onRetry,
  isRetrying = false,
}: TodoRowProps) {
  const checkboxLabel = todo.completed
    ? `Mark incomplete: ${todo.description}`
    : `Mark complete: ${todo.description}`;

  return (
    <li className="flex flex-col border-b border-[--color-border]">
      <div className="flex items-center gap-3 py-3 md:py-4 px-2">
        <span
          className="inline-flex items-center justify-center min-w-[44px] min-h-[44px]"
          aria-busy={isMutating ? 'true' : undefined}
        >
          <input
            type="checkbox"
            checked={todo.completed}
            disabled={isMutating}
            aria-label={checkboxLabel}
            onChange={(e) => onToggle(todo.id, e.target.checked)}
          />
        </span>
        <span
          className={`flex-1 text-base break-words transition-[opacity,text-decoration-color] duration-200 ease-out${
            todo.completed ? ' line-through opacity-60' : ''
          }`}
        >
          {todo.description}
        </span>
        <button
          type="button"
          disabled={isMutating}
          aria-label={`Delete todo: ${todo.description}`}
          onClick={() => onDeleteRequest(todo)}
          className="inline-flex items-center justify-center min-w-[44px] min-h-[44px] text-[--color-fg-muted] rounded-md"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            width="18"
            height="18"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 6h18" />
            <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
            <path d="M10 11v6" />
            <path d="M14 11v6" />
          </svg>
        </button>
      </div>
      {error && error.length > 0 ? (
        <div className="pb-3 md:pb-4 px-2">
          <InlineError message={error} onRetry={onRetry} isRetrying={isRetrying} />
        </div>
      ) : null}
    </li>
  );
}

export default memo(TodoRowImpl);
