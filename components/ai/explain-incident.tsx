"use client";

import { Lock, RefreshCw, Sparkles } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Wizi } from "@/components/mascot/wizi";
import { Button } from "@/components/ui/button";
import { AI_CREDIT_COST } from "@/lib/ai/types";
import type { IncidentDTO } from "@/lib/dto/alert";
import { AiRequestError, requestExplain } from "./api";
import { aiAccess, useAiStatus } from "./use-ai-status";

/**
 * "Explain" on an incident (PRD §5.10 anomaly explanation): a few sentences grounded in the
 * rollups and bounce data around the alert. Cached per incident, so reopening the page is free;
 * asking again costs credits again. Wizi thinks while it works.
 */
export function ExplainIncident({
  orgSlug,
  incident,
}: {
  orgSlug: string;
  incident: Pick<IncidentDTO, "id" | "aiExplanation">;
}) {
  const { status, refresh } = useAiStatus(orgSlug);
  const access = aiAccess(status, "anomaly");
  const [text, setText] = useState(incident.aiExplanation?.text ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A cached explanation stays readable even when AI has since been switched off.
  if (access.kind === "hidden" && !text) return null;

  async function explain(refreshText: boolean) {
    setBusy(true);
    setError(null);
    try {
      const result = await requestExplain(orgSlug, {
        incidentId: incident.id,
        refresh: refreshText,
      });
      setText(result.text);
    } catch (e) {
      setError(e instanceof AiRequestError ? e.message : "We couldn't reach the AI. Try again.");
    } finally {
      setBusy(false);
      refresh();
    }
  }

  return (
    <div className="grid gap-2 border-t border-line pt-4" data-testid="ai-explain">
      <h2 className="flex items-center gap-1.5 text-sm font-semibold">
        <Sparkles aria-hidden className="size-4 text-engaged" /> What happened?
      </h2>
      {busy ? (
        <div className="flex items-center gap-3 text-sm text-ink-muted" role="status">
          <Wizi mood="thinking" size={48} />
          Wizi is looking at your delivery data…
        </div>
      ) : text ? (
        <p
          className="max-w-[68ch] rounded-lg bg-engaged-soft/60 px-3 py-2 text-sm"
          data-testid="ai-explanation"
        >
          {text}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-danger-ink">
          {error}
        </p>
      ) : null}
      {!busy ? (
        access.kind === "locked" ? (
          <p className="flex items-start gap-1.5 text-[0.8125rem] text-ink-muted">
            <Lock aria-hidden className="mt-0.5 size-3.5 flex-none" />
            <span>
              {access.message}{" "}
              <Link href={`/${orgSlug}/settings/ai`} className="font-semibold underline">
                See plans
              </Link>
            </span>
          </p>
        ) : access.kind === "ready" ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void explain(!!text)}
              data-testid="ai-explain-button"
            >
              {text ? <RefreshCw aria-hidden /> : <Sparkles aria-hidden />}
              {text ? "Explain again" : "Explain this alert"}
            </Button>
            <span className="text-xs text-ink-muted">
              Uses {AI_CREDIT_COST.anomaly} AI credits. Only counts and error reasons are sent,
              never email content.
            </span>
          </div>
        ) : null
      ) : null}
    </div>
  );
}
