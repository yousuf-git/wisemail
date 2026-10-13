"use client";

import type { InsightDomainRow } from "@/lib/dto/insights";
import { TrendLine } from "./charts";
import { BOUNCE_GUIDELINE, COMPLAINT_GUIDELINE, formatCount, formatRate } from "./format";

/** Top domains with their bounce trend. Numbers are text, the sparkline is decoration. */
export function DomainTable({ domains }: { domains: InsightDomainRow[] }) {
  if (domains.length === 0) return null;
  return (
    <section
      aria-labelledby="domains-title"
      className="grid gap-2 rounded-lg bg-surface p-4 shadow-md"
    >
      <h2 id="domains-title" className="text-[0.9375rem] font-semibold">
        Domains
      </h2>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-sm" data-testid="domain-table">
          <thead>
            <tr className="text-left text-xs font-semibold text-ink-muted">
              <th className="py-1.5 pr-3 font-semibold">Domain</th>
              <th className="px-3 py-1.5 text-right font-semibold">Sent</th>
              <th className="px-3 py-1.5 text-right font-semibold">Delivered</th>
              <th className="px-3 py-1.5 text-right font-semibold">Bounced</th>
              <th className="px-3 py-1.5 text-right font-semibold">Complaints</th>
              <th className="py-1.5 pl-3 font-semibold">Bounce trend</th>
            </tr>
          </thead>
          <tbody>
            {domains.map((d) => {
              const bounceHigh = (d.rates.bounced ?? 0) > BOUNCE_GUIDELINE;
              const complaintHigh = (d.rates.complained ?? 0) > COMPLAINT_GUIDELINE;
              return (
                <tr key={d.domainId ?? "none"} className="border-t border-line">
                  <th
                    scope="row"
                    className="max-w-[18rem] truncate py-2 pr-3 text-left font-medium"
                  >
                    {d.name}
                  </th>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatCount(d.counts.sent)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatRate(d.rates.delivered)}
                  </td>
                  <td
                    className={`px-3 py-2 text-right tabular-nums ${bounceHigh ? "font-semibold text-danger-ink" : ""}`}
                  >
                    {formatRate(d.rates.bounced)}
                  </td>
                  <td
                    className={`px-3 py-2 text-right tabular-nums ${complaintHigh ? "font-semibold text-danger-ink" : ""}`}
                  >
                    {formatRate(d.rates.complained, 2)}
                  </td>
                  <td className="py-2 pl-3">
                    <TrendLine values={d.bounceTrend} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
