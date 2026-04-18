import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ErrorBoundary } from './ErrorBoundary.js';

function Thrower({ when }: { when: boolean }) {
  if (when) throw new Error('test boom');
  return <p>ok</p>;
}

describe('<ErrorBoundary />', () => {
  const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

  afterEach(() => {
    consoleErrorSpy.mockClear();
  });

  it('renders children when nothing throws', () => {
    render(
      <ErrorBoundary>
        <Thrower when={false} />
      </ErrorBoundary>,
    );
    expect(screen.getByText('ok')).toBeInTheDocument();
  });

  it('renders the fallback UI when a child throws during render', () => {
    render(
      <ErrorBoundary>
        <Thrower when={true} />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Something went wrong.')).toBeInTheDocument();
    expect(screen.queryByText('ok')).not.toBeInTheDocument();
  });

  it('calls console.error with the captured error', () => {
    render(
      <ErrorBoundary>
        <Thrower when={true} />
      </ErrorBoundary>,
    );
    // React dev-mode logs its own error message first; ours is the call with the thrown Error instance.
    const calledWithOurError = consoleErrorSpy.mock.calls.some((call) =>
      call.some((arg) => arg instanceof Error && arg.message === 'test boom'),
    );
    expect(calledWithOurError).toBe(true);
  });
});
