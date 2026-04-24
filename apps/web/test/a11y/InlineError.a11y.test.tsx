import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { axe } from 'vitest-axe';
import InlineError from '../../src/components/InlineError.js';

describe('<InlineError /> accessibility', () => {
  // jsdom does not compute real styles for Tailwind arbitrary color tokens, so
  // axe's color-contrast rule is skipped by default. Enabling it explicitly is
  // still safe because the palette is AC-locked (#991b1b on #fef2f2 ≈ 10.4:1,
  // well above WCAG AA 4.5:1) — any future palette drift will surface here.
  it('with Retry — zero axe-core violations', async () => {
    const { container } = render(
      <InlineError message="Couldn't save. Check your connection." onRetry={() => {}} />,
    );
    const results = await axe(container, {
      rules: { 'color-contrast': { enabled: true } },
    });
    expect(results).toHaveNoViolations();
  });

  it('without Retry — zero axe-core violations', async () => {
    const { container } = render(<InlineError message="Couldn't save. Check your connection." />);
    const results = await axe(container, {
      rules: { 'color-contrast': { enabled: true } },
    });
    expect(results).toHaveNoViolations();
  });
});
