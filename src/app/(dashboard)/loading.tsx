export default function DashboardLoading() {
  return (
    <div role="status" aria-label="Loading page" className="space-y-6 py-2">
      <span className="sr-only">Loading page…</span>
      <div className="h-8 w-48 animate-pulse rounded-md bg-muted" />
      <div className="h-4 w-72 max-w-full animate-pulse rounded-md bg-muted" />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="h-56 animate-pulse rounded-xl bg-muted" />
        <div className="h-56 animate-pulse rounded-xl bg-muted" />
      </div>
    </div>
  );
}
