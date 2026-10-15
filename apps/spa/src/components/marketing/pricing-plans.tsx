import { PLAN_CATALOG, PLAN_ORDER, CREDIT_PACK_CREDITS, CREDIT_PACK_PRICE_USD } from "@wisemail/shared";
import { Link } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";

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
  const rowRef = useRef<HTMLDivElement>(null);

  // On phones the plans are a swipe row: open it on Pro, with Free to the left.
  useLayoutEffect(() => {
    const row = rowRef.current;
    const card = row?.querySelector<HTMLElement>(`[data-plan="${HIGHLIGHT}"]`);
    if (!row || !card || row.scrollWidth <= row.clientWidth) return;
    row.scrollLeft = card.offsetLeft - (row.clientWidth - card.offsetWidth) / 2;
  }, []);
  const pct = maxAnnualSavingPct();

  return (
    <div className="grid gap-8">
      <div className="flex flex-wrap items-center gap-3">
        <div
          role="group"
          aria-label="Billing period"
          className="inline-flex h-10 rounded-full bg-canvas-sunken p-1"
        >
          {(["month", "year"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setInterval(v)}
              className={cn(
                "rounded-full px-4 text-sm font-semibold",
                interval === v ? "bg-surface text-ink shadow-sm" : "text-ink-muted",
              )}
            >
              {v === "month" ? "Monthly" : "Annual"}
            </button>
          ))}
        </div>
        <span className="rounded-full bg-success-soft px-2.5 py-1 text-xs font-semibold text-success-ink">
          Annual saves up to {pct}%
        </span>
      </div>

      {/* Phones swipe through the plans; md and up show them as one joined table. */}
      <div ref={rowRef} className="relative -mx-5 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-3 [scrollbar-width:none] sm:-mx-8 sm:px-8 md:mx-0 md:grid md:snap-none md:grid-cols-2 md:gap-px md:overflow-hidden md:rounded-[1.75rem] md:border md:border-line/70 md:bg-line md:px-0 md:pb-0 md:shadow-sm lg:grid-cols-4">
        {PLAN_ORDER.map((id) => {
          const plan = PLAN_CATALOG[id];
          const price = priceFor(id, interval);
          const highlighted = id === HIGHLIGHT;
          return (
            <section
              key={id}
              data-plan={id}
              aria-labelledby={`plan-${id}`}
              className={cn(
                "relative grid w-[84%] max-w-[22rem] shrink-0 snap-center content-start gap-5 rounded-[1.5rem] border border-line/70 p-6 shadow-sm sm:p-7 md:w-auto md:max-w-none md:rounded-none md:border-0 md:shadow-none",
                highlighted ? "bg-accent-soft" : "bg-surface",
              )}
            >
              <div className="grid gap-1">
                <div className="flex items-center justify-between gap-2">
                  <h3
                    id={`plan-${id}`}
                    className="font-display text-lg font-bold tracking-[-0.02em]"
                  >
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
                  <span
                    className="font-display text-4xl font-bold tracking-[-0.04em] tabular-nums"
                    data-testid={`price-${id}`}
                  >
                    {usd(price)}
                  </span>
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

              <Link
                to="/sign-up"
                className={cn(
                  "inline-flex h-10 items-center justify-center rounded-full text-sm font-semibold",
                  highlighted
                    ? "bg-accent-fill text-accent-ink hover:bg-accent-fill-hover"
                    : "border border-line hover:bg-canvas",
                )}
              >
                {id === "free" ? "Start free" : `Get ${plan.label}`}
              </Link>

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

      <p className="text-sm text-ink-muted">
        Need more AI? Credit packs are {usd(CREDIT_PACK_PRICE_USD)} for{" "}
        {CREDIT_PACK_CREDITS.toLocaleString("en-US")} credits, bought from Billing.
      </p>
    </div>
  );
}
