import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import { ArrowLeft, Check, Lock, RefreshCw, Sparkles } from "lucide-react";
import { useState } from "react";
import { AI_CREDIT_COST } from "@wisemail/shared";

import { BreadcrumbLabel } from "@/components/app/breadcrumb-label";
import { Wizi } from "@/components/mascot/wizi";
import {
  ResourceError,
  ResourcePage,
  ResourcePending,
} from "@/components/resource-page";
import { acknowledgeIncident } from "@/lib/actions";
import {
  ApiError,
  aiExplainIncident,
  getAiStatus,
  getIncident,
  type IncidentRow,
} from "@/lib/api";

const KIND_LABELS: Record<string, string> = {
  bounce_rate: "Bounce rate",
  complaint_rate: "Complaint rate",
  complaint_any: "Any complaint",
  delivery_delay_rate: "Delivery delays",
  connection_silent: "Webhook silence",
  domain_status: "Domain verification failed",
  connection_status: "Connection needs attention",
};

const RATE_KINDS = new Set(["bounce_rate", "complaint_rate", "delivery_delay_rate"]);

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-xs font-semibold tracking-[0.04em] text-ink-muted uppercase">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

function statusTone(status: IncidentRow["status"]) {
  if (status === "resolved") return "bg-success-soft text-success-ink";
  if (status === "acknowledged") return "bg-accent-soft text-accent-fill";
  return "bg-warning-soft text-warning-ink";
}

