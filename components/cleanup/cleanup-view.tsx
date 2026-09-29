"use client";

import { Ban, Eraser, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import {
  deleteCleanupRuleAction,
  setCleanupRuleEnabledAction,
} from "@/app/(app)/[orgSlug]/settings/cleanup/actions";
import { EmptyState } from "@/components/app/empty-state";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import type { CleanupRuleDTO } from "@/lib/dto/deletion";
import { RuleDialog } from "./rule-dialog";

const ACTION_LABEL = { archive: "Archive", trash: "Move to Trash", delete: "Delete permanently" };

/** One line describing what a rule matches, in words. */
export function describeRule(rule: CleanupRuleDTO): string {
  const m = rule.match;
  const parts: string[] = [];
  if (m.fromAddress) parts.push(`from ${m.fromAddress}`);
  if (m.fromDomain) parts.push(`from @${m.fromDomain}`);
  if (m.subjectContains) parts.push(`subject contains “${m.subjectContains}”`);
  if (m.direction) parts.push(m.direction === "inbound" ? "received" : "sent");
  if (m.tag) parts.push(`tag ${m.tag.name}${m.tag.value ? `=${m.tag.value}` : ""}`);
  if (m.aiCategory) parts.push(`AI category ${m.aiCategory}`);
  if (m.olderThanDays) parts.push(`older than ${m.olderThanDays} days`);
  if (rule.scope.mailboxAddresses.length)
    parts.push(`in ${rule.scope.mailboxAddresses.join(", ")}`);
  return parts.join(" · ") || "Everything";
}

/** Settings → Cleanup (PRD §5.16, UC-39): rule list, toggles, dry-run preview in the editor. */
export function CleanupView({
  orgSlug,
  rules,
  connections,
  canDelete,
}: {
  orgSlug: string;
  rules: CleanupRuleDTO[];
  connections: { id: string; name: string }[];
  canDelete: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<CleanupRuleDTO | "new" | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function toggle(rule: CleanupRuleDTO, enabled: boolean) {
    setBusy(rule.id);
    const result = await setCleanupRuleEnabledAction(orgSlug, { id: rule.id, enabled });
    setBusy(null);
    if (!result.ok) return void toast.error(result.error.message);
    router.refresh();
  }

  async function remove(rule: CleanupRuleDTO) {
    if (!window.confirm(`Delete the rule “${rule.name}”? Mail it already moved stays where it is.`))
      return;
    setBusy(rule.id);
    const result = await deleteCleanupRuleAction(orgSlug, { id: rule.id });
    setBusy(null);
    if (!result.ok) return void toast.error(result.error.message);
    toast.success("Rule deleted");
    router.refresh();
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-ink-muted">
          Rules run every hour. Blocked senders skip the inbox on arrival.
        </p>
        <Button onClick={() => setEditing("new")}>
          <Plus aria-hidden /> New rule
        </Button>
      </div>

      {rules.length === 0 ? (
        <EmptyState
          mood="idle"
          mascotSize={112}
          title="No cleanup rules yet"
          action={<Button onClick={() => setEditing("new")}>Create your first rule</Button>}
        >
          For example: move notifications from github.com to Trash after 30 days, or send mail from
          a sender you never want straight to Trash.
        </EmptyState>
      ) : (
        <ul className="grid gap-2" aria-label="Cleanup rules">
          {rules.map((rule) => {
            const locked = rule.action === "delete" && !canDelete;
            return (
              <li
                key={rule.id}
                data-testid="cleanup-rule"
                className="grid gap-3 rounded-xl bg-surface p-4 shadow-sm md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
              >
                <div className="grid min-w-0 gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {rule.kind === "block_sender" ? (
                      <Ban aria-hidden className="size-4 text-ink-muted" />
                    ) : (
                      <Eraser aria-hidden className="size-4 text-ink-muted" />
                    )}
                    <h2 className="text-[15px] font-semibold">{rule.name}</h2>
                    <span
                      className={
                        rule.action === "delete"
                          ? "rounded-full bg-danger-soft px-2 py-px text-xs font-semibold text-danger-ink"
                          : "rounded-full bg-canvas-sunken px-2 py-px text-xs font-semibold text-ink-secondary"
                      }
                    >
                      {rule.kind === "block_sender" ? "Block sender" : ACTION_LABEL[rule.action]}
                    </span>
                  </div>
                  <p className="text-[13px] text-ink-muted">{describeRule(rule)}</p>
                  <p className="text-xs text-ink-faint">
                    {rule.kind === "block_sender"
                      ? "Applies to mail as it arrives"
                      : rule.lastRunAt
                        ? `Last run ${new Date(rule.lastRunAt).toLocaleString()} · ${rule.lastRunCount} affected`
                        : "Has not run yet"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={rule.enabled}
                    disabled={busy === rule.id || locked}
                    onCheckedChange={(on) => void toggle(rule, on)}
                    aria-label={`${rule.enabled ? "Turn off" : "Turn on"} ${rule.name}`}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={locked}
                    onClick={() => setEditing(rule)}
                  >
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy === rule.id || locked}
                    onClick={() => void remove(rule)}
                  >
                    Delete
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {editing ? (
        <RuleDialog
          key={editing === "new" ? "new" : editing.id}
          orgSlug={orgSlug}
          rule={editing === "new" ? undefined : editing}
          connections={connections}
          canDelete={canDelete}
          open
          onOpenChange={(open) => !open && setEditing(null)}
          onSaved={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}
