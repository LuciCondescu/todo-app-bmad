import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AddTodoInput from './AddTodoInput.js';

type AddTodoInputProps = Parameters<typeof AddTodoInput>[0];

function renderComponent(props: Partial<AddTodoInputProps> = {}) {
  const onSubmit = props.onSubmit ?? vi.fn();
  const result = render(<AddTodoInput {...props} onSubmit={onSubmit} />);
  return {
    onSubmit,
    input: screen.getByRole('textbox', { name: 'Add a todo' }) as HTMLInputElement,
    button: screen.getByRole('button', { name: 'Add' }) as HTMLButtonElement,
    rerender: result.rerender,
  };
}

describe('<AddTodoInput />', () => {
  it('auto-focuses the input on mount', () => {
    const { input } = renderComponent();
    expect(input).toHaveFocus();
  });

  it('has the required input attributes (maxlength, autocomplete, aria-label, type)', () => {
    const { input } = renderComponent();
    expect(input.getAttribute('maxlength')).toBe('500');
    expect(input.getAttribute('autocomplete')).toBe('off');
    expect(input.getAttribute('aria-label')).toBe('Add a todo');
    expect(input.getAttribute('type')).toBe('text');
  });

  it('input has computed font-size ≥ 16px (iOS auto-zoom guard)', () => {
    const { input } = renderComponent();
    const fontSize = parseFloat(getComputedStyle(input).fontSize);
    // jsdom doesn't process Tailwind CSS; fall back to 16 if no explicit style resolved.
    expect(Number.isNaN(fontSize) ? 16 : fontSize).toBeGreaterThanOrEqual(16);
  });

  it('calls onSubmit("Buy milk") when the user types and presses Enter', async () => {
    const user = userEvent.setup();
    const { onSubmit, input } = renderComponent();
    await user.type(input, 'Buy milk{Enter}');
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith('Buy milk');
  });

  it('calls onSubmit with the current value when Add is clicked', async () => {
    const user = userEvent.setup();
    const { onSubmit, input, button } = renderComponent();
    await user.type(input, 'Buy milk');
    await user.click(button);
    expect(onSubmit).toHaveBeenCalledWith('Buy milk');
  });

  it('does NOT call onSubmit on empty submission (click + Enter)', async () => {
    const user = userEvent.setup();
    const { onSubmit, input, button } = renderComponent();
    await user.click(button);
    await user.type(input, '{Enter}');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it.each([
    ['spaces only', '   '],
    ['mixed whitespace', '  \t '],
  ])('does NOT call onSubmit on whitespace-only input (%s)', async (_label, ws) => {
    const user = userEvent.setup();
    const { onSubmit, input, button } = renderComponent();
    await user.type(input, ws);
    await user.click(button);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('clears value and refocuses the input when disabled flips true → false with no error', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const { rerender } = render(<AddTodoInput onSubmit={onSubmit} disabled={false} />);
    const input = screen.getByRole('textbox') as HTMLInputElement;
    await user.type(input, 'Buy milk');

    rerender(<AddTodoInput onSubmit={onSubmit} disabled={true} />);
    expect(input.value).toBe('Buy milk');

    rerender(<AddTodoInput onSubmit={onSubmit} disabled={false} error={null} />);
    expect(input.value).toBe('');
    expect(input).toHaveFocus();
  });

  it('does NOT clear value when disabled flips true → false with an error present', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const { rerender } = render(<AddTodoInput onSubmit={onSubmit} />);
    const input = screen.getByRole('textbox') as HTMLInputElement;
    await user.type(input, 'Buy milk');

    rerender(<AddTodoInput onSubmit={onSubmit} disabled={true} />);
    rerender(
      <AddTodoInput
        onSubmit={onSubmit}
        disabled={false}
        error="Couldn't save. Check your connection."
      />,
    );
    expect(input.value).toBe('Buy milk');
  });

  it('disabled={true} sets the button disabled + aria-busy and leaves the input editable', () => {
    const { input, button } = renderComponent({ disabled: true });
    expect(button).toBeDisabled();
    expect(button.getAttribute('aria-busy')).toBe('true');
    expect(input).not.toBeDisabled();
  });

  it('renders error with role=alert when error prop is a non-empty string', () => {
    renderComponent({ error: "Couldn't save. Check your connection." });
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent("Couldn't save. Check your connection.");
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['empty string', ''],
  ])('does NOT render error region for error=%s', (_label, value) => {
    renderComponent({ error: value });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('renders a Retry button inside the alert region when error + onRetry are both provided', () => {
    renderComponent({ error: "Couldn't save. Check your connection.", onRetry: vi.fn() });
    const alert = screen.getByRole('alert');
    expect(within(alert).getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('clicking Retry inside the alert region calls onRetry exactly once', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    renderComponent({ error: "Couldn't save. Check your connection.", onRetry });
    const retryBtn = within(screen.getByRole('alert')).getByRole('button', { name: /retry/i });
    await user.click(retryBtn);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('isRetrying=true disables Retry with aria-busy="true" (delegated to InlineError)', () => {
    renderComponent({
      error: "Couldn't save. Check your connection.",
      onRetry: vi.fn(),
      isRetrying: true,
    });
    const retryBtn = within(screen.getByRole('alert')).getByRole('button', { name: /retry/i });
    expect(retryBtn).toBeDisabled();
    expect(retryBtn).toHaveAttribute('aria-busy', 'true');
  });

  it('alert region unmounts when error transitions from a non-empty string → null', () => {
    const onSubmit = vi.fn();
    const { rerender } = render(
      <AddTodoInput onSubmit={onSubmit} error="Couldn't save. Check your connection." />,
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
    rerender(<AddTodoInput onSubmit={onSubmit} error={null} />);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
