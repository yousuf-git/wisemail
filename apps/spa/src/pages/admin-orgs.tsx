import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";

import { listAdminOrgs } from "@/lib/admin-api";

export function AdminOrgsPage() {
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const orgs = useQuery({
    queryKey: ["admin-orgs", search],
    queryFn: () => listAdminOrgs(search || undefined),
  });

  return (
    <>
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Organizations</h1>
        <p className="text-sm text-ink-muted">Plans, suspensions, and limits across tenants.</p>
      </header>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setSearch(q.trim());
        }}
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name or slug"
          className="h-9 flex-1 rounded-control border border-line bg-canvas-sunken px-3 text-sm"
        />
        <button
          type="submit"
          className="h-9 rounded-control bg-accent-fill px-3 text-sm font-semibold text-accent-ink"
        >
          Search
        </button>
      </form>
      {orgs.isPending ? (
        <p className="text-sm text-ink-muted">Loading…</p>
      ) : orgs.isError ? (
        <p className="text-sm text-danger-ink">Could not load organizations.</p>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
          {orgs.data.items.map((o) => (
            <li key={o.id}>
              <Link
                to="/admin/organizations/$orgId"
                params={{ orgId: o.id }}
                className="grid gap-0.5 px-4 py-3 hover:bg-canvas-sunken"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium">{o.name}</span>
                  <span className="text-xs text-ink-faint">
                    {o.suspended ? "Suspended · " : ""}
                    {o.planLabel} · {o.members} members
                  </span>
                </div>
                <p className="truncate text-xs text-ink-muted">{o.slug}</p>
              </Link>
            </li>
          ))}
          {orgs.data.items.length === 0 ? (
            <li className="px-4 py-6 text-sm text-ink-muted">No organizations match.</li>
          ) : null}
        </ul>
      )}
    </>
  );
}
