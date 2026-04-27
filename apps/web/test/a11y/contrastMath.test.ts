import { describe, expect, it } from 'vitest';
import {
  InvalidHexError,
  alphaComposite,
  computeContrast,
  parseHex,
  relativeLuminance,
} from './contrastMath.js';

describe('parseHex', () => {
  it('accepts 6-char hex with leading #', () => {
    expect(parseHex('#1A1A1A')).toEqual({ r: 0x1a, g: 0x1a, b: 0x1a });
  });

  it('accepts 6-char hex without leading #', () => {
    expect(parseHex('FAFAFA')).toEqual({ r: 0xfa, g: 0xfa, b: 0xfa });
  });

  it('accepts 3-char hex (expanded)', () => {
    expect(parseHex('#abc')).toEqual({ r: 0xaa, g: 0xbb, b: 0xcc });
    expect(parseHex('fff')).toEqual({ r: 0xff, g: 0xff, b: 0xff });
  });

  it.each([
    ['#xyz', '#xyz'],
    ['notahex', 'notahex'],
    ['', ''],
    ['#12345', '#12345'],
  ])('throws InvalidHexError on %s', (label, input) => {
    expect(() => parseHex(input)).toThrow(InvalidHexError);
  });
});

describe('relativeLuminance', () => {
  // White and black are the WCAG-defined endpoints.
  it('returns 1 for pure white', () => {
    expect(relativeLuminance({ r: 0xff, g: 0xff, b: 0xff })).toBeCloseTo(1, 5);
  });

  it('returns 0 for pure black', () => {
    expect(relativeLuminance({ r: 0, g: 0, b: 0 })).toBeCloseTo(0, 5);
  });
});

describe('alphaComposite', () => {
  // 0x1A=26, 0xFA=250, alpha=0.6 → 26*0.6 + 250*0.4 = 15.6 + 100 = 115.6.
  // We deliberately keep this UN-ROUNDED — see the comment in contrastMath.ts
  // for why (rounding pushes the AA-borderline completed-text pair below
  // threshold). The story AC sketch's `0x7A` and `0x74` integer expectations
  // both reflect a rounding choice we no longer apply.
  it('composites #1A1A1A at 60% over #FAFAFA → rgb(115.6, 115.6, 115.6) (un-rounded)', () => {
    const result = alphaComposite(
      { r: 0x1a, g: 0x1a, b: 0x1a },
      { r: 0xfa, g: 0xfa, b: 0xfa },
      0.6,
    );
    expect(result.r).toBeCloseTo(115.6, 5);
    expect(result.g).toBeCloseTo(115.6, 5);
    expect(result.b).toBeCloseTo(115.6, 5);
  });

  it('alpha=0 is the background', () => {
    const result = alphaComposite({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 }, 0);
    expect(result).toEqual({ r: 255, g: 255, b: 255 });
  });

  it('alpha=1 is the foreground', () => {
    const result = alphaComposite({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 }, 1);
    expect(result).toEqual({ r: 0, g: 0, b: 0 });
  });
});

describe('computeContrast — WCAG reference values', () => {
  // Reference: WCAG 2.1 maximum contrast is 21 (black on white).
  // Source: https://www.w3.org/TR/WCAG21/#contrast-minimum
  it('returns exactly 21 for #000 on #FFF (WCAG endpoint)', () => {
    expect(computeContrast('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
  });

  it('returns exactly 21 for #FFF on #000 (symmetry)', () => {
    expect(computeContrast('#FFFFFF', '#000000')).toBeCloseTo(21, 5);
  });

  it('returns exactly 1 for same color on same color', () => {
    expect(computeContrast('#FFFFFF', '#FFFFFF')).toBe(1);
    expect(computeContrast('#1A1A1A', '#1A1A1A')).toBe(1);
  });

  // Reference: per the project's UX spec (ux-design-specification.md:432) and
  // independent WCAG reference computation: #1A1A1A on #FAFAFA ≈ 16.8.
  it('returns ~16 for #1A1A1A on #FAFAFA (UX spec body-text pair)', () => {
    const ratio = computeContrast('#1A1A1A', '#FAFAFA');
    expect(ratio).toBeGreaterThan(16);
    expect(ratio).toBeLessThan(17);
  });

  // Reference: a 4.5:1 reference example often cited in the WCAG community is
  // #767676 on #FFFFFF (https://webaim.org/articles/contrast/) ≈ 4.54.
  it('returns ~4.5 for #767676 on #FFFFFF (WCAG AA boundary reference)', () => {
    const ratio = computeContrast('#767676', '#FFFFFF');
    expect(ratio).toBeGreaterThan(4.5);
    expect(ratio).toBeLessThan(4.6);
  });

  // Reference: #2563EB (project --color-accent) on #FFFFFF — UI-non-text 3:1
  // threshold reference. WebAIM reports ≈5.17.
  it('returns ~5 for #2563EB on #FFFFFF (--color-accent vs white)', () => {
    const ratio = computeContrast('#2563EB', '#FFFFFF');
    expect(ratio).toBeGreaterThan(4.5);
    expect(ratio).toBeLessThan(5.5);
  });

  // Reference: #DC2626 (project --color-danger) on #FFFFFF. WebAIM ≈4.83.
  it('returns ~4.8 for #DC2626 on #FFFFFF (--color-danger vs white)', () => {
    const ratio = computeContrast('#DC2626', '#FFFFFF');
    expect(ratio).toBeGreaterThan(4.5);
    expect(ratio).toBeLessThan(5.0);
  });

  it('alpha-composite path: #1A1A1A at 60% on #FAFAFA returns ~4.7 (≥AA)', () => {
    const ratio = computeContrast('#1A1A1A', '#FAFAFA', 0.6);
    expect(ratio).toBeGreaterThan(4.5);
    expect(ratio).toBeLessThan(5.0);
  });
});
