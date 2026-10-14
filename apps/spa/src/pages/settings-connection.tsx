import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useState } from "react";

import { BreadcrumbLabel } from "@/components/app/breadcrumb-label";
import { Checklist } from "@/components/connections/checklist";
import {
  CONNECTION_STATUS,
  STATUS_REASON_COPY,
  summarizeChecklist,
  timeAgo,
} from "@/components/connections/status";
import { Wizi } from "@/components/mascot/wizi";
import {
  ResourceEmpty,
  ResourceError,
  ResourcePage,
  ResourcePending,
} from "@/components/resource-page";
import { syncConnection } from "@/lib/actions";
import { getConnection } from "@/lib/api";
import { cn } from "@/lib/utils";

const COUNT_LABELS: [string, string][] = [
  ["domains", "Domains"],
  ["apiKeys", "API keys"],
  ["contacts", "Contacts"],
  ["segments", "Segments"],
  ["topics", "Topics"],
  ["contactProperties", "Contact properties"],
  ["templates", "Templates"],
  ["broadcasts", "Broadcasts"],
  ["automations", "Automations"],
];

export function SettingsConnectionPage() {
  const { orgSlug, connectionId } = useParams({
    from: "/$orgSlug/settings/connections/$connectionId",
  });
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const detail = useQuery({
    queryKey: ["connection", orgSlug, connectionId],
    queryFn: () => getConnection(orgSlug, connectionId),
    retry: false,
  });

  const sync = useMutation({
    mutationFn: () => syncConnection(orgSlug, connectionId),
    onSuccess: async (result) => {
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setError(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["connection", orgSlug, connectionId] }),
        queryClient.invalidateQueries({ queryKey: ["connections", orgSlug] }),
      ]);
    },
  });

  if (detail.isPending) {
    return (
      <ResourcePage title="Connection">
        <ResourcePending />
      </ResourcePage>
    );
  }

  if (detail.isError || !detail.data) {
    return (
      <ResourcePage title="Connection">
        <ResourceError message="We couldn't find that connection." />
        <Link
          to="/$orgSlug/settings/connections"
          params={{ orgSlug }}
          className="text-sm font-medium text-accent-fill hover:underline"
        >
          Back to connections
        </Link>
      </ResourcePage>
    );
  }

  const { connection, can } = detail.data;
  const status = CONNECTION_STATUS[connection.status];
  const summary = summarizeChecklist(connection.checklist);
  const allReady = summary.total > 0 && summary.ok === summary.total;
  const reason = connection.statusReason
    ? STATUS_REASON_COPY[connection.statusReason] ?? connection.statusReason
    : null;
  const manageable = connection.status !== "read_only" && connection.status !== "disabled";

  return (
    <div className="grid gap-4">
      <BreadcrumbLabel segment={connectionId} label={connection.name} />
      <Link
        to="/$orgSlug/settings/connections"
        params={{ orgSlug }}
        className="inline-flex w-fit items-center gap-1.5 text-[0.8125rem] font-medium text-ink-secondary hover:text-ink"
      >
        <ArrowLeft aria-hidden className="size-4" />
        All connections
      </Link>

      <header className="grid gap-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h1 className="text-xl font-semibold tracking-tight">{connection.name}</h1>
          {status ? (
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold",
                status.state === "success" && "bg-success-soft text-success-ink",
                status.state === "warning" && "bg-warning-soft text-warning-ink",
                status.state === "danger" && "bg-danger-soft text-danger-ink",
                status.state === "info" && "bg-info-soft text-info-ink",
                status.state === "neutral" && "bg-canvas-sunken text-ink-muted",
              )}
            >
              {status.label}
            </span>
          ) : null}
        </div>
        <p className="text-sm text-ink-muted">
          Key re_••••{connection.apiKeyLast4 ?? "••••"}
        </p>
      </header>

      {error ? (
        <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger-ink">
          {error}
        </p>
      ) : null}

      {reason ? (
        <p
          role="status"
          className="max-w-[68ch] rounded-md bg-warning-soft px-3 py-2.5 text-[0.8125rem] leading-snug text-warning-ink"
        >
          {reason}
        </p>
      ) : null}

      <section className="grid gap-3 rounded-xl border border-line bg-surface p-4 shadow-sm min-[560px]:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold">Sync</h2>
          {can.update && connection.status !== "disabled" ? (
            <button
              type="button"
              disabled={sync.isPending}
              onClick={() => sync.mutate()}
              className="h-8 rounded-control border border-line px-3 text-xs font-semibold hover:bg-canvas-sunken disabled:opacity-50"
            >
              {sync.isPending ? "Syncing…" : "Sync now"}
            </button>
          ) : null}
        </div>
        {connection.sync ? (
          <>
            <p className="text-sm text-ink-secondary">
              {connection.sync.state}
              {connection.sync.stage ? ` · ${connection.sync.stage.label}` : ""}
              {connection.sync.error ? ` · ${connection.sync.error}` : ""}
              {connection.lastSyncAt ? ` · started ${timeAgo(connection.sync.startedAt)}` : ""}
            </p>
            <ol
              className="grid gap-x-6 gap-y-1 text-[0.8125rem] text-ink-secondary min-[560px]:grid-cols-2"
              aria-label="Sync steps"
            >
              {connection.sync.progress.map((step) => (
                <li key={step.key} className="flex items-center justify-between gap-3">
                  <span>{step.label}</span>
                  <span className="text-ink-muted">
                    {step.status === "completed"
                      ? `${step.count} synced`
                      : step.status === "running"
                        ? `${step.count} so far`
                        : step.status === "failed"
                          ? "failed"
                          : "waiting"}
                  </span>
                </li>
              ))}
            </ol>
          </>
        ) : (
          <p className="text-sm text-ink-muted">
            {connection.lastSyncAt
              ? `Last sync ${timeAgo(connection.lastSyncAt)}`
              : "No sync has run yet."}
          </p>
        )}
      </section>

      <section className="grid gap-3 rounded-xl border border-line bg-surface p-4 shadow-sm min-[560px]:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold">
            Setup checklist
            {summary.total > 0 ? (
              <span className="ml-2 text-[0.8125rem] font-normal text-ink-muted">
                {summary.ok} of {summary.total} ready
              </span>
            ) : null}
          </h2>
          {allReady ? <Wizi mood="happy" size={48} title="All set" /> : null}
        </div>
        {connection.checklist.length === 0 ? (
          <ResourceEmpty>Checklist appears after the first sync finishes.</ResourceEmpty>
        ) : (
          <Checklist
            orgSlug={orgSlug}
            connectionId={connection.id}
            items={connection.checklist}
            can={{ connection: can.update, domain: can.domainUpdate }}
            showDomains
            fixesDisabled={!manageable}
          />
        )}
      </section>

      <section className="grid gap-3 rounded-xl border border-line bg-surface p-4 shadow-sm min-[560px]:p-5">
        <h2 className="text-base font-semibold">Synced data</h2>
        <ul className="grid gap-x-6 gap-y-1 text-sm min-[560px]:grid-cols-2">
          {COUNT_LABELS.map(([key, label]) => (
            <li key={key} className="flex justify-between gap-3">
              <span className="text-ink-secondary">{label}</span>
              <span className="font-medium">{connection.counts[key] ?? 0}</span>
            </li>
          ))}
        </ul>
      </section>

      {connection.domains.length > 0 ? (
        <section className="grid gap-3 rounded-xl border border-line bg-surface p-4 shadow-sm min-[560px]:p-5">
          <h2 className="text-base font-semibold">Domains</h2>
          <ul className="divide-y divide-line">
            {connection.domains.map((d) => (
              <li key={d.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                <div>
                  <p className="text-sm font-medium">{d.name}</p>
                  <p className="text-xs text-ink-muted">
                    {d.status}
                    {d.openTracking ? " · opens" : ""}
                    {d.clickTracking ? " · clicks" : ""}
                    {d.receiving ? " · receiving" : ""}
                  </p>
                </div>
                <Link
                  to="/$orgSlug/domains"
                  params={{ orgSlug }}
                  className="text-xs font-medium text-accent-fill hover:underline"
                >
                  Domains
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
