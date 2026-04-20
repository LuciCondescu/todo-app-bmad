import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { axe } from 'vitest-axe';
import EmptyState from '../../src/components/EmptyState.js';

describe('<EmptyState /> accessibility', () => {
  it('zero axe-core violations', async () => {
    const { container } = render(<EmptyState />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
