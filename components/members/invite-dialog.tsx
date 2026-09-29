"use client";

import { Check, Copy, Link2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { inviteMemberAction } from "@/app/(app)/[orgSlug]/settings/members/actions";
import { FormAlert } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ROLES, type Role } from "@/lib/auth/permissions";
import type { InvitationDTO, MemberQuota } from "@/lib/dto/member";
import type { ProjectDTO } from "@/lib/dto/project";
import { ROLE_BLURBS, ROLE_LABELS } from "@/lib/validation/member";
import { ProjectChecklist } from "./project-checklist";

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Link box with a copy button: the fallback when the invitation email doesn't arrive. */
export function InviteLinkBox({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="grid gap-1.5">
      <div className="flex items-center gap-2">
        <Input
          readOnly
          value={link}
          aria-label="Invite link"
          className="font-mono text-xs"
          onFocus={(e) => e.currentTarget.select()}
        />
        <Button
          type="button"
          variant="outline"
          onClick={async () => {
            if (await copyText(link)) {
              setCopied(true);
              toast.success("Invite link copied");
              setTimeout(() => setCopied(false), 2000);
            } else toast.error("Couldn't copy. Select the link and copy it by hand.");
          }}
        >
          {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
          {copied ? "Copied" : "Copy link"}
        </Button>
      </div>
    </div>
  );
}

export function InviteDialog({
  orgSlug,
  actorRole,
  quota,
  projects,
}: {
  orgSlug: string;
  actorRole: Role;
  quota: MemberQuota;
  projects: Pick<ProjectDTO, "id" | "name" | "color">[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("viewer");
  const [projectIds, setProjectIds] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [created, setCreated] = useState<InvitationDTO | null>(null);

  const atLimit = quota.limit !== null && quota.used >= quota.limit;
  const roles = ROLES.filter((r) => r !== "owner" || actorRole === "owner");
  const canScope = role !== "owner" && role !== "admin" && projects.length > 0;

  function reset() {
    setEmail("");
    setRole("viewer");
    setProjectIds([]);
    setError(null);
    setEmailError(null);
    setCreated(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    setEmailError(null);
    const result = await inviteMemberAction(orgSlug, {
      email,
      role,
      projectIds: canScope && quota.scopesAllowed ? projectIds : [],
    });
    setPending(false);
    if (!result.ok) {
      const fe = result.error.fieldErrors?.email?.[0];
      if (fe) setEmailError(fe);
      else setError(result.error.message);
      return;
    }
    setCreated(result.data);
    router.refresh();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button className="font-bold" disabled={atLimit}>
          <Link2 aria-hidden /> Invite member
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        {created ? (
          <div className="grid gap-4">
            <DialogHeader>
              <DialogTitle className="text-xl">
                {created.emailSent ? "Invitation sent" : "Invitation ready"}
              </DialogTitle>
              <DialogDescription>
                {created.emailSent ? (
                  <>
                    We emailed <b className="font-semibold">{created.email}</b>. The link works for
                    7 days, once, and only for that address once they&apos;ve confirmed it.
                  </>
                ) : (
                  <>
                    We couldn&apos;t send the email, so copy this link and send it to{" "}
                    <b className="font-semibold">{created.email}</b> yourself. It works for 7 days
                    and only for that address.
                  </>
                )}
              </DialogDescription>
            </DialogHeader>
            {created.link ? <InviteLinkBox link={created.link} /> : null}
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  reset();
                }}
              >
                Invite another
              </Button>
              <Button onClick={() => setOpen(false)}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={submit} className="grid gap-4" noValidate>
            <DialogHeader>
              <DialogTitle className="text-xl">Invite a member</DialogTitle>
              <DialogDescription>
                They join as soon as they accept. Pick the access that fits their job.
              </DialogDescription>
            </DialogHeader>
            <FormAlert>{error}</FormAlert>
            <div className="grid gap-2">
              <Label htmlFor="invite-email">Email</Label>
              <Input
                id="invite-email"
                type="email"
                autoComplete="off"
                placeholder="teammate@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-invalid={!!emailError}
              />
              {emailError ? <p className="text-sm text-danger-ink">{emailError}</p> : null}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="invite-role">Role</Label>
              <Select value={role} onValueChange={(v) => setRole(v as Role)}>
                <SelectTrigger id="invite-role" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {roles.map((r) => (
                    <SelectItem key={r} value={r}>
                      {ROLE_LABELS[r]} · {ROLE_BLURBS[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {canScope ? (
              <div className="grid gap-2">
                <Label>Limit to projects</Label>
                {quota.scopesAllowed ? (
                  <>
                    <ProjectChecklist
                      name="invite-projects"
                      projects={projects}
                      value={projectIds}
                      onChange={setProjectIds}
                    />
                    <p className="text-[0.8125rem] text-ink-muted">
                      Leave all unchecked to give access to the whole workspace.
                    </p>
                  </>
                ) : (
                  <p className="text-[0.8125rem] text-ink-muted">
                    Limiting a member to projects is on Team and above.
                  </p>
                )}
              </div>
            ) : null}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending} className="font-bold">
                {pending ? "Creating…" : "Create invite link"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
