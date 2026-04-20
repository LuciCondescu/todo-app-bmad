import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import LoadingSkeleton from './LoadingSkeleton.js';

function getPlaceholderRows(container: HTMLElement): Element[] {
  // Direct `<div>` children of the skeleton root are the placeholder rows.
  const root = container.firstElementChild;
  if (!root) return [];
  return Array.from(root.children).filter((el) => el.tagName.toLowerCase() === 'div');
}

describe('<LoadingSkeleton />', () => {
  it('renders 3 placeholder rows by default', () => {
    const { container } = render(<LoadingSkeleton />);
    expect(getPlaceholderRows(container)).toHaveLength(3);
  });

  it.each([
    [1, 1],
    [4, 4],
    [7, 7],
  ])('rows=%i renders %i placeholder rows', (input, expected) => {
    const { container } = render(<LoadingSkeleton rows={input} />);
    expect(getPlaceholderRows(container)).toHaveLength(expected);
  });

  it('root <div> carries aria-busy, aria-live=polite, and aria-label="Loading your todos"', () => {
    render(<LoadingSkeleton />);
    const root = screen.getByLabelText('Loading your todos');
    expect(root).toHaveAttribute('aria-busy', 'true');
    expect(root).toHaveAttribute('aria-live', 'polite');
  });

  it('root <div> has animate-pulse class', () => {
    const { container } = render(<LoadingSkeleton />);
    const root = container.firstElementChild;
    expect(root).toHaveClass('animate-pulse');
  });

  it('each placeholder row shares TodoRow layout classes (flex, gap-3, py-3, border-b)', () => {
    const { container } = render(<LoadingSkeleton rows={2} />);
    const rows = getPlaceholderRows(container);
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row).toHaveClass('flex', 'items-center', 'gap-3', 'py-3', 'border-b');
    }
  });

  it('contains NO buttons, inputs, or anchors (pure visual placeholder)', () => {
    const { container } = render(<LoadingSkeleton />);
    expect(container.querySelector('button, input, a')).toBeNull();
  });
});
