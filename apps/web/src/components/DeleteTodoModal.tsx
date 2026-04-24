import { useEffect, useId, useRef, type ReactElement } from 'react';
import type { Todo } from '../types.js';

interface DeleteTodoModalProps {
  todo: Todo | null;
  onCancel: () => void;
  onConfirm: (todo: Todo) => void;
}

export default function DeleteTodoModal({
  todo,
  onCancel,
  onConfirm,
}: DeleteTodoModalProps): ReactElement | null {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelBtnRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const bodyId = useId();

  useEffect(() => {
    if (!todo) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    // UX DR14 — default focus lands on Cancel (least destructive).
    cancelBtnRef.current?.focus();

    return () => {
      if (dialog.open) {
        dialog.close();
      }
    };
  }, [todo]);

  if (!todo) return null;

  const handleBackdropClick = (event: React.MouseEvent<HTMLDialogElement>) => {
    if (event.target === event.currentTarget) {
      onCancel();
    }
  };

  const handleCancelEvent = (event: React.SyntheticEvent<HTMLDialogElement>) => {
    // Escape fires a native `cancel` event that would default-close the dialog.
    // Prevent that so React state (todoPendingDelete) stays the single source of
    // truth for open/close — avoids a double-close race on the next render.
    event.preventDefault();
    onCancel();
  };

  return (
    // jsx-a11y treats <dialog> as non-interactive, but per the HTML spec (and
    // when opened via .showModal()) it IS an interactive landmark. Keyboard
    // dismissal is already provided by the native Escape → `cancel` event
    // pipeline handled via onCancel above — no redundant onKeyDown needed.
    /* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions */
    <dialog
      ref={dialogRef}
      className="todo-modal rounded-lg shadow-sm max-w-[400px] w-[calc(100vw-32px)] p-6 bg-[var(--color-surface)] backdrop:bg-black/30"
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      onCancel={handleCancelEvent}
      onClick={handleBackdropClick}
    >
      <h2 id={titleId} className="text-lg font-semibold text-[var(--color-fg)]">
        Delete this todo?
      </h2>
      <p id={bodyId} className="mt-2 text-base text-[var(--color-fg)]">
        This cannot be undone.
      </p>
      <div className="mt-6 flex gap-3 justify-end">
        <button
          ref={cancelBtnRef}
          type="button"
          onClick={onCancel}
          className="min-h-[44px] px-4 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-fg)] text-sm font-medium"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => onConfirm(todo)}
          className="min-h-[44px] px-4 rounded-md bg-[var(--color-danger)] text-white text-sm font-medium"
        >
          Delete
        </button>
      </div>
    </dialog>
  );
}
