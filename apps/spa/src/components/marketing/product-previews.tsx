import {
  AlertTriangle,
  Check,
  Eye,
  Inbox,
  Paperclip,
  Search,
  Sparkles,
} from "lucide-react";
import * as m from "motion/react-m";

import { cn } from "@/lib/utils";
import { easeOut } from "./section";

/** Miniature, non-interactive renders of real Wisemail screens for the landing page. */

export function PreviewWindow({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <div className="overflow-hidden rounded-[1.5rem] border border-line bg-surface shadow-lg">
      <div className="flex h-11 items-center gap-3 border-b border-line bg-canvas-sunken/60 px-4">
        <span className="flex gap-1.5" aria-hidden>
          <span className="size-2.5 rounded-full bg-line-strong" />
          <span className="size-2.5 rounded-full bg-line-strong" />
          <span className="size-2.5 rounded-full bg-line-strong" />
        </span>
        <span className="text-xs font-semibold text-ink-secondary">Northwind Labs</span>
        <span className="text-xs text-ink-faint">/</span>
        <span className="text-xs font-medium text-ink-muted">{title}</span>
        <span className="ml-auto hidden h-7 w-44 items-center gap-2 rounded-full border border-line bg-surface px-3 text-[0.6875rem] text-ink-faint sm:flex">
          <Search className="size-3" aria-hidden /> Search mail
        </span>
      </div>
      <div className="h-[23rem] sm:h-[25rem]">{children}</div>
    </div>
  );
}

const threads = [
  {
    from: "Priya Raman",
    subject: "Order photos for the launch",
    snippet: "Attached both shots, let me know if the crop works.",
    time: "09:52",
    unread: true,
    attach: true,
    initials: "PR",
    hue: "bg-warning-soft text-warning-ink",
  },
  {
    from: "Tomás Aguirre",
    subject: "Can't reset my password",
    snippet: "The link says it expired straight away.",
    time: "09:31",
    unread: true,
    initials: "TA",
    hue: "bg-info-soft text-info-ink",
  },
  {
    from: "Maya Okafor",
    subject: "Re: Invoice 2291 is ready",
    snippet: "Paid, thanks! Could you add our VAT number?",
    time: "Tue",
    initials: "MO",
    hue: "bg-engaged-soft text-engaged-ink",
  },
  {
    from: "Lena Fischer",
    subject: "Partnership idea",
    snippet: "We run a newsletter for indie makers and…",
    time: "Mon",
    initials: "LF",
    hue: "bg-success-soft text-success-ink",
  },
];

export function InboxPreview() {
  return (
    <div className="grid h-full md:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
      <ul className="overflow-hidden border-line md:border-r">
        {threads.map((t, i) => (
          <li
            key={t.subject}
            className={cn(
              "grid grid-cols-[auto_1fr_auto] gap-3 border-b border-line px-4 py-3.5",
              i === 2 && "bg-accent-soft/60",
            )}
          >
            <span
              className={cn(
                "grid size-8 place-items-center rounded-full text-[0.625rem] font-bold",
                t.hue,
              )}
            >
              {t.initials}
            </span>
            <span className="min-w-0">
              <span
                className={cn("block truncate text-[0.8125rem]", t.unread ? "font-bold" : "font-medium")}
              >
                {t.from}
              </span>
              <span className="block truncate text-xs text-ink-secondary">{t.subject}</span>
              <span className="block truncate text-xs text-ink-faint">{t.snippet}</span>
            </span>
            <span className="grid content-start justify-items-end gap-1.5">
              <span className="text-[0.6875rem] text-ink-muted tabular-nums">{t.time}</span>
              {t.attach ? <Paperclip className="size-3 text-ink-faint" aria-hidden /> : null}
              {t.unread ? <span className="size-2 rounded-full bg-accent" aria-label="Unread" /> : null}
            </span>
          </li>
        ))}
      </ul>
      <div className="hidden flex-col gap-4 p-5 md:flex">
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-full bg-engaged-soft text-[0.6875rem] font-bold text-engaged-ink">
            MO
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">Maya Okafor</p>
            <p className="truncate text-xs text-ink-muted">to billing@northwind.studio</p>
          </div>
        </div>
        <p className="text-[0.8125rem] leading-6 text-ink-secondary">
          Paid, thanks! Could you add our VAT number to the next one? It's on the order form.
        </p>
        <div className="mt-auto rounded-2xl border border-line bg-canvas p-4">
          <p className="text-xs font-semibold text-ink-muted">Your reply</p>
          <p className="mt-1.5 text-[0.8125rem] leading-6">
            Done, Maya. Invoice 2292 now carries your VAT number.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[0.6875rem] font-semibold">
            <span className="rounded-full bg-info-soft px-2 py-0.5 text-info-ink">Sent</span>
            <span className="rounded-full bg-success-soft px-2 py-0.5 text-success-ink">
              Delivered
            </span>
            <m.span
              className="inline-flex items-center gap-1 rounded-full bg-engaged-soft px-2 py-0.5 text-engaged-ink"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.6, duration: 0.5, ease: easeOut }}
            >
              <Eye className="size-3" aria-hidden /> Opened 3 min ago
            </m.span>
          </div>
        </div>
      </div>
    </div>
  );
}

