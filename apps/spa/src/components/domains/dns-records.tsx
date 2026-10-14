import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { DnsRecord } from "@/lib/api";
import { cn } from "@/lib/utils";

import { GROUP_LABEL, recordStatus } from "./domain-status";

function CopyButton({ value, label }: { value: string; label: string }) {
  const [done, setDone] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  return (
    <button
      type="button"
      aria-label={`Copy ${label}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setDone(true);
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => setDone(false), 1600);
        } catch {
          /* ignore */
        }
      }}
      className="rounded p-1 text-ink-muted hover:bg-canvas-sunken hover:text-ink"
    >
      {done ? <Check className="size-3.5 text-success-ink" /> : <Copy className="size-3.5" />}
    </button>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid min-w-0 gap-0.5">
      <dt className="text-[0.6875rem] font-semibold tracking-[0.05em] text-ink-muted uppercase">
        {label}
      </dt>
      <dd className="flex min-w-0 items-start gap-1">
        <span className="min-w-0 font-mono text-[0.8125rem] break-all">{value}</span>
        <span className="-mt-1 shrink-0">
          <CopyButton value={value} label={label.toLowerCase()} />
        </span>
      </dd>
    </div>
  );
}

export function DnsRecords({ records }: { records: DnsRecord[] }) {
  if (records.length === 0) {
    return (
      <p className="text-sm text-ink-muted">
        Resend hasn&apos;t listed any DNS records for this domain yet.
      </p>
    );
  }
  return (
    <ul className="grid gap-3" aria-label="DNS records">
      {records.map((r, i) => {
        const status = recordStatus(r.status);
        return (
          <li
            key={`${r.record}-${r.type}-${r.name}-${i}`}
            data-testid="dns-record"
            className="grid gap-3 rounded-lg border border-line p-3.5"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-2 text-sm font-semibold">
                {GROUP_LABEL[r.record] ?? r.record}
                <span className="rounded-md bg-canvas-sunken px-1.5 py-px font-mono text-xs font-medium text-ink-secondary">
                  {r.type}
                </span>
              </p>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                  status.tone,
                )}
              >
                {status.label}
              </span>
            </div>
            <dl className="grid gap-2.5 min-[720px]:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto]">
              <Field label="Name" value={r.name} />
              <Field label="Value" value={r.value} />
              {r.priority != null ? (
                <div className="grid gap-0.5">
                  <dt className="text-[0.6875rem] font-semibold tracking-[0.05em] text-ink-muted uppercase">
                    Priority
                  </dt>
                  <dd className="font-mono text-[0.8125rem]">{r.priority}</dd>
                </div>
              ) : null}
            </dl>
          </li>
        );
      })}
    </ul>
  );
}
