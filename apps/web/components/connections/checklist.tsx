"use client";

import { Check, CircleAlert, CircleX, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  enableTrackingAction,
  reregisterWebhookAction,
} from "@/app/(app)/[orgSlug]/settings/connections/actions";
import { StatusChip, type StatusState } from "@/components/app/status-chip";
import { Button } from "@/components/ui/button";
import type { ChecklistFixKind, ChecklistItemDTO, ChecklistStatus } from "@/lib/dto/checklist";

const CHIP: Record<ChecklistStatus, { state: StatusState; label: string; Icon: typeof Check }> = {
  ok: { state: "success", label: "Ready", Icon: Check },
  warn: { state: "warning", label: "Needs a look", Icon: CircleAlert },
  fail: { state: "danger", label: "Not set up", Icon: CircleX },
};

export type ChecklistPermissions = {
  /** connection:update: re-register the webhook. */
  connection: boolean;
  /** domain:update: tracking toggles. */
  domain: boolean;
};

const needs = (kind: ChecklistFixKind): keyof ChecklistPermissions =>
  kind === "reregister_webhook" ? "connection" : "domain";

export function Checklist({
  orgSlug,
  connectionId,
  items,
  can,
  showDomains = false,
  fixesDisabled = false,
}: {
  orgSlug: string;
  connectionId: string;
  items: ChecklistItemDTO[];
  can: ChecklistPermissions;
  showDomains?: boolean;
  /** Read-only or disabled connections: Resend is not changed from Wisemail. */
  fixesDisabled?: boolean;
}) {
  const router = useRouter();
  const [, start] = useTransition();
  const [running, setRunning] = useState<ChecklistFixKind | null>(null);

  function fix(kind: ChecklistFixKind) {
    setRunning(kind);
    start(async () => {
      try {
        if (kind === "reregister_webhook") {
          const result = await reregisterWebhookAction(orgSlug, { connectionId });
          if (!result.ok) toast.error(result.error.message);
          else if (result.data.registered) toast.success("Webhook registered");
          else
            toast.warning("Resend has no free webhook slot. Delete an unused one and try again.");
        } else {
          const result = await enableTrackingAction(orgSlug, {
            connectionId,
            kind: kind === "enable_open_tracking" ? "open" : "click",
          });
          if (!result.ok) toast.error(result.error.message);
          else {
            const n = result.data.updated.length;
            toast.success(
              kind === "enable_open_tracking"
                ? `Read receipts on for ${n} ${n === 1 ? "domain" : "domains"}`
                : `Click tracking on for ${n} ${n === 1 ? "domain" : "domains"}`,
            );
          }
        }
      } finally {
        setRunning(null);
        router.refresh();
      }
    });
  }

  return (
    <ul className="grid gap-2" aria-label="Setup checklist" data-testid="checklist">
      {items.map((item) => {
        const chip = CHIP[item.status];
        const canFix = item.fix && can[needs(item.fix.kind)] && !fixesDisabled;
        return (
          <li
            key={item.key}
            data-testid={`checklist-${item.key}`}
            data-status={item.status}
            className="grid gap-2 rounded-lg bg-canvas-sunken px-3 py-2.5 min-[560px]:grid-cols-[minmax(0,1fr)_auto] min-[560px]:items-center min-[560px]:gap-4"
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                <StatusChip state={chip.state}>{chip.label}</StatusChip>
                <span className="text-[0.875rem] font-semibold">{item.title}</span>
                {item.technical ? (
                  <span className="text-xs text-ink-muted">· {item.technical}</span>
                ) : null}
              </div>
              {item.status !== "ok" || showDomains ? (
                <p className="mt-1 max-w-[62ch] text-[0.8125rem] leading-snug text-ink-secondary">
                  {item.detail}
                </p>
              ) : null}
              {showDomains && item.domains && item.domains.length > 0 && item.status !== "ok" ? (
                <p className="mt-1 text-xs text-ink-muted">{item.domains.join(", ")}</p>
              ) : null}
            </div>
            {canFix && item.fix ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => fix(item.fix!.kind)}
                disabled={running !== null}
              >
                {running === item.fix.kind ? (
                  <Loader2 aria-hidden className="animate-spin" />
                ) : null}
                {item.fix.label}
              </Button>
            ) : item.fix && item.status !== "ok" ? (
              <span className="text-xs text-ink-muted">Ask an Admin to fix this</span>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
