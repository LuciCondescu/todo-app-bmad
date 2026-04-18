import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Header from './Header.js';

describe('<Header />', () => {
  it('renders a single <h1> with exact text "Todos"', () => {
    render(<Header />);
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent(/^Todos$/);
  });

  it('renders the heading inside a <header> landmark', () => {
    render(<Header />);
    const banner = screen.getByRole('banner');
    expect(banner).toContainElement(screen.getByRole('heading', { level: 1 }));
  });
});
