import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TodoList from './TodoList.js';
import type { Todo } from '../types.js';

function makeTodo(overrides: Partial<Todo> = {}): Todo {
  return {
    id: `t-${Math.random().toString(36).slice(2, 10)}`,
    description: 'Buy milk',
    completed: false,
    userId: null,
    createdAt: '2026-04-20T12:00:00.000Z',
    ...overrides,
  };
}

const noop = () => {};

describe('<TodoList />', () => {
  it('renders a <ul> with one <li> per active todo', () => {
    const todos = [makeTodo({ description: 'A' }), makeTodo({ description: 'B' })];
    const { container } = render(<TodoList todos={todos} onToggle={noop} onDeleteRequest={noop} />);
    expect(container.querySelectorAll('ul')).toHaveLength(1);
    expect(container.querySelectorAll('li')).toHaveLength(2);
  });

  it('filters out completed todos, rendering only active ones', () => {
    const todos = [
      makeTodo({ description: 'Active A', completed: false }),
      makeTodo({ description: 'Done X', completed: true }),
      makeTodo({ description: 'Active B', completed: false }),
      makeTodo({ description: 'Done Y', completed: true }),
    ];
    const { container } = render(<TodoList todos={todos} onToggle={noop} onDeleteRequest={noop} />);
    expect(container.querySelectorAll('li')).toHaveLength(2);
    expect(screen.getByText('Active A')).toBeInTheDocument();
    expect(screen.getByText('Active B')).toBeInTheDocument();
    expect(screen.queryByText('Done X')).toBeNull();
    expect(screen.queryByText('Done Y')).toBeNull();
  });

  it('preserves the received order of active todos', () => {
    const todos = [
      makeTodo({ description: 'B' }),
      makeTodo({ description: 'A' }),
      makeTodo({ description: 'C' }),
    ];
    const { container } = render(<TodoList todos={todos} onToggle={noop} onDeleteRequest={noop} />);
    const lis = Array.from(container.querySelectorAll('li'));
    expect(lis.map((li) => li.textContent)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('B'),
        expect.stringContaining('A'),
        expect.stringContaining('C'),
      ]),
    );
    // Strict positional check
    expect(lis[0]?.textContent).toContain('B');
    expect(lis[1]?.textContent).toContain('A');
    expect(lis[2]?.textContent).toContain('C');
  });

  it('each row exposes the correct checkbox aria-label (no key-collision bugs)', () => {
    const todos = [makeTodo({ description: 'First' }), makeTodo({ description: 'Second' })];
    render(<TodoList todos={todos} onToggle={noop} onDeleteRequest={noop} />);
    expect(screen.getByLabelText('Mark complete: First')).toBeInTheDocument();
    expect(screen.getByLabelText('Mark complete: Second')).toBeInTheDocument();
  });

  it('empty list renders an empty <ul> (no EmptyState — parent concern)', () => {
    const { container } = render(<TodoList todos={[]} onToggle={noop} onDeleteRequest={noop} />);
    expect(container.querySelectorAll('ul')).toHaveLength(1);
    expect(container.querySelectorAll('li')).toHaveLength(0);
  });

  it('all-completed list renders an empty <ul> (no Completed section — Story 3.4)', () => {
    const todos = [
      makeTodo({ description: 'Done X', completed: true }),
      makeTodo({ description: 'Done Y', completed: true }),
    ];
    const { container } = render(<TodoList todos={todos} onToggle={noop} onDeleteRequest={noop} />);
    expect(container.querySelectorAll('ul')).toHaveLength(1);
    expect(container.querySelectorAll('li')).toHaveLength(0);
    expect(screen.queryByText('Done X')).toBeNull();
  });

  it('forwards onToggle from TodoList → TodoRow with (id, desired) correctly', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    const todos = [makeTodo({ description: 'First' })];
    render(<TodoList todos={todos} onToggle={onToggle} onDeleteRequest={noop} />);
    await user.click(screen.getByRole('checkbox'));
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onToggle).toHaveBeenCalledWith(todos[0]!.id, true);
  });
});
