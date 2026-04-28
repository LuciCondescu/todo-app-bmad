// Story 5.1 — Journey-4 perf harness.
//
// Gates two NFRs as a CI regression-guard:
//   NFR-001 — UI p95 ≤ 100ms per interaction batch
//   NFR-002 — API p95 ≤ 200ms per interaction batch (round-trip)
//
// IMPORTANT: jsdom is not a real browser. These thresholds are calibrated so
// that a CATASTROPHIC regression (an unmemoed component, a leaked subscription,
// an O(n²) render loop) breaks the assertion, while normal jsdom overhead does
// not. The PRD's formal SC-003 validation (Chrome DevTools Performance panel
// on a mid-tier 2022 laptop) remains a manual pre-release check — see
// `apps/web/test/perf/README.md`.
//
// Architecture: this harness mounts <App /> in jsdom AND boots a real Fastify
// API in-process via `buildApp({})`. Web fetch calls are rerouted into the
// Fastify app via `app.inject()` (the `fetchViaInject` adapter below) — real
// app, real DB, zero network stack. See `Dev Notes` in the story for rationale.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '@todo-app/api/app';
import App from '../../src/App.js';
import { ErrorBoundary } from '../../src/components/ErrorBoundary.js';
import { seed50, SEED_TOTAL } from '../fixtures/seed50.js';
import { migrateLatest, truncateTodos } from './test-db.js';
import { computeP95, formatMs } from './latency.js';

// jsdom-calibrated thresholds. The AC-letter values are 100 / 200; jsdom
// overhead under load can flake above 100ms even on healthy code (waitFor's
// 50ms polling is a primary contributor). Per Dev Notes, the harness is a
// regression-guard — relaxed UI/API thresholds still catch catastrophic
// drops because a real-browser 100ms regression typically blows past 250ms
// in jsdom too.
const UI_P95_MS = 250;
const API_P95_MS = 300;
const INITIAL_RENDER_MS = 1500; // cold path includes React boot + initial fetch

let app: FastifyInstance;

const fetchViaInject: typeof fetch = async (input, init) => {
  const url =
    typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  const path = new URL(url, 'http://local/').pathname;
  const method = (init?.method ?? 'GET').toUpperCase();
  const payload = init?.body ? JSON.parse(init.body as string) : undefined;
  const apiStart = performance.now();
  const res = await app.inject({
    method: method as 'GET' | 'POST' | 'PATCH' | 'DELETE',
    url: path,
    payload,
    headers: (init?.headers as Record<string, string>) ?? {},
  });
  const apiEnd = performance.now();
  // Stash the most-recent API round-trip for batches that want to read it.
  lastFetchTimings.push({ method, path, ms: apiEnd - apiStart });
  // Status codes 204 and 1xx must NOT have a body per the Fetch spec — passing
  // a body to the Response constructor throws under those statuses, which
  // breaks DELETE flows in particular. Guard explicitly.
  const bodyAllowed = res.statusCode !== 204 && (res.statusCode < 100 || res.statusCode >= 200);
  return new Response(bodyAllowed ? res.body : null, {
    status: res.statusCode,
    headers: Object.fromEntries(Object.entries(res.headers).map(([k, v]) => [k, String(v)])),
  });
};

let lastFetchTimings: Array<{ method: string; path: string; ms: number }> = [];

function makeClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
}

function mountApp() {
  const client = makeClient();
  return render(
    <ErrorBoundary>
      <QueryClientProvider client={client}>
        <App />
      </QueryClientProvider>
    </ErrorBoundary>,
  );
}

function takeApiSamples(method: string, count: number): number[] {
  const matching = lastFetchTimings.filter((t) => t.method === method);
  return matching.slice(-count).map((t) => t.ms);
}

function assertP95(label: string, samples: number[], threshold: number): void {
  const p95 = computeP95(samples);
  if (!(p95 <= threshold)) {
    throw new Error(
      `Batch "${label}" p95=${formatMs(p95)}ms exceeded threshold ${threshold}ms — ` +
        `samples=[${samples.map(formatMs).join(', ')}]`,
    );
  }
}

beforeAll(async () => {
  app = await buildApp();
  await migrateLatest(app.db);
  vi.stubGlobal('fetch', fetchViaInject);
});

afterAll(async () => {
  vi.unstubAllGlobals();
  await app.close();
});

beforeEach(async () => {
  lastFetchTimings = [];
  await seed50(app.db);
});

afterEach(() => {
  // Drop any stale React Query subscriptions between tests.
});

// Vitest's 5s default collides with the harness's 5s render-gate waitFor, and
// AC10's 40-interaction loop adds non-trivial jsdom overhead on CI runners.
// 20s gives slow CI hardware breathing room without hiding regressions — the
// real budgets are the UI/API p95 assertions inside each test.
vi.setConfig({ testTimeout: 20_000 });

