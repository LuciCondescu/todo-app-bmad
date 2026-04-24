import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { axe } from 'vitest-axe';
import TodoList from '../../src/components/TodoList.js';
import type { Todo } from '../../src/types.js';

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

describe('<TodoList /> accessibility', () => {
  it('with 2 active todos — zero axe-core violations', async () => {
    const todos = [makeTodo({ description: 'Buy milk' }), makeTodo({ description: 'Read book' })];
    const { container } = render(<TodoList todos={todos} onToggle={noop} onDeleteRequest={noop} />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('empty list — zero axe-core violations', async () => {
    const { container } = render(<TodoList todos={[]} onToggle={noop} onDeleteRequest={noop} />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('mixed active + completed todos — zero axe-core violations (FR-006 / NFR-007 contrast)', async () => {
    const todos = [
      makeTodo({ description: 'Active todo' }),
      makeTodo({ description: 'Completed todo', completed: true }),
    ];
    const { container } = render(<TodoList todos={todos} onToggle={noop} onDeleteRequest={noop} />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
