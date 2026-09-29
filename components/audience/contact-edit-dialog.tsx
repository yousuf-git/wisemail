"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { updateContactAction } from "@/app/(app)/[orgSlug]/audience/actions";
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
import { Label } from "@/components/ui/label";
import type { ContactDetailDTO } from "@/lib/dto/audience";
import { audienceError, fieldErrorMap } from "./errors";

/** Edit name and property values. A cleared property is removed from the contact in Resend. */
export function ContactEditDialog({
  orgSlug,
  contact,
  open,
  onOpenChange,
}: {
  orgSlug: string;
  contact: ContactDetailDTO;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [firstName, setFirstName] = useState(contact.firstName);
  const [lastName, setLastName] = useState(contact.lastName);
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      contact.options.properties.map((p) => [p.key, String(contact.properties[p.key] ?? "")]),
    ),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);
    const properties: Record<string, string | number | null> = {};
    const local: Record<string, string> = {};
    for (const p of contact.options.properties) {
      const raw = (values[p.key] ?? "").trim();
      const current = contact.properties[p.key];
      if (raw === "" && current !== undefined) properties[p.key] = null;
      else if (raw !== "" && String(current ?? "") !== raw) {
        if (p.type === "number" && !Number.isFinite(Number(raw)))
          local[`properties.${p.key}`] = `${p.key} must be a number.`;
        properties[p.key] = p.type === "number" ? Number(raw) : raw;
      }
    }
    if (Object.keys(local).length) return setErrors(local);
    setErrors({});
    setBusy(true);
    const result = await updateContactAction(orgSlug, {
      id: contact.id,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      ...(Object.keys(properties).length ? { properties } : {}),
    });
    setBusy(false);
    if (!result.ok) {
      const fields = fieldErrorMap(result.error.fieldErrors);
      setErrors(fields);
      if (!Object.keys(fields).length || result.error.code !== "validation")
        setFormError(audienceError(result.error));
      return;
    }
    toast.success("Contact saved");
    onOpenChange(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <form onSubmit={submit} className="grid gap-4" noValidate>
          <DialogHeader>
            <DialogTitle className="text-xl">Edit {contact.email}</DialogTitle>
            <DialogDescription>Saved in Resend first, then here.</DialogDescription>
          </DialogHeader>
          {formError ? (
            <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-ink">
              {formError}
            </p>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="edit-first">First name</Label>
              <Input
                id="edit-first"
                value={firstName}
                maxLength={100}
                onChange={(e) => setFirstName(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="edit-last">Last name</Label>
              <Input
                id="edit-last"
                value={lastName}
                maxLength={100}
                onChange={(e) => setLastName(e.target.value)}
              />
            </div>
          </div>
          {contact.options.properties.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {contact.options.properties.map((p) => (
                <div key={p.id} className="grid gap-1.5">
                  <Label htmlFor={`edit-prop-${p.key}`}>
                    {p.key} <span className="font-normal text-ink-muted">({p.type})</span>
                  </Label>
                  <Input
                    id={`edit-prop-${p.key}`}
                    inputMode={p.type === "number" ? "decimal" : undefined}
                    value={values[p.key] ?? ""}
                    placeholder={p.fallbackValue === null ? "" : `Default: ${p.fallbackValue}`}
                    onChange={(e) => setValues((v) => ({ ...v, [p.key]: e.target.value }))}
                    aria-invalid={!!errors[`properties.${p.key}`]}
                  />
                  {errors[`properties.${p.key}`] ? (
                    <p role="alert" className="text-xs text-danger-ink">
                      {errors[`properties.${p.key}`]}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-ink-muted">
              This account has no contact properties yet. Add some under Audience, then Properties.
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy} className="font-bold">
              {busy ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
