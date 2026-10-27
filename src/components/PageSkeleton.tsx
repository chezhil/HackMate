// Placeholder shown while the client-side app shell loads.
export function PageSkeleton() {
  return (
    <div className="space-y-3">
      <div className="h-8 w-64 animate-pulse rounded-lg bg-surface-2" />
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="h-24 animate-pulse rounded-xl bg-surface-2" />
      ))}
    </div>
  );
}
