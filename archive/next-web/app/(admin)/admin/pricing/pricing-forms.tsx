"use client";

import { ActionForm, TextField } from "@/components/admin/action-form";
import { Panel } from "@/components/admin/admin-ui";
import type { CatalogPlan } from "@wisemail/shared/catalog";

import { updatePlanPriceAction } from "../actions";

export function PricingForms({
  plans,
  billingEnabled,
}: {
  plans: CatalogPlan[];
  billingEnabled: boolean;
}) {
  return (
    <div className="grid gap-3.5">
      {plans.map((plan) => (
        <Panel
          key={plan.id}
          title={plan.label}
          description={`${plan.tagline}. Lookup keys: ${plan.stripeLookupKeys.monthly ?? "—"} / ${plan.stripeLookupKeys.annual ?? "—"}.`}
        >
          <div className="grid gap-4 min-[800px]:grid-cols-2">
            <ActionForm
              action={updatePlanPriceAction}
              submit={`Update monthly${billingEnabled ? " (+ Stripe)" : ""}`}
              success={`${plan.label} monthly price updated`}
              reset={false}
              build={(fd) => ({
                plan: plan.id,
                interval: "month" as const,
                priceUsd: Number(fd.get("priceUsd")),
                reason: String(fd.get("reason") || "") || undefined,
              })}
            >
              <TextField
                name="priceUsd"
                label="Monthly price (USD)"
                type="number"
                step="0.01"
                min={1}
                defaultValue={String(plan.priceMonthly)}
                required
              />
              <TextField name="reason" label="Reason (optional)" />
            </ActionForm>
            <ActionForm
              action={updatePlanPriceAction}
              submit={`Update annual /mo${billingEnabled ? " (+ Stripe)" : ""}`}
              success={`${plan.label} annual price updated`}
              reset={false}
              build={(fd) => ({
                plan: plan.id,
                interval: "year" as const,
                priceUsd: Number(fd.get("priceUsd")),
                reason: String(fd.get("reason") || "") || undefined,
              })}
            >
              <TextField
                name="priceUsd"
                label="Annual price per month (USD)"
                type="number"
                step="0.01"
                min={1}
                defaultValue={String(plan.priceAnnualPerMonth)}
                required
              />
              <TextField name="reason" label="Reason (optional)" />
            </ActionForm>
          </div>
        </Panel>
      ))}
    </div>
  );
}
