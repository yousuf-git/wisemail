import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import { useState } from "react";

import { callAdminAction, getAdminUser } from "@/lib/admin-api";

export function AdminUserPage() {
  const { userId } = useParams({ from: "/admin/users/$userId" });
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const user = useQuery({
    queryKey: ["admin-user", userId],
    queryFn: () => getAdminUser(userId),
  });

  const act = useMutation({
    mutationFn: (args: { id: string; input: Record<string, unknown> }) =>
      callAdminAction(args.id, args.input),
    onSuccess: async (result) => {
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setError(null);
      setReason("");
      await queryClient.invalidateQueries({ queryKey: ["admin-user", userId] });
      if (result.data && typeof result.data === "object" && "path" in result.data) {
        const path = String((result.data as { path: string }).path);
        window.location.assign(path.startsWith("http") ? path : path);
      }
    },
    onError: () => setError("Action failed."),
  });

  if (user.isPending) return <p className="text-sm text-ink-muted">Loading…</p>;
  if (user.isError || !user.data) {
    return <p className="text-sm text-danger-ink">User not found.</p>;
  }

  const u = user.data;
  const canMutate = !u.isAdmin && !u.isSuperAdmin;

  return (
    <>
      <Link to="/admin/users" className="text-sm text-accent-fill hover:underline">
        ← Users
      </Link>
      <header>
        <h1 className="text-xl font-semibold tracking-tight">{u.name || u.email}</h1>
        <p className="text-sm text-ink-muted">{u.email}</p>
      </header>
      {error ? (
        <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger-ink">
          {error}
        </p>
      ) : null}
      <dl className="grid gap-2 rounded-xl border border-line bg-surface p-4 text-sm">
        <Row k="Verified" v={u.emailVerified ? "Yes" : "No"} />
        <Row k="Role" v={String(u.role)} />
        <Row k="Banned" v={u.banned ? "Yes" : "No"} />
        <Row k="Orgs" v={String(u.orgCount)} />
        <Row k="Joined" v={new Date(u.createdAt).toLocaleString()} />
      </dl>
      {canMutate ? (
        <div className="grid max-w-lg gap-3 rounded-xl border border-line bg-surface p-4">
          <label className="grid gap-1 text-sm">
            Reason (required for destructive actions)
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="h-9 rounded-control border border-line bg-canvas-sunken px-3"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            {u.banned ? (
              <button
                type="button"
                disabled={act.isPending}
                className="h-9 rounded-control border border-line px-3 text-sm font-medium"
                onClick={() =>
                  act.mutate({ id: "admin.users.unban", input: { userId, reason: reason || undefined } })
                }
              >
                Unban
              </button>
            ) : (
              <button
                type="button"
                disabled={act.isPending || reason.trim().length < 5}
                className="h-9 rounded-control bg-danger-soft px-3 text-sm font-medium text-danger-ink disabled:opacity-50"
                onClick={() =>
                  act.mutate({ id: "admin.users.ban", input: { userId, reason: reason.trim() } })
                }
              >
                Ban
              </button>
            )}
            <button
              type="button"
              disabled={act.isPending || reason.trim().length < 5}
              className="h-9 rounded-control border border-line px-3 text-sm font-medium disabled:opacity-50"
              onClick={() =>
                act.mutate({
                  id: "admin.users.revokeSessions",
                  input: { userId, reason: reason.trim() },
                })
              }
            >
              Revoke sessions
            </button>
            <button
              type="button"
              disabled={act.isPending || reason.trim().length < 5}
              className="h-9 rounded-control bg-accent-fill px-3 text-sm font-semibold text-accent-ink disabled:opacity-50"
              onClick={() =>
                act.mutate({
                  id: "admin.users.impersonate",
                  input: { userId, reason: reason.trim() },
                })
              }
            >
              Impersonate
            </button>
            {!u.emailVerified ? (
              <button
                type="button"
                disabled={act.isPending}
                className="h-9 rounded-control border border-line px-3 text-sm font-medium"
                onClick={() =>
                  act.mutate({ id: "admin.users.resendVerification", input: { userId } })
                }
              >
                Resend verification
              </button>
            ) : null}
          </div>
        </div>
      ) : (
        <p className="text-sm text-ink-muted">Platform admins cannot be mutated here.</p>
      )}
    </>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-ink-muted">{k}</dt>
      <dd className="font-medium">{v}</dd>
    </div>
  );
}
