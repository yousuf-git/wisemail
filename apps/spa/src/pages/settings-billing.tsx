import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { useState } from "react";

import {
  ResourceEmpty,
  ResourceError,
  ResourcePage,
  ResourcePending,
} from "@/components/resource-page";
import { openBillingPortal, startBillingCheckout, startBillingTrial } from "@/lib/actions";
import { getBillingOverview } from "@/lib/api";

export function SettingsBillingPage() {
  const { orgSlug } = useParams({ from: "/$orgSlug/settings/billing" });
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [interval, setInterval] = useState<"month" | "year">("month");
  const billing = useQuery({
    queryKey: ["settings", "billing", orgSlug],
    queryFn: () => getBillingOverview(orgSlug),
  });

  const redirectTo = (url: string) => {
    window.location.assign(url);
  };

  const checkout = useMutation({
    mutationFn: (plan: "pro" | "team" | "agency") =>
      startBillingCheckout(orgSlug, { plan, interval }),
    onSuccess: (result) => {
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setError(null);
      redirectTo(result.data.url);
    },
    onError: () => setError("Could not start checkout."),
  });

  const portal = useMutation({
    mutationFn: () => openBillingPortal(orgSlug),
    onSuccess: (result) => {
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setError(null);
      redirectTo(result.data.url);
    },
    onError: () => setError("Could not open the billing portal."),
  });

  const trial = useMutation({
    mutationFn: () => startBillingTrial(orgSlug),
    onSuccess: async (result) => {
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ["settings", "billing", orgSlug] });
    },
    onError: () => setError("Could not start the trial."),
  });

  return (
    <ResourcePage title="Billing" description="Checkout · portal · trial">
      {error ? (
        <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger-ink">
          {error}
        </p>
      ) : null}
      {billing.isPending ? (
        <ResourcePending />
      ) : billing.isError ? (
        <ResourceError message="Could not load billing (permission or API)." />
      ) : !billing.data ? (
        <ResourceEmpty>No billing data.</ResourceEmpty>
      ) : (
        <div className="grid gap-4">
          <div className="grid gap-3 rounded-lg border border-line bg-surface p-4">
            <p className="text-sm">
              <span className="font-semibold">{billing.data.currentLabel}</span>
              <span className="text-ink-muted"> · {billing.data.planState}</span>
            </p>
            <p className="text-xs text-ink-muted">
              Billing {billing.data.billingEnabled ? "enabled" : "off (beta)"}
              {billing.data.stripe?.hasSubscription
                ? ` · ${billing.data.stripe.interval ?? "—"}`
                : " · no subscription"}
              {billing.data.stripe?.renewsAt
                ? ` · renews ${new Date(billing.data.stripe.renewsAt).toLocaleDateString()}`
                : ""}
              {billing.data.stripe?.cancelAtPeriodEnd ? " · cancels at period end" : ""}
            </p>
            {billing.data.trial?.active ? (
              <p className="text-sm text-ink-secondary">
                Trial · {billing.data.trial.daysLeft} days left (ends{" "}
                {new Date(billing.data.trial.endsAt).toLocaleDateString()})
              </p>
            ) : null}
            {billing.data.priceMigration ? (
              <p className="rounded-md bg-warning-soft px-3 py-2 text-sm text-warning-ink">
                {billing.data.priceMigration.message}
              </p>
            ) : null}
            {billing.data.canManage ? (
              <div className="flex flex-wrap gap-2 pt-1">
                {billing.data.trialAvailable && !billing.data.trial?.active ? (
                  <button
                    type="button"
                    disabled={trial.isPending}
                    onClick={() => trial.mutate()}
                    className="h-9 rounded-control border border-line px-3 text-sm font-medium hover:bg-canvas-sunken disabled:opacity-50"
                  >
                    Start trial
                  </button>
                ) : null}
                {billing.data.stripe?.hasSubscription ? (
                  <button
                    type="button"
                    disabled={portal.isPending || !billing.data.billingEnabled}
                    onClick={() => portal.mutate()}
                    className="h-9 rounded-control border border-line px-3 text-sm font-medium hover:bg-canvas-sunken disabled:opacity-50"
                  >
                    Open portal
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>

          {billing.data.canManage && billing.data.billingEnabled ? (
            <div className="grid gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold">Upgrade</p>
                <div className="flex gap-1">
                  {(
                    [
                      ["month", "Monthly"],
                      ["year", "Yearly"],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setInterval(id)}
                      className={`h-8 rounded-control px-3 text-xs font-medium ${
                        interval === id
                          ? "bg-accent-soft text-accent-fill"
                          : "border border-line text-ink-secondary hover:bg-canvas-sunken"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
                {billing.data.plans
                  .filter((p) => p.id === "pro" || p.id === "team" || p.id === "agency")
                  .map((plan) => {
                    const price =
                      interval === "year" ? plan.priceAnnualPerMonth : plan.priceMonthly;
                    const current = plan.id === billing.data.currentPlan;
                    return (
                      <li
                        key={plan.id}
                        className="flex items-center justify-between gap-3 px-4 py-3"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium">
                            {plan.label}
                            {current ? " (current)" : ""}
                          </p>
                          <p className="text-xs text-ink-muted">
                            {plan.tagline} · ${price}/mo
                            {interval === "year" ? " billed yearly" : ""}
                          </p>
                        </div>
                        {!current ? (
                          <button
                            type="button"
                            disabled={checkout.isPending}
                            onClick={() =>
                              checkout.mutate(plan.id as "pro" | "team" | "agency")
                            }
                            className="shrink-0 rounded-control bg-accent-fill px-3 py-1.5 text-xs font-semibold text-accent-ink hover:bg-accent-fill-hover disabled:opacity-50"
                          >
                            Checkout
                          </button>
                        ) : null}
                      </li>
                    );
                  })}
              </ul>
            </div>
          ) : null}
        </div>
      )}
    </ResourcePage>
  );
}
