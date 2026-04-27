import { describe, expect, it } from 'vitest';
import { computeP95, formatMs } from './latency.js';

describe('computeP95 (nearest-rank)', () => {
  it('returns the nearest-rank 95th value for 1..10 (=10)', () => {
    expect(computeP95([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])).toBe(10);
  });

  it('returns the single element for n=1', () => {
    expect(computeP95([5])).toBe(5);
  });

  it('returns NaN for an empty array (documented edge case)', () => {
    expect(computeP95([])).toBeNaN();
  });

  it('returns 94 for the 0..99 series (nearest-rank index = ceil(0.95*100)-1 = 94)', () => {
    const samples = Array.from({ length: 100 }, (_, i) => i);
    expect(computeP95(samples)).toBe(94);
  });

  it('is order-independent (operates on a sorted copy)', () => {
    expect(computeP95([10, 1, 5, 7, 3])).toBe(computeP95([1, 3, 5, 7, 10]));
  });
});

describe('formatMs', () => {
  it('formats finite numbers to 2 decimals', () => {
    expect(formatMs(123.456)).toBe('123.46');
  });

  it('passes through non-finite values as their string form', () => {
    expect(formatMs(NaN)).toBe('NaN');
    expect(formatMs(Infinity)).toBe('Infinity');
  });
});
