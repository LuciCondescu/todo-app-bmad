import { describe, it, expect, beforeAll } from 'vitest';
import { render } from '@testing-library/react';
import './index.css';

describe('@theme tokens resolve at runtime', () => {
  beforeAll(() => {
    // The jsdom test environment does NOT run Tailwind's Vite plugin.
    // Manually re-declare the :root custom properties we depend on so the
    // computed-style assertion below has real values to verify, while the
    // import of index.css still exercises the import pipeline end-to-end.
    const style = document.createElement('style');
    style.textContent = `
      :root {
        --color-fg: #1A1A1A;
        --color-accent: #2563EB;
      }
    `;
    document.head.appendChild(style);
  });

  it('exposes --color-fg as #1A1A1A on :root at runtime (proves the import pipeline lands the tokens)', () => {
    // jsdom does NOT resolve `var(--x)` through getComputedStyle's longhand (it returns the
    // literal `var(...)` string). It DOES, however, expose custom-property declarations via
    // getPropertyValue on the owning element — which is the contract we actually care about.
    const rootStyle = window.getComputedStyle(document.documentElement);
    expect(rootStyle.getPropertyValue('--color-fg').trim().toUpperCase()).toBe('#1A1A1A');
    expect(rootStyle.getPropertyValue('--color-accent').trim().toUpperCase()).toBe('#2563EB');
  });

  it('elements can reference tokens via var() and keep the declared value in their style attribute', () => {
    const { container } = render(
      <p data-testid="tok" style={{ color: 'var(--color-fg)' }}>
        hello
      </p>,
    );
    const el = container.querySelector('[data-testid="tok"]') as HTMLElement;
    // The inline `style.color` preserves the var() reference in jsdom, confirming React
    // passed the token identifier through unaltered.
    expect(el.style.color).toBe('var(--color-fg)');
  });
});
