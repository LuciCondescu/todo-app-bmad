import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DeleteTodoModal from './DeleteTodoModal.js';
import type { Todo } from '../types.js';

const todoFixture: Todo = {
  id: '01-modal-test',
  description: 'Buy milk',
  completed: false,
  userId: null,
  createdAt: '2026-04-20T12:00:00.000Z',
};

describe('<DeleteTodoModal />', () => {
  it('renders nothing when todo is null', () => {
    const { container } = render(
      <DeleteTodoModal todo={null} onCancel={vi.fn()} onConfirm={vi.fn()} />,
    );
    expect(container.querySelector('dialog')).toBeNull();
  });

  it('renders the dialog with locked copy when a todo is provided', () => {
    render(<DeleteTodoModal todo={todoFixture} onCancel={vi.fn()} onConfirm={vi.fn()} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Delete this todo?' })).toBeInTheDocument();
    expect(screen.getByText('This cannot be undone.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
  });

  it('links aria-labelledby and aria-describedby to real DOM elements', () => {
    const { container } = render(
      <DeleteTodoModal todo={todoFixture} onCancel={vi.fn()} onConfirm={vi.fn()} />,
    );
    const dialog = screen.getByRole('dialog');
    const labelledBy = dialog.getAttribute('aria-labelledby');
    const describedBy = dialog.getAttribute('aria-describedby');
    expect(labelledBy).not.toBeNull();
    expect(describedBy).not.toBeNull();
    // useId() returns values with a leading `:` / `꞉` which are not valid CSS selector
    // fragments; use [id="..."] instead of `#...`.
    const title = container.querySelector(`[id="${labelledBy!}"]`);
    const body = container.querySelector(`[id="${describedBy!}"]`);
    expect(title).toHaveTextContent('Delete this todo?');
    expect(body).toHaveTextContent('This cannot be undone.');
  });

  it('moves initial focus to the Cancel button on open', async () => {
    render(<DeleteTodoModal todo={todoFixture} onCancel={vi.fn()} onConfirm={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus());
  });

  it('fires onCancel when the dialog emits a cancel event (Escape pressed)', () => {
    const onCancel = vi.fn();
    render(<DeleteTodoModal todo={todoFixture} onCancel={onCancel} onConfirm={vi.fn()} />);
    const dialog = screen.getByRole('dialog');
    fireEvent(dialog, new Event('cancel', { cancelable: true, bubbles: true }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('fires onCancel when the dialog element itself is clicked (backdrop)', () => {
    const onCancel = vi.fn();
    render(<DeleteTodoModal todo={todoFixture} onCancel={onCancel} onConfirm={vi.fn()} />);
    const dialog = screen.getByRole('dialog');
    fireEvent.click(dialog);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('does NOT fire onCancel when clicking interior content (e.g., the heading)', () => {
    const onCancel = vi.fn();
    render(<DeleteTodoModal todo={todoFixture} onCancel={onCancel} onConfirm={vi.fn()} />);
    const heading = screen.getByRole('heading', { name: 'Delete this todo?' });
    fireEvent.click(heading);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('fires onConfirm(todo) with the full todo object when Delete is clicked', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<DeleteTodoModal todo={todoFixture} onCancel={vi.fn()} onConfirm={onConfirm} />);
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith(todoFixture);
  });

  it('Cancel and Delete buttons both carry min-h-[44px] and font-medium (UX DR11)', () => {
    render(<DeleteTodoModal todo={todoFixture} onCancel={vi.fn()} onConfirm={vi.fn()} />);
    const cancel = screen.getByRole('button', { name: 'Cancel' });
    const del = screen.getByRole('button', { name: 'Delete' });
    expect(cancel).toHaveClass('min-h-[44px]', 'font-medium');
    expect(del).toHaveClass('min-h-[44px]', 'font-medium');
  });

  it('renders InlineError in place of body text when error prop is set', () => {
    render(
      <DeleteTodoModal
        todo={todoFixture}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
        error="Couldn't delete. Check your connection."
      />,
    );
    const alert = screen.getByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveTextContent("Couldn't delete. Check your connection.");
    expect(screen.queryByText('This cannot be undone.')).toBeNull();
  });

  it('Delete button label flips to "Retry" in error state, with Danger variant retained', () => {
    render(
      <DeleteTodoModal
        todo={todoFixture}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
        error="Couldn't delete. Check your connection."
      />,
    );
    const retry = screen.getByRole('button', { name: 'Retry' });
    expect(retry).toBeInTheDocument();
    expect(retry).toHaveClass('bg-[var(--color-danger)]');
    // Original "Delete" label is gone in error state.
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
  });

  it('isDeleting disables the Delete/Retry button and sets aria-busy; Cancel stays enabled', () => {
    const { rerender } = render(
      <DeleteTodoModal
        todo={todoFixture}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
        isDeleting={true}
      />,
    );
    const del = screen.getByRole('button', { name: 'Delete' }) as HTMLButtonElement;
    const cancel = screen.getByRole('button', { name: 'Cancel' }) as HTMLButtonElement;
    expect(del).toBeDisabled();
    expect(del).toHaveAttribute('aria-busy', 'true');
    expect(cancel).not.toBeDisabled();

    rerender(
      <DeleteTodoModal
        todo={todoFixture}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
        error="Couldn't delete. Check your connection."
        isDeleting={true}
      />,
    );
    const retry = screen.getByRole('button', { name: 'Retry' }) as HTMLButtonElement;
    const cancel2 = screen.getByRole('button', { name: 'Cancel' }) as HTMLButtonElement;
    expect(retry).toBeDisabled();
    expect(retry).toHaveAttribute('aria-busy', 'true');
    expect(cancel2).not.toBeDisabled();
  });

  it('Cancel button remains enabled in error state and still fires onCancel on click', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(
      <DeleteTodoModal
        todo={todoFixture}
        onCancel={onCancel}
        onConfirm={vi.fn()}
        error="Couldn't delete. Check your connection."
        isDeleting={false}
      />,
    );
    const cancel = screen.getByRole('button', { name: 'Cancel' }) as HTMLButtonElement;
    expect(cancel).not.toBeDisabled();
    await user.click(cancel);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('aria-describedby on <dialog> still points at a real node when body is replaced', () => {
    const { container } = render(
      <DeleteTodoModal
        todo={todoFixture}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
        error="Couldn't delete. Check your connection."
      />,
    );
    const dialog = screen.getByRole('dialog');
    const describedBy = dialog.getAttribute('aria-describedby');
    expect(describedBy).not.toBeNull();
    const body = container.querySelector(`[id="${describedBy!}"]`);
    expect(body).not.toBeNull();
    expect(body).toContainElement(screen.getByRole('alert'));
  });
});
