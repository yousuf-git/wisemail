import Link from "next/link";

import { StatusChip, type StatusState } from "@/components/app/status-chip";
import { cn } from "@/lib/utils";

/** Small presentational pieces shared by the admin pages. Server-renderable. */

export function Panel({
  title,
  description,
  actions,
  children,
  className,
}: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("min-w-0 rounded-xl bg-surface shadow-md", className)}>
      {title ? (
        <header className="flex flex-wrap items-start justify-between gap-2 px-4 pt-4 pb-1 sm:px-5">
          <div className="min-w-0">
            <h2 className="text-[0.95rem] font-bold tracking-[-0.01em]">{title}</h2>
            {description ? <p className="mt-0.5 text-sm text-ink-muted">{description}</p> : null}
          </div>
          {actions}
        </header>
      ) : null}
      <div className="px-4 py-3 sm:px-5 sm:py-4">{children}</div>
    </section>
  );
}

export function Stat({
  label,
  value,
  hint,
  tone,
  href,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: "danger" | "warning";
  href?: string;
}) {
  const body = (
    <>
      <span className="text-[0.78rem] font-medium text-ink-muted">{label}</span>
      <span
        className={cn(
          "text-[1.625rem] leading-[1.15] font-bold tracking-[-0.02em] tabular-nums",
          tone === "danger" && "text-danger-ink",
          tone === "warning" && "text-warning-ink",
        )}
      >
        {value}
      </span>
      {hint ? <span className="text-xs text-ink-muted">{hint}</span> : null}
    </>
  );
  const cls = "grid min-w-0 gap-1 rounded-lg bg-surface px-4 py-3.5 shadow-md";
  return href ? (
    <Link
      href={href}
      className={cn(
        cls,
        "transition-colors outline-none hover:bg-canvas-sunken focus-visible:ring-2 focus-visible:ring-accent",
      )}
    >
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

export function KeyValue({ items }: { items: { label: string; value: React.ReactNode }[] }) {
  return (
    <dl className="grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
      {items.map((i) => (
        <div key={i.label} className="grid min-w-0 gap-0.5">
          <dt className="text-xs font-medium text-ink-muted">{i.label}</dt>
          <dd className="min-w-0 text-sm break-words">{i.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-2 text-sm text-ink-muted">{children}</p>;
}

/** Stacked list rows instead of a table: readable at 390px without horizontal scrolling. */
export function RowList({ children }: { children: React.ReactNode }) {
  return <ul className="-my-1 divide-y divide-line">{children}</ul>;
}

export function Row({
  href,
  children,
  aside,
}: {
  href?: string;
  children: React.ReactNode;
  aside?: React.ReactNode;
}) {
  const inner = (
    <>
      <div className="min-w-0 flex-1">{children}</div>
      {aside ? <div className="flex flex-wrap items-center gap-1.5">{aside}</div> : null}
    </>
  );
  const cls = "flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 py-2.5";
  return (
    <li>
      {href ? (
        <Link
          href={href}
          className={cn(
            cls,
            "-mx-2 rounded-md px-2 transition-colors outline-none hover:bg-canvas-sunken focus-visible:ring-2 focus-visible:ring-accent",
          )}
        >
          {inner}
        </Link>
      ) : (
        <div className={cls}>{inner}</div>
      )}
    </li>
  );
}

const PLAN_TONE: Record<string, StatusState> = {
  free: "neutral",
  pro: "info",
  team: "engaged",
  agency: "success",
};
export const PlanChip = ({ plan, label }: { plan: string; label: string }) => (
  <StatusChip state={PLAN_TONE[plan] ?? "neutral"}>{label}</StatusChip>
);

const CONNECTION_TONE: Record<string, StatusState> = {
  active: "success",
  provisioning: "info",
  needs_attention: "warning",
  read_only: "neutral",
  disabled: "neutral",
};
export const ConnectionChip = ({ status }: { status: string }) => (
  <StatusChip state={CONNECTION_TONE[status] ?? "neutral"}>{status.replace("_", " ")}</StatusChip>
);

const dateFmt = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});
const dateTimeFmt = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "UTC",
});
export const formatDate = (iso: string | null) => (iso ? dateFmt.format(new Date(iso)) : "never");
export const formatDateTime = (iso: string | null) =>
  iso ? `${dateTimeFmt.format(new Date(iso))} UTC` : "never";
export const formatNumber = (n: number | null) =>
  n === null ? "unlimited" : n.toLocaleString("en-US");

export function SearchForm({
  action,
  q,
  placeholder,
}: {
  action: string;
  q?: string;
  placeholder: string;
}) {
  return (
    <form action={action} role="search" className="flex w-full max-w-md gap-2">
      <input
        type="search"
        name="q"
        defaultValue={q}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-9 min-w-0 flex-1 rounded-md border border-input bg-surface px-3 text-sm shadow-xs outline-none placeholder:text-ink-muted focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
      />
      <button
        type="submit"
        className="h-9 rounded-md bg-accent-fill px-4 text-sm font-medium text-accent-ink outline-none hover:bg-accent-fill-hover focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        Search
      </button>
    </form>
  );
}

export function Pager({
  href,
  nextCursor,
}: {
  href: (cursor: string) => string;
  nextCursor: string | null;
}) {
  if (!nextCursor) return null;
  return (
    <div className="flex justify-center pt-1">
      <Link
        href={href(nextCursor)}
        className="rounded-md border border-line-strong px-4 py-1.5 text-sm font-medium outline-none hover:bg-canvas-sunken focus-visible:ring-2 focus-visible:ring-accent"
      >
        Next page
      </Link>
    </div>
  );
}
