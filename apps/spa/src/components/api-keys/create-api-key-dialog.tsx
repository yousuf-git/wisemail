import { useEffect, useRef, useState } from "react";
import { AlertTriangle, KeyRound } from "lucide-react";

import { createApiKey } from "@/lib/actions";
import type { ApiKeyConnectionOption, ApiKeyPermission } from "@/lib/api";
import { cn } from "@/lib/utils";

const ANY_DOMAIN = "any";

const PERMISSIONS: { value: ApiKeyPermission; title: string; blurb: string }[] = [
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

function CopySecret({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="h-9 shrink-0 rounded-control border border-line px-3 text-xs font-medium hover:bg-canvas-sunken"
      onClick={() => {
        void navigator.clipboard.writeText(value).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        });
      }}
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

/**
 * Creates a key, then shows its secret once. Closing is blocked until the copy checkbox is ticked.
 */
export function CreateApiKeyDialog({
  orgSlug,
  connections,
  canCreateFull,
  open,
  onOpenChange,
  onCreated,
}: {
  orgSlug: string;
  connections: ApiKeyConnectionOption[];
  canCreateFull: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [connectionId, setConnectionId] = useState(connections[0]?.id ?? "");
  const [name, setName] = useState("");
  const [permission, setPermission] = useState<ApiKeyPermission>("sending_access");
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
    setConnectionId(connections[0]?.id ?? "");
  }

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  function requestClose() {
    if (secret && !savedIt) return;
    onOpenChange(false);
    reset();
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setFields({});
    const result = await createApiKey(orgSlug, {
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
    onCreated();
  }

  return (
    <dialog
      ref={dialogRef}
      className="w-full max-w-lg rounded-xl border border-line bg-surface p-0 text-ink shadow-lg backdrop:bg-ink/40"
      onCancel={(e) => {
        if (secret && !savedIt) e.preventDefault();
        else requestClose();
      }}
      onClose={() => {
        if (open) onOpenChange(false);
      }}
    >
      <div className="max-h-[calc(100dvh-2rem)] overflow-y-auto p-5">
        {secret ? (
          <div className="grid gap-4">
            <div>
              <h2 className="flex items-center gap-2 text-xl font-semibold">
                <KeyRound aria-hidden className="size-5 text-accent-fill" /> Copy your new key
              </h2>
              <p className="mt-1 text-sm text-ink-muted">
                “{secret.keyName}” now exists in {secret.where}.
              </p>
            </div>
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
              <input
                readOnly
                value={secret.value}
                aria-label="New API key"
                data-testid="api-key-secret"
                className="h-9 min-w-0 flex-1 rounded-control border border-line bg-canvas px-3 font-mono text-xs"
                onFocus={(e) => e.currentTarget.select()}
              />
              <CopySecret value={secret.value} />
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
            <div className="flex justify-end">
              <button
                type="button"
                disabled={!savedIt}
                onClick={requestClose}
                className="h-9 rounded-control bg-accent-fill px-3 text-sm font-semibold text-accent-ink disabled:opacity-50"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="grid gap-4" noValidate>
            <div>
              <h2 className="text-xl font-semibold">New API key</h2>
              <p className="mt-1 text-sm text-ink-muted">
                Created in your Resend account. You&apos;ll see the key once, right after.
              </p>
            </div>
            {error ? (
              <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger-ink">
                {error}
              </p>
            ) : null}

            {connections.length > 1 ? (
              <label className="grid gap-1.5 text-sm">
                <span className="font-medium">Resend account</span>
                <select
                  value={connectionId}
                  onChange={(e) => {
                    setConnectionId(e.target.value);
                    setDomainId(ANY_DOMAIN);
                  }}
                  className="h-9 rounded-control border border-line bg-canvas px-2"
                >
                  {connections.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            <label className="grid gap-1.5 text-sm">
              <span className="font-medium">Name</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Storefront app (production)"
                maxLength={64}
                autoComplete="off"
                aria-invalid={!!fields.name}
                className="h-9 rounded-control border border-line bg-canvas px-3"
              />
              {fields.name ? (
                <span role="alert" className="text-xs text-danger-ink">
                  {fields.name}
                </span>
              ) : null}
            </label>

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
                        {disabled
                          ? "Only Owners and Admins can create full-access keys."
                          : p.blurb}
                      </span>
                    </span>
                  </label>
                );
              })}
            </fieldset>

            {permission === "sending_access" ? (
              <label className="grid gap-1.5 text-sm">
                <span className="font-medium">Restrict to a domain</span>
                <select
                  value={domainId}
                  onChange={(e) => setDomainId(e.target.value)}
                  className="h-9 rounded-control border border-line bg-canvas px-2"
                >
                  <option value={ANY_DOMAIN}>Any domain on this account</option>
                  {(connection?.domains ?? []).map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
                {fields.domainId ? (
                  <span role="alert" className="text-xs text-danger-ink">
                    {fields.domainId}
                  </span>
                ) : (
                  <span className="text-xs text-ink-muted">
                    A key limited to one domain can&apos;t send from your others, so a leak does
                    less harm.
                  </span>
                )}
              </label>
            ) : null}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={requestClose}
                disabled={pending}
                className="h-9 rounded-control border border-line px-3 text-sm font-medium hover:bg-canvas-sunken disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={pending || !name.trim() || !connectionId}
                className="h-9 rounded-control bg-accent-fill px-3 text-sm font-semibold text-accent-ink disabled:opacity-50"
              >
                {pending ? "Creating…" : "Create key"}
              </button>
            </div>
          </form>
        )}
      </div>
    </dialog>
  );
}