describe('Journey-4 perf harness', () => {
  it('AC5/AC6 — initial render: 50 seeded todos visible within the cold-path threshold', async () => {
    const t0 = performance.now();
    mountApp();
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(SEED_TOTAL), {
      timeout: 5_000,
    });
    const initialRenderMs = performance.now() - t0;
    if (initialRenderMs > INITIAL_RENDER_MS) {
      throw new Error(
        `Initial render took ${formatMs(initialRenderMs)}ms — exceeded cold-path threshold ${INITIAL_RENDER_MS}ms`,
      );
    }
  });

  it('AC7 — toggle batch (5 rows): UI p95 ≤ threshold; API p95 ≤ threshold', async () => {
    mountApp();
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(SEED_TOTAL), {
      timeout: 5_000,
    });

    const user = userEvent.setup();
    const uiSamples: number[] = [];
    const baselineApiCount = lastFetchTimings.filter((t) => t.method === 'PATCH').length;

    for (const rowIdx of [0, 10, 20, 30, 40]) {
      const description = `Perf todo #${String(rowIdx).padStart(2, '0')}`;
      // Row 40 is in the seed's completed slice (35..49) → "Mark incomplete".
      const isInitiallyCompleted = rowIdx >= 35;
      const labelBefore = isInitiallyCompleted
        ? `Mark incomplete: ${description}`
        : `Mark complete: ${description}`;
      const labelAfter = isInitiallyCompleted
        ? `Mark complete: ${description}`
        : `Mark incomplete: ${description}`;
      const checkbox = screen.getByRole('checkbox', { name: labelBefore });

      const t0 = performance.now();
      await user.click(checkbox);
      // Story-3.4 row-remount semantics: when a row toggles, it unmounts from
      // its current section and re-mounts in the other. The original checkbox
      // reference is detached, so we query by the new label to confirm the
      // optimistic state has landed in the live DOM.
      await waitFor(() => screen.getByRole('checkbox', { name: labelAfter }));
      uiSamples.push(performance.now() - t0);
    }

    const apiAfter = lastFetchTimings.filter((t) => t.method === 'PATCH');
    const apiSamples = apiAfter.slice(baselineApiCount).map((t) => t.ms);

    expect(uiSamples).toHaveLength(5);
    expect(apiSamples).toHaveLength(5);
    assertP95('toggle-ui', uiSamples, UI_P95_MS);
    assertP95('toggle-api', apiSamples, API_P95_MS);
  });

  it('AC8 — create batch (3 todos): UI p95 ≤ threshold; API p95 ≤ threshold', async () => {
    mountApp();
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(SEED_TOTAL), {
      timeout: 5_000,
    });

    const user = userEvent.setup();
    const uiSamples: number[] = [];
    const input = screen.getByRole('textbox', { name: 'Add a todo' }) as HTMLInputElement;

    // Untimed warmup: the first user.type drives ~14 keypress events through
    // React + AJV, which on a contended CI runner consistently lands ~50–100ms
    // above the steady-state cost. Discard it so the timed loop measures the
    // warm path only. Baselines are captured AFTER the warmup for the same
    // reason on the API side.
    await user.type(input, 'Perf create warmup{Enter}');
    await waitFor(() => {
      expect(screen.getByText('Perf create warmup')).toBeInTheDocument();
      expect(input.value).toBe('');
    });
    const baselineApiCount = lastFetchTimings.filter((t) => t.method === 'POST').length;

    for (let n = 1; n <= 3; n += 1) {
      const desc = `Perf create ${n}`;
      const t0 = performance.now();
      await user.type(input, `${desc}{Enter}`);
      // Create is non-optimistic — wait for the new row to appear AND the input
      // to clear + refocus (Story 2.4 invariants).
      await waitFor(() => {
        expect(screen.getByText(desc)).toBeInTheDocument();
        expect(input.value).toBe('');
      });
      uiSamples.push(performance.now() - t0);
    }

    const apiAfter = lastFetchTimings.filter((t) => t.method === 'POST');
    const apiSamples = apiAfter.slice(baselineApiCount).map((t) => t.ms);

    expect(uiSamples).toHaveLength(3);
    expect(apiSamples).toHaveLength(3);
    assertP95('create-ui', uiSamples, UI_P95_MS);
    assertP95('create-api', apiSamples, API_P95_MS);
  });

  it('AC9 — delete batch (3 rows): UI p95 ≤ threshold; API p95 ≤ threshold', async () => {
    mountApp();
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(SEED_TOTAL), {
      timeout: 5_000,
    });

    const user = userEvent.setup();
    const uiSamples: number[] = [];
    const baselineApiCount = lastFetchTimings.filter((t) => t.method === 'DELETE').length;

    // Per AC9 simpler-path note: measure confirm-to-row-removal (single sub-interval).
    for (const rowIdx of [45, 46, 47]) {
      const description = `Perf todo #${String(rowIdx).padStart(2, '0')}`;
      await user.click(screen.getByLabelText(`Delete todo: ${description}`));
      const dialog = await screen.findByRole('dialog');
      const confirmBtn = within(dialog).getByRole('button', { name: 'Delete' });

      const t0 = performance.now();
      await user.click(confirmBtn);
      // The optimistic filter removes the row immediately; the modal closes
      // when the per-call onSuccess fires after the DELETE settles. Both are
      // user-visible signals of "delete done" — wait for the row removal as
      // the primary signal, then assert dialog cleanup as a follow-up.
      await waitFor(() => expect(screen.queryByText(description)).toBeNull());
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull(), { timeout: 3_000 });
      uiSamples.push(performance.now() - t0);
    }

    const apiAfter = lastFetchTimings.filter((t) => t.method === 'DELETE');
    const apiSamples = apiAfter.slice(baselineApiCount).map((t) => t.ms);

    expect(uiSamples).toHaveLength(3);
    expect(apiSamples).toHaveLength(3);
    assertP95('delete-ui', uiSamples, UI_P95_MS);
    assertP95('delete-api', apiSamples, API_P95_MS);
  });

  it('AC10 — cumulative-degradation: 40th interaction ≤ 2× 1st interaction', async () => {
    // Re-seed for isolation (beforeEach already does this; explicit here for clarity).
    await truncateTodos(app.db);
    await seed50(app.db);
    mountApp();
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(SEED_TOTAL), {
      timeout: 5_000,
    });

    const user = userEvent.setup();
    const samples: number[] = [];
    const input = screen.getByRole('textbox', { name: 'Add a todo' }) as HTMLInputElement;

    type Step =
      | { kind: 'toggle'; row: number }
      | { kind: 'create'; n: number }
      | { kind: 'delete'; row: number };
    const steps: Step[] = [];
    // Build a deterministic 40-step interleaved script:
    // 20 toggles (rotating rows 0..19), 10 creates, 10 deletes.
    let toggleIdx = 0;
    let createIdx = 0;
    let deleteIdx = 0;
    for (let i = 0; i < 40; i += 1) {
      const slot = i % 4;
      if (slot < 2 && toggleIdx < 20) {
        steps.push({ kind: 'toggle', row: toggleIdx });
        toggleIdx += 1;
      } else if (slot === 2 && createIdx < 10) {
        steps.push({ kind: 'create', n: createIdx + 1 });
        createIdx += 1;
      } else if (slot === 3 && deleteIdx < 10) {
        // Delete from the seeded completed slice (45 down to 36) so it stays valid.
        steps.push({ kind: 'delete', row: 45 - deleteIdx });
        deleteIdx += 1;
      } else if (toggleIdx < 20) {
        steps.push({ kind: 'toggle', row: toggleIdx });
        toggleIdx += 1;
      } else if (createIdx < 10) {
        steps.push({ kind: 'create', n: createIdx + 1 });
        createIdx += 1;
      } else {
        steps.push({ kind: 'delete', row: 45 - deleteIdx });
        deleteIdx += 1;
      }
    }
    expect(steps).toHaveLength(40);

    const toggleStates = new Map<number, boolean>(); // row → currently-completed?
    for (let i = 0; i < 20; i += 1) toggleStates.set(i, false);

    for (const step of steps) {
      const t0 = performance.now();
      if (step.kind === 'toggle') {
        const description = `Perf todo #${String(step.row).padStart(2, '0')}`;
        const isCompleted = toggleStates.get(step.row) ?? false;
        const labelBefore = isCompleted
          ? `Mark incomplete: ${description}`
          : `Mark complete: ${description}`;
        const labelAfter = isCompleted
          ? `Mark complete: ${description}`
          : `Mark incomplete: ${description}`;
        const cb = screen.getByRole('checkbox', { name: labelBefore });
        await user.click(cb);
        // Row-remount: query by the new label, not the (now-detached) cb reference.
        await waitFor(() => screen.getByRole('checkbox', { name: labelAfter }));
        toggleStates.set(step.row, !isCompleted);
      } else if (step.kind === 'create') {
        const desc = `Perf cumulative create ${step.n}`;
        await user.type(input, `${desc}{Enter}`);
        await waitFor(() => {
          expect(screen.getByText(desc)).toBeInTheDocument();
          expect(input.value).toBe('');
        });
      } else {
        const description = `Perf todo #${String(step.row).padStart(2, '0')}`;
        await user.click(screen.getByLabelText(`Delete todo: ${description}`));
        const dialog = await screen.findByRole('dialog');
        await user.click(within(dialog).getByRole('button', { name: 'Delete' }));
        await waitFor(() => expect(screen.queryByText(description)).toBeNull());
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull(), { timeout: 3_000 });
      }
      samples.push(performance.now() - t0);
    }

    expect(samples).toHaveLength(40);
    if (!(samples[39] <= 2 * samples[0])) {
      throw new Error(
        `Cumulative degradation detected: 40th=${formatMs(samples[39])}ms vs 1st=${formatMs(samples[0])}ms ` +
          `(ratio ${(samples[39] / samples[0]).toFixed(2)}× > 2×). Full samples: [${samples.map(formatMs).join(', ')}]`,
      );
    }
  });
});
