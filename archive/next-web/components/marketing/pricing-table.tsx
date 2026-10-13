import { Check, Minus } from "lucide-react";

import {
  FEATURE_LABELS,
  PLAN_CATALOG,
  PLAN_ORDER,
  type Feature,
  type Plan,
} from "@/lib/billing/plans";
import { compactCount, formatRetention, limitLabel, usd } from "./format";

const tableFeatures: Feature[] = [
  "inboxCollaboration",
  "chatAlertChannels",
  "digests",
  "savedViews",
  "projectScopedMembers",
  "auditLog",
];

type Row = { label: string; cell: (p: Plan) => React.ReactNode };

const text = (p: Plan) => PLAN_CATALOG[p];

const rows: Row[] = [
  {
    label: "Tracked emails a month",
    cell: (p) => compactCount(text(p).limits.emailsTrackedPerMonth),
  },
  {
    label: "Resend accounts",
    cell: (p) =>
      text(p).extraConnectionUsd !== null
        ? `${text(p).limits.connections} included, then ${usd(text(p).extraConnectionUsd!)}/mo each`
        : String(text(p).limits.connections),
  },
  {
    label: "Overage per extra 10k",
    cell: (p) =>
      text(p).overagePer10kUsd === null ? "Shorter retention" : usd(text(p).overagePer10kUsd!),
  },
  { label: "History", cell: (p) => formatRetention(text(p).limits.retentionDays) },
  { label: "Members", cell: (p) => limitLabel(text(p).limits.members) },
  { label: "Projects", cell: (p) => limitLabel(text(p).limits.projects) },
  { label: "Alert rules", cell: (p) => limitLabel(text(p).limits.alertRules) },
  {
    label: "AI credits a month",
    cell: (p) =>
      text(p).limits.aiCreditsPerMonth ? (
        text(p).limits.aiCreditsPerMonth.toLocaleString("en-US")
      ) : (
        <Dash />
      ),
  },
  {
    label: "Audit log",
    cell: (p) =>
      text(p).limits.auditLogDays ? formatRetention(text(p).limits.auditLogDays) : <Dash />,
  },
  ...tableFeatures
    .filter((f) => f !== "auditLog")
    .map((f) => ({
      label: FEATURE_LABELS[f],
      cell: (p: Plan) => (PLAN_CATALOG[p].features[f] ? <Yes /> : <Dash />),
    })),
  { label: "Support", cell: (p) => text(p).support },
];

function Dash() {
  return (
    <>
      <Minus className="mx-auto size-4 text-ink-muted" aria-hidden />
      <span className="sr-only">Not included</span>
    </>
  );
}

function Yes() {
  return (
    <>
      <Check className="mx-auto size-4 text-success-ink" aria-hidden />
      <span className="sr-only">Included</span>
    </>
  );
}

export function PricingTable() {
  return (
    <div
      role="region"
      aria-label="Compare plans"
      tabIndex={0}
      className="relative overflow-x-auto rounded-xl border border-line bg-surface shadow-md"
    >
      <table className="w-full min-w-[680px] border-collapse text-left text-sm">
        <caption className="sr-only">What each Wisemail plan includes</caption>
        <thead>
          <tr className="bg-canvas-sunken">
            <th scope="col" className="px-4 py-3 text-xs font-semibold text-ink-secondary">
              Plan
            </th>
            {PLAN_ORDER.map((p) => (
              <th key={p} scope="col" className="px-4 py-3 text-center font-bold">
                {PLAN_CATALOG[p].label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-t border-line">
              <th scope="row" className="px-4 py-3 font-medium">
                {r.label}
              </th>
              {PLAN_ORDER.map((p) => (
                <td key={p} className="px-4 py-3 text-center text-ink-secondary tabular-nums">
                  {r.cell(p)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
