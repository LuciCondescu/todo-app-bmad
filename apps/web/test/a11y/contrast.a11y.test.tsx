// Story 5.4 — token-level WCAG contrast audit.
//
// Asserts every declared token pair against its WCAG threshold via two
// independent paths:
//   1. The pure-math `computeContrast` helper (authoritative — independent of
//      jsdom + axe version drift).
//   2. axe-core's `color-contrast` rule, explicitly enabled, against an
//      inline-styled sample. Defensive belt-and-braces — if axe disagrees
//      with the math helper, that's a real signal.
//
// Console output emits each pair's computed ratio so the implementer can
// harvest values for `docs/contrast-audit.md` (Story 5.4 Task 4).
//
// Note on Primary/Danger button pairs: the AC text describes the pairs as
// `#2563EB on #FFFFFF` / `#DC2626 on #FFFFFF`, but the actual components are
// `bg-[--color-accent] text-white` / `bg-[--color-danger] text-white` — i.e.
// white text on the accent/danger background. We test the as-implemented
// pair (white on accent/danger) since that's what users see; contrast is
// symmetric so the math is identical.

import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { computeContrast } from './contrastMath.js';

type Pair = {
  label: string;
  fg: string;
  bg: string;
  alpha?: number;
  threshold: number;
  wcag: string;
  fgToken: string;
  bgToken: string;
};

const PAIRS: Pair[] = [
  {
    label: 'body text',
    fg: '#1A1A1A',
    bg: '#FAFAFA',
    threshold: 7,
    wcag: 'AAA normal',
    fgToken: '--color-fg',
    bgToken: '--color-bg',
  },
  {
    label: 'secondary text',
    fg: '#737373',
    bg: '#FAFAFA',
    threshold: 4.5,
    wcag: 'AA normal',
    fgToken: '--color-fg-muted',
    bgToken: '--color-bg',
  },
  {
    label: 'completed text (60% opacity, alpha-composited)',
    fg: '#1A1A1A',
    bg: '#FAFAFA',
    alpha: 0.6,
    threshold: 4.5,
    wcag: 'AA normal (effective via alpha-composite)',
    fgToken: '--color-completed-fg (rgb(26 26 26 / 0.6))',
    bgToken: '--color-bg',
  },
  {
    label: 'focus ring',
    fg: '#2563EB',
    bg: '#FAFAFA',
    threshold: 3,
    wcag: 'AA non-text',
    fgToken: '--color-accent',
    bgToken: '--color-bg',
  },
  {
    label: 'Primary button text (white on accent — see file header re: AC drift)',
    fg: '#FFFFFF',
    bg: '#2563EB',
    threshold: 4.5,
    wcag: 'AA normal',
    fgToken: 'white literal',
    bgToken: '--color-accent',
  },
  {
    label: 'Danger button text (white on danger — see file header re: AC drift)',
    fg: '#FFFFFF',
    bg: '#DC2626',
    threshold: 4.5,
    wcag: 'AA normal',
    fgToken: 'white literal',
    bgToken: '--color-danger',
  },
  {
    label: 'InlineError text',
    fg: '#991b1b',
    bg: '#fef2f2',
    threshold: 7,
    wcag: 'AAA normal',
    fgToken: 'literal (Story 4.1)',
    bgToken: 'literal (Story 4.1)',
  },
];

describe('Story 5.4 — token-pair contrast audit', () => {
  it.each(PAIRS)('$label: contrast ratio (math) ≥ $threshold ($wcag)', (pair: Pair) => {
    const ratio = computeContrast(pair.fg, pair.bg, pair.alpha);
    console.log(
      `[contrast] ${pair.label}: ${ratio.toFixed(2)} — threshold ${pair.threshold} (${pair.wcag})`,
    );
    if (!(ratio >= pair.threshold)) {
      throw new Error(
        `[contrast FAIL] ${pair.label}: got ${ratio.toFixed(2)}, threshold ${pair.threshold}, tokens (${pair.fgToken}, ${pair.bgToken})`,
      );
    }
    expect(ratio).toBeGreaterThanOrEqual(pair.threshold);
  });

  // Defensive axe pass over inline-styled samples — skip the alpha case
  // (jsdom's CSSOM inline-opacity handling is unreliable; helper-math is
  // authoritative there).
  it.each(PAIRS.filter((p) => p.alpha === undefined))(
    'axe color-contrast: $label',
    async (pair: Pair) => {
      const { container } = render(
        <div style={{ color: pair.fg, backgroundColor: pair.bg, padding: 8 }}>Sample text</div>,
      );
      const results = await axe(container, {
        rules: { 'color-contrast': { enabled: true } },
      });
      expect(results).toHaveNoViolations();
    },
  );
});
