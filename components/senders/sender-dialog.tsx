"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import {
  createSenderAction,
  updateSenderAction,
} from "@/app/(app)/[orgSlug]/settings/senders/actions";
import { AddressField } from "@/components/composer/address-field";
import { fieldMessages, friendlyError } from "@/components/composer/errors";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { Textarea } from "@/components/ui/textarea";
import type { SenderDTO } from "@/lib/dto/mail";
import { createSenderInput } from "@/lib/validation/mail";
import type { SenderDomainOption } from "./senders-view";

/** Create (no `sender`) or edit a sender. The address itself is fixed once created. */
export function SenderDialog({
  orgSlug,
  domains,
  sender,
  open,
  onOpenChange,
}: {
  orgSlug: string;
  domains: SenderDomainOption[];
  sender?: SenderDTO;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
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

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);
    setBusy(true);
    try {
      let result;
      if (sender) {
        result = await updateSenderAction(orgSlug, {
          id: sender.id,
          version: sender.version,
          displayName,
          replyTo,
          signatureHtml,
          isDefault: isDefault && !sender.isDefault ? true : undefined,
        });
      } else {
        const parsed = createSenderInput.safeParse({
          domainId,
          localPart,
          displayName,
          replyTo,
          signatureHtml,
          isDefault,
        });
        if (!parsed.success) {
          const fields: Record<string, string> = {};
          for (const issue of parsed.error.issues) {
            fields[String(issue.path[0] ?? "_")] ??= issue.message;
          }
          if (!localPart.trim()) fields.localPart = "Add the part before the @, like support.";
          setErrors(fields);
          return;
        }
        result = await createSenderAction(orgSlug, parsed.data);
      }
      if (!result.ok) {
        const friendly = friendlyError(result.error);
        setErrors(fieldMessages(result.error.fieldErrors));
        if (!Object.keys(friendly.fields).length) setFormError(friendly.message);
        return;
      }
      toast.success(sender ? "Sender saved" : `Created ${result.data.address}`);
      onOpenChange(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <form onSubmit={submit} className="grid gap-4" noValidate>
          <DialogHeader>
            <DialogTitle className="text-xl">
              {sender ? `Edit ${sender.address}` : "New sender"}
            </DialogTitle>
          </DialogHeader>
          {formError ? (
            <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-ink">
              {formError}
            </p>
          ) : null}

          {sender ? null : (
            <div className="grid gap-1.5">
              <Label htmlFor="sender-domain">Domain</Label>
              <Select value={domainId} onValueChange={setDomainId}>
                <SelectTrigger id="sender-domain" className="w-full">
                  <SelectValue placeholder="Choose a verified domain" />
                </SelectTrigger>
                <SelectContent>
                  {domains.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.domainId ? (
                <p role="alert" className="text-xs text-danger-ink">
                  {errors.domainId}
                </p>
              ) : null}
            </div>
          )}

          <div className="grid gap-1.5">
            <Label htmlFor="sender-local">Address</Label>
            <div className="flex items-center gap-2">
              <Input
                id="sender-local"
                value={localPart}
                disabled={!!sender}
                autoComplete="off"
                placeholder="support"
                aria-invalid={!!errors.localPart}
                onChange={(event) => setLocalPart(event.target.value)}
                className="min-w-0 flex-1"
              />
              <span className="shrink-0 text-sm text-ink-muted">@{domainName}</span>
            </div>
            {errors.localPart ? (
              <p role="alert" className="text-xs text-danger-ink">
                {errors.localPart}
              </p>
            ) : null}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="sender-name">
              Display name <span className="font-normal text-ink-muted">(optional)</span>
            </Label>
            <Input
              id="sender-name"
              value={displayName}
              maxLength={100}
              placeholder="Acme Support"
              onChange={(event) => setDisplayName(event.target.value)}
            />
          </div>

          <div className="grid gap-1.5">
            <span className="text-sm leading-none font-medium">
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

          <div className="grid gap-1.5">
            <Label htmlFor="sender-signature">
              Signature <span className="font-normal text-ink-muted">(HTML, optional)</span>
            </Label>
            <Textarea
              id="sender-signature"
              rows={4}
              value={signatureHtml}
              maxLength={20_000}
              spellCheck={false}
              placeholder="<p>Thanks,<br>The Acme team</p>"
              onChange={(event) => setSignatureHtml(event.target.value)}
              className="font-mono text-[0.8125rem]"
            />
            {errors.signatureHtml ? (
              <p role="alert" className="text-xs text-danger-ink">
                {errors.signatureHtml}
              </p>
            ) : null}
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isDefault}
              disabled={!!sender?.isDefault}
              onChange={(event) => setIsDefault(event.target.checked)}
              className="size-4 accent-[var(--accent)]"
            />
            Default sender for {domainName || "this domain"}
          </label>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || (!sender && !domainId)} className="font-bold">
              {busy ? "Saving…" : sender ? "Save" : "Create sender"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
