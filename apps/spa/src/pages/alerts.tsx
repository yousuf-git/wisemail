import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useState } from "react";

import { relativeTime, useNow } from "@/components/inbox/format";
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
import { listAlertRules, listIncidents, type IncidentRow } from "@/lib/api";
import { cn } from "@/lib/utils";

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

function kindLabel(kind: string) {
  return KIND_OPTIONS.find((k) => k.kind === kind)?.label ?? kind;
}

function statusTone(status: IncidentRow["status"]) {
  if (status === "resolved") return "bg-success-soft text-success-ink";
  if (status === "acknowledged") return "bg-accent-soft text-accent-fill";
  return "bg-warning-soft text-warning-ink";
}

function IncidentRowLink({
  orgSlug,
  incident,
  now,
}: {
  orgSlug: string;
  incident: IncidentRow;
  now: number;
}) {
  return (
    <Link
      to="/$orgSlug/alerts/incidents/$incidentId"
      params={{ orgSlug, incidentId: incident.id }}
      data-testid="incident-row"
      data-status={incident.status}
      className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl bg-surface p-3.5 shadow-md transition-colors duration-150 outline-none hover:bg-canvas-sunken focus-visible:ring-2 focus-visible:ring-accent min-[560px]:px-4"
    >
      <div className="min-w-0 flex-1 basis-64">
        <p className="truncate text-sm font-semibold">{incident.title}</p>
        <p className="line-clamp-1 text-[0.8125rem] text-ink-muted">{incident.summary}</p>
      </div>
      <span className="text-xs text-ink-muted">
        {now ? relativeTime(incident.openedAt, now) : ""}
      </span>
      <span
        className={cn(
          "rounded-full px-2.5 py-0.5 text-[11px] font-semibold capitalize",
          statusTone(incident.status),
        )}
      >
        {incident.status}
      </span>
    </Link>
  );
}

