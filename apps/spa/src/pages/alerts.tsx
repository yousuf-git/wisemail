import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import { useState } from "react";

import {
  ResourceEmpty,
  ResourceError,
  ResourcePage,
  ResourcePending,
} from "@/components/resource-page";
import {
  acknowledgeIncident,
  createAlertRule,
  deleteAlertRule,
  setAlertRuleEnabled,
} from "@/lib/actions";
import { listAlertRules, listIncidents } from "@/lib/api";

/** Labels mirrored from `lib/alerts/kinds` (SPA can't import apps/web). */
const KIND_OPTIONS = [
  { kind: "bounce_rate", label: "Bounce rate", threshold: 3, windowMinutes: 60, minVolume: 10 },
  {
    kind: "complaint_rate",
    label: "Complaint rate",
    threshold: 0.1,
    windowMinutes: 60,
    minVolume: 50,
  },
  { kind: "complaint_any", label: "Any complaint", threshold: 0, windowMinutes: 60, minVolume: 0 },
  {
    kind: "delivery_delay_rate",
    label: "Delivery delays",
    threshold: 10,
    windowMinutes: 60,
    minVolume: 20,
  },
  {
    kind: "connection_silent",
    label: "Webhook silence",
    threshold: 0,
    windowMinutes: 24 * 60,
    minVolume: 0,
  },
  {
    kind: "domain_status",
    label: "Domain verification failed",
    threshold: 0,
    windowMinutes: 0,
    minVolume: 0,
  },
  {
    kind: "connection_status",
    label: "Connection needs attention",
    threshold: 0,
    windowMinutes: 0,
    minVolume: 0,
  },
] as const;

