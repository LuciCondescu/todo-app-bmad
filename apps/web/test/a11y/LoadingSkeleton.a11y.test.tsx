import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { axe } from 'vitest-axe';
import LoadingSkeleton from '../../src/components/LoadingSkeleton.js';

describe('<LoadingSkeleton /> accessibility', () => {
  it('default render — zero axe-core violations', async () => {
    const { container } = render(<LoadingSkeleton />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
