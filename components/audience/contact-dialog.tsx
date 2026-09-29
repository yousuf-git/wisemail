"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { createContactAction } from "@/app/(app)/[orgSlug]/audience/actions";
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
import type { AudienceOptionsDTO } from "@/lib/dto/audience";
import { isValidEmail } from "@/lib/mail/address";
import { audienceError, fieldErrorMap } from "./errors";
import { ConnectionSelect, firstWritable } from "./connection-select";

/** Adds one contact to a Resend account (Resend first, then our copy). */
export function ContactDialog({
  orgSlug,
  options,
  open,
  onOpenChange,
}: {
  orgSlug: string;
  options: AudienceOptionsDTO;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [connectionId, setConnectionId] = useState(firstWritable(options.connections));
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [segmentIds, setSegmentIds] = useState<string[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const segments = options.segments.filter((s) => s.connectionId === connectionId);
  const properties = options.properties.filter((p) => p.connectionId === connectionId);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);
    const address = email.trim().toLowerCase();
    if (!isValidEmail(address)) return setErrors({ email: "Enter a valid email address." });
    setErrors({});
    const props: Record<string, string | number> = {};
    const local: Record<string, string> = {};
    for (const p of properties) {
      const raw = (values[p.key] ?? "").trim();
      if (!raw) continue;
      if (p.type === "number" && !Number.isFinite(Number(raw)))
        local[`properties.${p.key}`] = `${p.key} must be a number.`;
      props[p.key] = p.type === "number" ? Number(raw) : raw;
    }
    if (Object.keys(local).length) return setErrors(local);
    setBusy(true);
    const result = await createContactAction(orgSlug, {
      connectionId,
      email: address,
      firstName: firstName.trim() || undefined,
      lastName: lastName.trim() || undefined,
      properties: props,
      segmentIds,
    });
    setBusy(false);
    if (!result.ok) {
      const fields = fieldErrorMap(result.error.fieldErrors);
      setErrors(fields);
      if (!Object.keys(fields).length || result.error.code !== "validation")
        setFormError(audienceError(result.error));
      return;
    }
    toast.success(`Added ${result.data.email}`);
    onOpenChange(false);
    router.push(`/${orgSlug}/audience/contacts/${result.data.id}`);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <form onSubmit={submit} className="grid gap-4" noValidate>
          <DialogHeader>
            <DialogTitle className="text-xl">New contact</DialogTitle>
            <DialogDescription>Added in Resend first, then here.</DialogDescription>
          </DialogHeader>
          {formError ? (
            <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-ink">
              {formError}
            </p>
          ) : null}
          {options.connections.length > 1 ? (
            <ConnectionSelect
              id="contact-connection"
              connections={options.connections}
              value={connectionId}
              onChange={(id) => {
                setConnectionId(id);
                setSegmentIds([]);
                setValues({});
              }}
            />
          ) : null}
          <div className="grid gap-1.5">
            <Label htmlFor="contact-email">Email</Label>
            <Input
              id="contact-email"
              type="email"
              autoComplete="off"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              aria-invalid={!!errors.email}
              placeholder="jane@example.com"
            />
            {errors.email ? (
              <p role="alert" className="text-xs text-danger-ink">
                {errors.email}
              </p>
            ) : null}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="contact-first">First name</Label>
              <Input
                id="contact-first"
                value={firstName}
                maxLength={100}
                onChange={(e) => setFirstName(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="contact-last">Last name</Label>
              <Input
                id="contact-last"
                value={lastName}
                maxLength={100}
                onChange={(e) => setLastName(e.target.value)}
              />
            </div>
          </div>
          {segments.length > 0 ? (
            <fieldset className="grid gap-1.5">
              <legend className="text-sm leading-none font-medium">Segments</legend>
              <div className="flex flex-wrap gap-x-4 gap-y-1.5 pt-1">
                {segments.map((s) => (
                  <label key={s.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={segmentIds.includes(s.id)}
                      onChange={(e) =>
                        setSegmentIds((ids) =>
                          e.target.checked ? [...ids, s.id] : ids.filter((x) => x !== s.id),
                        )
                      }
                      className="size-4 accent-[var(--accent)]"
                    />
                    {s.name}
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null}
          {properties.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {properties.map((p) => (
                <div key={p.id} className="grid gap-1.5">
                  <Label htmlFor={`contact-prop-${p.key}`}>
                    {p.key} <span className="font-normal text-ink-muted">({p.type})</span>
                  </Label>
                  <Input
                    id={`contact-prop-${p.key}`}
                    inputMode={p.type === "number" ? "decimal" : undefined}
                    value={values[p.key] ?? ""}
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
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !connectionId} className="font-bold">
              {busy ? "Adding…" : "Add contact"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
