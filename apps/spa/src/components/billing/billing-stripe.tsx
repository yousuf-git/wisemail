import { useEffect, useState } from "react";
import { Plug, Sparkles } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

import { buyCreditPack, openBillingPortal } from "@/lib/actions";
import type { BillingOverview } from "@/lib/api";

type StripeOverview = NonNullable<BillingOverview["stripe"]>;

const date = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
const nf = new Intl.NumberFormat("en-US");

export function usePortal(orgSlug: string) {
  const [opening, setOpening] = useState(false);
  async function open() {
    setOpening(true);
    const result = await openBillingPortal(orgSlug);
    if (!result.ok) {
      setOpening(false);
      return;
    }
    window.location.assign(result.data.url);
  }
  return { open, opening };
}

/** After Stripe redirects back, poll until webhook updates land. */
export function useReturnPolling(orgSlug: string, overview: BillingOverview) {
  const queryClient = useQueryClient();
  const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
  const returned = params.get("checkout") === "success" || params.get("pack") === "success";
  const kind = params.get("pack") === "success" ? "pack" : "plan";
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
      setWaiting(false);
      const url = new URL(window.location.href);
      url.searchParams.delete("checkout");
      url.searchParams.delete("pack");
      window.history.replaceState(null, "", url.pathname + url.search);
      return;
    }
    let tries = 0;
    const timer = window.setInterval(() => {
      tries += 1;
      if (tries > 12) {
        window.clearInterval(timer);
        setWaiting(false);
        return;
      }
      void queryClient.invalidateQueries({ queryKey: ["settings", "billing", orgSlug] });
    }, 1500);
    return () => window.clearInterval(timer);
  }, [returned, settled, kind, orgSlug, queryClient]);

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
        <button
          type="button"
          onClick={onManage}
          disabled={opening}
          data-testid="update-payment"
          className="h-8 rounded-control bg-accent-fill px-3 text-xs font-semibold text-accent-ink disabled:opacity-50"
        >
          Update payment method
        </button>
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
          <button
            type="button"
            onClick={onManage}
            disabled={opening}
            data-testid="manage-subscription"
            className="h-8 rounded-control border border-line px-3 text-xs font-medium hover:bg-canvas-sunken disabled:opacity-50"
          >
            Manage subscription
          </button>
          <button
            type="button"
            onClick={onManage}
            disabled={opening}
            data-testid="view-invoices"
            className="h-8 rounded-control border border-line px-3 text-xs font-medium hover:bg-canvas-sunken disabled:opacity-50"
          >
            Invoices and payment method
          </button>
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
  const [error, setError] = useState<string | null>(null);
  const pack = overview.creditPack;
  async function buy() {
    setBuying(true);
    setError(null);
    const result = await buyCreditPack(orgSlug, 1);
    if (!result.ok) {
      setBuying(false);
      setError(result.error.message);
      return;
    }
    window.location.assign(result.data.url);
  }
  return (
    <section
      className="grid gap-3 rounded-xl border border-line bg-surface p-5 shadow-sm"
      aria-label="AI credit packs"
      data-testid="credit-packs"
    >
      <div className="flex items-center gap-2">
        <Sparkles aria-hidden className="size-4 text-accent-fill" />
        <h2 className="text-base font-semibold">AI credit packs</h2>
      </div>
      <p className="text-sm text-ink-secondary">
        {nf.format(pack.credits)} credits for ${pack.priceUsd}. They are used after your monthly
        allowance and don&apos;t expire while you have a paid plan.
        {pack.available ? ` You have ${nf.format(pack.balance)} pack credits left.` : ""}
      </p>
      {error ? (
        <p role="alert" className="text-sm text-danger-ink">
          {error}
        </p>
      ) : null}
      {pack.available ? (
        canManage ? (
          <button
            type="button"
            onClick={() => void buy()}
            disabled={buying}
            data-testid="buy-credits"
            className="h-9 w-fit rounded-control bg-accent-fill px-3 text-sm font-semibold text-accent-ink disabled:opacity-50"
          >
            Buy {nf.format(pack.credits)} credits (${pack.priceUsd})
          </button>
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
      className="grid gap-2 rounded-xl border border-line bg-surface p-5 shadow-sm"
      aria-label="Extra connections"
      data-testid="extra-connections"
    >
      <div className="flex items-center gap-2">
        <Plug aria-hidden className="size-4 text-accent-fill" />
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
        Your next connection adds ${extra.unitUsd}/month ($
        {(extra.quantity + 1) * extra.unitUsd}/month in total). You confirm before it is added, and
        it is prorated on your next invoice. Removing a connection lowers the price from the next
        period.
      </p>
    </section>
  );
}
