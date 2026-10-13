import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { useState } from "react";

import {
  ResourceEmpty,
  ResourceError,
  ResourcePage,
  ResourcePending,
} from "@/components/resource-page";
import { cancelInvitation, inviteMember, resendInvitation } from "@/lib/actions";
import { listMembersBundle } from "@/lib/api";

const INVITE_ROLES = ["admin", "developer", "support", "viewer"] as const;

export function SettingsMembersPage() {
  const { orgSlug } = useParams({ from: "/$orgSlug/settings/members" });
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<(typeof INVITE_ROLES)[number]>("viewer");
  const bundle = useQuery({
    queryKey: ["members", orgSlug],
    queryFn: () => listMembersBundle(orgSlug),
  });

  const invite = useMutation({
    mutationFn: () => inviteMember(orgSlug, { email, role }),
    onSuccess: async (result) => {
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setError(null);
      setEmail("");
      await queryClient.invalidateQueries({ queryKey: ["members", orgSlug] });
    },
    onError: () => setError("Could not send the invitation."),
  });

  const invitationAction = useMutation({
    mutationFn: ({ id, kind }: { id: string; kind: "cancel" | "resend" }) =>
      kind === "cancel" ? cancelInvitation(orgSlug, id) : resendInvitation(orgSlug, id),
    onSuccess: async (result) => {
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ["members", orgSlug] });
    },
    onError: () => setError("Could not update the invitation."),
  });

  return (
    <ResourcePage title="Members" description="Invite / cancel / resend via org actions">
      {error ? (
        <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger-ink">
          {error}
        </p>
      ) : null}

      <form
        className="grid gap-2 rounded-lg border border-line bg-surface p-4 sm:grid-cols-[1fr_auto_auto]"
        onSubmit={(e) => {
          e.preventDefault();
          invite.mutate();
        }}
      >
        <label className="grid gap-1 text-sm">
          <span className="text-xs font-medium text-ink-muted">Email</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-9 rounded-control border border-line bg-canvas px-3 text-sm"
            placeholder="teammate@company.com"
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-xs font-medium text-ink-muted">Role</span>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as (typeof INVITE_ROLES)[number])}
            className="h-9 rounded-control border border-line bg-canvas px-2 text-sm"
          >
            {INVITE_ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-end">
          <button
            type="submit"
            disabled={invite.isPending || !email.trim()}
            className="h-9 rounded-control bg-accent-fill px-3 text-sm font-semibold text-accent-ink hover:bg-accent-fill-hover disabled:opacity-50"
          >
            Invite
          </button>
        </div>
      </form>

      {bundle.isPending ? (
        <ResourcePending />
      ) : bundle.isError ? (
        <ResourceError message="Could not load members (permission or API)." />
      ) : (
        <div className="grid gap-6">
          <div className="grid gap-2">
            <h2 className="text-sm font-semibold">People</h2>
            {bundle.data.members.length === 0 ? (
              <ResourceEmpty>No members.</ResourceEmpty>
            ) : (
              <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
                {bundle.data.members.map((row) => (
                  <li key={row.id} className="flex items-baseline justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {row.name}
                        {row.isYou ? " (you)" : ""}
                      </p>
                      <p className="truncate text-xs text-ink-muted">{row.email}</p>
                    </div>
                    <span className="shrink-0 text-xs font-medium text-ink-secondary">{row.role}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="grid gap-2">
            <h2 className="text-sm font-semibold">Pending invitations</h2>
            {bundle.data.invitations.length === 0 ? (
              <p className="text-sm text-ink-muted">None pending.</p>
            ) : (
              <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
                {bundle.data.invitations.map((row) => (
                  <li key={row.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{row.email}</p>
                      <p className="text-xs text-ink-muted">{row.role}</p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <button
                        type="button"
                        disabled={invitationAction.isPending}
                        onClick={() => invitationAction.mutate({ id: row.id, kind: "resend" })}
                        className="rounded-control border border-line px-2.5 py-1 text-xs font-medium hover:bg-canvas-sunken disabled:opacity-50"
                      >
                        Resend
                      </button>
                      <button
                        type="button"
                        disabled={invitationAction.isPending}
                        onClick={() => invitationAction.mutate({ id: row.id, kind: "cancel" })}
                        className="rounded-control border border-line px-2.5 py-1 text-xs font-medium text-danger-ink hover:bg-danger-soft disabled:opacity-50"
                      >
                        Cancel
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </ResourcePage>
  );
}
