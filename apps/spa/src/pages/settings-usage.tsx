import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";

import {
  ResourceEmpty,
  ResourceError,
  ResourcePage,
  ResourcePending,
} from "@/components/resource-page";
import { ApiError, getSettingsUsage } from "@/lib/api";

const nf = new Intl.NumberFormat("en-US");

/** Settings → Usage: tracked emails, allowance, AI credits. */
export function SettingsUsagePage() {
  const { orgSlug } = useParams({ from: "/$orgSlug/settings/usage" });
  const usage = useQuery({
    queryKey: ["settings-usage", orgSlug],
    queryFn: () => getSettingsUsage(orgSlug),
    retry: false,
  });

  if (usage.isError && usage.error instanceof ApiError && usage.error.status === 403) {
    return (
      <ResourcePage title="Usage" description="Plan allowance and AI credits.">
        <ResourceEmpty>Usage is for Owners and Admins.</ResourceEmpty>
      </ResourcePage>
    );
  }

  return (
    <ResourcePage
      title="Usage"
      description="Tracked emails against your allowance, AI credits, and what your plan includes."
    >
      {usage.isPending ? (
        <ResourcePending />
      ) : usage.isError ? (
        <ResourceError message="Could not load usage." />
      ) : (
        <div className="grid max-w-2xl gap-4">
          <section className="grid gap-3 rounded-xl border border-line bg-surface p-5 shadow-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-base font-semibold">Tracked emails</h2>
              <span className="text-sm text-ink-muted">{usage.data.plan.label}</span>
            </div>
            <p className="text-2xl font-semibold tracking-tight">
              {nf.format(usage.data.tracked.total)}
              <span className="text-base font-medium text-ink-muted">
                {" "}
                / {nf.format(usage.data.allowance)}
              </span>
            </p>
            <div
              role="meter"
              aria-valuemin={0}
              aria-valuemax={usage.data.allowance}
              aria-valuenow={usage.data.tracked.total}
              className="flex h-2.5 overflow-hidden rounded-full bg-line"
            >
              {(
                [
                  ["transactional", "bg-accent"],
                  ["broadcast", "bg-engaged"],
                  ["inbound", "bg-success"],
                ] as const
              ).map(([key, bar]) => {
                const n = usage.data.tracked[key];
                const w =
                  usage.data.allowance > 0
                    ? Math.min(100, (n / Math.max(usage.data.allowance, usage.data.tracked.total)) * 100)
                    : 0;
                return <i key={key} className={`block h-full ${bar}`} style={{ width: `${w}%` }} />;
              })}
            </div>
            <ul className="grid gap-1 text-sm text-ink-secondary sm:grid-cols-3">
              <li>Transactional · {nf.format(usage.data.tracked.transactional)}</li>
              <li>Broadcast · {nf.format(usage.data.tracked.broadcast)}</li>
              <li>Inbound · {nf.format(usage.data.tracked.inbound)}</li>
            </ul>
            {usage.data.overage.emails > 0 ? (
              <p className="text-sm text-warning-ink">
                {nf.format(usage.data.overage.emails)} over allowance
                {usage.data.overage.costUsd != null
                  ? ` · ~$${usage.data.overage.costUsd.toFixed(2)} estimated`
                  : ""}
                .
              </p>
            ) : null}
            <Link
              to="/$orgSlug/settings/billing"
              params={{ orgSlug }}
              className="text-sm font-medium text-accent-fill hover:underline"
            >
              Manage plan
            </Link>
          </section>

          {usage.data.ai.enabled ? (
            <section className="grid gap-2 rounded-xl border border-line bg-surface p-5 shadow-sm">
              <h2 className="text-base font-semibold">AI credits</h2>
              <p className="text-2xl font-semibold tracking-tight">
                {nf.format(usage.data.ai.allowance - usage.data.ai.used)}
                <span className="text-base font-medium text-ink-muted">
                  {" "}
                  / {nf.format(usage.data.ai.allowance)} left
                </span>
              </p>
              <p className="text-sm text-ink-muted">
                Used {nf.format(usage.data.ai.used)}
                {usage.data.ai.packs > 0 ? ` · ${usage.data.ai.packs} pack credits` : ""}.
              </p>
            </section>
          ) : null}

          {usage.data.resources.length > 0 ? (
            <section className="grid gap-2 rounded-xl border border-line bg-surface p-5 shadow-sm">
              <h2 className="text-base font-semibold">Resources</h2>
              <ul className="divide-y divide-line">
                {usage.data.resources.map((r) => (
                  <li key={r.key} className="flex justify-between gap-3 py-2 text-sm">
                    <span>{r.label}</span>
                    <span className="text-ink-muted">
                      {nf.format(r.used)}
                      {r.limit != null ? ` / ${nf.format(r.limit)}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      )}
    </ResourcePage>
  );
}
