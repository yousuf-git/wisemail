import { StatusChip } from "@/components/app/status-chip";
import type { DnsRecordDTO } from "@/lib/dto/domain";
import { CopyButton } from "./copy-button";
import { recordStatus } from "./domain-status";

const GROUP_LABEL: Record<string, string> = {
  SPF: "SPF (sending)",
  DKIM: "DKIM (signing)",
  Receiving: "MX (receiving)",
  Tracking: "Tracking",
  TrackingCAA: "Tracking CAA",
};

function Field({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="grid min-w-0 gap-0.5">
      <dt className="text-[0.6875rem] font-semibold tracking-[0.05em] text-ink-muted uppercase">
        {label}
      </dt>
      <dd className="flex min-w-0 items-start gap-1">
        <span className={mono ? "min-w-0 font-mono text-[0.8125rem] break-all" : "min-w-0 text-sm"}>
          {value}
        </span>
        <span className="-mt-1 shrink-0">
          <CopyButton value={value} label={label.toLowerCase()} />
        </span>
      </dd>
    </div>
  );
}

/**
 * The DNS records Resend wants at the domain's DNS provider, grouped by purpose. Every name and
 * value has a copy button, because these are pasted into another site.
 */
export function DnsRecords({ records }: { records: DnsRecordDTO[] }) {
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
              <StatusChip state={status.state}>{status.label}</StatusChip>
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
