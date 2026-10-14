import { useEffect, useRef, useState } from "react";

import {
  createCleanupRule,
  previewCleanupRule,
  updateCleanupRule,
} from "@/lib/actions";
import type { CleanupRule, CleanupRuleInput } from "@/lib/api";

const ANY = "__any";
const field =
  "h-9 w-full rounded-control border border-line bg-canvas px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-accent";

type Form = {
  name: string;
  kind: "rule" | "block_sender";
  action: "archive" | "trash" | "delete";
  enabled: boolean;
  fromAddress: string;
  fromDomain: string;
  subjectContains: string;
  direction: string;
  tagName: string;
  tagValue: string;
  aiCategory: string;
  olderThanDays: string;
  connectionId: string;
  mailbox: string;
};

function initial(rule?: CleanupRule): Form {
  return {
    name: rule?.name ?? "",
    kind: rule?.kind ?? "rule",
    action: rule?.action ?? "trash",
    enabled: rule?.enabled ?? true,
    fromAddress: rule?.match.fromAddress ?? "",
    fromDomain: rule?.match.fromDomain ?? "",
    subjectContains: rule?.match.subjectContains ?? "",
    direction: rule?.match.direction ?? ANY,
    tagName: rule?.match.tag?.name ?? "",
    tagValue: rule?.match.tag?.value ?? "",
    aiCategory: rule?.match.aiCategory ?? "",
    olderThanDays: rule?.match.olderThanDays ? String(rule.match.olderThanDays) : "30",
    connectionId: rule?.scope?.connectionIds?.[0] ?? ANY,
    mailbox: rule?.scope?.mailboxAddresses?.[0] ?? "",
  };
}

function toInput(f: Form): CleanupRuleInput {
  const block = f.kind === "block_sender";
  return {
    name: f.name,
    kind: f.kind,
    action: block ? "trash" : f.action,
    enabled: f.enabled,
    scope: {
      connectionIds: f.connectionId === ANY ? [] : [f.connectionId],
      projectIds: [],
      mailboxAddresses: f.mailbox.trim() ? [f.mailbox.trim()] : [],
    },
    match: {
      ...(f.fromAddress.trim() ? { fromAddress: f.fromAddress.trim() } : {}),
      ...(f.fromDomain.trim() ? { fromDomain: f.fromDomain.trim().replace(/^@/, "") } : {}),
      ...(!block && f.subjectContains.trim() ? { subjectContains: f.subjectContains.trim() } : {}),
      ...(!block && f.direction !== ANY
        ? { direction: f.direction as "inbound" | "outbound" }
        : {}),
      ...(!block && f.tagName.trim()
        ? {
            tag: {
              name: f.tagName.trim(),
              ...(f.tagValue.trim() ? { value: f.tagValue.trim() } : {}),
            },
          }
        : {}),
      ...(!block && f.aiCategory.trim() ? { aiCategory: f.aiCategory.trim() } : {}),
      ...(!block && f.olderThanDays ? { olderThanDays: Number(f.olderThanDays) } : {}),
    },
  };
}

