import { useEffect, useRef, useState, type FormEvent } from 'react';
import { MAX_DESCRIPTION_LENGTH } from '../lib/constants.js';
import InlineError from './InlineError.js';

interface AddTodoInputProps {
  onSubmit: (description: string) => void;
  disabled?: boolean;
  error?: string | null;
  onRetry?: () => void;
  isRetrying?: boolean;
}

export default function AddTodoInput({
  onSubmit,
  disabled = false,
  error = null,
  onRetry,
  isRetrying = false,
}: AddTodoInputProps) {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const wasDisabledRef = useRef(false);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (wasDisabledRef.current && !disabled && !error) {
      setValue('');
      inputRef.current?.focus();
    }
    wasDisabledRef.current = disabled;
  }, [disabled, error]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled) return;
    if (value.trim().length === 0) return;
    onSubmit(value);
  }

  return (
    <div>
      <form onSubmit={handleSubmit} className="flex gap-2 items-stretch flex-wrap">
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          maxLength={MAX_DESCRIPTION_LENGTH}
          autoComplete="off"
          aria-label="Add a todo"
          placeholder="What needs doing?"
          className="flex-1 min-h-[44px] px-3 py-2 border border-[--color-border] rounded-md bg-[--color-surface] text-base"
        />
        <button
          type="submit"
          disabled={disabled}
          aria-busy={disabled ? 'true' : undefined}
          className="min-h-[44px] min-w-[64px] px-4 rounded-md bg-[--color-accent] text-white font-medium disabled:opacity-60 disabled:cursor-not-allowed"
        >
          Add
        </button>
      </form>
      {error ? (
        <div className="mt-2">
          <InlineError message={error} onRetry={onRetry} isRetrying={isRetrying} />
        </div>
      ) : null}
    </div>
  );
}
