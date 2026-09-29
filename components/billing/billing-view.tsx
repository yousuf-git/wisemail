"use client";

import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import {
  cancelPendingChangeAction,
  changePlanAction,
  previewPlanChangeAction,
  startTrialAction,
} from "@/app/(app)/[orgSlug]/settings/billing/actions";
import { FormAlert } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { BillingOverviewDTO, PlanChangePreviewDTO } from "@/lib/dto/billing";
import { cn } from "@/lib/utils";

const date = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

export function BillingView({
  orgSlug,
  overview,
}: {
  orgSlug: string;
  overview: BillingOverviewDTO;
}) {
  const router = useRouter();
  const [preview, setPreview] = useState<PlanChangePreviewDTO | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { canManage } = overview;

  async function choose(plan: string) {
    setLoading(plan);
    setError(null);
    const result = await previewPlanChangeAction(orgSlug, { plan: plan as never });
    setLoading(null);
    if (!result.ok) {
      toast.error(result.error.message);
      return;
    }
    setPreview(result.data);
  }

  async function confirm() {
    if (!preview) return;
    setApplying(true);
    setError(null);
    const result = await changePlanAction(orgSlug, { plan: preview.toPlan });
    setApplying(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    toast.success(
      result.data.status === "scheduled"
        ? `Switching to ${preview.toLabel} on ${date(result.data.effectiveAt!)}`
        : `You are on ${preview.toLabel}`,
    );
    setPreview(null);
    router.refresh();
  }

  async function startTrial() {
    setLoading("trial");
    const result = await startTrialAction(orgSlug);
    setLoading(null);
    if (!result.ok) {
      toast.error(result.error.message);
      return;
    }
    toast.success("Your 14-day Pro trial has started");
    router.refresh();
  }

  async function cancelPending() {
    setLoading("cancel");
    const result = await cancelPendingChangeAction(orgSlug);
    setLoading(null);
    if (!result.ok) {
      toast.error(result.error.message);
      return;
    }
    toast.success("The scheduled change was cancelled");
    router.refresh();
  }

  const pending = overview.pendingChange;
  return (
    <div className="grid gap-4">
      {!overview.billingEnabled ? (
        <p
          data-testid="beta-notice"
          className="rounded-xl bg-accent-soft px-4 py-3 text-sm text-info-ink"
        >
          <b className="font-bold">Wisemail is in beta.</b> Limits apply, but nothing is charged.
          Switching plans takes effect right away (downgrades at the end of the period), and
          payments arrive with public launch.
        </p>
      ) : null}

      <section
        className="grid gap-3 rounded-xl bg-surface p-5 shadow-md"
        aria-label="Current plan"
        data-testid="current-plan"
      >
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-lg font-semibold">
            {overview.currentLabel}
            {overview.trial ? " trial" : ""}
          </h2>
          <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-[0.72rem] font-bold text-info-ink">
            Current plan
          </span>
        </div>
        {overview.trial ? (
          <p className="text-sm text-ink-secondary" data-testid="trial-status">
            {overview.trial.daysLeft} {overview.trial.daysLeft === 1 ? "day" : "days"} left in your
            Pro trial (ends {date(overview.trial.endsAt)}). AI is capped at 200 credits during the
            trial. Without a plan the workspace moves to Free.
          </p>
        ) : null}
        {pending?.scheduled ? (
          <div
            className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning-ink"
            data-testid="pending-change"
          >
            <span className="min-w-0 flex-1">
              Switching to <b>{pending.toLabel}</b> on {date(pending.effectiveAt)}.
              {pending.retentionEffectiveAt
                ? ` History then shortens to ${pending.retentionTo} days from ${date(pending.retentionEffectiveAt)}.`
                : ""}
            </span>
            {canManage ? (
              <Button
                size="sm"
                variant="outline"
                onClick={cancelPending}
                disabled={loading === "cancel"}
              >
                Keep {overview.currentLabel}
              </Button>
            ) : null}
          </div>
        ) : null}
        {pending && !pending.scheduled && pending.retentionEffectiveAt ? (
          <p
            className="rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning-ink"
            data-testid="retention-notice"
          >
            Your history now shortens to {pending.retentionTo} days. Existing emails older than that
            are removed from {date(pending.retentionEffectiveAt)}.
          </p>
        ) : null}
        {overview.trialAvailable && canManage ? (
          <div>
            <Button onClick={startTrial} disabled={loading === "trial"} className="font-bold">
              Start 14-day Pro trial
            </Button>
            <span className="ml-3 text-[0.8125rem] text-ink-muted">
              No card needed. Once per workspace.
            </span>
          </div>
        ) : null}
        {!canManage ? (
          <p className="text-sm text-ink-muted">Only the Owner can change the plan.</p>
        ) : null}
      </section>

      <ul
        className="grid gap-3 min-[720px]:grid-cols-2 min-[1100px]:grid-cols-4"
        aria-label="Plans"
      >
        {overview.plans.map((plan) => {
          const current = plan.id === overview.currentPlan && !overview.trial;
          return (
            <li
              key={plan.id}
              data-testid={`plan-${plan.id}`}
              className={cn(
                "grid content-start gap-3 rounded-xl bg-surface p-5 shadow-md",
                current && "ring-2 ring-accent",
              )}
            >
              <div>
                <h3 className="text-base font-semibold">{plan.label}</h3>
                <p className="text-[0.8125rem] text-ink-muted">{plan.tagline}</p>
              </div>
              <p>
                <b className="text-2xl font-bold tabular-nums">${plan.priceMonthly}</b>
                <span className="text-sm text-ink-muted"> / month</span>
                {plan.priceMonthly > 0 ? (
                  <span className="block text-[0.75rem] text-ink-faint">
                    ${plan.priceAnnualPerMonth} a month billed yearly
                  </span>
                ) : null}
              </p>
              <ul className="grid gap-1.5 text-[0.8125rem] text-ink-secondary">
                {plan.highlights.map((h) => (
                  <li key={h} className="flex gap-2">
                    <Check aria-hidden className="mt-0.5 size-3.5 shrink-0 text-success-ink" />
                    {h}
                  </li>
                ))}
              </ul>
              {plan.overage ? (
                <p className="text-[0.75rem] text-ink-faint">{plan.overage}</p>
              ) : null}
              <Button
                variant={current ? "outline" : "default"}
                disabled={current || !canManage || loading !== null}
                onClick={() => choose(plan.id)}
                className="mt-auto font-bold"
              >
                {current
                  ? "Current plan"
                  : overview.trial && plan.id === "pro"
                    ? "Keep Pro"
                    : `Switch to ${plan.label}`}
              </Button>
            </li>
          );
        })}
      </ul>

      <Dialog
        open={!!preview}
        onOpenChange={(next) => {
          if (!next) {
            setPreview(null);
            setError(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          {preview ? (
            <>
              <DialogHeader>
                <DialogTitle className="text-xl">
                  {preview.direction === "downgrade" ? "Switch" : "Move"} to {preview.toLabel}?
                </DialogTitle>
                <DialogDescription>
                  {preview.direction === "downgrade" && new Date(preview.effectiveAt) > new Date()
                    ? `Your current plan stays until ${date(preview.effectiveAt)}, then the change applies.`
                    : "The change applies right away."}
                </DialogDescription>
              </DialogHeader>
              <ul className="grid gap-2 text-sm text-ink-secondary" data-testid="plan-preview">
                {preview.readOnlyConnections.length > 0 ? (
                  <li>
                    These connections become read-only (events keep coming in, sending and changes
                    stop): <b>{preview.readOnlyConnections.join(", ")}</b>. Remove some or upgrade
                    to get them back.
                  </li>
                ) : null}
                {preview.lostFeatures.length > 0 ? (
                  <li>No longer included: {preview.lostFeatures.join(", ")}.</li>
                ) : null}
                {preview.retention ? (
                  <li>
                    History shortens from {preview.retention.from} to {preview.retention.to} days
                    after a 14-day notice ({date(preview.retention.effectiveAt)}).
                  </li>
                ) : null}
                {preview.memberOverLimit > 0 ? (
                  <li>
                    {preview.memberOverLimit} more{" "}
                    {preview.memberOverLimit === 1 ? "member" : "members"} than the new plan
                    includes. They keep access; new invitations are blocked.
                  </li>
                ) : null}
                {preview.direction !== "downgrade" ? (
                  <li>
                    Limits and features update immediately. Nothing is charged during the beta.
                  </li>
                ) : null}
                <li>Nothing you already have is deleted.</li>
              </ul>
              <FormAlert>{error}</FormAlert>
              <DialogFooter>
                <Button variant="outline" onClick={() => setPreview(null)} disabled={applying}>
                  Cancel
                </Button>
                <Button onClick={confirm} disabled={applying} className="font-bold">
                  {applying ? "Applying…" : `Confirm ${preview.toLabel}`}
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
