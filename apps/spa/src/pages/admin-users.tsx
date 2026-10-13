import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";

import { listAdminUsers } from "@/lib/admin-api";

export function AdminUsersPage() {
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const users = useQuery({
    queryKey: ["admin-users", search],
    queryFn: () => listAdminUsers(search || undefined),
  });

  return (
    <>
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Users</h1>
        <p className="text-sm text-ink-muted">Search, ban, and impersonate across the platform.</p>
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
          placeholder="Search name or email"
          className="h-9 flex-1 rounded-control border border-line bg-canvas-sunken px-3 text-sm"
        />
        <button
          type="submit"
          className="h-9 rounded-control bg-accent-fill px-3 text-sm font-semibold text-accent-ink"
        >
          Search
        </button>
      </form>
      {users.isPending ? (
        <p className="text-sm text-ink-muted">Loading…</p>
      ) : users.isError ? (
        <p className="text-sm text-danger-ink">Could not load users.</p>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
          {users.data.items.map((u) => (
            <li key={u.id}>
              <Link
                to="/admin/users/$userId"
                params={{ userId: u.id }}
                className="grid gap-0.5 px-4 py-3 hover:bg-canvas-sunken"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium">{u.name || u.email}</span>
                  <span className="text-xs text-ink-faint">
                    {u.banned ? "Banned · " : ""}
                    {u.isAdmin ? "Admin · " : ""}
                    {u.orgCount} orgs
                  </span>
                </div>
                <p className="truncate text-xs text-ink-muted">{u.email}</p>
              </Link>
            </li>
          ))}
          {users.data.items.length === 0 ? (
            <li className="px-4 py-6 text-sm text-ink-muted">No users match.</li>
          ) : null}
        </ul>
      )}
    </>
  );
}
