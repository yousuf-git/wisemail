"use client";

import NumberFlow from "@number-flow/react";
import { AlertTriangle, Bell, Check, Loader2, RotateCcw, Sparkles } from "lucide-react";
import * as m from "motion/react-m";
import { useState } from "react";

import { cn } from "@/lib/utils";
import { Frame } from "./section";
import { useSeen, useStepper } from "./motion-hooks";

const ease = [0.2, 0.8, 0.2, 1] as const;
const reveal = (on: boolean) => ({ opacity: on ? 1 : 0, y: on ? 0 : 8 });

/* ---------------------------------------------------------------- read receipts */

const timeline = [
  { label: "Sent", detail: "09:41:02", tone: "bg-info" },
  { label: "Delivered", detail: "09:41:04", tone: "bg-success" },
  { label: "Opened", detail: "09:47, first time", tone: "bg-engaged" },
  { label: "Opened again", detail: "11:20, 2 opens", tone: "bg-engaged" },
  { label: "Clicked", detail: "View invoice", tone: "bg-engaged" },
];

export function ReceiptsVignette() {
  const [ref, seen] = useSeen<HTMLDivElement>();
  const { step, replay, reduced } = useStepper([500, 1100, 1900, 2700, 3500], seen);

  return (
    <div ref={ref}>
      <Frame label="Sample data. Open tracking is pixel-based, so rates are estimates.">
        <div className="flex items-start justify-between gap-3">
          <div className="grid gap-0.5">
            <p className="text-sm font-bold">Re: Invoice question</p>
            <p className="text-xs text-ink-secondary">To jane@example.com</p>
          </div>
          {!reduced ? (
            <button
              type="button"
              onClick={replay}
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold text-ink-secondary transition-colors hover:bg-canvas-sunken hover:text-ink focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <RotateCcw className="size-3.5" aria-hidden /> Replay
            </button>
          ) : null}
        </div>
        <ol className="relative mt-5 grid gap-4 pl-6">
          <span aria-hidden className="absolute top-2 bottom-2 left-[5px] w-px bg-line-strong" />
          {timeline.map((t, i) => (
            <m.li
              key={t.label}
              initial={false}
              animate={reveal(step > i)}
              transition={{ duration: 0.35, ease }}
              className="relative flex items-baseline justify-between gap-3"
            >
              <span
                aria-hidden
                className={cn(
                  "absolute top-1.5 -left-6 size-[11px] rounded-full ring-4 ring-surface",
                  t.tone,
                )}
              />
              <span className="text-sm font-semibold">{t.label}</span>
              <span className="font-mono text-xs text-ink-secondary">{t.detail}</span>
            </m.li>
          ))}
        </ol>
        <m.div
          initial={false}
          animate={reveal(step >= 3)}
          transition={{ duration: 0.35, ease }}
          className="mt-5 flex items-center gap-2 rounded-lg bg-engaged-soft px-3 py-2 text-xs font-semibold text-engaged-ink"
        >
          <Bell className="size-3.5" aria-hidden /> Jane opened your reply
        </m.div>
      </Frame>
    </div>
  );
}

/* ---------------------------------------------------------------- checklist */

