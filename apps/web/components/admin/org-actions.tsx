"use client";

import {
  changePlanAction,
  grantTrialAction,
  setLimitsAction,
  suspendOrgAction,
  unsuspendOrgAction,
} from "@/app/(admin)/admin/actions";
import type { AdminLimitRowDTO } from "@/lib/dto/admin";
import { ActionForm, Disclosure, SelectField, TextField } from "./action-form";

const PLAN_OPTIONS = [
  { value: "free", label: "Free" },
  { value: "pro", label: "Pro" },
  { value: "team", label: "Team" },
  { value: "agency", label: "Agency" },
];

const reasonOf = (f: FormData) => String(f.get("reason") ?? "");

export function PlanForm({
  orgId,
  plan,
  billingEnabled,
}: {
  orgId: string;
  plan: string;
  billingEnabled: boolean;
}) {
  if (billingEnabled) {
    return (
      <p className="text-sm text-ink-muted">
        Billing is on, so plans change through Stripe. Limit overrides and trials still work.
      </p>
    );
  }
  return (
    <ActionForm
      action={changePlanAction}
      build={(f) => ({ orgId, plan: String(f.get("plan")), reason: reasonOf(f) })}
      submit="Change plan"
      success="Plan changed"
      reset={false}
    >
      <p className="text-sm text-ink-muted">
        Beta switch through the plan-change service. Applies at once, also for downgrades;
        connections over the new limit become read-only.
      </p>
      <SelectField label="Plan" name="plan" options={PLAN_OPTIONS} defaultValue={plan} />
      <TextField label="Reason" name="reason" required multiline />
    </ActionForm>
  );
}

export function LimitsForm({ orgId, limits }: { orgId: string; limits: AdminLimitRowDTO[] }) {
  return (
    <ActionForm
      action={setLimitsAction}
      build={(f) => {
        const overrides: Record<string, number | null> = {};
        for (const l of limits) {
          const raw = String(f.get(l.key) ?? "").trim();
          overrides[l.key] = raw === "" ? null : Number(raw);
        }
        return { orgId, overrides, reason: reasonOf(f) };
      }}
      submit="Save limits"
      success="Limits saved"
      reset={false}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {limits.map((l) => (
          <TextField
            key={l.key}
            label={l.label}
            name={l.key}
            type="number"
            min={0}
            defaultValue={l.override ?? ""}
            placeholder={l.catalog === null ? "unlimited" : String(l.catalog)}
            hint={
              l.override === null ? "Plan value" : `Override (plan: ${l.catalog ?? "unlimited"})`
            }
          />
        ))}
      </div>
      <p className="text-xs text-ink-muted">
        An empty field uses the plan value. An override can&apos;t be &quot;unlimited&quot;: use a
        large number.
      </p>
      <TextField
        label="Reason"
        name="reason"
        required
        multiline
        placeholder="Sales deal, support exception…"
      />
    </ActionForm>
  );
}

export function TrialForm({ orgId, running }: { orgId: string; running: boolean }) {
  return (
    <ActionForm
      action={grantTrialAction}
      build={(f) => ({ orgId, days: Number(f.get("days")), reason: reasonOf(f) })}
      submit={running ? "Extend trial" : "Start Pro trial"}
      success={running ? "Trial extended" : "Trial started"}
    >
      <TextField
        label={running ? "Days to add" : "Trial length in days"}
        name="days"
        type="number"
        min={1}
        max={90}
        defaultValue={14}
        required
      />
      <TextField label="Reason" name="reason" required multiline />
    </ActionForm>
  );
}

export function SuspendForm({ orgId, suspended }: { orgId: string; suspended: boolean }) {
  if (suspended) {
    return (
      <ActionForm
        action={unsuspendOrgAction}
        build={(f) => ({ orgId, reason: reasonOf(f) || undefined })}
        submit="Lift suspension"
        success="Workspace restored"
      >
        <TextField label="Reason (optional)" name="reason" />
      </ActionForm>
    );
  }
  return (
    <Disclosure summary="Suspend workspace" tone="danger">
      <ActionForm
        action={suspendOrgAction}
        build={(f) => ({ orgId, reason: reasonOf(f) })}
        submit="Suspend workspace"
        success="Workspace suspended"
        variant="destructive"
      >
        <p className="text-sm text-ink-muted">
          Members see a &quot;workspace suspended&quot; page and every action and API call is
          refused. Incoming webhooks keep being stored, nothing is deleted. Lift it any time.
        </p>
        <TextField label="Reason" name="reason" required multiline />
      </ActionForm>
    </Disclosure>
  );
}
