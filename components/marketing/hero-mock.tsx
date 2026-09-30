"use client";

import { Activity, BarChart3, Bell, Check, Inbox, Send } from "lucide-react";
import * as m from "motion/react-m";

import { cn } from "@/lib/utils";
import { useSeen, useStepper } from "./motion-hooks";

const rows = [
  { who: "Jane Cooper", subject: "Invoice question", time: "9:41", unread: false, active: true },
  { who: "Ravi Patel", subject: "Can't reset my password", time: "9:12", unread: true },
  { who: "Mia Chen", subject: "Partnership idea", time: "Yesterday", unread: true },
  { who: "GitHub", subject: "[acme/web] Deploy succeeded", time: "Mon", unread: false },
];

const steps = ["Sent", "Delivered", "Opened"] as const;

const dock = [Inbox, Send, Activity, BarChart3, Bell];

/** The product in miniature: an inbox thread whose reply gets its read receipt. Sample data. */
export function HeroMock() {
  const [ref, seen] = useSeen<HTMLDivElement>(0.3);
  // step 1 = sent, 2 = delivered, 3 = opened, 4 = notification
  const { step } = useStepper([700, 1700, 3100, 3500], seen);
  const reached = Math.min(step, 3);

  return (
    <div
      ref={ref}
      role="img"
      aria-label="Illustration of the Wisemail inbox: a reply moves from Sent to Delivered to Opened."
      className="relative grid overflow-hidden rounded-xl border border-line bg-surface shadow-lg md:grid-cols-[52px_250px_minmax(0,1fr)]"
    >
      {/* dock */}
      <div
        aria-hidden
        className="hidden flex-col items-center gap-1 border-r border-line bg-canvas-sunken py-4 md:flex"
      >
        {dock.map((Icon, i) => (
          <span
            key={i}
            className={cn(
              "grid size-9 place-items-center rounded-[10px] text-ink-muted",
              i === 0 && "bg-surface text-accent-fill shadow-sm",
            )}
          >
            <Icon className="size-[18px]" />
          </span>
        ))}
        <span className="mt-auto size-2 rounded-full bg-success" />
      </div>

      {/* list */}
      <div aria-hidden className="hidden border-r border-line md:block">
        <div className="flex h-12 items-center justify-between border-b border-line px-4">
          <span className="text-sm font-bold">Inbox</span>
          <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[0.6875rem] font-semibold text-info-ink">
            2 new
          </span>
        </div>
        {rows.map((r) => (
          <div
            key={r.subject}
            className={cn(
              "grid gap-0.5 border-b border-line px-4 py-3 last:border-b-0",
              r.active && "bg-accent-soft",
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span
                className={cn("truncate text-[0.8125rem]", r.unread ? "font-bold" : "font-medium")}
              >
                {r.who}
              </span>
              <span className="shrink-0 text-[0.6875rem] text-ink-secondary">{r.time}</span>
            </div>
            <div className="flex items-center gap-2">
              {r.unread ? <span className="size-1.5 shrink-0 rounded-full bg-accent" /> : null}
              <span className="truncate text-xs text-ink-secondary">{r.subject}</span>
            </div>
          </div>
        ))}
      </div>

      {/* thread */}
      <div className="grid content-start gap-4 p-4 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="grid gap-0.5">
            <p className="text-base font-bold">Invoice question</p>
            <p className="text-xs text-ink-secondary">Jane Cooper · jane@example.com</p>
          </div>
          <span className="rounded-full bg-neutral-soft px-2.5 py-1 text-[0.6875rem] font-semibold text-neutral-ink">
            support@acme.dev
          </span>
        </div>

        <div className="rounded-lg bg-canvas-sunken p-3.5 text-[0.8125rem] leading-5 text-ink-secondary">
          Hi, the invoice I got this morning shows last month&apos;s plan. Could you check it?
        </div>

        <div className="ml-auto grid w-[92%] gap-3 rounded-lg border border-line bg-surface p-3.5 shadow-sm">
          <p className="text-[0.8125rem] leading-5">
            Thanks Jane, fixed. A corrected invoice is on its way to you now.
          </p>
          <ol className="flex flex-wrap items-center gap-x-1 gap-y-2" aria-label="Read receipt">
            {steps.map((label, i) => {
              const on = reached > i;
              const last = i === steps.length - 1;
              return (
                <li key={label} className="flex items-center gap-1">
                  <m.span
                    animate={{
                      scale: on && last && step === 3 ? [1, 1.08, 1] : 1,
                    }}
                    transition={{ duration: 0.5 }}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold transition-colors duration-300",
                      !on && "bg-canvas-sunken text-ink-muted",
                      on && !last && "bg-success-soft text-success-ink",
                      on && last && "bg-engaged-soft text-engaged-ink",
                      i === 0 && on && "bg-info-soft text-info-ink",
                    )}
                  >
                    {on ? (
                      <Check className="size-3" aria-hidden />
                    ) : (
                      <span className="size-1.5 rounded-full bg-current opacity-50" />
                    )}
                    {label}
                  </m.span>
                  {!last ? <span aria-hidden className="h-px w-3 bg-line-strong" /> : null}
                </li>
              );
            })}
            <li className="ml-1 text-xs text-ink-muted" aria-live="polite">
              {reached === 3
                ? "Opened just now"
                : reached === 2
                  ? "Delivered"
                  : reached === 1
                    ? "Sent"
                    : "Sending"}
            </li>
          </ol>
        </div>

        <m.div
          aria-hidden
          initial={false}
          animate={step >= 4 ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }}
          transition={{ duration: 0.35, ease: [0.2, 0.8, 0.2, 1] }}
          className="flex items-center gap-2.5 justify-self-end rounded-full border border-line bg-surface py-1.5 pr-4 pl-2 text-xs font-semibold shadow-md"
        >
          <span className="grid size-6 place-items-center rounded-full bg-engaged-soft text-engaged-ink">
            <Bell className="size-3.5" />
          </span>
          Jane opened your reply
        </m.div>
      </div>
    </div>
  );
}
