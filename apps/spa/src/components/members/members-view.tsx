import { useState } from "react";
import { Clock, FolderKanban, MoreHorizontal, Send, X } from "lucide-react";

import {
  cancelInvitation,
  changeMemberRole,
  resendInvitation,
} from "@/lib/actions";
import {
  MEMBER_ROLES,
  ROLE_LABELS,
  type InvitationRow,
  type MemberProjectOption,
  type MemberRole,
  type MemberRow,
  type MembersPagePayload,
} from "@/lib/api";

import { copyText, InviteDialog } from "./invite-dialog";
import { RemoveMemberDialog } from "./remove-member-dialog";
import { ScopeDialog } from "./scope-dialog";

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

export function MembersView({
  orgSlug,
  data,
  onChanged,
}: {
  orgSlug: string;
  data: MembersPagePayload;
  onChanged: () => void;
}) {
  const { members, invitations, projects, quota, actorRole } = data;
  const owners = members.filter((m) => m.role === "owner").length;
  const [inviting, setInviting] = useState(false);
  const [removing, setRemoving] = useState<MemberRow | null>(null);
  const [scoping, setScoping] = useState<MemberRow | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  return (
    <div className="grid gap-5">
      {actionError ? (
        <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger-ink">
          {actionError}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-muted" data-testid="member-quota">
          {quota.limit === null
            ? `${quota.used} seats used · unlimited on ${quota.planLabel}`
            : `${quota.used} of ${quota.limit} seats used on ${quota.planLabel}`}
          {invitations.length > 0 ? " (pending invitations count)" : ""}
        </p>
        <InviteDialog
          orgSlug={orgSlug}
          actorRole={actorRole}
          quota={quota}
          projects={projects}
          open={inviting}
          onOpenChange={setInviting}
          onCreated={onChanged}
        />
      </div>

      <section aria-labelledby="members-h" className="grid gap-3">
        <h2 id="members-h" className="text-base font-semibold">
          Members
        </h2>
        <ul className="grid gap-2.5" aria-label="Members">
          {members.map((member) => (
            <MemberRowCard
              key={member.id}
              orgSlug={orgSlug}
              actorRole={actorRole}
              member={member}
              lastOwner={member.role === "owner" && owners <= 1}
              projects={projects}
              scopesAllowed={quota.scopesAllowed}
              onRemove={() => setRemoving(member)}
              onScope={() => setScoping(member)}
              onChanged={onChanged}
              onError={setActionError}
            />
          ))}
        </ul>
      </section>

      {invitations.length > 0 ? (
        <section aria-labelledby="invites-h" className="grid gap-3">
          <h2 id="invites-h" className="text-base font-semibold">
            Pending invitations
          </h2>
          <p className="text-[0.8125rem] text-ink-muted">
            Invitees get an email with a single-use link. Links can&apos;t be shown again, so use
            Resend to send a new one.
          </p>
          <ul className="grid gap-2.5" aria-label="Pending invitations">
            {invitations.map((invite) => (
              <InvitationRowCard
                key={invite.id}
                orgSlug={orgSlug}
                invite={invite}
                projects={projects}
                onChanged={onChanged}
                onError={setActionError}
              />
            ))}
          </ul>
        </section>
      ) : null}

      {removing ? (
        <RemoveMemberDialog
          orgSlug={orgSlug}
          member={removing}
          open
          onOpenChange={(o) => !o && setRemoving(null)}
          onRemoved={onChanged}
        />
      ) : null}
      {scoping ? (
        <ScopeDialog
          key={scoping.id}
          orgSlug={orgSlug}
          member={scoping}
          projects={projects}
          open
          onOpenChange={(o) => !o && setScoping(null)}
          onSaved={onChanged}
        />
      ) : null}
    </div>
  );
}

function MemberRowCard({
  orgSlug,
  actorRole,
  member,
  lastOwner,
  projects,
  scopesAllowed,
  onRemove,
  onScope,
  onChanged,
  onError,
}: {
  orgSlug: string;
  actorRole: MemberRole;
  member: MemberRow;
  lastOwner: boolean;
  projects: MemberProjectOption[];
  scopesAllowed: boolean;
  onRemove: () => void;
  onScope: () => void;
  onChanged: () => void;
  onError: (msg: string | null) => void;
}) {
  const [pending, setPending] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const lockedByRank = member.role === "owner" && actorRole !== "owner";
  const roleLocked = lockedByRank || lastOwner;
  const roles = MEMBER_ROLES.filter((r) => r !== "owner" || actorRole === "owner");
  const scopable = member.role !== "owner" && member.role !== "admin";
  const projectNames = (member.projectIds ?? [])
    .map((id) => projects.find((p) => p.id === id)?.name)
    .filter(Boolean);

  async function changeRole(role: string) {
    setPending(true);
    onError(null);
    const result = await changeMemberRole(orgSlug, member.id, role);
    setPending(false);
    if (!result.ok) {
      onError(result.error.message);
      return;
    }
    onChanged();
  }

  return (
    <li
      data-testid={`member-${member.email}`}
      className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-xl border border-line bg-surface p-3.5 shadow-sm min-[560px]:px-4"
    >
      <div className="flex min-w-0 flex-1 basis-56 items-center gap-3">
        <span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-full bg-coral text-xs font-bold text-ink">
          {member.image ? (
            <img src={member.image} alt="" className="size-full object-cover" />
          ) : (
            initials(member.name)
          )}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">
            {member.name}
            {member.isYou ? <span className="font-normal text-ink-muted"> (you)</span> : null}
          </p>
          <p className="truncate text-[0.8125rem] text-ink-muted">{member.email}</p>
        </div>
      </div>

      <select
        value={member.role}
        disabled={roleLocked || pending}
        aria-label={`Role for ${member.name}`}
        title={
          lastOwner
            ? "The last Owner can't be changed. Make someone else an Owner first."
            : undefined
        }
        onChange={(e) => void changeRole(e.target.value)}
        className="h-8 w-32 rounded-control border border-line bg-canvas px-2 text-sm disabled:opacity-50"
      >
        {roles.map((r) => (
          <option key={r} value={r}>
            {ROLE_LABELS[r]}
          </option>
        ))}
      </select>

      <div className="flex min-w-[9rem] items-center">
        {scopable ? (
          <button
            type="button"
            onClick={onScope}
            aria-label={`Project access for ${member.name}`}
            className="inline-flex max-w-[16rem] items-center gap-1.5 rounded-control px-2 py-1 text-sm text-ink-secondary hover:bg-canvas-sunken"
          >
            <FolderKanban aria-hidden className="size-3.5 shrink-0" />
            <span className="truncate">
              {member.projectIds
                ? projectNames.join(", ") || `${member.projectIds.length} projects`
                : scopesAllowed
                  ? "All projects"
                  : "All projects"}
            </span>
          </button>
        ) : (
          <span className="px-2 text-[0.8125rem] text-ink-muted">Sees everything</span>
        )}
      </div>

      {!member.isYou && !lockedByRank ? (
        <div className="relative shrink-0">
          <button
            type="button"
            aria-label={`Actions for ${member.name}`}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((o) => !o)}
            className="inline-flex size-8 items-center justify-center rounded-control text-ink-muted hover:bg-canvas-sunken"
          >
            <MoreHorizontal aria-hidden className="size-4" />
          </button>
          {menuOpen ? (
            <div
              role="menu"
              className="absolute top-9 right-0 z-20 grid min-w-[12rem] overflow-hidden rounded-lg border border-line bg-surface py-1 shadow-lg"
            >
              {scopable ? (
                <button
                  type="button"
                  role="menuitem"
                  className="px-3 py-2 text-left text-sm hover:bg-canvas-sunken"
                  onClick={() => {
                    setMenuOpen(false);
                    onScope();
                  }}
                >
                  Project access…
                </button>
              ) : null}
              <button
                type="button"
                role="menuitem"
                disabled={lastOwner}
                className="px-3 py-2 text-left text-sm text-danger-ink hover:bg-danger-soft disabled:opacity-50"
                onClick={() => {
                  setMenuOpen(false);
                  onRemove();
                }}
              >
                Remove from workspace
              </button>
            </div>
          ) : null}
        </div>
      ) : (
        <span className="hidden size-8 min-[560px]:block" aria-hidden />
      )}
    </li>
  );
}

function InvitationRowCard({
  orgSlug,
  invite,
  projects,
  onChanged,
  onError,
}: {
  orgSlug: string;
  invite: InvitationRow;
  projects: MemberProjectOption[];
  onChanged: () => void;
  onError: (msg: string | null) => void;
}) {
  const [pending, setPending] = useState(false);
  const names = invite.projectIds
    .map((id) => projects.find((p) => p.id === id)?.name)
    .filter(Boolean);
  const days = invite.expiresInDays;

  return (
    <li
      data-testid={`invite-${invite.email}`}
      className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-line bg-surface p-3.5 shadow-sm min-[560px]:px-4"
    >
      <div className="min-w-0 flex-1 basis-56">
        <p className="truncate text-sm font-semibold">{invite.email}</p>
        <p className="flex flex-wrap items-center gap-x-2 text-[0.8125rem] text-ink-muted">
          <span>{ROLE_LABELS[invite.role]}</span>
          {names.length > 0 ? <span>· {names.join(", ")}</span> : null}
          <span className="inline-flex items-center gap-1">
            <Clock aria-hidden className="size-3" /> expires in {days} {days === 1 ? "day" : "days"}
          </span>
        </p>
      </div>
      <button
        type="button"
        disabled={pending}
        className="inline-flex h-8 items-center gap-1.5 rounded-control border border-line px-2.5 text-xs font-medium hover:bg-canvas-sunken disabled:opacity-50"
        onClick={() => {
          void (async () => {
            setPending(true);
            onError(null);
            const result = await resendInvitation(orgSlug, invite.id);
            setPending(false);
            if (!result.ok) {
              onError(result.error.message);
              return;
            }
            if (!result.data.emailSent && result.data.link) {
              await copyText(result.data.link);
            }
            onChanged();
          })();
        }}
      >
        <Send aria-hidden className="size-3.5" /> Resend
      </button>
      <button
        type="button"
        aria-label={`Cancel invitation for ${invite.email}`}
        disabled={pending}
        className="inline-flex size-8 items-center justify-center rounded-control text-ink-muted hover:bg-canvas-sunken disabled:opacity-50"
        onClick={() => {
          void (async () => {
            setPending(true);
            onError(null);
            const result = await cancelInvitation(orgSlug, invite.id);
            setPending(false);
            if (!result.ok) {
              onError(result.error.message);
              return;
            }
            onChanged();
          })();
        }}
      >
        <X aria-hidden className="size-4" />
      </button>
    </li>
  );
}
