"use client";

import { Plug, Sparkles } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import {
  buyCreditPackAction,
  openPortalAction,
} from "@/app/(app)/[orgSlug]/settings/billing/actions";
import { Button } from "@/components/ui/button";
import type { BillingOverviewDTO } from "@/lib/dto/billing";

type StripeOverview = NonNullable<BillingOverviewDTO["stripe"]>;

const date = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
const nf = new Intl.NumberFormat("en-US");

/** Opens the Stripe Customer Portal in this tab. */
export function usePortal(orgSlug: string) {
  const [opening, setOpening] = useState(false);
  async function open() {
    setOpening(true);
    const result = await openPortalAction(orgSlug);
    if (!result.ok) {
      setOpening(false);
      toast.error(result.error.message);
      return;
    }
    window.location.assign(result.data.url);
  }
  return { open, opening };
}

/**
 * After Stripe sends the customer back, the webhook may still be on its way: refresh the page
 * data a few times until the plan (or the credit balance) has changed (UCD "Stripe webhook
 * arrives before the checkout redirect returns").
 */
export function useReturnPolling(overview: BillingOverviewDTO) {
  const router = useRouter();
  const params = useSearchParams();
  const returned = params.get("checkout") === "success" || params.get("pack") === "success";
  const kind = params.get("pack") === "success" ? "pack" : "plan";
  // What the page showed when it opened, to tell when the webhook's changes have arrived.
  const [initial] = useState(() => ({
    plan: overview.currentPlan,
    interval: overview.stripe?.interval ?? null,
    subscribed: overview.stripe?.hasSubscription ?? false,
    balance: overview.stripe?.creditPack.balance ?? 0,
  }));
  const [waiting, setWaiting] = useState(returned);
  const settled =
    kind === "pack"
      ? (overview.stripe?.creditPack.balance ?? 0) > initial.balance
      : overview.currentPlan !== initial.plan ||
        (overview.stripe?.hasSubscription ?? false) !== initial.subscribed ||
        (overview.stripe?.interval ?? null) !== initial.interval;

  useEffect(() => {
    if (!returned) return;
    if (settled) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reflects the refreshed data
      setWaiting(false);
      toast.success(kind === "pack" ? "Your credits were added" : "Your plan is updated");
      return;
    }
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      if (tries > 12) {
        clearInterval(timer);
        setWaiting(false);
        return;
      }
      router.refresh();
    }, 1500);
    return () => clearInterval(timer);
  }, [returned, settled, kind, router]);

  return { waiting: returned && waiting && !settled, kind: kind as "plan" | "pack" };
}

export function ReturnNotice({ kind }: { kind: "plan" | "pack" }) {
  return (
    <p
      role="status"
      data-testid="checkout-confirming"
      className="rounded-xl bg-accent-soft px-4 py-3 text-sm text-info-ink"
    >
      <b className="font-bold">Confirming your payment…</b>{" "}
      {kind === "pack"
        ? "Your credits appear as soon as Stripe confirms it."
        : "Your plan updates as soon as Stripe confirms it. This usually takes a few seconds."}
    </p>
  );
}

export function PaymentIssueBanner({
  overview,
  onManage,
  opening,
  canManage,
}: {
  overview: StripeOverview;
  onManage: () => void;
  opening: boolean;
  canManage: boolean;
}) {
  if (!overview.payment.pastDue) return null;
  return (
    <div
      role="alert"
      data-testid="payment-issue"
      className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger-ink"
    >
      <span className="min-w-0 flex-1">
        <b className="font-bold">We couldn&apos;t charge your payment method.</b> Stripe keeps
        retrying.
        {overview.payment.graceEndsAt
          ? ` Update it by ${date(overview.payment.graceEndsAt)} to keep your plan, or the workspace moves to Free.`
          : " Update it to keep your plan."}
      </span>
      {canManage ? (
        <Button size="sm" onClick={onManage} disabled={opening} data-testid="update-payment">
          Update payment method
        </Button>
      ) : null}
    </div>
  );
}

