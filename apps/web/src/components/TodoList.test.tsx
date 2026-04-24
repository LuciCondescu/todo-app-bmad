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
  it('renders a single Active <ul> with one <li> per active todo (no Completed section if all active)', () => {
    const todos = [makeTodo({ description: 'A' }), makeTodo({ description: 'B' })];
    const { container } = render(<TodoList todos={todos} onToggle={noop} onDeleteRequest={noop} />);
    expect(container.querySelectorAll('ul')).toHaveLength(1);
    expect(container.querySelectorAll('li')).toHaveLength(2);
    expect(screen.queryByRole('heading', { level: 2, name: 'Completed' })).toBeNull();
  });

  it('splits mixed todos into Active <ul> and Completed <ul> sections (received order)', () => {
    const todos = [
      makeTodo({ description: 'Active A', completed: false }),
      makeTodo({ description: 'Done X', completed: true }),
      makeTodo({ description: 'Active B', completed: false }),
      makeTodo({ description: 'Done Y', completed: true }),
    ];
    const { container } = render(<TodoList todos={todos} onToggle={noop} onDeleteRequest={noop} />);

    const lists = container.querySelectorAll('ul');
    expect(lists).toHaveLength(2);

    // Active <ul> (first) has 2 items in received order.
    const activeItems = Array.from(lists[0]!.querySelectorAll('li'));
    expect(activeItems[0]?.textContent).toContain('Active A');
    expect(activeItems[1]?.textContent).toContain('Active B');

    // Completed <ul> (second) has 2 items in received order.
    const completedItems = Array.from(lists[1]!.querySelectorAll('li'));
    expect(completedItems[0]?.textContent).toContain('Done X');
    expect(completedItems[1]?.textContent).toContain('Done Y');

    // Completed heading present.
    expect(screen.getByRole('heading', { level: 2, name: 'Completed' })).toBeInTheDocument();
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

  it('all-completed list renders the Completed section with its label', () => {
    const todos = [
      makeTodo({ description: 'Done X', completed: true }),
      makeTodo({ description: 'Done Y', completed: true }),
    ];
    const { container } = render(<TodoList todos={todos} onToggle={noop} onDeleteRequest={noop} />);
    expect(container.querySelectorAll('ul')).toHaveLength(2); // empty Active + non-empty Completed
    expect(screen.getByRole('heading', { level: 2, name: 'Completed' })).toBeInTheDocument();
    expect(screen.getByText('Done X')).toBeInTheDocument();
    expect(screen.getByText('Done Y')).toBeInTheDocument();
  });

  it('assigns rows to sections by completed flag with stable keys (no cross-section leak)', () => {
    const todos = [
      makeTodo({ id: 'aaa', description: 'Active', completed: false }),
      makeTodo({ id: 'bbb', description: 'Done', completed: true }),
    ];
    const { container } = render(<TodoList todos={todos} onToggle={noop} onDeleteRequest={noop} />);
    const lists = container.querySelectorAll('ul');
    expect(lists[0]!.textContent).toContain('Active');
    expect(lists[0]!.textContent).not.toContain('Done');
    expect(lists[1]!.textContent).toContain('Done');
    expect(lists[1]!.textContent).not.toContain('Active');
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
