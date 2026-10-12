"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import {
  requestDeletionAction,
  updateGeneralAction,
} from "@/app/(app)/[orgSlug]/settings/general/actions";
import { FormAlert } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { GeneralSettingsDTO } from "@/lib/services/general-settings";

function timeZones(current: string): string[] {
  let zones: string[] = [];
  try {
    zones = Intl.supportedValuesOf("timeZone");
  } catch {
    /* older engines: fall back to the current value and UTC */
  }
  return [...new Set(["UTC", current, ...zones])].sort();
}

export function GeneralForm({
  orgSlug,
  initial,
  canDelete,
}: {
  orgSlug: string;
  initial: GeneralSettingsDTO;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState(initial.name);
  const [slug, setSlug] = useState(initial.slug);
  const [timezone, setTimezone] = useState(initial.timezone);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const zones = useMemo(() => timeZones(initial.timezone), [initial.timezone]);
  const slugChanged = slug !== initial.slug;

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setFieldErrors({});
    const result = await updateGeneralAction(orgSlug, { name, slug, timezone });
    setSaving(false);
    if (!result.ok) {
      setFieldErrors(result.error.fieldErrors ?? {});
      setError(result.error.message);
      return;
    }
    toast.success("Settings saved");
    // The old address stops working: continue on the new one.
    if (result.data.slug !== orgSlug) router.replace(`/${result.data.slug}/settings/general`);
    else router.refresh();
  }

  return (
    <div className="grid gap-6">
      <form
        onSubmit={save}
        noValidate
        className="grid gap-4 rounded-xl bg-surface p-5 shadow-md"
        data-testid="general-form"
      >
        <FormAlert>{error}</FormAlert>
        <label className="grid gap-1.5 text-sm font-medium">
          Workspace name
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
          {fieldErrors.name?.[0] ? (
            <span className="text-[0.8125rem] font-normal text-danger-ink">
              {fieldErrors.name[0]}
            </span>
          ) : null}
        </label>
        <label className="grid gap-1.5 text-sm font-medium">
          Address
          <span className="flex items-center gap-2">
            <span className="text-ink-muted">/</span>
            <Input
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase())}
              maxLength={40}
              aria-describedby="slug-hint"
            />
          </span>
          <span id="slug-hint" className="text-[0.8125rem] font-normal text-ink-muted">
            {slugChanged
              ? "Changing the address breaks bookmarks and links to the old one. You will land on the new address after saving."
              : "Lowercase letters, numbers and dashes."}
          </span>
          {fieldErrors.slug?.[0] ? (
            <span className="text-[0.8125rem] font-normal text-danger-ink">
              {fieldErrors.slug[0]}
            </span>
          ) : null}
        </label>
        <label className="grid gap-1.5 text-sm font-medium">
          Time zone
          <select
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            className="h-9 rounded-md border border-line-strong bg-surface px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            {zones.map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </select>
          <span className="text-[0.8125rem] font-normal text-ink-muted">
            Used for daily insights, digests and quiet hours defaults.
          </span>
        </label>
        <div>
          <Button type="submit" size="lg" className="font-bold" disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </form>

      {canDelete ? <DeleteWorkspace orgSlug={orgSlug} orgName={initial.name} /> : null}
    </div>
  );
}

function DeleteWorkspace({ orgSlug, orgName }: { orgSlug: string; orgName: string }) {
  const [open, setOpen] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recorded, setRecorded] = useState(false);

  async function submit() {
    setPending(true);
    setError(null);
    const result = await requestDeletionAction(orgSlug, { confirmName });
    setPending(false);
    if (!result.ok) {
      setError(result.error.fieldErrors?.confirmName?.[0] ?? result.error.message);
      return;
    }
    setRecorded(true);
    setOpen(false);
    toast.success("We noted your request");
  }

  return (
    <section
      aria-label="Delete workspace"
      className="grid gap-3 rounded-xl bg-surface p-5 shadow-md"
      data-testid="delete-workspace"
    >
      <h2 className="text-base font-semibold">Delete workspace</h2>
      <p className="text-sm text-ink-muted">
        Deleting removes the workspace and everything in it after a 30-day grace period. Deletion is
        not available yet: send us a request and we will follow up.
      </p>
      {recorded ? (
        <p className="text-sm font-medium text-success-ink">
          Request noted. Nothing has been deleted.
        </p>
      ) : (
        <div>
          <Button variant="destructive" onClick={() => setOpen(true)}>
            Request deletion
          </Button>
        </div>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl">Request deletion of “{orgName}”?</DialogTitle>
            <DialogDescription>
              Type the workspace name to confirm. This only records your request; nothing is deleted
              yet.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={confirmName}
            onChange={(e) => setConfirmName(e.target.value)}
            placeholder={orgName}
            aria-label="Workspace name"
          />
          <FormAlert>{error}</FormAlert>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={submit} disabled={pending}>
              {pending ? "Sending…" : "Request deletion"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
