import { useEffect, useRef, useState } from "react";

import { AddressField } from "@/components/composer/address-field";
import { createSender, updateSender } from "@/lib/actions";
import type { Sender, SenderDomainOption } from "@/lib/api";

/** Create (no `sender`) or edit a sender. The address itself is fixed once created. */
export function SenderDialog({
  orgSlug,
  domains,
  sender,
  open,
  onOpenChange,
  onSaved,
}: {
  orgSlug: string;
  domains: SenderDomainOption[];
  sender?: Sender;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [domainId, setDomainId] = useState(sender?.domainId ?? domains[0]?.id ?? "");
  const [localPart, setLocalPart] = useState(sender?.localPart ?? "");
  const [displayName, setDisplayName] = useState(sender?.displayName ?? "");
  const [replyTo, setReplyTo] = useState<string[]>(sender?.replyTo ?? []);
  const [signatureHtml, setSignatureHtml] = useState(sender?.signatureHtml ?? "");
  const [isDefault, setIsDefault] = useState(sender?.isDefault ?? false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const domain = domains.find((d) => d.id === domainId);
  const domainName = sender?.domainName ?? domain?.name ?? "";

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setDomainId(sender?.domainId ?? domains[0]?.id ?? "");
    setLocalPart(sender?.localPart ?? "");
    setDisplayName(sender?.displayName ?? "");
    setReplyTo(sender?.replyTo ?? []);
    setSignatureHtml(sender?.signatureHtml ?? "");
    setIsDefault(sender?.isDefault ?? false);
    setErrors({});
    setFormError(null);
  }, [open, sender, domains]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);
    setErrors({});
    setBusy(true);
    try {
      let result;
      if (sender) {
        result = await updateSender(orgSlug, {
          id: sender.id,
          version: sender.version,
          displayName,
          replyTo,
          signatureHtml,
          isDefault: isDefault && !sender.isDefault ? true : undefined,
        });
      } else {
        const trimmed = localPart.trim().toLowerCase();
        if (!trimmed) {
          setErrors({ localPart: "Add the part before the @, like support." });
          return;
        }
        if (!/^[a-z0-9._+-]+$/.test(trimmed)) {
          setErrors({ localPart: "Use letters, numbers, dots, dashes or underscores" });
          return;
        }
        if (!domainId) {
          setErrors({ domainId: "Choose a verified domain." });
          return;
        }
        result = await createSender(orgSlug, {
          domainId,
          localPart: trimmed,
          displayName,
          replyTo,
          signatureHtml,
          isDefault,
        });
      }
      if (!result.ok) {
        const next: Record<string, string> = {};
        for (const [key, messages] of Object.entries(result.error.fieldErrors ?? {})) {
          if (messages[0]) next[key] = messages[0];
        }
        setErrors(next);
        if (Object.keys(next).length === 0) setFormError(result.error.message);
        return;
      }
      onSaved();
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="w-full max-w-lg rounded-xl border border-line bg-surface p-0 text-ink shadow-lg backdrop:bg-ink/40"
      onClose={() => {
        if (open) onOpenChange(false);
      }}
    >
      <form
        onSubmit={submit}
        className="grid max-h-[90dvh] gap-4 overflow-y-auto p-5"
        noValidate
      >
        <h2 className="text-xl font-semibold">
          {sender ? `Edit ${sender.address}` : "New sender"}
        </h2>
        {formError ? (
          <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-ink">
            {formError}
          </p>
        ) : null}

        {sender ? null : (
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium">Domain</span>
            <select
              value={domainId}
              onChange={(e) => setDomainId(e.target.value)}
              className="h-9 rounded-control border border-line bg-canvas px-2"
            >
              <option value="" disabled>
                Choose a verified domain
              </option>
              {domains.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
            {errors.domainId ? (
              <span role="alert" className="text-xs text-danger-ink">
                {errors.domainId}
              </span>
            ) : null}
          </label>
        )}

        <div className="grid gap-1.5 text-sm">
          <span className="font-medium">Address</span>
          <div className="flex items-center gap-2">
            <input
              value={localPart}
              disabled={!!sender}
              autoComplete="off"
              placeholder="support"
              aria-invalid={!!errors.localPart}
              onChange={(e) => setLocalPart(e.target.value)}
              className="h-9 min-w-0 flex-1 rounded-control border border-line bg-canvas px-3 disabled:opacity-60"
            />
            <span className="shrink-0 text-sm text-ink-muted">@{domainName}</span>
          </div>
          {errors.localPart ? (
            <span role="alert" className="text-xs text-danger-ink">
              {errors.localPart}
            </span>
          ) : null}
        </div>

        <label className="grid gap-1.5 text-sm">
          <span className="font-medium">
            Display name <span className="font-normal text-ink-muted">(optional)</span>
          </span>
          <input
            value={displayName}
            maxLength={100}
            placeholder="Acme Support"
            onChange={(e) => setDisplayName(e.target.value)}
            className="h-9 rounded-control border border-line bg-canvas px-3"
          />
        </label>

        <div className="grid gap-1.5">
          <span className="text-sm font-medium">
            Reply-to <span className="font-normal text-ink-muted">(optional)</span>
          </span>
          <AddressField
            label="Reply"
            values={replyTo}
            onChange={setReplyTo}
            max={5}
            error={errors.replyTo}
            placeholder="replies@example.com"
          />
        </div>

        <label className="grid gap-1.5 text-sm">
          <span className="font-medium">
            Signature <span className="font-normal text-ink-muted">(HTML, optional)</span>
          </span>
          <textarea
            rows={4}
            value={signatureHtml}
            maxLength={20_000}
            spellCheck={false}
            placeholder="<p>Thanks,<br>The Acme team</p>"
            onChange={(e) => setSignatureHtml(e.target.value)}
            className="rounded-control border border-line bg-canvas px-3 py-2 font-mono text-[0.8125rem]"
          />
          {errors.signatureHtml ? (
            <span role="alert" className="text-xs text-danger-ink">
              {errors.signatureHtml}
            </span>
          ) : null}
        </label>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={isDefault}
            disabled={!!sender?.isDefault}
            onChange={(e) => setIsDefault(e.target.checked)}
            className="size-4 accent-[var(--accent)]"
          />
          Default sender for {domainName || "this domain"}
        </label>

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
            disabled={busy || (!sender && !domainId)}
            className="h-9 rounded-control bg-accent-fill px-3 text-sm font-semibold text-accent-ink disabled:opacity-50"
          >
            {busy ? "Saving…" : sender ? "Save" : "Create sender"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
