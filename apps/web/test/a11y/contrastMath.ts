// Story 5.4 — pure-math helpers for WCAG 2.1 contrast computation.
//
// References:
//   WCAG 2.1 contrast formula: https://www.w3.org/TR/WCAG21/#contrast-minimum
//   Relative luminance:        https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
//
// We use these helpers (instead of relying on axe's color-contrast rule
// alone) because jsdom's CSSOM cannot reliably resolve Tailwind v4 arbitrary
// values + `var(--token)` references at compute-style time. A pure-math
// helper sidesteps the toolchain ambiguity and provides a deterministic
// numeric assertion against the WCAG threshold, regardless of jsdom or
// axe-core version drift.

export type RGB = { r: number; g: number; b: number };

export class InvalidHexError extends Error {
  constructor(input: string) {
    super(`Invalid hex color: ${JSON.stringify(input)}`);
    this.name = 'InvalidHexError';
  }
}

const SHORT_HEX_RE = /^#?([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])$/;
const LONG_HEX_RE = /^#?([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/;

export function parseHex(hex: string): RGB {
  if (typeof hex !== 'string' || hex.length === 0) {
    throw new InvalidHexError(hex);
  }
  const long = LONG_HEX_RE.exec(hex);
  if (long) {
    return {
      r: parseInt(long[1], 16),
      g: parseInt(long[2], 16),
      b: parseInt(long[3], 16),
    };
  }
  const short = SHORT_HEX_RE.exec(hex);
  if (short) {
    return {
      r: parseInt(short[1] + short[1], 16),
      g: parseInt(short[2] + short[2], 16),
      b: parseInt(short[3] + short[3], 16),
    };
  }
  throw new InvalidHexError(hex);
}

function channelToLinear(channel: number): number {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function relativeLuminance(rgb: RGB): number {
  const lr = channelToLinear(rgb.r);
  const lg = channelToLinear(rgb.g);
  const lb = channelToLinear(rgb.b);
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
}

// Compositing returns FLOAT channel values — no `Math.round`. The WCAG
// canonical contrast computation operates at sub-pixel precision; rounding
// to integers introduces error that can flip a borderline pair across the
// AA threshold. For example, `26 * 0.6 + 250 * 0.4 = 115.6` un-rounded gives
// contrast ≈ 4.506 (passes AA at 4.5); `Math.round → 116` gives ≈ 4.478
// (FAILS). The AA "thin margin" the UX spec calls out for completed text
// (60%-opacity #1A1A1A on #FAFAFA) is real and depends on un-rounded math.
// Callers that need integer display values should round at the call site.
export function alphaComposite(fg: RGB, bg: RGB, alpha: number): RGB {
  const blend = (a: number, b: number) => a * alpha + b * (1 - alpha);
  return { r: blend(fg.r, bg.r), g: blend(fg.g, bg.g), b: blend(fg.b, bg.b) };
}

export function computeContrast(fgHex: string, bgHex: string, fgAlpha?: number): number {
  const bg = parseHex(bgHex);
  let fg = parseHex(fgHex);
  if (typeof fgAlpha === 'number') {
    fg = alphaComposite(fg, bg, fgAlpha);
  }
  const lFg = relativeLuminance(fg);
  const lBg = relativeLuminance(bg);
  const lighter = Math.max(lFg, lBg);
  const darker = Math.min(lFg, lBg);
  return (lighter + 0.05) / (darker + 0.05);
}