export function AlertsPage() {
  const { orgSlug } = useParams({ from: "/$orgSlug/alerts" });
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"incidents" | "rules">("incidents");
  const [kind, setKind] = useState<(typeof KIND_OPTIONS)[number]["kind"]>("bounce_rate");
  const [name, setName] = useState("Bounce rate over 3%");

  const selected = KIND_OPTIONS.find((k) => k.kind === kind) ?? KIND_OPTIONS[0];

  const incidents = useQuery({
    queryKey: ["incidents", orgSlug],
    queryFn: () => listIncidents(orgSlug, "active"),
  });
  const rules = useQuery({
    queryKey: ["alert-rules", orgSlug],
    queryFn: () => listAlertRules(orgSlug),
  });

  const ack = useMutation({
    mutationFn: (incidentId: string) => acknowledgeIncident(orgSlug, incidentId),
    onSuccess: async (result) => {
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ["incidents", orgSlug] });
    },
    onError: () => setError("Could not acknowledge the incident."),
  });

  const create = useMutation({
    mutationFn: () =>
      createAlertRule(orgSlug, {
        name: name.trim(),
        kind: selected.kind,
        condition: {
          operator: "gt",
          threshold: selected.threshold,
          windowMinutes: selected.windowMinutes,
          minVolume: selected.minVolume,
        },
      }),
    onSuccess: async (result) => {
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setError(null);
      setTab("rules");
      await queryClient.invalidateQueries({ queryKey: ["alert-rules", orgSlug] });
    },
    onError: () => setError("Could not create the rule."),
  });

  const toggleRule = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      setAlertRuleEnabled(orgSlug, id, enabled),
    onSuccess: async (result) => {
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ["alert-rules", orgSlug] });
    },
    onError: () => setError("Could not update the rule."),
  });

  const removeRule = useMutation({
    mutationFn: (id: string) => deleteAlertRule(orgSlug, id),
    onSuccess: async (result) => {
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ["alert-rules", orgSlug] });
    },
    onError: () => setError("Could not delete the rule."),
  });

  return (
    <ResourcePage title="Alerts" description="Incidents and rules">
      {error ? (
        <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger-ink">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {(
          [
            ["incidents", "Incidents"],
            ["rules", "Rules"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`h-8 rounded-control px-3 text-sm font-medium ${
              tab === id
                ? "bg-accent-soft text-accent-fill"
                : "border border-line text-ink-secondary hover:bg-canvas-sunken"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "incidents" ? (
        incidents.isPending ? (
          <ResourcePending />
        ) : incidents.isError ? (
          <ResourceError message="Could not load incidents." />
        ) : incidents.data.length === 0 ? (
          <ResourceEmpty>No open incidents.</ResourceEmpty>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
            {incidents.data.map((row) => (
              <li key={row.id} className="grid gap-2 px-4 py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <Link
                    to="/$orgSlug/alerts/incidents/$incidentId"
                    params={{ orgSlug, incidentId: row.id }}
                    className="truncate text-sm font-semibold hover:underline"
                  >
                    {row.title}
                  </Link>
                  <span className="shrink-0 text-xs font-medium text-warning-ink">{row.status}</span>
                </div>
                <p className="text-xs text-ink-muted">
                  {row.ruleName} · opened {new Date(row.openedAt).toLocaleString()}
                </p>
                {row.summary ? <p className="text-sm text-ink-secondary">{row.summary}</p> : null}
                {row.status === "open" ? (
                  <div className="flex flex-wrap gap-2">
                    <Link
                      to="/$orgSlug/alerts/incidents/$incidentId"
                      params={{ orgSlug, incidentId: row.id }}
                      className="rounded-control border border-line px-2.5 py-1 text-xs font-medium hover:bg-canvas-sunken"
                    >
                      Open
                    </Link>
                    <button
                      type="button"
                      disabled={ack.isPending}
                      onClick={() => ack.mutate(row.id)}
                      className="rounded-control border border-line px-2.5 py-1 text-xs font-medium hover:bg-canvas-sunken disabled:opacity-50"
                    >
                      Acknowledge
                    </button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )
      ) : (
        <div className="grid gap-4">
          <form
            className="grid gap-2 rounded-lg border border-line bg-surface p-4 sm:grid-cols-[1fr_1fr_auto]"
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate();
            }}
          >
            <label className="grid gap-1 text-sm">
              <span className="text-xs font-medium text-ink-muted">Name</span>
              <input
                required
                minLength={2}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-9 rounded-control border border-line bg-canvas px-3 text-sm"
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-xs font-medium text-ink-muted">Kind</span>
              <select
                value={kind}
                onChange={(e) => {
                  const next = e.target.value as (typeof KIND_OPTIONS)[number]["kind"];
                  setKind(next);
                  const opt = KIND_OPTIONS.find((k) => k.kind === next);
                  if (opt) setName(opt.label);
                }}
                className="h-9 rounded-control border border-line bg-canvas px-2 text-sm"
              >
                {KIND_OPTIONS.map((k) => (
                  <option key={k.kind} value={k.kind}>
                    {k.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex items-end">
              <button
                type="submit"
                disabled={create.isPending || name.trim().length < 2}
                className="h-9 rounded-control bg-accent-fill px-3 text-sm font-semibold text-accent-ink hover:bg-accent-fill-hover disabled:opacity-50"
              >
                {create.isPending ? "Creating…" : "Create"}
              </button>
            </div>
          </form>

          {rules.isPending ? (
            <ResourcePending />
          ) : rules.isError ? (
            <ResourceError message="Could not load alert rules." />
          ) : rules.data.length === 0 ? (
            <ResourceEmpty>No alert rules yet.</ResourceEmpty>
          ) : (
            <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
              {rules.data.map((row) => (
                <li key={row.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{row.name}</p>
                    <p className="truncate text-xs text-ink-muted">
                      {row.kind} · {row.condition.operator} {row.condition.threshold}
                      {row.activeIncidents > 0 ? ` · ${row.activeIncidents} active` : ""}
                      {row.enabled ? "" : " · disabled"}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      disabled={toggleRule.isPending}
                      onClick={() => toggleRule.mutate({ id: row.id, enabled: !row.enabled })}
                      className="rounded-control border border-line px-2.5 py-1 text-xs font-medium hover:bg-canvas-sunken disabled:opacity-50"
                    >
                      {row.enabled ? "Disable" : "Enable"}
                    </button>
                    <button
                      type="button"
                      disabled={removeRule.isPending}
                      onClick={() => {
                        if (window.confirm(`Delete rule “${row.name}”?`)) removeRule.mutate(row.id);
                      }}
                      className="rounded-control border border-line px-2.5 py-1 text-xs font-medium text-danger-ink hover:bg-danger-soft disabled:opacity-50"
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </ResourcePage>
  );
}