export function ChecklistVignette() {
  const [ref, seen] = useSeen<HTMLDivElement>();
  // 1 = fixing, 2 = fixed
  const { step, set } = useStepper([1100, 2100], seen);
  const fixing = step === 1;
  const fixed = step >= 2;
  const done = fixed ? 2 : 1;

  return (
    <div ref={ref}>
      <Frame label="Sample data. Some fixes need a DNS change on your side, and we say which.">
        <div className="flex items-center justify-between">
          <p className="text-sm font-bold">Setup for example.com</p>
          <span className="text-xs font-semibold text-ink-secondary tabular-nums">
            {done} of 3 done
          </span>
        </div>
        <div aria-hidden className="mt-3 h-1.5 overflow-hidden rounded-full bg-canvas-sunken">
          <m.div
            className="h-full origin-left rounded-full bg-success"
            initial={false}
            animate={{ scaleX: done / 3 }}
            transition={{ duration: 0.5, ease }}
          />
        </div>
        <ul className="mt-4 grid gap-2.5">
          <ChecklistRow
            state="ok"
            title="Webhook is receiving events"
            note="Last event 2 minutes ago"
          />
          <ChecklistRow
            state={fixed ? "ok" : "todo"}
            title="Read receipts (open tracking)"
            note={fixed ? "Turned on for example.com" : "Unlocks: Opened status on your emails"}
            action={
              fixed ? null : (
                <button
                  type="button"
                  disabled={fixing}
                  onClick={() => set(2)}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-bold text-primary-foreground transition-colors hover:bg-accent-fill-hover focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-80"
                >
                  {fixing ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
                  {fixing ? "Turning on" : "Turn on"}
                </button>
              )
            }
          />
          <ChecklistRow
            state="todo"
            title="Receiving: MX record"
            note="Needs a DNS change. We show the exact value."
          />
        </ul>
      </Frame>
    </div>
  );
}

function ChecklistRow({
  state,
  title,
  note,
  action,
}: {
  state: "ok" | "todo";
  title: string;
  note: string;
  action?: React.ReactNode;
}) {
  return (
    <li className="flex items-center gap-3 rounded-lg border border-line px-3 py-2.5">
      <span
        className={cn(
          "grid size-6 shrink-0 place-items-center rounded-full transition-colors duration-300",
          state === "ok" ? "bg-success-soft text-success-ink" : "bg-warning-soft text-warning-ink",
        )}
      >
        {state === "ok" ? (
          <Check className="size-3.5" aria-label="Done" />
        ) : (
          <AlertTriangle className="size-3.5" aria-label="Needs attention" />
        )}
      </span>
      <div className="grid min-w-0 flex-1 gap-0.5">
        <span className="text-[0.8125rem] font-semibold">{title}</span>
        <span className="text-xs text-ink-secondary">{note}</span>
      </div>
      {action}
    </li>
  );
}

/* ---------------------------------------------------------------- insights */

const domains = [
  {
    id: "all",
    label: "All domains",
    delivered: 98.6,
    opens: 41.2,
    bounce: 1.2,
    spark: [3, 4, 3.5, 5, 4.5, 6, 5.5, 7],
  },
  {
    id: "app",
    label: "example.com",
    delivered: 99.1,
    opens: 46.8,
    bounce: 0.6,
    spark: [4, 4.5, 5, 4.8, 6, 6.4, 7, 7.4],
  },
  {
    id: "shop",
    label: "shop.example.com",
    delivered: 96.9,
    opens: 33.5,
    bounce: 3.1,
    spark: [6, 5, 5.5, 4, 4.4, 3.2, 3.6, 2.6],
  },
] as const;

function sparkPath(values: readonly number[], w = 120, h = 32) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  return values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * w;
      const y = h - 3 - ((v - min) / (max - min || 1)) * (h - 6);
      return `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
}

export function InsightsVignette() {
  const [ref, seen] = useSeen<HTMLDivElement>();
  const [id, setId] = useState<(typeof domains)[number]["id"]>("all");
  const d = domains.find((x) => x.id === id)!;
  const tiles = [
    { label: "Delivered", value: d.delivered, color: "var(--success)", good: true },
    { label: "Opened (estimate)", value: d.opens, color: "var(--engaged)", good: true },
    {
      label: "Bounced",
      value: d.bounce,
      color: d.bounce > 3 ? "var(--danger)" : "var(--accent)",
      good: d.bounce <= 3,
    },
  ];
  return (
    <div ref={ref} className="grid gap-4">
      <div role="radiogroup" aria-label="Domain" className="flex flex-wrap gap-1.5">
        {domains.map((x) => (
          <button
            key={x.id}
            type="button"
            role="radio"
            aria-checked={x.id === id}
            onClick={() => setId(x.id)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-semibold transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
              x.id === id
                ? "border-accent-fill bg-accent-soft text-info-ink"
                : "border-line-strong bg-surface text-ink-secondary hover:text-ink",
            )}
          >
            {x.label}
          </button>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {tiles.map((t, i) => (
          <div
            key={t.label}
            className="grid gap-1.5 rounded-lg border border-line bg-surface p-3.5"
          >
            <span className="text-xs font-semibold text-ink-secondary">{t.label}</span>
            <span className="text-2xl font-bold tracking-[-0.02em] tabular-nums">
              <NumberFlow
                value={t.value}
                suffix="%"
                format={{ maximumFractionDigits: 1, minimumFractionDigits: 1 }}
              />
            </span>
            <svg viewBox="0 0 120 32" className="h-8 w-full" aria-hidden preserveAspectRatio="none">
              <m.path
                key={id + i}
                d={sparkPath(d.spark.map((v) => (i === 2 ? 10 - v : v)))}
                fill="none"
                stroke={t.color}
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: seen ? 1 : 0 }}
                transition={{ duration: 0.9, ease, delay: i * 0.1 }}
              />
            </svg>
          </div>
        ))}
      </div>
      <p className="text-xs text-ink-secondary">
        Sample data. Bounce and complaint rates are shown against the 4% and 0.08% thresholds, and
        open rates are labelled as estimates.
      </p>
    </div>
  );
}

/* ---------------------------------------------------------------- alerts */

export function AlertsVignette() {
  const [ref, seen] = useSeen<HTMLDivElement>();
  const { step } = useStepper([600, 1500], seen);
  return (
    <div ref={ref} className="grid gap-3">
      <div className="flex items-center justify-between gap-3 rounded-lg border border-line bg-surface p-3">
        <div className="grid gap-0.5">
          <span className="text-[0.8125rem] font-semibold">Bounce rate above 3% for 1 hour</span>
          <span className="text-xs text-ink-secondary">shop.example.com · In-app, email</span>
        </div>
        <span className="rounded-full bg-success-soft px-2 py-0.5 text-[0.6875rem] font-semibold text-success-ink">
          On
        </span>
      </div>
      <m.div
        initial={false}
        animate={reveal(step >= 1)}
        transition={{ duration: 0.35, ease }}
        className="flex items-start gap-3 rounded-lg bg-danger-soft p-3 text-danger-ink"
      >
        <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
        <div className="grid gap-0.5 text-[0.8125rem]">
          <span className="font-bold">Bounce rate is 4.1% on shop.example.com</span>
          <span>Most bounces are to one recipient domain.</span>
        </div>
      </m.div>
      <m.div
        initial={false}
        animate={reveal(step >= 2)}
        transition={{ duration: 0.35, ease }}
        className="flex items-start gap-3 rounded-lg bg-success-soft p-3 text-success-ink"
      >
        <Check className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span className="text-[0.8125rem] font-bold">Domain verified: example.com</span>
      </m.div>
    </div>
  );
}

/* ---------------------------------------------------------------- accounts */

const accounts = [
  {
    id: "acme",
    name: "Acme SaaS",
    kind: "Your account",
    domains: 3,
    sent: 18420,
    health: "Healthy",
    tone: "success",
  },
  {
    id: "bakery",
    name: "Client: Bakery",
    kind: "Client account",
    domains: 1,
    sent: 2310,
    health: "Healthy",
    tone: "success",
  },
  {
    id: "side",
    name: "Side project",
    kind: "Your account",
    domains: 2,
    sent: 640,
    health: "Needs attention",
    tone: "warning",
  },
] as const;

export function AccountsVignette() {
  const [id, setId] = useState<(typeof accounts)[number]["id"]>("acme");
  const a = accounts.find((x) => x.id === id)!;
  return (
    <div className="grid gap-4 sm:grid-cols-[1fr_1.1fr]">
      <div role="radiogroup" aria-label="Resend account" className="grid content-start gap-1.5">
        {accounts.map((x) => (
          <button
            key={x.id}
            type="button"
            role="radio"
            aria-checked={x.id === id}
            onClick={() => setId(x.id)}
            className={cn(
              "flex items-center justify-between gap-2 rounded-lg border px-3 py-2.5 text-left transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
              x.id === id
                ? "border-accent-fill bg-accent-soft"
                : "border-line bg-surface hover:bg-canvas-sunken",
            )}
          >
            <span className="grid gap-0.5">
              <span className="text-[0.8125rem] font-semibold">{x.name}</span>
              <span className="text-xs text-ink-secondary">{x.kind}</span>
            </span>
            <span
              aria-hidden
              className={cn(
                "size-2 rounded-full",
                x.tone === "success" ? "bg-success" : "bg-warning",
              )}
            />
          </button>
        ))}
      </div>
      <div className="grid content-start gap-3 rounded-lg bg-canvas-sunken p-4">
        <p className="text-sm font-bold">{a.name}</p>
        <dl className="grid grid-cols-2 gap-3">
          <div className="grid gap-0.5">
            <dt className="text-xs text-ink-secondary">Domains</dt>
            <dd className="text-xl font-bold tabular-nums">
              <NumberFlow value={a.domains} />
            </dd>
          </div>
          <div className="grid gap-0.5">
            <dt className="text-xs text-ink-secondary">Emails, 30 days</dt>
            <dd className="text-xl font-bold tabular-nums">
              <NumberFlow value={a.sent} />
            </dd>
          </div>
        </dl>
        <span
          className={cn(
            "w-fit rounded-full px-2.5 py-1 text-xs font-semibold",
            a.tone === "success"
              ? "bg-success-soft text-success-ink"
              : "bg-warning-soft text-warning-ink",
          )}
        >
          {a.health}
        </span>
      </div>
      <p className="text-xs text-ink-secondary sm:col-span-2">
        Sample data. Try switching accounts.
      </p>
    </div>
  );
}

/* ---------------------------------------------------------------- AI */

const tones = {
  Friendly:
    "Hi Jane, thanks for flagging this. I've sent you a corrected invoice, so you'll have it in a minute.",
  Direct: "Jane, the invoice is corrected and on its way to you now.",
  Formal:
    "Dear Jane, thank you for bringing this to our attention. A corrected invoice has been issued.",
} as const;

export function AiVignette() {
  const [tone, setTone] = useState<keyof typeof tones>("Friendly");
  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-2">
        <span className="rounded-full bg-info-soft px-2 py-0.5 text-[0.6875rem] font-semibold text-info-ink">
          Billing
        </span>
        <span className="text-xs text-ink-secondary">
          Jane asks why her invoice shows the wrong plan.
        </span>
      </div>
      <div role="radiogroup" aria-label="Tone" className="flex flex-wrap gap-1.5">
        {(Object.keys(tones) as (keyof typeof tones)[]).map((t) => (
          <button
            key={t}
            type="button"
            role="radio"
            aria-checked={t === tone}
            onClick={() => setTone(t)}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
              t === tone
                ? "border-accent-fill bg-accent-soft text-info-ink"
                : "border-line-strong text-ink-secondary hover:text-ink",
            )}
          >
            {t === tone ? <Sparkles className="size-3" aria-hidden /> : null}
            {t}
          </button>
        ))}
      </div>
      <m.p
        key={tone}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease }}
        className="min-h-[5.5rem] rounded-lg bg-canvas-sunken p-3 text-[0.8125rem] leading-5 text-ink-secondary"
      >
        {tones[tone]}
      </m.p>
      <p className="text-xs text-ink-secondary">
        A draft only. You review it, and nothing is sent automatically.
      </p>
    </div>
  );
}