export function SubscriptionDetails({
  overview,
  planLabel,
  onManage,
  opening,
  canManage,
}: {
  overview: StripeOverview;
  planLabel: string;
  onManage: () => void;
  opening: boolean;
  canManage: boolean;
}) {
  if (!overview.hasSubscription) return null;
  const yearly = overview.interval === "year";
  const sentences = [`${planLabel} billed ${yearly ? "yearly" : "monthly"}.`];
  if (overview.renewsAt && overview.cancelAtPeriodEnd) {
    sentences.push(
      `Cancels on ${date(overview.renewsAt)}; you keep ${planLabel} until then, then the workspace moves to Free.`,
    );
  } else if (overview.renewsAt) {
    sentences.push(`Renews on ${date(overview.renewsAt)}.`);
  }
  if (overview.overage) sentences.push(`Beyond the allowance: ${overview.overage}.`);
  return (
    <div className="grid gap-2" data-testid="subscription-details">
      <p className="text-sm text-ink-secondary">{sentences.join(" ")}</p>
      {canManage ? (
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={onManage}
            disabled={opening}
            data-testid="manage-subscription"
          >
            Manage subscription
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={onManage}
            disabled={opening}
            data-testid="view-invoices"
          >
            Invoices and payment method
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function CreditPackCard({
  orgSlug,
  overview,
  canManage,
}: {
  orgSlug: string;
  overview: StripeOverview;
  canManage: boolean;
}) {
  const [buying, setBuying] = useState(false);
  const pack = overview.creditPack;
  async function buy() {
    setBuying(true);
    const result = await buyCreditPackAction(orgSlug, { quantity: 1 });
    if (!result.ok) {
      setBuying(false);
      toast.error(result.error.message);
      return;
    }
    window.location.assign(result.data.url);
  }
  return (
    <section
      className="grid gap-3 rounded-xl bg-surface p-5 shadow-md"
      aria-label="AI credit packs"
      data-testid="credit-packs"
    >
      <div className="flex items-center gap-2">
        <Sparkles aria-hidden className="size-4 text-accent" />
        <h2 className="text-base font-semibold">AI credit packs</h2>
      </div>
      <p className="text-sm text-ink-secondary">
        {nf.format(pack.credits)} credits for ${pack.priceUsd}. They are used after your monthly
        allowance and don&apos;t expire while you have a paid plan.
        {pack.available ? ` You have ${nf.format(pack.balance)} pack credits left.` : ""}
      </p>
      {pack.available ? (
        canManage ? (
          <div>
            <Button onClick={buy} disabled={buying} className="font-bold" data-testid="buy-credits">
              Buy {nf.format(pack.credits)} credits (${pack.priceUsd})
            </Button>
          </div>
        ) : (
          <p className="text-sm text-ink-muted">Only the Owner can buy credit packs.</p>
        )
      ) : (
        <p className="text-sm text-ink-muted" data-testid="credit-packs-locked">
          Credit packs are for paid plans. Upgrade first to use AI.
        </p>
      )}
    </section>
  );
}

export function ExtraConnectionsCard({ overview }: { overview: StripeOverview }) {
  const extra = overview.extraConnections;
  if (!extra) return null;
  return (
    <section
      className="grid gap-2 rounded-xl bg-surface p-5 shadow-md"
      aria-label="Extra connections"
      data-testid="extra-connections"
    >
      <div className="flex items-center gap-2">
        <Plug aria-hidden className="size-4 text-accent" />
        <h2 className="text-base font-semibold">Extra connections</h2>
      </div>
      <p className="text-sm text-ink-secondary">
        Agency includes {extra.included} Resend connections; each additional one is ${extra.unitUsd}
        /month.{" "}
        {extra.quantity > 0
          ? `You pay for ${extra.quantity} extra ($${extra.monthlyUsd}/month).`
          : "You don't pay for any extra yet."}
      </p>
      <p className="text-[0.8125rem] text-ink-muted" data-testid="extra-connection-preview">
        Your next connection adds ${extra.unitUsd}/month (${(extra.quantity + 1) * extra.unitUsd}
        /month in total). You confirm before it is added, and it is prorated on your next invoice.
        Removing a connection lowers the price from the next period.
      </p>
    </section>
  );
}
