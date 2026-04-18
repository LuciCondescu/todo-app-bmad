import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App.js';
import { ErrorBoundary } from './components/ErrorBoundary.js';

describe('<App /> mounted in the full provider tree', () => {
  it('mounts without error and renders the Header', () => {
    const qc = new QueryClient();
    render(
      <ErrorBoundary>
        <QueryClientProvider client={qc}>
          <App />
        </QueryClientProvider>
      </ErrorBoundary>,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Todos' })).toBeInTheDocument();
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('main')).toBeInTheDocument();
  });
});
