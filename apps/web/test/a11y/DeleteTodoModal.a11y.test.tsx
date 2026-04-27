import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { axe } from 'vitest-axe';
import DeleteTodoModal from '../../src/components/DeleteTodoModal.js';
import type { Todo } from '../../src/types.js';

const fixture: Todo = {
  id: '01-a11y-modal',
  description: 'Delete me',
  completed: false,
  userId: null,
  createdAt: '2026-04-20T12:00:00.000Z',
};

describe('<DeleteTodoModal /> accessibility', () => {
  it('open modal — zero axe-core violations', async () => {
    const noop = () => {};
    const { container } = render(
      <DeleteTodoModal todo={fixture} onCancel={noop} onConfirm={noop} />,
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('error state — zero axe-core violations', async () => {
    const noop = () => {};
    const { container } = render(
      <DeleteTodoModal
        todo={fixture}
        onCancel={noop}
        onConfirm={noop}
        error="Couldn't delete. Check your connection."
        isDeleting={false}
      />,
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
