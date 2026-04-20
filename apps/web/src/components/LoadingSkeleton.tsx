interface LoadingSkeletonProps {
  rows?: number;
}

export default function LoadingSkeleton({ rows = 3 }: LoadingSkeletonProps) {
  return (
    <div
      className="animate-pulse"
      role="status"
      aria-busy="true"
      aria-live="polite"
      aria-label="Loading your todos"
    >
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 py-3 md:py-4 px-2 border-b border-[--color-border]"
        >
          <span className="inline-flex items-center justify-center min-w-[44px] min-h-[44px]">
            <div className="w-5 h-5 rounded-full bg-[--color-border]" />
          </span>
          <div className="flex-1 h-4 rounded bg-[--color-border]" />
          <span className="inline-flex items-center justify-center min-w-[44px] min-h-[44px]">
            <div className="w-[18px] h-[18px] rounded bg-[--color-border]" />
          </span>
        </div>
      ))}
    </div>
  );
}
