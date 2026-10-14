import { ChevronDown, Download } from "lucide-react";
import { useCallback, useRef, useState } from "react";

import {
  downloadAuditExport,
  listAuditLog,
  type AuditFilters,
  type AuditPage,
  type AuditQueryParams,
  type AuditRow,
} from "@/lib/api";
import { cn } from "@/lib/utils";

type Filters = { actor: string; action: string; targetType: string; from: string; to: string };
const EMPTY: Filters = { actor: "", action: "", targetType: "", from: "", to: "" };

const time = (iso: string) =>
  new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  });

const actionLabel = (action: string) => {
  const text = action.replace(/[._]/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
};

const selectClass =
  "h-9 min-w-0 rounded-md border border-line-strong bg-surface px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-accent";

function toQuery(f: Filters, cursor?: string | null): AuditQueryParams {
  return {
    actor: f.actor || undefined,
    action: f.action || undefined,
    targetType: f.targetType || undefined,
    from: f.from || undefined,
    to: f.to || undefined,
    cursor: cursor ?? undefined,
  };
}

export function AuditView({
  orgSlug,
  initial,
  filters,
}: {
  orgSlug: string;
  initial: AuditPage;
  filters: AuditFilters;
}) {
  const [f, setF] = useState<Filters>(EMPTY);
  const [items, setItems] = useState(initial.items);
  const [cursor, setCursor] = useState(initial.nextCursor);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const request = useRef(0);

  const load = useCallback(
    async (next: Filters, after: string | null, replace: boolean) => {
      const id = ++request.current;
      setLoading(true);
      setError(null);
      try {
        const page = await listAuditLog(orgSlug, toQuery(next, after));
        if (id !== request.current) return;
        setItems((prev) => (replace ? page.items : [...prev, ...page.items]));
        setCursor(page.nextCursor);
      } catch (e) {
        if (id === request.current) {
          setError(e instanceof Error ? e.message : "Could not load the audit log.");
        }
      } finally {
        if (id === request.current) setLoading(false);
      }
    },
    [orgSlug],
  );

  function update(patch: Partial<Filters>) {
    const next = { ...f, ...patch };
    setF(next);
    void load(next, null, true);
  }

  const active = Object.values(f).some(Boolean);

  async function onExport() {
    setExporting(true);
    setError(null);
    try {
      await downloadAuditExport(orgSlug, toQuery(f));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not export the audit log.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="grid gap-4">
      <div
        className="grid gap-3 rounded-xl bg-surface p-4 shadow-md min-[720px]:grid-cols-[repeat(auto-fit,minmax(130px,1fr))]"
        role="search"
        aria-label="Filter the audit log"
      >
        <label className="grid gap-1 text-[0.75rem] font-medium text-ink-muted">
          Actor
          <select
            className={selectClass}
            value={f.actor}
            onChange={(e) => update({ actor: e.target.value })}
            aria-label="Actor"
          >
            <option value="">Anyone</option>
            <option value="system">System</option>
            {filters.actors.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-[0.75rem] font-medium text-ink-muted">
          Action
          <select
            className={selectClass}
            value={f.action}
            onChange={(e) => update({ action: e.target.value })}
            aria-label="Action"
          >
            <option value="">Any action</option>
            {filters.actions.map((a) => (
              <option key={a} value={a}>
                {actionLabel(a)}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-[0.75rem] font-medium text-ink-muted">
          Resource
          <select
            className={selectClass}
            value={f.targetType}
            onChange={(e) => update({ targetType: e.target.value })}
            aria-label="Resource"
          >
            <option value="">Any resource</option>
            {filters.targetTypes.map((t) => (
              <option key={t} value={t}>
                {actionLabel(t)}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-[0.75rem] font-medium text-ink-muted">
          From
          <input
            type="date"
            className={selectClass}
            value={f.from}
            onChange={(e) => update({ from: e.target.value })}
            aria-label="From date"
          />
        </label>
        <label className="grid gap-1 text-[0.75rem] font-medium text-ink-muted">
          To
          <input
            type="date"
            className={selectClass}
            value={f.to}
            onChange={(e) => update({ to: e.target.value })}
            aria-label="To date"
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-ink-muted">
          Showing the last {filters.windowDays} days
          {active ? " · filtered" : ""}.
          {active ? (
            <button
              type="button"
              className="ml-2 font-semibold text-ink underline underline-offset-4"
              onClick={() => {
                setF(EMPTY);
                void load(EMPTY, null, true);
              }}
            >
              Clear filters
            </button>
          ) : null}
        </p>
        <button
          type="button"
          data-testid="audit-export"
          disabled={exporting}
          onClick={() => void onExport()}
          className="inline-flex h-9 items-center gap-2 rounded-control border border-line-strong bg-surface px-3 text-sm font-semibold hover:bg-canvas disabled:opacity-50"
        >
          <Download aria-hidden className="size-4" />
          {exporting ? "Exporting…" : "Export CSV"}
        </button>
      </div>

      {error ? (
        <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-ink">
          {error}
        </p>
      ) : null}

      {items.length === 0 && !loading ? (
        <p className="rounded-xl bg-surface px-5 py-8 text-center text-sm text-ink-muted shadow-md">
          {active ? "Nothing matches these filters." : "Nothing has been recorded yet."}
        </p>
      ) : (
        <ul className="grid gap-2" aria-label="Audit entries" data-testid="audit-list">
          {items.map((entry) => (
            <AuditRowItem
              key={entry.id}
              entry={entry}
              open={open === entry.id}
              onToggle={() => setOpen(open === entry.id ? null : entry.id)}
            />
          ))}
        </ul>
      )}

      {cursor ? (
        <div className="flex justify-center">
          <button
            type="button"
            data-testid="audit-more"
            disabled={loading}
            onClick={() => void load(f, cursor, false)}
            className="h-9 rounded-control border border-line-strong bg-surface px-4 text-sm font-semibold hover:bg-canvas disabled:opacity-50"
          >
            {loading ? "Loading…" : "Load more"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function AuditRowItem({
  entry,
  open,
  onToggle,
}: {
  entry: AuditRow;
  open: boolean;
  onToggle: () => void;
}) {
  const hasDetail = !!entry.changes || !!entry.ip;
  return (
    <li
      className="rounded-xl bg-surface shadow-md"
      data-testid="audit-row"
      data-action={entry.action}
    >
      <button
        type="button"
        onClick={onToggle}
        disabled={!hasDetail}
        aria-expanded={hasDetail ? open : undefined}
        className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-default"
      >
        <span className="grid min-w-0 flex-1 gap-0.5">
          <span className="truncate text-sm font-semibold">{actionLabel(entry.action)}</span>
          <span className="truncate text-[0.8125rem] text-ink-muted">
            {entry.actor.name} · {entry.target.type.replace(/_/g, " ")}
          </span>
        </span>
        <time
          dateTime={entry.createdAt}
          className="shrink-0 text-[0.75rem] text-ink-muted tabular-nums"
        >
          {time(entry.createdAt)}
        </time>
        {hasDetail ? (
          <ChevronDown
            aria-hidden
            className={cn(
              "size-4 shrink-0 text-ink-muted transition-transform",
              open && "rotate-180",
            )}
          />
        ) : null}
      </button>
      {open ? (
        <div className="grid gap-3 border-t border-line px-4 py-3 text-[0.8125rem]">
          <dl className="grid gap-1 text-ink-secondary min-[560px]:grid-cols-[110px_1fr]">
            <dt className="text-ink-muted">Resource id</dt>
            <dd className="font-mono text-[0.75rem] break-all">{entry.target.id}</dd>
            {entry.ip ? (
              <>
                <dt className="text-ink-muted">IP</dt>
                <dd>{entry.ip}</dd>
              </>
            ) : null}
          </dl>
          {entry.changes ? (
            <div className="grid gap-2 min-[720px]:grid-cols-2">
              <JsonBlock title="Before" value={entry.changes.before} />
              <JsonBlock title="After" value={entry.changes.after} />
            </div>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

function JsonBlock({ title, value }: { title: string; value?: Record<string, unknown> }) {
  if (!value) return null;
  return (
    <div>
      <h3 className="mb-1 text-[0.75rem] font-medium text-ink-muted">{title}</h3>
      <pre className="overflow-x-auto rounded-lg bg-canvas p-2.5 text-[0.75rem] leading-snug">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}
