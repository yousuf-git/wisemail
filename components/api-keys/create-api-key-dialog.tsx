"use client";

import { AlertTriangle, KeyRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { createApiKeyAction } from "@/app/(app)/[orgSlug]/api-keys/actions";
import { FormAlert } from "@/components/auth/auth-shell";
import { CopyButton } from "@/components/domains/copy-button";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type KeyConnectionOption = {
  id: string;
  name: string;
  domains: { id: string; name: string }[];
};

type Permission = "full_access" | "sending_access";
const ANY_DOMAIN = "any";

const PERMISSIONS: { value: Permission; title: string; blurb: string }[] = [
  {
    value: "sending_access",
    title: "Sending access",
    blurb: "Can only send email. The right choice for an app or a server.",
  },
  {
    value: "full_access",
    title: "Full access",
    blurb: "Can also manage domains, keys and webhooks. Keep these to a minimum.",
  },
];

/**
 * Creates a key, then shows its secret ONCE. The secret lives only in this component's state; it
 * is dropped the moment the dialog closes, and the dialog cannot be dismissed by accident while
 * it is on screen.
 */
export function CreateApiKeyDialog({
  orgSlug,
  connections,
  canCreateFull,
  open,
  onOpenChange,
}: {
  orgSlug: string;
  connections: KeyConnectionOption[];
  /** Full-access keys need `apiKey:create` (Developers can only make sending keys). */
  canCreateFull: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [connectionId, setConnectionId] = useState(connections[0]?.id ?? "");
  const [name, setName] = useState("");
  const [permission, setPermission] = useState<Permission>("sending_access");
  const [domainId, setDomainId] = useState(ANY_DOMAIN);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [secret, setSecret] = useState<{ value: string; keyName: string; where: string } | null>(
    null,
  );
  const [savedIt, setSavedIt] = useState(false);

  const connection = connections.find((c) => c.id === connectionId);

  function reset() {
    setName("");
    setPermission("sending_access");
    setDomainId(ANY_DOMAIN);
    setError(null);
    setFields({});
    setSecret(null);
    setSavedIt(false);
  }

  function close(next: boolean) {
    // While the secret is showing, only the "Done" button closes the dialog.
    if (!next && secret && !savedIt) return;
    onOpenChange(next);
    if (!next) reset();
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setFields({});
    const result = await createApiKeyAction(orgSlug, {
      connectionId,
      name,
      permission,
      domainId: permission === "sending_access" && domainId !== ANY_DOMAIN ? domainId : null,
    });
    setPending(false);
    if (!result.ok) {
      const next: Record<string, string> = {};
      for (const [key, messages] of Object.entries(result.error.fieldErrors ?? {})) {
        if (messages[0]) next[key] = messages[0];
      }
      setFields(next);
      if (Object.keys(next).length === 0) setError(result.error.message);
      return;
    }
    setSecret({
      value: result.data.secret,
      keyName: result.data.key.name,
      where: result.data.key.connectionName,
    });
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent
        showCloseButton={!secret}
        onInteractOutside={(e) => secret && e.preventDefault()}
        onEscapeKeyDown={(e) => secret && e.preventDefault()}
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg"
      >
        {secret ? (
          <div className="grid gap-4">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-xl">
                <KeyRound aria-hidden className="size-5 text-accent" /> Copy your new key
              </DialogTitle>
              <DialogDescription>
                “{secret.keyName}” now exists in {secret.where}.
              </DialogDescription>
            </DialogHeader>
            <p
              role="alert"
              className="flex gap-2 rounded-md bg-warning-soft px-3 py-2.5 text-[0.8125rem] leading-snug text-warning-ink"
            >
              <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
              This is the only time you&apos;ll see it. Wisemail doesn&apos;t store the key, so
              nobody, including you, can look it up later. Lost it? Delete the key and make a new
              one.
            </p>
            <div className="flex items-center gap-2">
              <Input
                readOnly
                value={secret.value}
                aria-label="New API key"
                data-testid="api-key-secret"
                className="font-mono text-xs"
                onFocus={(e) => e.currentTarget.select()}
              />
              <CopyButton value={secret.value} label="API key" variant="outline" showLabel />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={savedIt}
                onChange={(e) => setSavedIt(e.target.checked)}
                className="size-4 accent-[var(--color-accent)]"
              />
              I&apos;ve copied it somewhere safe
            </label>
            <DialogFooter>
              <Button
                onClick={() => {
                  toast.success(`Created ${secret.keyName}`);
                  onOpenChange(false);
                  reset();
                }}
                disabled={!savedIt}
              >
                Done
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={submit} className="grid gap-4" noValidate>
            <DialogHeader>
              <DialogTitle className="text-xl">New API key</DialogTitle>
              <DialogDescription>
                Created in your Resend account. You&apos;ll see the key once, right after.
              </DialogDescription>
            </DialogHeader>
            <FormAlert>{error}</FormAlert>

            {connections.length > 1 ? (
              <div className="grid gap-1.5">
                <Label htmlFor="key-connection">Resend account</Label>
                <Select
                  value={connectionId}
                  onValueChange={(v) => {
                    setConnectionId(v);
                    setDomainId(ANY_DOMAIN);
                  }}
                >
                  <SelectTrigger id="key-connection" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {connections.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            <div className="grid gap-1.5">
              <Label htmlFor="key-name">Name</Label>
              <Input
                id="key-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Storefront app (production)"
                maxLength={64}
                autoComplete="off"
                aria-invalid={!!fields.name}
              />
              {fields.name ? (
                <p role="alert" className="text-xs text-danger-ink">
                  {fields.name}
                </p>
              ) : null}
            </div>

            <fieldset className="grid gap-2">
              <legend className="mb-0.5 text-sm font-medium">Permission</legend>
              {PERMISSIONS.map((p) => {
                const disabled = p.value === "full_access" && !canCreateFull;
                return (
                  <label
                    key={p.value}
                    className={cn(
                      "flex cursor-pointer items-start gap-3 rounded-lg border border-line p-3 text-left has-[:checked]:border-accent has-[:checked]:bg-accent-soft",
                      disabled && "cursor-not-allowed opacity-55",
                    )}
                  >
                    <input
                      type="radio"
                      name="permission"
                      value={p.value}
                      checked={permission === p.value}
                      disabled={disabled}
                      onChange={() => setPermission(p.value)}
                      className="mt-1 accent-[var(--color-accent)]"
                    />
                    <span className="grid gap-0.5">
                      <span className="text-sm font-semibold">{p.title}</span>
                      <span className="text-[0.8125rem] text-ink-muted">
                        {disabled ? "Only Owners and Admins can create full-access keys." : p.blurb}
                      </span>
                    </span>
                  </label>
                );
              })}
            </fieldset>

            {permission === "sending_access" ? (
              <div className="grid gap-1.5">
                <Label htmlFor="key-domain">Restrict to a domain</Label>
                <Select value={domainId} onValueChange={setDomainId}>
                  <SelectTrigger id="key-domain" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ANY_DOMAIN}>Any domain on this account</SelectItem>
                    {(connection?.domains ?? []).map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {fields.domainId ? (
                  <p role="alert" className="text-xs text-danger-ink">
                    {fields.domainId}
                  </p>
                ) : (
                  <p className="text-xs text-ink-muted">
                    A key limited to one domain can&apos;t send from your others, so a leak does
                    less harm.
                  </p>
                )}
              </div>
            ) : null}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => close(false)}
                disabled={pending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={pending || !name.trim() || !connectionId}>
                {pending ? "Creating…" : "Create key"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