const rows = [
  { to: "maya@northwind.studio", subject: "Invoice 2292", status: "Opened", time: "09:58" },
  { to: "j.kowalski@fastmail.com", subject: "Your login code", status: "Delivered", time: "09:57" },
  { to: "hello@bakehouse.co", subject: "Weekly digest", status: "Clicked", time: "09:51" },
  { to: "old-inbox@yahoo.com", subject: "Welcome aboard", status: "Bounced", time: "09:44" },
  { to: "sam@tinylab.dev", subject: "Trial ends Friday", status: "Scheduled", time: "Fri 08:00" },
  { to: "ana.lima@proton.me", subject: "Receipt 1187", status: "Delivered", time: "09:39" },
];

const statusTone: Record<string, string> = {
  Opened: "bg-engaged-soft text-engaged-ink",
  Clicked: "bg-engaged-soft text-engaged-ink",
  Delivered: "bg-success-soft text-success-ink",
  Bounced: "bg-danger-soft text-danger-ink",
  Scheduled: "bg-neutral-soft text-neutral-ink",
};

export function ActivityPreview() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap gap-2 border-b border-line px-4 py-3">
        {["All accounts", "Last 24 hours", "Any status"].map((f) => (
          <span
            key={f}
            className="rounded-full border border-line px-3 py-1 text-[0.6875rem] font-medium text-ink-secondary"
          >
            {f}
          </span>
        ))}
      </div>
      <ul className="flex-1 overflow-hidden">
        {rows.map((r, i) => (
          <m.li
            key={r.to}
            className="grid grid-cols-[1fr_auto] items-center gap-3 border-b border-line px-4 py-3 sm:grid-cols-[1.2fr_1fr_auto_auto]"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06, duration: 0.4, ease: easeOut }}
          >
            <span className="truncate text-[0.8125rem] font-medium">{r.to}</span>
            <span className="hidden truncate text-xs text-ink-muted sm:block">{r.subject}</span>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold",
                statusTone[r.status],
              )}
            >
              {r.status}
            </span>
            <span className="hidden w-16 text-right text-[0.6875rem] text-ink-faint tabular-nums sm:block">
              {r.time}
            </span>
          </m.li>
        ))}
      </ul>
    </div>
  );
}

const series = [62, 64, 61, 66, 70, 68, 73, 71, 76, 74, 79, 82, 80, 86];
const domains = [
  { name: "northwind.studio", rate: 99.1 },
  { name: "mail.bakehouse.co", rate: 97.4 },
  { name: "tinylab.dev", rate: 94.8 },
];

