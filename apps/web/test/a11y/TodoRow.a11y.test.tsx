import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { axe } from 'vitest-axe';
import TodoRow from '../../src/components/TodoRow.js';
import type { Todo } from '../../src/types.js';

const activeTodo: Todo = {
  id: '01-a11y-active',
  description: 'Buy milk',
  completed: false,
  userId: null,
  createdAt: '2026-04-20T12:00:00.000Z',
};

const completedTodo: Todo = { ...activeTodo, id: '01-a11y-done', completed: true };

const noop = () => {};

describe('<TodoRow /> accessibility', () => {
  it('default (active) — zero axe-core violations', async () => {
    const { container } = render(
      <ul>
        <TodoRow todo={activeTodo} onToggle={noop} onDeleteRequest={noop} />
      </ul>,
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('mutating (isMutating=true) — zero axe-core violations', async () => {
    const { container } = render(
      <ul>
        <TodoRow todo={activeTodo} onToggle={noop} onDeleteRequest={noop} isMutating={true} />
      </ul>,
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('completed todo (aria-label flips) — zero axe-core violations', async () => {
    const { container } = render(
      <ul>
        <TodoRow todo={completedTodo} onToggle={noop} onDeleteRequest={noop} />
      </ul>,
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('error state — zero axe-core violations', async () => {
    const { container } = render(
      <ul>
        <TodoRow
          todo={activeTodo}
          onToggle={noop}
          onDeleteRequest={noop}
          error="Couldn't save. Check your connection."
          onRetry={noop}
        />
      </ul>,
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
