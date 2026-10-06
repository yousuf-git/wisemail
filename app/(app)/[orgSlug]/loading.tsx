/** Instant feedback on soft navigations while the org layout / page resolve. */
export default function OrgLoading() {
  return (
    <div className="flex flex-1 flex-col gap-3.5" aria-busy="true" aria-live="polite">
      <div className="h-8 w-48 animate-pulse rounded-md bg-canvas-sunken" />
      <div className="h-4 w-80 max-w-full animate-pulse rounded-md bg-canvas-sunken" />
      <div className="mt-2 grid gap-3 min-[720px]:grid-cols-2 min-[1100px]:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-lg bg-surface shadow-md" />
        ))}
      </div>
      <div className="mt-1 min-h-64 flex-1 animate-pulse rounded-lg bg-surface shadow-md" />
      <span className="sr-only">Loading</span>
    </div>
  );
}
