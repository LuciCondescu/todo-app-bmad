import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TodoRow from './TodoRow.js';
import type { Todo } from '../types.js';

function renderRow(overrides: Partial<React.ComponentProps<typeof TodoRow>> = {}) {
  const todo: Todo = {
    id: '01-test-uuid',
    description: 'Buy milk',
    completed: false,
    userId: null,
    createdAt: '2026-04-20T12:00:00.000Z',
    ...overrides.todo,
  };
  const onToggle = overrides.onToggle ?? vi.fn();
  const onDeleteRequest = overrides.onDeleteRequest ?? vi.fn();
  const isMutating = overrides.isMutating;
  const result = render(
    <ul>
      <TodoRow
        todo={todo}
        onToggle={onToggle}
        onDeleteRequest={onDeleteRequest}
        isMutating={isMutating}
      />
    </ul>,
  );
  return { ...result, todo, onToggle, onDeleteRequest };
}

describe('<TodoRow />', () => {
  it('renders <li> root with flex row layout and border', () => {
    const { container } = renderRow();
    const li = container.querySelector('li');
    expect(li).not.toBeNull();
    expect(li).toHaveClass('flex', 'items-center', 'gap-3', 'py-3', 'border-b');
  });

  it('checkbox aria-label reads "Mark complete: <desc>" when todo is active', () => {
    renderRow({ todo: { description: 'Buy milk', completed: false } as Todo });
    expect(screen.getByRole('checkbox')).toHaveAttribute('aria-label', 'Mark complete: Buy milk');
  });

  it('checkbox aria-label reads "Mark incomplete: <desc>" when todo is completed', () => {
    renderRow({ todo: { description: 'Buy milk', completed: true } as Todo });
    expect(screen.getByRole('checkbox')).toHaveAttribute('aria-label', 'Mark incomplete: Buy milk');
  });

  it('delete button aria-label reads "Delete todo: <desc>"', () => {
    renderRow();
    expect(screen.getByRole('button', { name: 'Delete todo: Buy milk' })).toBeInTheDocument();
  });

  it('clicking the checkbox (active todo) calls onToggle(id, true) exactly once', async () => {
    const user = userEvent.setup();
    const { onToggle, todo } = renderRow();
    await user.click(screen.getByRole('checkbox'));
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onToggle).toHaveBeenCalledWith(todo.id, true);
  });

  it('clicking the checkbox (completed todo) calls onToggle(id, false) exactly once', async () => {
    const user = userEvent.setup();
    const { onToggle, todo } = renderRow({ todo: { completed: true } as Todo });
    await user.click(screen.getByRole('checkbox'));
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onToggle).toHaveBeenCalledWith(todo.id, false);
  });

  it('clicking the delete button calls onDeleteRequest(todo) with the full todo object', async () => {
    const user = userEvent.setup();
    const { onDeleteRequest, todo } = renderRow();
    await user.click(screen.getByRole('button', { name: /Delete todo/ }));
    expect(onDeleteRequest).toHaveBeenCalledTimes(1);
    expect(onDeleteRequest).toHaveBeenCalledWith(todo);
  });

  it('isMutating={true} disables checkbox + delete button and sets aria-busy on the wrapper', () => {
    const { container } = renderRow({ isMutating: true });
    const checkbox = screen.getByRole('checkbox') as HTMLInputElement;
    const deleteBtn = screen.getByRole('button', { name: /Delete todo/ }) as HTMLButtonElement;
    expect(checkbox).toBeDisabled();
    expect(deleteBtn).toBeDisabled();
    const wrapper = container.querySelector('span[aria-busy="true"]');
    expect(wrapper).not.toBeNull();
  });

  it('checkbox wrapper carries 44×44 min size classes', () => {
    const { container } = renderRow();
    const wrapper = container.querySelector('span.inline-flex');
    expect(wrapper).toHaveClass('min-w-[44px]', 'min-h-[44px]');
  });

  it('delete button carries 44×44 min size classes', () => {
    const { container } = renderRow();
    const btn = container.querySelector('button');
    expect(btn).toHaveClass('min-w-[44px]', 'min-h-[44px]');
  });

  it('default export is wrapped in React.memo with the default (shallow) comparator', () => {
    const asMemo = TodoRow as unknown as { $$typeof: symbol; compare?: unknown };
    expect(asMemo.$$typeof).toBe(Symbol.for('react.memo'));
    expect(typeof asMemo.compare).not.toBe('function');
  });

  it('applies line-through and opacity-60 classes to the description when completed=true', () => {
    const { container } = renderRow({ todo: { completed: true } as Todo });
    const desc = container.querySelector('span.flex-1');
    expect(desc).not.toBeNull();
    expect(desc).toHaveClass('line-through');
    expect(desc).toHaveClass('opacity-60');
  });

  it('does NOT apply line-through or opacity-60 when completed=false', () => {
    const { container } = renderRow({ todo: { completed: false } as Todo });
    const desc = container.querySelector('span.flex-1');
    expect(desc).not.toHaveClass('line-through');
    expect(desc).not.toHaveClass('opacity-60');
  });

  it('applies transition utility unconditionally (for symmetric in-and-out animation)', () => {
    const { container: activeContainer } = renderRow({ todo: { completed: false } as Todo });
    const activeDesc = activeContainer.querySelector('span.flex-1');
    expect(activeDesc).toHaveClass('transition-[opacity,text-decoration-color]');
    expect(activeDesc).toHaveClass('duration-200');
    expect(activeDesc).toHaveClass('ease-out');

    const { container: completedContainer } = renderRow({ todo: { completed: true } as Todo });
    const completedDesc = completedContainer.querySelector('span.flex-1');
    expect(completedDesc).toHaveClass('transition-[opacity,text-decoration-color]');
  });
});
