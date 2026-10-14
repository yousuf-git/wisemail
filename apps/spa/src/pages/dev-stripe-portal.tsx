import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";

import { apiUrl } from "@/lib/api-base";

type PortalPayload = {
  portal: { id: string; return_url: string | null; flow: string | null };
  subscription: {
    id: string;
    status: string;
    cancel_at_period_end: boolean;
    items: { id: string; priceId: string; label: string; quantity: number }[];
  } | null;
};

export function DevStripePortalPage() {
  const { id } = useParams({ from: "/dev/stripe/portal/$id" });
  const queryClient = useQueryClient();

  const portal = useQuery({
    queryKey: ["dev-portal", id],
    queryFn: async () => {
      const res = await fetch(apiUrl(`/api/dev/stripe/portal/${encodeURIComponent(id)}`), {
        credentials: "include",
      });
      if (!res.ok) throw new Error(res.status === 404 ? "Portal not found." : `HTTP ${res.status}`);
      return (await res.json()) as PortalPayload;
    },
  });

  const act = useMutation({
    mutationFn: async (action: string) => {
      const res = await fetch(apiUrl(`/api/dev/stripe/portal/${encodeURIComponent(id)}/action`), {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const body = (await res.json()) as { redirectUrl?: string; message?: string };
      if (!res.ok) throw new Error(body.message ?? "Action failed.");
      return body;
    },
    onSuccess: (body) => {
      if (body.redirectUrl) window.location.assign(body.redirectUrl);
      else void queryClient.invalidateQueries({ queryKey: ["dev-portal", id] });
    },
  });

  if (portal.isPending) {
    return <p className="p-6 text-sm text-ink-muted">Loading portal…</p>;
  }
  if (portal.isError) {
    return (
      <p role="alert" className="m-6 rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger-ink">
        {portal.error.message}
      </p>
    );
  }

  const { portal: p, subscription: sub } = portal.data;
  const button = (action: string, label: string, testId: string, primary = false) => (
    <button
      type="button"
      data-testid={testId}
      disabled={act.isPending}
      onClick={() => act.mutate(action)}
      className={
        primary
          ? "h-9 rounded-control bg-accent-fill px-3 text-sm font-bold text-accent-ink hover:bg-accent-fill-hover disabled:opacity-50"
          : "h-9 rounded-control border border-line px-3 text-sm font-semibold hover:bg-canvas disabled:opacity-50"
      }
    >
      {label}
    </button>
  );

  return (
    <main className="mx-auto grid w-full max-w-lg gap-4 px-4 py-10">
      <p
        data-testid="fake-stripe-banner"
        className="rounded-xl bg-warning-soft px-4 py-2 text-sm font-semibold text-warning-ink"
      >
        Fake Stripe Customer Portal (STRIPE_MODE=fake).
      </p>
      <section className="grid gap-3 rounded-xl bg-surface p-5 shadow-md">
        <h1 className="text-xl font-bold">Billing portal</h1>
        {sub ? (
          <>
            <p className="text-sm text-ink-secondary" data-testid="fake-portal-status">
              Subscription <span className="font-mono">{sub.id}</span> is{" "}
              <b>{sub.cancel_at_period_end ? "set to cancel at period end" : sub.status}</b>.
            </p>
            <ul className="grid gap-1 text-sm">
              {sub.items.map((item) => (
                <li key={item.id}>
                  {item.label}
                  {item.quantity > 1 ? ` x ${item.quantity}` : ""}
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-2">
              {p.flow === "subscription_update_confirm"
                ? button("confirm_update", "Confirm plan change", "fake-portal-confirm", true)
                : null}
              {sub.cancel_at_period_end
                ? button("resume", "Resume subscription", "fake-portal-resume")
                : button("cancel", "Cancel at period end", "fake-portal-cancel")}
              {sub.status === "past_due"
                ? button("pay", "Update payment method and pay", "fake-portal-pay", true)
                : button("fail_payment", "Simulate a failed payment", "fake-portal-fail")}
            </div>
          </>
        ) : (
          <p className="text-sm text-ink-muted">
            This customer has no subscription in the fake Stripe (the fake store is forgotten when
            the server restarts).
          </p>
        )}
        <a
          href={p.return_url ?? "/"}
          className="text-sm font-semibold text-accent-fill hover:underline"
          data-testid="fake-portal-return"
        >
          Return to Wisemail
        </a>
        {act.isError ? (
          <p role="alert" className="text-sm text-danger-ink">
            {act.error.message}
          </p>
        ) : null}
      </section>
    </main>
  );
}