function ExplainIncident({
  orgSlug,
  incident,
}: {
  orgSlug: string;
  incident: Pick<IncidentRow, "id" | "aiExplanation">;
}) {
  const ai = useQuery({
    queryKey: ["ai-status", orgSlug],
    queryFn: () => getAiStatus(orgSlug),
  });
  const [text, setText] = useState(incident.aiExplanation?.text ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const status = ai.data;
  const featureOn = status?.features.anomalies !== false;
  const ready =
    !!status &&
    status.planIncluded &&
    status.enabled &&
    featureOn &&
    status.canUse &&
    status.credits.available >= AI_CREDIT_COST.anomaly;
  const locked = !!status && (!status.planIncluded || !status.enabled || !featureOn || !status.canUse);
  const hidden = ai.isPending || (!status?.planIncluded && !text);

  if (hidden && !text) return null;

  async function explain(refreshText: boolean) {
    setBusy(true);
    setError(null);
    try {
      const result = await aiExplainIncident(orgSlug, {
        incidentId: incident.id,
        refresh: refreshText,
      });
      setText(result.text);
      void ai.refetch();
    } catch (e) {
      setError(
        e instanceof ApiError || e instanceof Error
          ? e.message
          : "We couldn't reach the AI. Try again.",
      );
    } finally {
      setBusy(false);
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
        locked && !ready ? (
          <p className="flex items-start gap-1.5 text-[0.8125rem] text-ink-muted">
            <Lock aria-hidden className="mt-0.5 size-3.5 flex-none" />
            <span>
              AI explanations need a paid plan with anomaly explanations on.{" "}
              <Link
                to="/$orgSlug/settings/ai"
                params={{ orgSlug }}
                className="font-semibold underline"
              >
                See AI settings
              </Link>
            </span>
          </p>
        ) : ready ? (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void explain(!!text)}
              data-testid="ai-explain-button"
              className="inline-flex h-8 items-center gap-1.5 rounded-control border border-line px-2.5 text-xs font-medium hover:bg-canvas-sunken"
            >
              {text ? <RefreshCw aria-hidden className="size-3.5" /> : <Sparkles aria-hidden className="size-3.5" />}
              {text ? "Explain again" : "Explain this alert"}
            </button>
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

export function IncidentDetailPage() {
  const { orgSlug } = useParams({ from: "/$orgSlug" });
  const { incidentId } = useParams({ strict: false }) as { incidentId: string };
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const detail = useQuery({
    queryKey: ["incident", orgSlug, incidentId],
    queryFn: () => getIncident(orgSlug, incidentId),
  });

  const ack = useMutation({
    mutationFn: () => acknowledgeIncident(orgSlug, incidentId),
    onSuccess: async (result) => {
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ["incident", orgSlug, incidentId] });
      await queryClient.invalidateQueries({ queryKey: ["incidents", orgSlug] });
    },
    onError: () => setError("Could not acknowledge the incident."),
  });

  if (detail.isPending) {
    return (
      <ResourcePage title="Incident">
        <ResourcePending />
      </ResourcePage>
    );
  }
  if (detail.isError || !detail.data) {
    return (
      <ResourcePage title="Incident">
        <ResourceError message="Could not load this incident." />
      </ResourcePage>
    );
  }

  const { incident, can } = detail.data;
  const c = incident.context;
  const isRate = RATE_KINDS.has(incident.kind);

  return (
    <ResourcePage title={incident.title} description={incident.summary}>
      <BreadcrumbLabel segment={incidentId} label={incident.title} />
      <div className="grid gap-4">
        <Link
          to="/$orgSlug/alerts"
          params={{ orgSlug }}
          className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-ink-secondary hover:text-ink"
        >
          <ArrowLeft aria-hidden className="size-4" /> All alerts
        </Link>

        {error ? (
          <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger-ink">
            {error}
          </p>
        ) : null}

        <section className="grid gap-4 rounded-xl border border-line bg-surface p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h1
                className="text-[1.5rem] leading-8 font-bold tracking-[-0.02em]"
                data-testid="incident-title"
              >
                {incident.title}
              </h1>
              <p className="mt-1 max-w-[68ch] text-ink-muted">{incident.summary}</p>
            </div>
            <span
              className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${statusTone(incident.status)}`}
            >
              {incident.status}
            </span>
          </div>

          <dl className="grid gap-4 border-t border-line pt-4 sm:grid-cols-2 lg:grid-cols-4">
            <Fact label="Rule">
              {incident.ruleName}
              <span className="block text-[0.8125rem] text-ink-muted">
                {KIND_LABELS[incident.kind] ?? incident.kind}
              </span>
            </Fact>
            <Fact label="Opened">
              {new Date(incident.openedAt).toLocaleString()}
            </Fact>
            {isRate ? (
              <Fact label="Seen vs. limit">
                <span className="tabular-nums">
                  {incident.observedValue}% of {c.volume ?? "?"} emails
                </span>
                <span className="block text-[0.8125rem] text-ink-muted">
                  Alerts above {c.threshold}%
                </span>
              </Fact>
            ) : null}
            {incident.resolvedAt ? (
              <Fact label="Resolved">{new Date(incident.resolvedAt).toLocaleString()}</Fact>
            ) : null}
            {c.connectionName ? <Fact label="Connection">{c.connectionName}</Fact> : null}
            {c.domainName ? <Fact label="Domain">{c.domainName}</Fact> : null}
          </dl>

          {c.sampleEmailIds && c.sampleEmailIds.length > 0 ? (
            <div className="grid gap-2 border-t border-line pt-4">
              <h2 className="text-sm font-semibold">Recent examples</h2>
              <ul className="flex flex-wrap gap-2">
                {c.sampleEmailIds.map((id) => (
                  <li key={id}>
                    <Link
                      to="/$orgSlug/activity"
                      params={{ orgSlug }}
                      className="rounded-full bg-canvas-sunken px-3 py-1 font-mono text-xs text-ink-secondary hover:text-ink"
                    >
                      {id.slice(-8)}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <ExplainIncident orgSlug={orgSlug} incident={incident} />

          {incident.status === "open" && can.acknowledge ? (
            <div className="border-t border-line pt-4">
              <button
                type="button"
                disabled={ack.isPending}
                onClick={() => ack.mutate()}
                className="inline-flex h-9 items-center gap-1.5 rounded-control border border-line px-3 text-sm font-medium hover:bg-canvas-sunken disabled:opacity-50"
              >
                <Check aria-hidden className="size-4" /> I&apos;m on it
              </button>
              <p className="mt-2 text-[0.8125rem] text-ink-muted">
                The incident stays open and closes by itself once the numbers look normal again.
              </p>
            </div>
          ) : null}
        </section>
      </div>
    </ResourcePage>
  );
}