export function RuleDialog({
  orgSlug,
  rule,
  connections,
  canDelete,
  open,
  onOpenChange,
  onSaved,
}: {
  orgSlug: string;
  rule?: CleanupRule;
  connections: { id: string; name: string }[];
  canDelete: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [form, setForm] = useState(() => initial(rule));
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [pending, setPending] = useState(false);
  const [preview, setPreview] = useState<number | null>(null);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setForm(initial(rule));
    setError(null);
    setFieldErrors({});
    setPreview(null);
  }, [open, rule]);

  const set = (patch: Partial<Form>) => {
    setForm((f) => ({ ...f, ...patch }));
    setPreview(null);
  };
  const block = form.kind === "block_sender";
  const fe = (key: string) => fieldErrors[key]?.[0];

  async function run(kind: "preview" | "save") {
    setPending(true);
    setError(null);
    setFieldErrors({});
    const input = toInput(form);
    const result =
      kind === "preview"
        ? await previewCleanupRule(orgSlug, input)
        : rule
          ? await updateCleanupRule(orgSlug, rule.id, input)
          : await createCleanupRule(orgSlug, input);
    setPending(false);
    if (!result.ok) {
      setError(result.error.message);
      setFieldErrors(result.error.fieldErrors ?? {});
      return;
    }
    if (kind === "preview") setPreview((result.data as { count: number }).count);
    else onSaved();
  }

  return (
    <dialog
      ref={dialogRef}
      className="m-auto max-h-[90dvh] w-[min(100%,32rem)] overflow-y-auto rounded-xl border border-line bg-surface p-0 shadow-lg backdrop:bg-ink/40"
      onClose={() => onOpenChange(false)}
    >
      <div className="grid gap-4 p-5">
        <header className="grid gap-1">
          <h2 className="text-xl font-bold">{rule ? "Edit rule" : "New cleanup rule"}</h2>
          <p className="text-sm text-ink-muted">
            Every condition you fill in must match. Preview shows how much existing mail it would
            touch before you save.
          </p>
        </header>

        {error ? (
          <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-ink">
            {error}
          </p>
        ) : null}

        <div className="grid gap-4">
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium">Name</span>
            <input
              value={form.name}
              onChange={(e) => set({ name: e.target.value })}
              placeholder="GitHub notifications"
              className={field}
            />
            {fe("name") ? <p className="text-xs text-danger-ink">{fe("name")}</p> : null}
          </label>

          <div className="grid gap-1.5">
            <span className="text-sm font-medium">Type</span>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Rule type">
              {(
                [
                  ["rule", "Clean up old mail"],
                  ["block_sender", "Block a sender"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={form.kind === value}
                  onClick={() =>
                    set({ kind: value, action: value === "block_sender" ? "trash" : form.action })
                  }
                  className={`h-8 rounded-control border px-3 text-sm font-medium ${
                    form.kind === value
                      ? "border-accent bg-accent-soft text-ink"
                      : "border-line hover:bg-canvas"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1.5 text-sm">
              <span className="font-medium">Sender address</span>
              <input
                value={form.fromAddress}
                onChange={(e) => set({ fromAddress: e.target.value })}
                placeholder="no-reply@github.com"
                className={field}
              />
              {fe("match.fromAddress") ? (
                <p className="text-xs text-danger-ink">{fe("match.fromAddress")}</p>
              ) : null}
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="font-medium">Sender domain</span>
              <input
                value={form.fromDomain}
                onChange={(e) => set({ fromDomain: e.target.value })}
                placeholder="github.com"
                className={field}
              />
              {fe("match.fromDomain") ? (
                <p className="text-xs text-danger-ink">{fe("match.fromDomain")}</p>
              ) : null}
            </label>
          </div>

          {!block ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1.5 text-sm">
                  <span className="font-medium">Subject contains</span>
                  <input
                    value={form.subjectContains}
                    onChange={(e) => set({ subjectContains: e.target.value })}
                    className={field}
                  />
                </label>
                <label className="grid gap-1.5 text-sm">
                  <span className="font-medium">Older than (days)</span>
                  <input
                    inputMode="numeric"
                    value={form.olderThanDays}
                    onChange={(e) => set({ olderThanDays: e.target.value.replace(/\D/g, "") })}
                    className={field}
                  />
                  {fe("match.olderThanDays") ? (
                    <p className="text-xs text-danger-ink">{fe("match.olderThanDays")}</p>
                  ) : null}
                </label>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="grid gap-1.5 text-sm">
                  <span className="font-medium">Direction</span>
                  <select
                    value={form.direction}
                    onChange={(e) => set({ direction: e.target.value })}
                    className={field}
                    aria-label="Direction"
                  >
                    <option value={ANY}>Sent and received</option>
                    <option value="inbound">Received</option>
                    <option value="outbound">Sent</option>
                  </select>
                </label>
                <label className="grid gap-1.5 text-sm">
                  <span className="font-medium">Tag name</span>
                  <input
                    value={form.tagName}
                    onChange={(e) => set({ tagName: e.target.value })}
                    className={field}
                  />
                </label>
                <label className="grid gap-1.5 text-sm">
                  <span className="font-medium">Tag value</span>
                  <input
                    value={form.tagValue}
                    onChange={(e) => set({ tagValue: e.target.value })}
                    className={field}
                  />
                </label>
              </div>
              <label className="grid gap-1.5 text-sm">
                <span className="font-medium">AI category</span>
                <input
                  value={form.aiCategory}
                  onChange={(e) => set({ aiCategory: e.target.value })}
                  placeholder="newsletter"
                  className={field}
                />
              </label>
            </>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1.5 text-sm">
              <span className="font-medium">Connection</span>
              <select
                value={form.connectionId}
                onChange={(e) => set({ connectionId: e.target.value })}
                className={field}
                aria-label="Connection"
              >
                <option value={ANY}>All connections</option>
                {connections.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="font-medium">Mailbox (optional)</span>
              <input
                value={form.mailbox}
                onChange={(e) => set({ mailbox: e.target.value })}
                placeholder="support@yourdomain.com"
                className={field}
              />
            </label>
          </div>

          {!block ? (
            <label className="grid gap-1.5 text-sm">
              <span className="font-medium">Action</span>
              <select
                value={form.action}
                onChange={(e) =>
                  set({ action: e.target.value as Form["action"] })
                }
                className={field}
                aria-label="Action"
              >
                <option value="archive">Archive</option>
                <option value="trash">Move to Trash (kept 30 days)</option>
                <option value="delete" disabled={!canDelete}>
                  Delete permanently{canDelete ? "" : " (Owner or Admin)"}
                </option>
              </select>
              {form.action === "delete" ? (
                <p className="text-xs text-danger-ink">
                  Deleted from Wisemail for good. Resend keeps its copy until its own retention
                  ends.
                </p>
              ) : null}
            </label>
          ) : (
            <p className="text-sm text-ink-muted">
              Mail from this sender goes straight to Trash when it arrives, without a notification.
            </p>
          )}

          <label className="flex items-center justify-between gap-3 text-sm">
            <span className="font-medium">Turn the rule on</span>
            <input
              type="checkbox"
              role="switch"
              checked={form.enabled}
              onChange={(e) => set({ enabled: e.target.checked })}
              className="size-4 accent-accent"
            />
          </label>

          {preview !== null ? (
            <p role="status" className="rounded-lg bg-canvas-sunken px-3 py-2 text-sm">
              {block ? "This sender has already sent " : "Matches "}
              <b>{preview.toLocaleString("en-US")}</b> {preview === 1 ? "email" : "emails"} right
              now.
            </p>
          ) : null}
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4">
          <button
            type="button"
            disabled={pending}
            onClick={() => void run("preview")}
            className="h-9 rounded-control border border-line px-3 text-sm font-semibold hover:bg-canvas disabled:opacity-50"
          >
            Preview
          </button>
          <span className="flex gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() => onOpenChange(false)}
              className="h-9 rounded-control px-3 text-sm font-semibold text-ink-muted hover:bg-canvas disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={pending || !form.name.trim()}
              onClick={() => void run("save")}
              className="h-9 rounded-control bg-accent-fill px-3 text-sm font-semibold text-accent-ink hover:bg-accent-fill-hover disabled:opacity-50"
            >
              {pending ? "Working…" : rule ? "Save rule" : "Create rule"}
            </button>
          </span>
        </footer>
      </div>
    </dialog>
  );
}
