import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import {
  callAdminAction,
  getAdminOrg,
  type AdminLimitRow,
  type AdminOrgDetail,
} from "@/lib/admin-api";

const PLANS = ["free", "pro", "team", "agency"] as const;

export function AdminOrgPage() {
  const { orgId } = useParams({ from: "/admin/organizations/$orgId" });
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("");
  const [plan, setPlan] = useState<(typeof PLANS)[number]>("pro");
  const [trialDays, setTrialDays] = useState(14);
  const [limitDraft, setLimitDraft] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const org = useQuery({
    queryKey: ["admin-org", orgId],
    queryFn: () => getAdminOrg(orgId),
  });

  useEffect(() => {
    if (!org.data) return;
    setPlan((org.data.plan as (typeof PLANS)[number]) || "pro");
    setLimitDraft(Object.fromEntries(org.data.limits.map((l) => [l.key, l.override?.toString() ?? ""])));
  }, [org.data]);

  const act = useMutation({
    mutationFn: (args: { id: string; input: Record<string, unknown> }) =>
      callAdminAction(args.id, args.input),
    onSuccess: async (result) => {
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setError(null);
      setReason("");
      await queryClient.invalidateQueries({ queryKey: ["admin-org", orgId] });
    },
    onError: () => setError("Action failed."),
  });

  if (org.isPending) return <p className="text-sm text-ink-muted">Loading…</p>;
  if (org.isError || !org.data) {
    return <p className="text-sm text-danger-ink">Organization not found.</p>;
  }

  const o: AdminOrgDetail = org.data;
  const suspended = Boolean(o.suspended);
  const trialRunning = Boolean(o.trial?.active);

  return (
    <>
      <Link to="/admin/organizations" className="text-sm text-accent-fill hover:underline">
        ← Organizations
      </Link>
      <header>
        <h1 className="text-xl font-semibold tracking-tight">{o.name}</h1>
        <p className="text-sm text-ink-muted">
          {o.slug} · {o.planLabel ?? o.plan}
          {trialRunning ? ` · Trial (${o.trial!.daysLeft}d left)` : ""}
          {suspended ? " · Suspended" : ""}
        </p>
      </header>
      {error ? (
        <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger-ink">
          {error}
        </p>
      ) : null}

      <section className="grid max-w-lg gap-3 rounded-xl border border-line bg-surface p-4">
        <h2 className="text-sm font-semibold">Plan & access</h2>
        <label className="grid gap-1 text-sm">
          Reason
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="h-9 rounded-control border border-line bg-canvas-sunken px-3"
            placeholder="Sales deal, support exception…"
          />
        </label>
        {o.billingEnabled ? (
          <p className="text-sm text-ink-muted">
            Billing is on, so plans change through Stripe. Limit overrides and trials still work.
          </p>
        ) : (
          <div className="flex flex-wrap items-end gap-2">
            <label className="grid gap-1 text-sm">
              Plan
              <select
                value={plan}
                onChange={(e) => setPlan(e.target.value as (typeof PLANS)[number])}
                className="h-9 rounded-control border border-line bg-canvas-sunken px-2"
              >
                {PLANS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              disabled={act.isPending || reason.trim().length < 5}
              className="h-9 rounded-control bg-accent-fill px-3 text-sm font-semibold text-accent-ink disabled:opacity-50"
              onClick={() =>
                act.mutate({
                  id: "admin.orgs.changePlan",
                  input: { orgId, plan, reason: reason.trim() },
                })
              }
            >
              Change plan
            </button>
          </div>
        )}
        <div className="flex flex-wrap items-end gap-2">
          <label className="grid gap-1 text-sm">
            {trialRunning ? "Days to add" : "Trial days"}
            <input
              type="number"
              min={1}
              max={90}
              value={trialDays}
              onChange={(e) => setTrialDays(Number(e.target.value) || 14)}
              className="h-9 w-24 rounded-control border border-line bg-canvas-sunken px-3"
            />
          </label>
          <button
            type="button"
            disabled={act.isPending || reason.trim().length < 5}
            className="h-9 rounded-control border border-line px-3 text-sm font-medium disabled:opacity-50"
            onClick={() =>
              act.mutate({
                id: "admin.orgs.grantTrial",
                input: { orgId, days: trialDays, reason: reason.trim() },
              })
            }
          >
            {trialRunning ? "Extend trial" : "Start Pro trial"}
          </button>
          {suspended ? (
            <button
              type="button"
              disabled={act.isPending}
              className="h-9 rounded-control border border-line px-3 text-sm font-medium"
              onClick={() =>
                act.mutate({
                  id: "admin.orgs.unsuspend",
                  input: { orgId, reason: reason.trim() || undefined },
                })
              }
            >
              Lift suspension
            </button>
          ) : (
            <button
              type="button"
              disabled={act.isPending || reason.trim().length < 5}
              className="h-9 rounded-control bg-danger-soft px-3 text-sm font-medium text-danger-ink disabled:opacity-50"
              onClick={() =>
                act.mutate({
                  id: "admin.orgs.suspend",
                  input: { orgId, reason: reason.trim() },
                })
              }
            >
              Suspend workspace
            </button>
          )}
        </div>
      </section>

      <LimitsSection
        orgId={orgId}
        limits={o.limits}
        draft={limitDraft}
        setDraft={setLimitDraft}
        reason={reason}
        setReason={setReason}
        pending={act.isPending}
        onSave={(overrides) =>
          act.mutate({
            id: "admin.orgs.setLimits",
            input: { orgId, overrides, reason: reason.trim() },
          })
        }
      />
    </>
  );
}

function LimitsSection({
  limits,
  draft,
  setDraft,
  reason,
  setReason,
  pending,
  onSave,
}: {
  orgId: string;
  limits: AdminLimitRow[];
  draft: Record<string, string>;
  setDraft: (next: Record<string, string>) => void;
  reason: string;
  setReason: (v: string) => void;
  pending: boolean;
  onSave: (overrides: Record<string, number | null>) => void;
}) {
  return (
    <section className="grid max-w-lg gap-3 rounded-xl border border-line bg-surface p-4">
      <h2 className="text-sm font-semibold">Limit overrides</h2>
      <p className="text-xs text-ink-muted">
        Empty field uses the plan value. Overrides cannot be unlimited — use a large number.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {limits.map((l) => (
          <label key={l.key} className="grid gap-1 text-sm">
            {l.label}
            <input
              type="number"
              min={0}
              value={draft[l.key] ?? ""}
              onChange={(e) => setDraft({ ...draft, [l.key]: e.target.value })}
              placeholder={l.catalog === null ? "unlimited" : String(l.catalog)}
              className="h-9 rounded-control border border-line bg-canvas-sunken px-3"
            />
            <span className="text-xs text-ink-muted">
              {l.override === null
                ? "Plan value"
                : `Override (plan: ${l.catalog ?? "unlimited"})`}
            </span>
          </label>
        ))}
      </div>
      <label className="grid gap-1 text-sm">
        Reason
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="h-9 rounded-control border border-line bg-canvas-sunken px-3"
        />
      </label>
      <button
        type="button"
        disabled={pending || reason.trim().length < 5}
        className="h-9 w-fit rounded-control bg-accent-fill px-3 text-sm font-semibold text-accent-ink disabled:opacity-50"
        onClick={() => {
          const overrides: Record<string, number | null> = {};
          for (const l of limits) {
            const raw = (draft[l.key] ?? "").trim();
            overrides[l.key] = raw === "" ? null : Number(raw);
          }
          onSave(overrides);
        }}
      >
        Save limits
      </button>
    </section>
  );
}
