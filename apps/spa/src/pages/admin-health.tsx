import { useQuery } from "@tanstack/react-query";

import { getAdminHealth } from "@/lib/admin-api";

export function AdminHealthPage() {
  const health = useQuery({ queryKey: ["admin-health"], queryFn: getAdminHealth });

  if (health.isPending) return <p className="text-sm text-ink-muted">Loading…</p>;
  if (health.isError || !health.data) {
    return <p className="text-sm text-danger-ink">Could not load system health.</p>;
  }

  const h = health.data;
  return (
    <>
      <header>
        <h1 className="text-xl font-semibold tracking-tight">System health</h1>
        <p className="text-sm text-ink-muted">Cross-tenant operational signals (read-only).</p>
      </header>
      <pre className="overflow-auto rounded-xl border border-line bg-surface p-4 text-xs leading-relaxed">
        {JSON.stringify(h, null, 2)}
      </pre>
    </>
  );
}
