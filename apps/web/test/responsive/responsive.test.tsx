// Story 5.2 — responsive smoke (jsdom).
// Class-presence regression guard for the responsive utility classes our layout
// depends on. Real-layout verification lives in `apps/web/e2e/browser-matrix.spec.ts`
// (Playwright, three browsers × two viewports).
//
// Note on AC3 deviation: the Story 5.2 Dev Notes claimed `getComputedStyle(el).minHeight`
// would return "44px" for elements carrying `min-h-[44px]`. That requires the Tailwind
// CSS bundle to be parsed into jsdom's CSSOM. This project does NOT import the
// CSS file in tests (App.tsx + components don't import their styles directly;
// `main.tsx` does, but tests render <App /> bypassing main.tsx). A direct probe
// confirmed `getComputedStyle(btn).minHeight === ""` for jsdom-rendered buttons
// with `className="min-h-[44px]"`. We therefore assert CLASS PRESENCE (regression
// guard if the class disappears), not computed-style numbers (which are 0/empty
// in jsdom). The AC-letter intent — "the 44×44 contract is regression-guarded" —
// is preserved; the actual 44×44 *layout* check moves to Playwright (boundingBox).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from '../../src/App.js';
import { ErrorBoundary } from '../../src/components/ErrorBoundary.js';
import DeleteTodoModal from '../../src/components/DeleteTodoModal.js';
import type { Todo } from '../../src/types.js';

type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

function makeClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
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

function stubViewport(width: number): void {
  Object.defineProperty(window, 'innerWidth', { value: width, writable: true, configurable: true });
  Object.defineProperty(window, 'innerHeight', { value: 800, writable: true, configurable: true });
  // The matchMedia shim is for safety — Tailwind v4 does NOT use matchMedia at
  // runtime; its utilities compile to CSS @media blocks, which jsdom cannot
  // evaluate. These tests verify CLASS PRESENCE, not computed layout.
  window.matchMedia = vi.fn().mockImplementation((query: string) => {
    const minMatch = /min-width:\s*(\d+)px/.exec(query);
    const maxMatch = /max-width:\s*(\d+)px/.exec(query);
    let matches = false;
    if (minMatch) matches = width >= Number(minMatch[1]);
    else if (maxMatch) matches = width <= Number(maxMatch[1]);
    return {
      matches,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    } as MediaQueryList;
  });
  window.dispatchEvent(new Event('resize'));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const VIEWPORTS = [320, 375, 640, 1024, 1440] as const;

describe.each(VIEWPORTS.map((w) => [w]))('App layout at %dpx viewport', (width) => {
  beforeEach(() => {
    stubViewport(width);
    const fetchFn = vi.fn<FetchFn>(
      async () =>
        ({
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => [],
        }) as unknown as Response,
    );
    vi.stubGlobal('fetch', fetchFn);
  });

  it('AC2 — root container carries the responsive utility class set', async () => {
    const { container } = mountApp();
    await waitFor(() => expect(screen.getByText('No todos yet.')).toBeInTheDocument());

    const root = container.querySelector('.max-w-xl');
    expect(root).not.toBeNull();
    expect(root).toHaveClass('max-w-xl', 'mx-auto', 'px-4', 'pt-8', 'lg:pt-16');

    // Defensive: no direct child of the root introduces horizontal-scroll utilities.
    if (root) {
      for (const child of Array.from(root.children)) {
        const cls = child.className;
        expect(cls).not.toMatch(/overflow-x-(scroll|auto)/);
        expect(cls).not.toMatch(/\bw-screen\b/);
      }
    }
  });

  it('AC3 — Add button + first row checkbox + delete icon carry 44×44 tap-target classes (regression guard)', async () => {
    // Re-stub fetch to seed one todo so a TodoRow renders (overrides the empty stub
    // installed in this describe-block's beforeEach — vi.stubGlobal replaces, not stacks).
    const seededTodo: Todo = {
      id: '01',
      description: 'Buy milk',
      completed: false,
      userId: null,
      createdAt: '2026-04-20T10:00:00.000Z',
    };
    const fetchFn = vi.fn<FetchFn>(
      async () =>
        ({
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => [seededTodo],
        }) as unknown as Response,
    );
    vi.stubGlobal('fetch', fetchFn);

    mountApp();
    await waitFor(() => expect(screen.getByText('Buy milk')).toBeInTheDocument());

    const addBtn = screen.getByRole('button', { name: 'Add' });
    expect(addBtn).toHaveClass('min-h-[44px]', 'min-w-[64px]');

    const checkbox = screen.getByRole('checkbox') as HTMLInputElement;
    const checkboxWrapper = checkbox.parentElement;
    expect(checkboxWrapper).not.toBeNull();
    expect(checkboxWrapper).toHaveClass('min-w-[44px]', 'min-h-[44px]');

    const deleteBtn = screen.getByRole('button', { name: /^Delete todo:/ });
    expect(deleteBtn).toHaveClass('min-w-[44px]', 'min-h-[44px]');
  });
});

describe('DeleteTodoModal — responsive class set', () => {
  const todoFixture: Todo = {
    id: '01-modal-resp',
    description: 'Modal target',
    completed: false,
    userId: null,
    createdAt: '2026-04-20T10:00:00.000Z',
  };

  it('AC4 — dialog carries layout-utility classes; Cancel + Delete carry 44px tap-target classes', () => {
    render(<DeleteTodoModal todo={todoFixture} onCancel={vi.fn()} onConfirm={vi.fn()} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveClass(
      'max-w-[400px]',
      'w-[calc(100vw-32px)]',
      'p-6',
      'rounded-lg',
      'shadow-sm',
    );

    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveClass('min-h-[44px]');
    expect(screen.getByRole('button', { name: 'Delete' })).toHaveClass('min-h-[44px]');

    // Dev Notes flagged AC drift: the modal is `max-w-[400px] w-[calc(100vw-32px)]`,
    // so the cap kicks in at viewport ≥ 432px (not 640px as the AC text claims).
    // We do NOT assert numeric pixel widths here — jsdom can't evaluate `calc()`,
    // so any numeric assertion would either flake or read stale zeros. Real-pixel
    // verification at 320 vs 1024 lives in the Playwright matrix spec.
  });
});
