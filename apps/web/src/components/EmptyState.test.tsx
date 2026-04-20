import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import EmptyState from './EmptyState.js';

describe('<EmptyState />', () => {
  it('renders "No todos yet." in a <p> with text-base class', () => {
    render(<EmptyState />);
    const p = screen.getByText('No todos yet.');
    expect(p.tagName).toBe('P');
    expect(p).toHaveClass('text-base');
  });

  it('renders "Add one below." in a <p> with text-sm + text-[--color-fg-muted] classes', () => {
    render(<EmptyState />);
    const p = screen.getByText('Add one below.');
    expect(p.tagName).toBe('P');
    expect(p).toHaveClass('text-sm', 'text-[--color-fg-muted]');
  });

  it('renders an <svg> with aria-hidden="true" (decorative)', () => {
    const { container } = render(<EmptyState />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg).toHaveAttribute('aria-hidden', 'true');
  });

  it('root <div> is a centered flex-column block', () => {
    const { container } = render(<EmptyState />);
    const root = container.firstElementChild;
    expect(root).toHaveClass('flex', 'flex-col', 'items-center', 'text-center', 'py-12');
  });

  it('contains NO buttons, anchors, or inputs (no CTAs inside EmptyState)', () => {
    const { container } = render(<EmptyState />);
    expect(container.querySelector('button, a, input')).toBeNull();
  });

  it('compiles and renders with zero props (zero-prop by design)', () => {
    const { container } = render(<EmptyState />);
    expect(container.firstElementChild).not.toBeNull();
  });
});
