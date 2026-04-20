export default function EmptyState() {
  return (
    <div className="flex flex-col items-center text-center py-12">
      <svg
        aria-hidden="true"
        viewBox="0 0 64 64"
        width="64"
        height="64"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        className="text-[--color-fg-muted] opacity-70"
      >
        <line x1="16" y1="24" x2="48" y2="24" />
        <line x1="16" y1="32" x2="48" y2="32" />
        <line x1="16" y1="40" x2="40" y2="40" />
      </svg>
      <p className="text-base mt-6">No todos yet.</p>
      <p className="text-sm text-[--color-fg-muted] mt-1">Add one below.</p>
    </div>
  );
}