export function AlertsPage() {
  const { orgSlug } = useParams({ from: "/$orgSlug/alerts" });
  const queryClient = useQueryClient();
  const now = useNow();
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [kind, setKind] = useState<(typeof KIND_OPTIONS)[number]["kind"]>("bounce_rate");
  const [name, setName] = useState("Bounce rate over 3%");

  const selected = KIND_OPTIONS.find((k) => k.kind === kind) ?? KIND_OPTIONS[0];

  const incidents = useQuery({
    queryKey: ["incidents", orgSlug, "all"],
    queryFn: () => listIncidents(orgSlug, "all"),
  });
  const rules = useQuery({
    queryKey: ["alert-rules", orgSlug],
    queryFn: () => listAlertRules(orgSlug),
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
      setCreating(false);
      setName("Bounce rate over 3%");
      setKind("bounce_rate");
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
  });

  const allIncidents = incidents.data ?? [];
  const active = allIncidents.filter((i) => i.status !== "resolved");
  const resolved = allIncidents.filter((i) => i.status === "resolved").slice(0, 8);
  const ruleRows = rules.data ?? [];

  return (
    <ResourcePage
      title="Alerts"
      description="Incidents that need a look, and the rules that open them."
    >
      {error ? (
        <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger-ink">
          {error}
        </p>
      ) : null}

      <div className="grid gap-8">
        <section aria-labelledby="incidents-h" data-tour="alerts-incidents" className="grid gap-3">
          <h2 id="incidents-h" className="text-base font-semibold">
            Incidents
          </h2>
          {incidents.isPending ? (
            <ResourcePending />
          ) : incidents.isError ? (
            <ResourceError message="Could not load incidents." />
          ) : active.length === 0 ? (
            <ResourceEmpty mood="sleep" title="All quiet">
              {ruleRows.length === 0
                ? "Create a rule below and Wisemail will tell you when something needs a look."
                : "No open incidents. Wizi is napping until a rule fires."}
            </ResourceEmpty>
          ) : (
            <ul className="grid gap-2.5" aria-label="Open incidents">
              {active.map((i) => (
                <li key={i.id} className="grid gap-2">
                  <IncidentRowLink orgSlug={orgSlug} incident={i} now={now} />
                  {i.status === "open" ? (
                    <button
                      type="button"
                      disabled={ack.isPending}
                      onClick={() => ack.mutate(i.id)}
                      className="ml-auto h-8 w-fit rounded-control border border-line px-2.5 text-xs font-semibold hover:bg-canvas-sunken disabled:opacity-50"
                    >
                      Acknowledge
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          {resolved.length > 0 ? (
            <details className="group">
              <summary className="cursor-pointer text-[0.8125rem] font-medium text-ink-muted hover:text-ink">
                Recently resolved ({resolved.length})
              </summary>
              <ul className="mt-2 grid gap-2.5" aria-label="Resolved incidents">
                {resolved.map((i) => (
                  <li key={i.id}>
                    <IncidentRowLink orgSlug={orgSlug} incident={i} now={now} />
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </section>

        <section aria-labelledby="rules-h" data-tour="alerts-rules" className="grid gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 id="rules-h" className="text-base font-semibold">
                Rules
              </h2>
              <p className="text-[0.8125rem] text-ink-muted" data-testid="rule-quota">
                {ruleRows.length} {ruleRows.length === 1 ? "rule" : "rules"}
              </p>
            </div>
            <button
              type="button"
              data-tour="alerts-new"
              onClick={() => setCreating((v) => !v)}
              className="inline-flex h-9 items-center gap-1.5 rounded-control bg-accent-fill px-3 text-sm font-semibold text-accent-ink"
            >
              <Plus aria-hidden className="size-4" />
              New rule
            </button>
          </div>

          {creating ? (
            <form
              className="grid gap-3 rounded-xl border border-line bg-surface p-4 shadow-sm sm:grid-cols-[1fr_1fr_auto]"
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
              <div className="flex items-end gap-2">
                <button
                  type="button"
                  onClick={() => setCreating(false)}
                  className="h-9 rounded-control border border-line px-3 text-sm font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={create.isPending || name.trim().length < 2}
                  className="h-9 rounded-control bg-accent-fill px-3 text-sm font-semibold text-accent-ink disabled:opacity-50"
                >
                  {create.isPending ? "Creating…" : "Create"}
                </button>
              </div>
            </form>
          ) : null}

          {rules.isPending ? (
            <ResourcePending />
          ) : rules.isError ? (
            <ResourceError message="Could not load alert rules." />
          ) : ruleRows.length === 0 ? (
            <ResourceEmpty
              title="No rules yet"
              mascot={false}
              action={
                <button
                  type="button"
                  onClick={() => setCreating(true)}
                  className="inline-flex h-9 items-center gap-1.5 rounded-control bg-accent-fill px-3 text-sm font-semibold text-accent-ink"
                >
                  <Plus aria-hidden className="size-4" /> Create your first rule
                </button>
              }
            >
              A rule watches something, like the bounce rate on a domain, and alerts you when it
              crosses a line.
            </ResourceEmpty>
          ) : (
            <ul className="grid gap-2.5" aria-label="Alert rules">
              {ruleRows.map((row) => (
                <li
                  key={row.id}
                  data-testid={`rule-${row.name}`}
                  className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl bg-surface p-3.5 shadow-md min-[560px]:px-4"
                >
                  <div className="min-w-0 flex-1 basis-64">
                    <p className="truncate text-sm font-semibold">
                      {row.name}
                      {row.activeIncidents > 0 ? (
                        <span className="ml-2 rounded-full bg-danger-soft px-2 py-0.5 text-xs font-semibold text-danger-ink">
                          {row.activeIncidents} open
                        </span>
                      ) : null}
                    </p>
                    <p className="truncate text-[0.8125rem] text-ink-muted">
                      {kindLabel(row.kind)} · {row.condition.operator} {row.condition.threshold}
                      {row.enabled ? "" : " · off"}
                    </p>
                  </div>
                  <label className="flex items-center gap-2 text-xs font-medium text-ink-secondary">
                    <input
                      type="checkbox"
                      role="switch"
                      checked={row.enabled}
                      disabled={toggleRule.isPending}
                      onChange={(e) =>
                        toggleRule.mutate({ id: row.id, enabled: e.target.checked })
                      }
                      className="size-4 accent-[var(--accent)]"
                    />
                    {row.enabled ? "On" : "Off"}
                  </label>
                  <button
                    type="button"
                    disabled={removeRule.isPending}
                    onClick={() => {
                      if (window.confirm(`Delete rule “${row.name}”?`)) removeRule.mutate(row.id);
                    }}
                    className="rounded-control border border-line px-2.5 py-1 text-xs font-semibold text-danger-ink hover:bg-danger-soft disabled:opacity-50"
                  >
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </ResourcePage>
  );
}
