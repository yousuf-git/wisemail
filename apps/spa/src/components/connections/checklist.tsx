import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { enableConnectionTracking, reregisterWebhook } from "@/lib/actions";
import type { ChecklistItem } from "@/lib/api";
import { cn } from "@/lib/utils";

const CHIP: Record<string, { label: string; className: string }> = {
  ok: { label: "Ready", className: "bg-success-soft text-success-ink" },
  warn: { label: "Needs a look", className: "bg-warning-soft text-warning-ink" },
  fail: { label: "Not set up", className: "bg-danger-soft text-danger-ink" },
};

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
  items: ChecklistItem[];
  can: { connection: boolean; domain: boolean };
  showDomains?: boolean;
  fixesDisabled?: boolean;
}) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["connections", orgSlug] }),
      queryClient.invalidateQueries({ queryKey: ["connection", orgSlug, connectionId] }),
    ]);
  };

  const fix = useMutation({
    mutationFn: async (kind: string) => {
      if (kind === "reregister_webhook") {
        return reregisterWebhook(orgSlug, connectionId);
      }
      return enableConnectionTracking(
        orgSlug,
        connectionId,
        kind === "enable_open_tracking" ? "open" : "click",
      );
    },
    onSuccess: async (result, kind) => {
      if (!result.ok) {
        setError(result.error.message);
        setMessage(null);
        return;
      }
      setError(null);
      if (kind === "reregister_webhook") {
        const data = result.data as { registered?: boolean };
        setMessage(data.registered ? "Webhook registered" : "Still no free webhook slot.");
      } else {
        setMessage("Tracking updated.");
      }
      await invalidate();
    },
  });

  return (
    <div className="grid gap-2">
      {error ? (
        <p role="alert" className="text-sm text-danger-ink">
          {error}
        </p>
      ) : null}
      {message ? <p className="text-sm text-success-ink">{message}</p> : null}
      <ul className="grid gap-2" aria-label="Setup checklist" data-testid="checklist">
        {items.map((item) => {
          const chip = CHIP[item.status] ?? CHIP.fail!;
          const canFix =
            !!item.fix &&
            !fixesDisabled &&
            (item.fix.kind === "reregister_webhook" ? can.connection : can.domain);
          return (
            <li
              key={item.key}
              data-testid={`checklist-${item.key}`}
              data-status={item.status}
              className="grid gap-2 rounded-lg bg-canvas-sunken px-3 py-2.5 min-[560px]:grid-cols-[minmax(0,1fr)_auto] min-[560px]:items-center"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold",
                      chip.className,
                    )}
                  >
                    {chip.label}
                  </span>
                  <span className="text-sm font-semibold">{item.title}</span>
                  {item.technical ? (
                    <span className="text-xs text-ink-muted">· {item.technical}</span>
                  ) : null}
                </div>
                <p className="mt-1 text-[0.8125rem] text-ink-secondary">{item.detail}</p>
                {showDomains && item.domains && item.domains.length > 0 ? (
                  <p className="mt-1 text-xs text-ink-muted">{item.domains.join(", ")}</p>
                ) : null}
              </div>
              {canFix && item.fix ? (
                <button
                  type="button"
                  disabled={fix.isPending}
                  onClick={() => fix.mutate(item.fix!.kind)}
                  className="h-8 shrink-0 rounded-control border border-line px-3 text-xs font-semibold hover:bg-canvas disabled:opacity-50"
                >
                  {fix.isPending ? "Working…" : item.fix.label}
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
