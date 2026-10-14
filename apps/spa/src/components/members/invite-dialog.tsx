import { useEffect, useRef, useState } from "react";
import { Check, Copy, Link2 } from "lucide-react";

import { inviteMember } from "@/lib/actions";
import {
  MEMBER_ROLES,
  ROLE_BLURBS,
  ROLE_LABELS,
  type InvitationRow,
  type MemberProjectOption,
  type MemberQuota,
  type MemberRole,
} from "@/lib/api";

import { ProjectChecklist } from "./project-checklist";

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function InviteLinkBox({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <input
        readOnly
        value={link}
        aria-label="Invite link"
        className="h-9 min-w-0 flex-1 rounded-control border border-line bg-canvas px-3 font-mono text-xs"
        onFocus={(e) => e.currentTarget.select()}
      />
      <button
        type="button"
        className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-control border border-line px-3 text-xs font-medium hover:bg-canvas-sunken"
        onClick={() => {
          void copyText(link).then((ok) => {
            if (ok) {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 2000);
            }
          });
        }}
      >
        {copied ? <Check aria-hidden className="size-3.5" /> : <Copy aria-hidden className="size-3.5" />}
        {copied ? "Copied" : "Copy link"}
      </button>
    </div>
  );
}

export function InviteDialog({
  orgSlug,
  actorRole,
  quota,
  projects,
  open,
  onOpenChange,
  onCreated,
}: {
  orgSlug: string;
  actorRole: MemberRole;
  quota: MemberQuota;
  projects: MemberProjectOption[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<MemberRole>("viewer");
  const [projectIds, setProjectIds] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [created, setCreated] = useState<InvitationRow | null>(null);

  const atLimit = quota.limit !== null && quota.used >= quota.limit;
  const roles = MEMBER_ROLES.filter((r) => r !== "owner" || actorRole === "owner");
  const canScope = role !== "owner" && role !== "admin" && projects.length > 0;

  function reset() {
    setEmail("");
    setRole("viewer");
    setProjectIds([]);
    setError(null);
    setEmailError(null);
    setCreated(null);
  }

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  useEffect(() => {
    if (!open) reset();
  }, [open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    setEmailError(null);
    const result = await inviteMember(orgSlug, {
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
    setCreated(result.data as InvitationRow);
    onCreated();
  }

  return (
    <>
      <button
        type="button"
        disabled={atLimit}
        onClick={() => onOpenChange(true)}
        className="inline-flex h-9 items-center gap-1.5 rounded-control bg-accent-fill px-3 text-xs font-semibold text-accent-ink disabled:opacity-50"
      >
        <Link2 aria-hidden className="size-3.5" /> Invite member
      </button>

      <dialog
        ref={dialogRef}
        className="w-full max-w-md rounded-xl border border-line bg-surface p-0 text-ink shadow-lg backdrop:bg-ink/40"
        onClose={() => {
          if (open) onOpenChange(false);
        }}
      >
        <div className="grid gap-4 p-5">
          {created ? (
            <>
              <div>
                <h2 className="text-xl font-semibold">
                  {created.emailSent ? "Invitation sent" : "Invitation ready"}
                </h2>
                <p className="mt-1 text-sm text-ink-muted">
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
                </p>
              </div>
              {created.link ? <InviteLinkBox link={created.link} /> : null}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={reset}
                  className="h-9 rounded-control border border-line px-3 text-sm font-medium hover:bg-canvas-sunken"
                >
                  Invite another
                </button>
                <button
                  type="button"
                  onClick={() => onOpenChange(false)}
                  className="h-9 rounded-control bg-accent-fill px-3 text-sm font-semibold text-accent-ink"
                >
                  Done
                </button>
              </div>
            </>
          ) : (
            <form onSubmit={submit} className="grid gap-4" noValidate>
              <div>
                <h2 className="text-xl font-semibold">Invite a member</h2>
                <p className="mt-1 text-sm text-ink-muted">
                  They join as soon as they accept. Pick the access that fits their job.
                </p>
              </div>
              {error ? (
                <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger-ink">
                  {error}
                </p>
              ) : null}
              <label className="grid gap-1.5 text-sm">
                <span className="font-medium">Email</span>
                <input
                  type="email"
                  autoComplete="off"
                  placeholder="teammate@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  aria-invalid={!!emailError}
                  className="h-9 rounded-control border border-line bg-canvas px-3"
                />
                {emailError ? (
                  <span className="text-xs text-danger-ink">{emailError}</span>
                ) : null}
              </label>
              <label className="grid gap-1.5 text-sm">
                <span className="font-medium">Role</span>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as MemberRole)}
                  className="h-9 rounded-control border border-line bg-canvas px-2"
                >
                  {roles.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r]} · {ROLE_BLURBS[r]}
                    </option>
                  ))}
                </select>
              </label>
              {canScope ? (
                <div className="grid gap-2">
                  <span className="text-sm font-medium">Limit to projects</span>
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
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => onOpenChange(false)}
                  className="h-9 rounded-control border border-line px-3 text-sm font-medium hover:bg-canvas-sunken"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={pending || !email.trim()}
                  className="h-9 rounded-control bg-accent-fill px-3 text-sm font-semibold text-accent-ink disabled:opacity-50"
                >
                  {pending ? "Creating…" : "Create invite link"}
                </button>
              </div>
            </form>
          )}
        </div>
      </dialog>
    </>
  );
}
