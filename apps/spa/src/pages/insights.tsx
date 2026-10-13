import { useQuery } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { useState } from "react";

import {
  ResourceEmpty,
  ResourceError,
  ResourcePage,
  ResourcePending,
} from "@/components/resource-page";
import { getInsights } from "@/lib/api";

function pct(n: number) {
  return `${n.toFixed(1)}%`;
}

export function InsightsPage() {
  const { orgSlug } = useParams({ from: "/$orgSlug/insights" });
  const [days, setDays] = useState<7 | 30 | 90>(7);
  const insights = useQuery({
    queryKey: ["insights", orgSlug, days],
    queryFn: () => getInsights(orgSlug, days),
  });

  return (
    <ResourcePage title="Insights" description="`GET /api/v1/insights`">
      <div className="flex flex-wrap gap-2">
        {([7, 30, 90] as const).map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setDays(d)}
            className={`h-8 rounded-control px-3 text-sm font-medium ${
              days === d
                ? "bg-accent-soft text-accent-fill"
                : "border border-line text-ink-secondary hover:bg-canvas-sunken"
            }`}
          >
            {d}d
          </button>
        ))}
      </div>
      {insights.isPending ? (
        <ResourcePending />
      ) : insights.isError ? (
        <ResourceError message="Could not load insights." />
      ) : !insights.data.hasData ? (
        <ResourceEmpty>No delivery data in this range yet.</ResourceEmpty>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {(
            [
              ["Sent", insights.data.totals.sent, null],
              ["Delivered", insights.data.totals.delivered, insights.data.rates.delivered],
              ["Opened", insights.data.totals.opened, insights.data.rates.opened],
              ["Bounced", insights.data.totals.bounced, insights.data.rates.bounced],
            ] as const
          ).map(([label, count, rate]) => (
            <div key={label} className="rounded-lg border border-line bg-surface p-4">
              <p className="text-xs font-medium text-ink-muted uppercase">{label}</p>
              <p className="mt-1 text-2xl font-semibold tracking-tight">{count.toLocaleString()}</p>
              {rate != null ? (
                <p className="text-xs text-ink-faint">{pct(rate)}</p>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </ResourcePage>
  );
}
