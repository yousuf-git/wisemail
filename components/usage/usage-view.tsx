import Link from "next/link";

import { UpgradeChip } from "@/components/billing/locked-feature";
import type { UsageDayDTO, UsageMeterDTO, UsageOverviewDTO } from "@/lib/dto/billing";
import { cn } from "@/lib/utils";

const nf = new Intl.NumberFormat("en-US");
const usd = (n: number) => `$${n.toFixed(2).replace(/\.00$/, "")}`;
const day = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
/** The stored period end is exclusive: show the last day. */
const lastDay = (iso: string) => day(new Date(new Date(iso).getTime() - 1).toISOString());

const STREAMS = [
  { key: "transactional", label: "Transactional", bar: "bg-accent" },
  { key: "broadcast", label: "Broadcast", bar: "bg-engaged" },
  { key: "inbound", label: "Inbound", bar: "bg-success" },
] as const;

function Card({
  title,
  aside,
  children,
  testId,
}: {
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <section
      className="grid gap-4 rounded-xl bg-surface p-5 shadow-md"
      aria-label={title}
      data-testid={testId}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold">{title}</h2>
        {aside ? <span className="text-[0.8125rem] text-ink-muted">{aside}</span> : null}
      </div>
      {children}
    </section>
  );
}

function TrackedMeter({ usage }: { usage: UsageOverviewDTO }) {
  const { tracked, allowance, projection } = usage;
  const ratio = allowance ? tracked.total / allowance : 0;
  const tone = ratio > 1 ? "bg-danger" : ratio >= 0.8 ? "bg-warning" : null;
  const scale = Math.max(allowance, tracked.total, projection.monthEnd) || 1;
  const w = (n: number) => `${(n / scale) * 100}%`;
  return (
    <div className="grid gap-2">
      <div className="relative">
        <div
          role="meter"
          aria-label="Tracked emails this period"
          aria-valuemin={0}
          aria-valuemax={allowance}
          aria-valuenow={tracked.total}
          className="relative flex h-3 overflow-hidden rounded-full bg-line"
        >
          {STREAMS.map((s) => (
            <i
              key={s.key}
              className={cn("block h-full", tone ?? s.bar)}
              style={{ width: w(tracked[s.key]) }}
            />
          ))}
        </div>
        {projection.monthEnd > tracked.total ? (
          <i
            aria-hidden
            title="Projected total at the end of the period"
            className="absolute -top-1 -bottom-1 w-0 border-l-2 border-dashed border-ink-muted"
            style={{ left: w(projection.monthEnd) }}
          />
        ) : null}
      </div>
      <div className="relative h-4 text-[0.72rem] text-ink-muted" aria-hidden>
        <span
          className={cn("absolute", allowance / scale > 0.9 ? "right-0" : "-translate-x-1/2")}
          style={allowance / scale > 0.9 ? undefined : { left: w(allowance) }}
        >
          Allowance
        </span>
      </div>
    </div>
  );
}

