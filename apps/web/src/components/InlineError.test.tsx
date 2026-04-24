import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import InlineError from './InlineError.js';

describe('<InlineError />', () => {
  it('message-only render — no Retry button is present', () => {
    render(<InlineError message="Couldn't save." />);
    expect(screen.queryByRole('button', { name: /retry/i })).toBeNull();
  });

  it('onRetry provided — renders a Retry button and calls onRetry exactly once on click', async () => {
    const user = userEvent.setup();
    const fn = vi.fn();
    render(<InlineError message="Couldn't save." onRetry={fn} />);
    const button = screen.getByRole('button', { name: 'Retry' });
    expect(button).toBeInTheDocument();
    await user.click(button);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('isRetrying — Retry button is disabled and carries aria-busy="true"', () => {
    render(<InlineError message="Couldn't save." onRetry={() => {}} isRetrying />);
    const button = screen.getByRole('button', { name: 'Retry' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
  });

  it('wrapper exposes role="alert" and aria-live="polite"', () => {
    render(<InlineError message="Couldn't save." />);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveAttribute('aria-live', 'polite');
  });

  it('icon is a decorative 16×16 svg with aria-hidden="true"', () => {
    const { container } = render(<InlineError message="Couldn't save." />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).toHaveAttribute('width', '16');
    expect(svg).toHaveAttribute('height', '16');
  });

  it('Retry button carries the documented min-h-[36px] inline-error exception', () => {
    render(<InlineError message="Couldn't save." onRetry={() => {}} />);
    expect(screen.getByRole('button', { name: 'Retry' })).toHaveClass('min-h-[36px]');
  });

  it('renders the message verbatim — newlines are preserved, not stripped', () => {
    render(<InlineError message={'line 1\nline 2'} />);
    const alert = screen.getByRole('alert');
    // Prefer direct textContent read over toHaveTextContent(regex) to avoid
    // whitespace normalization masking a stripped newline.
    expect(alert.textContent).toContain('line 1\nline 2');
  });
});
