"use client";

import { Clock, Copy, FolderKanban, MoreHorizontal, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  cancelInvitationAction,
  changeMemberRoleAction,
} from "@/app/(app)/[orgSlug]/settings/members/actions";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ROLES, type Role } from "@/lib/auth/permissions";
import type { InvitationDTO, MemberDTO, MemberQuota } from "@/lib/dto/member";
import type { ProjectDTO } from "@/lib/dto/project";
import { ROLE_LABELS } from "@/lib/validation/member";
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
  actorRole,
  members,
  invitations,
  projects,
  quota,
}: {
  orgSlug: string;
  actorRole: Role;
  members: MemberDTO[];
  invitations: InvitationDTO[];
  projects: Pick<ProjectDTO, "id" | "name" | "color">[];
  quota: MemberQuota;
}) {
  const owners = members.filter((m) => m.role === "owner").length;
  const [removing, setRemoving] = useState<MemberDTO | null>(null);
  const [scoping, setScoping] = useState<MemberDTO | null>(null);

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-muted" data-testid="member-quota">
          {quota.limit === null
            ? `${quota.used} seats used · unlimited on ${quota.planLabel}`
            : `${quota.used} of ${quota.limit} seats used on ${quota.planLabel}`}
          {invitations.length > 0 ? " (pending invitations count)" : ""}
        </p>
        <InviteDialog orgSlug={orgSlug} actorRole={actorRole} quota={quota} projects={projects} />
      </div>

      <section aria-labelledby="members-h" className="grid gap-3">
        <h2 id="members-h" className="text-base font-semibold">
          Members
        </h2>
        <ul className="grid gap-2.5" aria-label="Members">
          {members.map((member) => (
            <MemberRow
              key={member.id}
              orgSlug={orgSlug}
              actorRole={actorRole}
              member={member}
              lastOwner={member.role === "owner" && owners <= 1}
              projects={projects}
              scopesAllowed={quota.scopesAllowed}
              onRemove={() => setRemoving(member)}
              onScope={() => setScoping(member)}
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
            Invitation emails aren&apos;t sent yet. Copy the link and share it with the invitee.
          </p>
          <ul className="grid gap-2.5" aria-label="Pending invitations">
            {invitations.map((invite) => (
              <InvitationRow
                key={invite.id}
                orgSlug={orgSlug}
                invite={invite}
                projects={projects}
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
        />
      ) : null}
    </div>
  );
}

function MemberRow({
  orgSlug,
  actorRole,
  member,
  lastOwner,
  projects,
  scopesAllowed,
  onRemove,
  onScope,
}: {
  orgSlug: string;
  actorRole: Role;
  member: MemberDTO;
  lastOwner: boolean;
  projects: Pick<ProjectDTO, "id" | "name" | "color">[];
  scopesAllowed: boolean;
  onRemove: () => void;
  onScope: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // Only Owners touch Owners; nobody removes themselves here; the last Owner is fixed.
  const lockedByRank = member.role === "owner" && actorRole !== "owner";
  const roleLocked = lockedByRank || lastOwner;
  const roles = ROLES.filter((r) => r !== "owner" || actorRole === "owner");
  const scopable = member.role !== "owner" && member.role !== "admin";
  const projectNames = (member.projectIds ?? [])
    .map((id) => projects.find((p) => p.id === id)?.name)
    .filter(Boolean);

  function changeRole(role: string) {
    startTransition(async () => {
      const result = await changeMemberRoleAction(orgSlug, {
        memberId: member.id,
        role: role as Role,
      });
      if (!result.ok) toast.error(result.error.message);
      else toast.success(`${member.name} is now ${ROLE_LABELS[role as Role]}`);
      router.refresh();
    });
  }

  return (
    <li
      data-testid={`member-${member.email}`}
      className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-xl bg-surface p-3.5 shadow-md min-[560px]:px-4"
    >
      <div className="flex min-w-0 flex-1 basis-56 items-center gap-3">
        <Avatar>
          {member.image ? <AvatarImage src={member.image} alt="" /> : null}
          <AvatarFallback className="bg-coral text-xs font-bold text-white">
            {initials(member.name)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">
            {member.name}
            {member.isYou ? <span className="font-normal text-ink-muted"> (you)</span> : null}
          </p>
          <p className="truncate text-[0.8125rem] text-ink-muted">{member.email}</p>
        </div>
      </div>

      <Select value={member.role} onValueChange={changeRole} disabled={roleLocked || pending}>
        <SelectTrigger
          size="sm"
          className="w-32"
          aria-label={`Role for ${member.name}`}
          title={
            lastOwner
              ? "The last Owner can't be changed. Make someone else an Owner first."
              : undefined
          }
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {roles.map((r) => (
            <SelectItem key={r} value={r}>
              {ROLE_LABELS[r]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="flex min-w-[9rem] items-center">
        {scopable ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={onScope}
            aria-label={`Project access for ${member.name}`}
            className="max-w-[16rem] justify-start gap-1.5 text-ink-secondary"
          >
            <FolderKanban aria-hidden />
            <span className="truncate">
              {member.projectIds
                ? projectNames.join(", ") || `${member.projectIds.length} projects`
                : scopesAllowed
                  ? "All projects"
                  : "All projects"}
            </span>
          </Button>
        ) : (
          <span className="px-2 text-[0.8125rem] text-ink-muted">Sees everything</span>
        )}
      </div>

      {!member.isYou && !lockedByRank ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${member.name}`}>
              <MoreHorizontal aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44 rounded-lg shadow-lg">
            {scopable ? (
              <>
                <DropdownMenuItem onSelect={onScope}>Project access…</DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            ) : null}
            <DropdownMenuItem variant="destructive" disabled={lastOwner} onSelect={onRemove}>
              Remove from workspace
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <span className="hidden size-8 min-[560px]:block" aria-hidden />
      )}
    </li>
  );
}

function InvitationRow({
  orgSlug,
  invite,
  projects,
}: {
  orgSlug: string;
  invite: InvitationDTO;
  projects: Pick<ProjectDTO, "id" | "name" | "color">[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const names = invite.projectIds
    .map((id) => projects.find((p) => p.id === id)?.name)
    .filter(Boolean);
  const days = invite.expiresInDays;

  return (
    <li
      data-testid={`invite-${invite.email}`}
      className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl bg-surface p-3.5 shadow-md min-[560px]:px-4"
    >
      <div className="min-w-0 flex-1 basis-56">
        <p className="truncate text-sm font-semibold">{invite.email}</p>
        <p className="flex flex-wrap items-center gap-x-2 text-[0.8125rem] text-ink-muted">
          <span>{ROLE_LABELS[invite.role]}</span>
          {names.length > 0 ? <span>· {names.join(", ")}</span> : null}
          <span className="inline-flex items-center gap-1" suppressHydrationWarning>
            <Clock aria-hidden className="size-3" /> expires in {days} {days === 1 ? "day" : "days"}
          </span>
        </p>
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={async () => {
          if (await copyText(invite.link)) toast.success("Invite link copied");
          else toast.error("Couldn't copy the link.");
        }}
      >
        <Copy aria-hidden /> Copy link
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={`Cancel invitation for ${invite.email}`}
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await cancelInvitationAction(orgSlug, { invitationId: invite.id });
            if (!result.ok) toast.error(result.error.message);
            else toast.success("Invitation canceled");
            router.refresh();
          })
        }
      >
        <X aria-hidden />
      </Button>
    </li>
  );
}
