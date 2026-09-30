"use client";

import { Check } from "lucide-react";
import Link from "next/link";
import * as m from "motion/react-m";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Segmented, SegmentedItem } from "@/components/ui/segmented";
import { PLAN_CATALOG, PLAN_ORDER } from "@/lib/billing/plans";
import { CREDIT_PACK_CREDITS, CREDIT_PACK_PRICE_USD } from "@/lib/billing/stripe-price-keys";
import { cn } from "@/lib/utils";
import { usd } from "./format";
import {
  annualSavingPerYear,
  maxAnnualSavingPct,
  planHighlights,
  priceFor,
  trialLabel,
  type Interval,
} from "./pricing-data";

const HIGHLIGHT = "pro";

export function PricingPlans() {
  const [interval, setInterval] = useState<Interval>("month");
  const pct = maxAnnualSavingPct();

  return (
    <div className="grid gap-8">
      <div className="flex flex-wrap items-center gap-3">
        <Segmented
          value={interval}
          onValueChange={(v) => setInterval(v as Interval)}
          aria-label="Billing period"
          className="h-10"
        >
          <SegmentedItem value="month" className="px-4">
            Monthly
          </SegmentedItem>
          <SegmentedItem value="year" className="px-4">
            Annual
          </SegmentedItem>
        </Segmented>
        <span className="rounded-full bg-success-soft px-2.5 py-1 text-xs font-semibold text-success-ink">
          Annual saves up to {pct}%
        </span>
      </div>

      <div className="grid gap-px overflow-hidden rounded-xl border border-line bg-line shadow-md md:grid-cols-2 lg:grid-cols-4">
        {PLAN_ORDER.map((id) => {
          const plan = PLAN_CATALOG[id];
          const price = priceFor(id, interval);
          const highlighted = id === HIGHLIGHT;
          return (
            <section
              key={id}
              aria-labelledby={`plan-${id}`}
              className={cn(
                "relative grid content-start gap-5 p-6",
                highlighted ? "bg-accent-soft" : "bg-surface",
              )}
            >
              <div className="grid gap-1">
                <div className="flex items-center justify-between gap-2">
                  <h3 id={`plan-${id}`} className="text-lg font-extrabold tracking-[-0.01em]">
                    {plan.label}
                  </h3>
                  {highlighted ? (
                    <span className="rounded-full bg-warning-soft px-2 py-0.5 text-[0.6875rem] font-semibold text-warning-ink">
                      {trialLabel}
                    </span>
                  ) : null}
                </div>
                <p className="text-sm text-ink-secondary">{plan.tagline}</p>
              </div>

              <div className="grid gap-1">
                <div className="flex items-baseline gap-1.5">
                  <m.span
                    key={`${id}-${interval}`}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25, ease: [0.2, 0.8, 0.2, 1] }}
                    className="text-4xl font-extrabold tracking-[-0.03em] tabular-nums"
                    data-testid={`price-${id}`}
                  >
                    {usd(price)}
                  </m.span>
                  <span className="text-sm text-ink-secondary">
                    {id === "free" ? "forever" : "/ month"}
                  </span>
                </div>
                <p className="min-h-5 text-xs text-ink-secondary">
                  {id === "free"
                    ? "No card needed"
                    : interval === "year"
                      ? `Billed annually, saves ${usd(annualSavingPerYear(id))} a year`
                      : "Billed monthly"}
                </p>
              </div>

              <Button
                asChild
                variant={highlighted ? "default" : "outline"}
                className="h-10 font-bold"
              >
                <Link href="/sign-up">{id === "free" ? "Start free" : `Get ${plan.label}`}</Link>
              </Button>

              <ul className="grid gap-2.5">
                {planHighlights(id).map((h) => (
                  <li key={h} className="flex items-start gap-2 text-sm leading-5">
                    <Check className="mt-0.5 size-4 shrink-0 text-success-ink" aria-hidden />
                    {h}
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>

      <ul className="grid gap-2 text-sm leading-6 text-ink-secondary">
        <li>
          Over your allowance? We keep collecting events. Paid plans pay{" "}
          {PLAN_ORDER.filter((p) => PLAN_CATALOG[p].overagePer10kUsd !== null)
            .map((p) => `${usd(PLAN_CATALOG[p].overagePer10kUsd!)} (${PLAN_CATALOG[p].label})`)
            .join(", ")}{" "}
          per extra 10,000 tracked emails.
        </li>
        <li>
          AI credit packs are {usd(CREDIT_PACK_PRICE_USD)} per{" "}
          {CREDIT_PACK_CREDITS.toLocaleString("en-US")} credits.
        </li>
        <li>
          A tracked email is each email sent, each broadcast recipient and each email received.
        </li>
      </ul>
    </div>
  );
}