export function UsageView({
  usage,
  orgSlug,
  isOwner,
}: {
  usage: UsageOverviewDTO;
  orgSlug: string;
  isOwner: boolean;
}) {
  const { tracked, allowance, projection, overage, period } = usage;
  const over = Math.max(0, tracked.total - allowance);
  const pace =
    tracked.total === 0
      ? "No tracked emails yet this period."
      : projection.over > 0
        ? `On pace for about ${nf.format(projection.monthEnd)} by the end of the period, ${nf.format(projection.over)} over${projection.overageCostUsd ? ` (about ${usd(projection.overageCostUsd)} in overage)` : ""}.`
        : `On pace for about ${nf.format(projection.monthEnd)} by the end of the period.`;
  return (
    <div className="grid gap-4">
      <Card
        title="Tracked emails"
        aside={`${day(period.start)} – ${lastDay(period.end)} · day ${period.daysElapsed} of ${period.daysTotal}`}
        testId="usage-tracked"
      >
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <b className="text-3xl font-bold tracking-tight tabular-nums" data-testid="usage-total">
            {nf.format(tracked.total)}
          </b>
          <span className="text-ink-muted">
            of {nf.format(allowance)} on {usage.plan.label}
          </span>
          {over > 0 ? (
            <span className="rounded-full bg-danger-soft px-2.5 py-0.5 text-[0.75rem] font-bold text-danger-ink">
              Over by {nf.format(over)}
              {overage.costUsd ? ` · est. ${usd(overage.costUsd)} overage` : ""}
            </span>
          ) : null}
        </div>
        <TrackedMeter usage={usage} />
        <ul className="grid gap-2 min-[560px]:grid-cols-3" aria-label="Split by stream">
          {STREAMS.map((s) => (
            <li key={s.key} className="flex items-center gap-2 text-sm">
              <i aria-hidden className={cn("size-2.5 rounded-full", s.bar)} />
              <span className="text-ink-secondary">{s.label}</span>
              <b className="ml-auto font-semibold tabular-nums" data-testid={`usage-${s.key}`}>
                {nf.format(tracked[s.key])}
              </b>
            </li>
          ))}
        </ul>
        <p className="text-sm text-ink-secondary" data-testid="usage-projection">
          {pace}
        </p>
        {overage.graceEndsAt ? (
          <p
            className="rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning-ink"
            data-testid="usage-grace"
          >
            {overage.graceEnded
              ? "The 7-day grace period has ended. Emails beyond the allowance now keep 7 days of history instead of 30."
              : `You are over the allowance. Nothing is dropped; after the grace period ends on ${day(overage.graceEndsAt)}, extra emails keep 7 days of history instead of 30.`}{" "}
            {isOwner ? (
              <Link
                href={`/${orgSlug}/settings/billing`}
                className="font-bold underline underline-offset-4"
              >
                Choose a plan
              </Link>
            ) : null}
          </p>
        ) : null}
        <p className="text-[0.8125rem] text-ink-muted">
          One tracked email is a transactional send, one broadcast recipient or one inbound message.
          Every event for it (opens, clicks, bounces) is included.
        </p>
      </Card>

      <Card title="Per day" aside="UTC days" testId="usage-daily">
        <DailyChart days={usage.daily} />
      </Card>

      <AiCard usage={usage} orgSlug={orgSlug} isOwner={isOwner} />

      <Card title="Plan limits" testId="usage-resources">
        <ul className="grid gap-3 min-[720px]:grid-cols-2">
          {usage.resources.map((r) => (
            <ResourceRow key={r.key} meter={r} />
          ))}
        </ul>
      </Card>

      <Card title="Past periods" testId="usage-history">
        {usage.history.length === 0 ? (
          <p className="text-sm text-ink-muted">
            History appears here after your first full period.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead className="text-[0.75rem] text-ink-muted">
                <tr>
                  <th className="py-1.5 pr-3 font-medium">Period</th>
                  <th className="py-1.5 pr-3 font-medium">Plan</th>
                  <th className="py-1.5 pr-3 text-right font-medium">Transactional</th>
                  <th className="py-1.5 pr-3 text-right font-medium">Broadcast</th>
                  <th className="py-1.5 pr-3 text-right font-medium">Inbound</th>
                  <th className="py-1.5 pr-3 text-right font-medium">Total</th>
                  <th className="py-1.5 text-right font-medium">Over allowance</th>
                </tr>
              </thead>
              <tbody>
                {usage.history.map((h) => (
                  <tr key={h.periodStart} className="border-t border-line">
                    <td className="py-2 pr-3">
                      {day(h.periodStart)} – {lastDay(h.periodEnd)}
                    </td>
                    <td className="py-2 pr-3 capitalize">{h.plan}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {nf.format(h.transactional)}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">{nf.format(h.broadcast)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{nf.format(h.inbound)}</td>
                    <td className="py-2 pr-3 text-right font-semibold tabular-nums">
                      {nf.format(h.total)}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {h.overage ? nf.format(h.overage) : "–"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function DailyChart({ days }: { days: UsageDayDTO[] }) {
  const totals = days.map((d) => d.transactional + d.broadcast + d.inbound);
  const max = Math.max(1, ...totals);
  if (totals.every((t) => t === 0)) {
    return (
      <p className="text-sm text-ink-muted">
        Nothing tracked yet. Emails appear here as events arrive.
      </p>
    );
  }
  return (
    <div>
      <div
        className="flex h-36 items-end gap-[3px]"
        role="img"
        aria-label={`Tracked emails per day, peak ${nf.format(max)}`}
      >
        {days.map((d, i) => {
          const total = totals[i]!;
          return (
            <div
              key={d.date}
              className="group relative flex h-full min-w-0 flex-1 flex-col justify-end"
              title={`${day(d.date)}: ${nf.format(total)} (${nf.format(d.transactional)} transactional, ${nf.format(d.broadcast)} broadcast, ${nf.format(d.inbound)} inbound)`}
            >
              <div
                className="flex flex-col-reverse overflow-hidden rounded-t-[3px]"
                style={{ height: `${(total / max) * 100}%` }}
              >
                {STREAMS.map((s) => (
                  <i
                    key={s.key}
                    className={cn("block w-full", s.bar)}
                    style={{ height: total ? `${(d[s.key] / total) * 100}%` : 0 }}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-1.5 flex justify-between text-[0.72rem] text-ink-muted">
        <span>{day(days[0]!.date)}</span>
        <span>{day(days.at(-1)!.date)}</span>
      </div>
    </div>
  );
}

const FEATURE_LABEL: Record<string, string> = {
  triage: "Inbound triage",
  draft: "Reply drafts",
  compose: "Compose helper",
  anomaly: "Incident explanations",
};

function AiCard({
  usage,
  orgSlug,
  isOwner,
}: {
  usage: UsageOverviewDTO;
  orgSlug: string;
  isOwner: boolean;
}) {
  const { ai } = usage;
  if (!ai.enabled) {
    return (
      <Card title="AI credits" testId="usage-ai">
        <p className="flex flex-wrap items-center gap-2 text-sm text-ink-muted">
          AI is on paid plans.{" "}
          {isOwner ? (
            <UpgradeChip orgSlug={orgSlug} label="See plans" />
          ) : (
            "Ask your Owner to upgrade."
          )}
        </p>
      </Card>
    );
  }
  const pct = ai.allowance ? Math.min(100, (ai.used / ai.allowance) * 100) : 0;
  return (
    <Card
      title="AI credits"
      aside={ai.packs > 0 ? `${nf.format(ai.packs)} pack credits on top` : undefined}
      testId="usage-ai"
    >
      <div className="flex flex-wrap items-baseline gap-x-3">
        <b className="text-2xl font-bold tabular-nums" data-testid="usage-ai-used">
          {nf.format(ai.used)}
        </b>
        <span className="text-ink-muted">
          of {nf.format(ai.allowance)} credits used this period
        </span>
      </div>
      <div
        role="meter"
        aria-label="AI credits used"
        aria-valuemin={0}
        aria-valuemax={ai.allowance}
        aria-valuenow={ai.used}
        className="h-2 overflow-hidden rounded-full bg-line"
      >
        <i
          className={cn(
            "block h-full",
            pct >= 100 ? "bg-danger" : pct >= 80 ? "bg-warning" : "bg-accent",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      {ai.byFeature.length > 0 || ai.byMember.length > 0 ? (
        <div className="grid gap-4 min-[720px]:grid-cols-2">
          <BreakdownList
            title="By feature"
            rows={ai.byFeature.map((f) => ({
              label: FEATURE_LABEL[f.feature] ?? f.feature,
              credits: f.credits,
            }))}
          />
          <BreakdownList
            title="By member"
            rows={ai.byMember.map((m) => ({ label: m.name, credits: m.credits }))}
          />
        </div>
      ) : (
        <p className="text-sm text-ink-muted">No AI credits used yet this period.</p>
      )}
    </Card>
  );
}

function BreakdownList({
  title,
  rows,
}: {
  title: string;
  rows: { label: string; credits: number }[];
}) {
  return (
    <div>
      <h3 className="mb-1 text-[0.75rem] font-medium text-ink-muted">{title}</h3>
      <ul className="grid gap-1 text-sm">
        {rows.map((r) => (
          <li key={r.label} className="flex justify-between gap-3">
            <span className="truncate">{r.label}</span>
            <b className="font-semibold tabular-nums">{nf.format(r.credits)}</b>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ResourceRow({ meter }: { meter: UsageMeterDTO }) {
  const pct = meter.limit ? Math.min(100, (meter.used / meter.limit) * 100) : 0;
  const tone = meter.limit !== null && meter.used >= meter.limit ? "bg-warning" : "bg-accent";
  return (
    <li className="grid gap-1.5" data-testid={`usage-resource-${meter.key}`}>
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="text-ink-secondary">{meter.label}</span>
        <b className="font-semibold tabular-nums">
          {nf.format(meter.used)}
          <span className="font-normal text-ink-muted">
            {meter.limit === null ? " · unlimited" : ` of ${nf.format(meter.limit)}`}
          </span>
        </b>
      </div>
      <div
        role="meter"
        aria-label={meter.label}
        aria-valuemin={0}
        aria-valuemax={meter.limit ?? undefined}
        aria-valuenow={meter.used}
        className="h-[6px] overflow-hidden rounded-full bg-line"
      >
        {meter.limit !== null ? (
          <i className={cn("block h-full", tone)} style={{ width: `${pct}%` }} />
        ) : null}
      </div>
    </li>
  );
}