export function InsightsPreview() {
  const w = 320;
  const h = 110;
  const max = 90;
  const min = 55;
  const pts = series.map((v, i) => [
    (i / (series.length - 1)) * w,
    h - ((v - min) / (max - min)) * h,
  ]);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  return (
    <div className="flex h-full flex-col gap-5 p-5">
      <div className="grid grid-cols-3 gap-3">
        {[
          { k: "Delivered", v: "98.6%", d: "+0.4" },
          { k: "Opened", v: "41.2%", d: "+3.1" },
          { k: "Bounced", v: "0.9%", d: "-0.6" },
        ].map((s) => (
          <div key={s.k} className="rounded-2xl border border-line p-3">
            <p className="text-[0.6875rem] font-medium text-ink-muted">{s.k}</p>
            <p className="mt-1 font-display text-xl font-bold tracking-[-0.03em] tabular-nums">
              {s.v}
            </p>
            <p className="text-[0.6875rem] font-semibold text-success-ink tabular-nums">{s.d} pts</p>
          </div>
        ))}
      </div>
      <div className="rounded-2xl border border-line p-4">
        <p className="mb-3 text-xs font-semibold text-ink-secondary">Open rate, last 14 days</p>
        <svg viewBox={`0 0 ${w} ${h}`} className="h-24 w-full overflow-visible" aria-hidden>
          <defs>
            <linearGradient id="ins-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.28" />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <m.path
            d={`${line} L${w} ${h} L0 ${h} Z`}
            fill="url(#ins-fill)"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6, duration: 0.6 }}
          />
          <m.path
            d={line}
            fill="none"
            stroke="var(--accent)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 1.2, ease: easeOut }}
          />
        </svg>
      </div>
      <ul className="grid gap-2.5">
        {domains.map((d) => (
          <li key={d.name} className="grid grid-cols-[8.5rem_1fr_auto] items-center gap-3 text-xs">
            <span className="truncate font-medium">{d.name}</span>
            <m.span
              className="h-1.5 origin-left rounded-full bg-accent/70"
              style={{ width: `${(d.rate - 90) * 10}%` }}
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: 0.9, delay: 0.3, ease: easeOut }}
            />
            <span className="text-ink-muted tabular-nums">{d.rate}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function AlertsPreview() {
  const spike = [8, 9, 8, 10, 9, 11, 10, 22, 38, 44, 30, 14];
  const w = 260;
  const h = 64;
  const line = spike
    .map((v, i) => `${i ? "L" : "M"}${((i / (spike.length - 1)) * w).toFixed(1)} ${(h - (v / 48) * h).toFixed(1)}`)
    .join(" ");
  const threshold = h - (40 / 48) * h;
  return (
    <div className="grid h-full content-start gap-4 p-5">
      <div className="rounded-2xl border border-danger/30 bg-danger-soft/50 p-4">
        <div className="flex items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-danger-soft text-danger-ink">
            <AlertTriangle className="size-4" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">Bounce rate above 4% on mail.bakehouse.co</p>
            <p className="mt-0.5 text-xs text-ink-muted">Open incident since 10:12, 4.4% over the last hour</p>
          </div>
        </div>
        <svg viewBox={`0 0 ${w} ${h}`} className="mt-3 h-14 w-full overflow-visible" aria-hidden>
          <line
            x1="0"
            x2={w}
            y1={threshold}
            y2={threshold}
            stroke="var(--danger)"
            strokeDasharray="4 4"
            strokeOpacity="0.5"
          />
          <m.path
            d={line}
            fill="none"
            stroke="var(--danger)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 1.1, ease: easeOut }}
          />
        </svg>
      </div>
      <div className="rounded-2xl border border-line p-4">
        <p className="text-xs font-semibold text-ink-muted">Rule</p>
        <p className="mt-1 text-[0.8125rem] leading-6">
          When <b className="font-semibold">bounce rate</b> goes over{" "}
          <b className="font-semibold">4%</b> in an hour, notify{" "}
          <b className="font-semibold">Owners and Developers</b>.
        </p>
      </div>
      <ul className="grid gap-2">
        {[
          "Connection Bakehouse is receiving events again",
          "Domain tinylab.dev verified",
        ].map((t) => (
          <li key={t} className="flex items-center gap-2.5 text-xs text-ink-secondary">
            <span className="grid size-5 place-items-center rounded-full bg-success-soft text-success-ink">
              <Check className="size-3" aria-hidden />
            </span>
            {t}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function AiPreview() {
  return (
    <div className="grid h-full content-start gap-4 p-5">
      <div className="rounded-2xl border border-line p-4">
        <div className="flex items-center gap-2">
          <Inbox className="size-3.5 text-ink-muted" aria-hidden />
          <p className="text-xs font-semibold text-ink-muted">Tomás Aguirre</p>
          <span className="ml-auto flex gap-1.5">
            <span className="rounded-full bg-danger-soft px-2 py-0.5 text-[0.625rem] font-bold text-danger-ink">
              Urgent
            </span>
            <span className="rounded-full bg-info-soft px-2 py-0.5 text-[0.625rem] font-bold text-info-ink">
              Account
            </span>
          </span>
        </div>
        <p className="mt-2 text-[0.8125rem] leading-6">
          The reset link says it expired straight away. I've tried three times now.
        </p>
      </div>
      <div className="rounded-2xl border border-accent/30 bg-accent-soft/50 p-4">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-accent-fill">
          <Sparkles className="size-3.5" aria-hidden /> Suggested reply
        </p>
        <TypedText
          className="mt-2 text-[0.8125rem] leading-6"
          text="Sorry about that, Tomás. Reset links last 15 minutes, so older ones fail. I've sent a fresh one just now; it should arrive within a minute."
        />
        <div className="mt-3 flex gap-2">
          <span className="rounded-full bg-accent-fill px-3 py-1 text-[0.6875rem] font-semibold text-accent-ink">
            Use draft
          </span>
          <span className="rounded-full border border-line px-3 py-1 text-[0.6875rem] font-semibold text-ink-secondary">
            Make it shorter
          </span>
        </div>
      </div>
      <p className="text-[0.6875rem] text-ink-muted">
        Drafts are never sent on their own. Quoted history and attachments stay out of the prompt.
      </p>
    </div>
  );
}

function TypedText({ text, className }: { text: string; className?: string }) {
  const words = text.split(" ");
  return (
    <p className={className}>
      <span className="sr-only">{text}</span>
      <span aria-hidden>
        {words.map((w, i) => (
          <m.span
            key={i}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 + i * 0.045, duration: 0.2 }}
          >
            {w}{" "}
          </m.span>
        ))}
      </span>
    </p>
  );
}
