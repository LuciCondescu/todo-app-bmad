type InlineErrorProps = {
  message: string;
  onRetry?: () => void;
  isRetrying?: boolean;
};

export default function InlineError({ message, onRetry, isRetrying }: InlineErrorProps) {
  return (
    <div
      role="alert"
      aria-live="polite"
      className="flex items-start gap-3 rounded-md px-3 py-3 border text-sm bg-[#fef2f2] border-[#fecaca] text-[#991b1b]"
    >
      <svg
        aria-hidden="true"
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="mt-0.5 shrink-0"
      >
        <circle cx="8" cy="8" r="6.5" />
        <line x1="8" y1="4.5" x2="8" y2="8.5" />
        <circle cx="8" cy="11" r="0.6" fill="currentColor" stroke="none" />
      </svg>
      <span className="whitespace-pre-wrap flex-1">{message}</span>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          disabled={isRetrying ?? false}
          aria-busy={isRetrying ? 'true' : undefined}
          className="min-h-[36px] px-4 rounded-md border border-[--color-border] bg-[--color-surface] text-[--color-fg] text-sm font-medium disabled:opacity-60 disabled:cursor-not-allowed"
        >
          Retry
        </button>
      ) : null}
    </div>
  );
}
