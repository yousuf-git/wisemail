"use client";

import { useState } from "react";
import { toast } from "sonner";

import {
  createCleanupRuleAction,
  previewCleanupRuleAction,
  updateCleanupRuleAction,
} from "@/app/(app)/[orgSlug]/settings/cleanup/actions";
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { CleanupActionName, CleanupRuleDTO } from "@/lib/dto/deletion";

const ANY = "__any";

type Form = {
  name: string;
  kind: "rule" | "block_sender";
  action: CleanupActionName;
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

function initial(rule?: CleanupRuleDTO): Form {
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
    connectionId: rule?.scope.connectionIds[0] ?? ANY,
    mailbox: rule?.scope.mailboxAddresses[0] ?? "",
  };
}

function toInput(f: Form) {
  const block = f.kind === "block_sender";
  return {
    name: f.name,
    kind: f.kind,
    action: block ? ("trash" as const) : f.action,
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

/** Create or edit a rule, with a dry-run count of the mail it matches right now. */
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
  rule?: CleanupRuleDTO;
  connections: { id: string; name: string }[];
  canDelete: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState(() => initial(rule));
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [pending, setPending] = useState(false);
  const [preview, setPreview] = useState<number | null>(null);
  const set = (patch: Partial<Form>) => {
    setForm((f) => ({ ...f, ...patch }));
    setPreview(null);
  };
  const block = form.kind === "block_sender";

  async function run(kind: "preview" | "save") {
    setPending(true);
    setError(null);
    setFieldErrors({});
    const input = toInput(form);
    const result =
      kind === "preview"
        ? await previewCleanupRuleAction(orgSlug, input)
        : rule
          ? await updateCleanupRuleAction(orgSlug, { id: rule.id, rule: input })
          : await createCleanupRuleAction(orgSlug, input);
    setPending(false);
    if (!result.ok) {
      setError(result.error.message);
      setFieldErrors(result.error.fieldErrors ?? {});
      return;
    }
    if (kind === "preview") setPreview((result.data as { count: number }).count);
    else {
      toast.success(rule ? "Rule saved" : "Rule created");
      onSaved();
    }
  }

  const fe = (key: string) => fieldErrors[key]?.[0];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-xl">{rule ? "Edit rule" : "New cleanup rule"}</DialogTitle>
          <DialogDescription>
            Every condition you fill in must match. Preview shows how much existing mail it would
            touch before you save.
          </DialogDescription>
        </DialogHeader>
        <FormAlert>{error}</FormAlert>

        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="rule-name">Name</Label>
            <Input
              id="rule-name"
              value={form.name}
              onChange={(e) => set({ name: e.target.value })}
              placeholder="GitHub notifications"
            />
            {fe("name") ? <p className="text-xs text-danger-ink">{fe("name")}</p> : null}
          </div>

          <div className="grid gap-1.5">
            <Label>Type</Label>
            <div className="flex gap-2" role="radiogroup" aria-label="Rule type">
              {(
                [
                  ["rule", "Clean up old mail"],
                  ["block_sender", "Block a sender"],
                ] as const
              ).map(([value, label]) => (
                <Button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={form.kind === value}
                  size="sm"
                  variant={form.kind === value ? "secondary" : "outline"}
                  onClick={() =>
                    set({ kind: value, action: value === "block_sender" ? "trash" : form.action })
                  }
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="rule-from">Sender address</Label>
              <Input
                id="rule-from"
                value={form.fromAddress}
                onChange={(e) => set({ fromAddress: e.target.value })}
                placeholder="no-reply@github.com"
              />
              {fe("match.fromAddress") ? (
                <p className="text-xs text-danger-ink">{fe("match.fromAddress")}</p>
              ) : null}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="rule-domain">Sender domain</Label>
              <Input
                id="rule-domain"
                value={form.fromDomain}
                onChange={(e) => set({ fromDomain: e.target.value })}
                placeholder="github.com"
              />
              {fe("match.fromDomain") ? (
                <p className="text-xs text-danger-ink">{fe("match.fromDomain")}</p>
              ) : null}
            </div>
          </div>

          {!block ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="rule-subject">Subject contains</Label>
                  <Input
                    id="rule-subject"
                    value={form.subjectContains}
                    onChange={(e) => set({ subjectContains: e.target.value })}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="rule-age">Older than (days)</Label>
                  <Input
                    id="rule-age"
                    inputMode="numeric"
                    value={form.olderThanDays}
                    onChange={(e) => set({ olderThanDays: e.target.value.replace(/\D/g, "") })}
                  />
                  {fe("match.olderThanDays") ? (
                    <p className="text-xs text-danger-ink">{fe("match.olderThanDays")}</p>
                  ) : null}
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="grid gap-1.5">
                  <Label>Direction</Label>
                  <Select value={form.direction} onValueChange={(direction) => set({ direction })}>
                    <SelectTrigger aria-label="Direction">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ANY}>Sent and received</SelectItem>
                      <SelectItem value="inbound">Received</SelectItem>
                      <SelectItem value="outbound">Sent</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="rule-tag">Tag name</Label>
                  <Input
                    id="rule-tag"
                    value={form.tagName}
                    onChange={(e) => set({ tagName: e.target.value })}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="rule-tagv">Tag value</Label>
                  <Input
                    id="rule-tagv"
                    value={form.tagValue}
                    onChange={(e) => set({ tagValue: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="rule-ai">AI category</Label>
                <Input
                  id="rule-ai"
                  value={form.aiCategory}
                  onChange={(e) => set({ aiCategory: e.target.value })}
                  placeholder="newsletter"
                />
              </div>
            </>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label>Connection</Label>
              <Select
                value={form.connectionId}
                onValueChange={(connectionId) => set({ connectionId })}
              >
                <SelectTrigger aria-label="Connection">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ANY}>All connections</SelectItem>
                  {connections.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="rule-box">Mailbox (optional)</Label>
              <Input
                id="rule-box"
                value={form.mailbox}
                onChange={(e) => set({ mailbox: e.target.value })}
                placeholder="support@yourdomain.com"
              />
            </div>
          </div>

          {!block ? (
            <div className="grid gap-1.5">
              <Label>Action</Label>
              <Select
                value={form.action}
                onValueChange={(action) => set({ action: action as CleanupActionName })}
              >
                <SelectTrigger aria-label="Action">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="archive">Archive</SelectItem>
                  <SelectItem value="trash">Move to Trash (kept 30 days)</SelectItem>
                  <SelectItem value="delete" disabled={!canDelete}>
                    Delete permanently{canDelete ? "" : " (Owner or Admin)"}
                  </SelectItem>
                </SelectContent>
              </Select>
              {form.action === "delete" ? (
                <p className="text-xs text-danger-ink">
                  Deleted from Wisemail for good. Resend keeps its copy until its own retention
                  ends.
                </p>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-ink-muted">
              Mail from this sender goes straight to Trash when it arrives, without a notification.
            </p>
          )}

          <label className="flex items-center justify-between gap-3 text-sm">
            <span className="font-medium">Turn the rule on</span>
            <Switch checked={form.enabled} onCheckedChange={(enabled) => set({ enabled })} />
          </label>

          {preview !== null ? (
            <p role="status" className="rounded-lg bg-canvas-sunken px-3 py-2 text-sm">
              {block ? "This sender has already sent " : "Matches "}
              <b>{preview.toLocaleString("en-US")}</b> {preview === 1 ? "email" : "emails"} right
              now.
            </p>
          ) : null}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="outline" onClick={() => void run("preview")} disabled={pending}>
            Preview
          </Button>
          <span className="flex gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={() => void run("save")} disabled={pending || !form.name.trim()}>
              {pending ? "Working…" : rule ? "Save rule" : "Create rule"}
            </Button>
          </span>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
