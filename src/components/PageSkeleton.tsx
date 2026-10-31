// Placeholder shown while the client-side app shell loads.
export function PageSkeleton() {
  return (
    <div className="space-y-3">
      <div className="h-8 w-64 skeleton rounded-lg" />
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="h-24 skeleton rounded-xl" />
      ))}
    </div>
  );
}
