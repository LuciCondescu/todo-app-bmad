import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { axe } from 'vitest-axe';
import AddTodoInput from '../../src/components/AddTodoInput.js';

describe('<AddTodoInput /> accessibility', () => {
  it('default state — zero axe-core violations', async () => {
    const { container } = render(<AddTodoInput onSubmit={() => {}} />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('submitting state (disabled=true) — zero axe-core violations', async () => {
    const { container } = render(<AddTodoInput onSubmit={() => {}} disabled={true} />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('error state — zero axe-core violations', async () => {
    const { container } = render(
      <AddTodoInput onSubmit={() => {}} error="Couldn't save. Check your connection." />,
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
