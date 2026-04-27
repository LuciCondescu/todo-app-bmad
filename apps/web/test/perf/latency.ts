// Story 5.1 — perf-harness latency helpers.
//
// computeP95 uses the nearest-rank method: sort ascending, pick the value at
// `ceil(0.95 * n) - 1`. This is simpler than linear interpolation and is the
// AC-acceptable choice (AC4). Empty input → NaN (documented; the harness's
// assertions wrap p95 in a threshold check, and `NaN > threshold` is false,
// so an empty samples array would silently fail the assertion — caller's
// responsibility to never pass an empty batch).

export function computeP95(samples: number[]): number {
  if (samples.length === 0) return NaN;
  if (samples.length === 1) return samples[0];
  const sorted = [...samples].sort((a, b) => a - b);
  const idx = Math.ceil(0.95 * sorted.length) - 1;
  return sorted[idx];
}

export function formatMs(n: number): string {
  return Number.isFinite(n) ? n.toFixed(2) : String(n);
}
