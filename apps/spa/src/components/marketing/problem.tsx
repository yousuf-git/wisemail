import { ArrowRight, Check, Eye, MousePointerClick, Send, Truck } from "lucide-react";
import { useScroll, useTransform, type MotionValue } from "motion/react";
import * as m from "motion/react-m";
import { useRef } from "react";

import { cn } from "@/lib/utils";
import { Container, Reveal, Tone } from "./section";

const STATEMENT =
  "Resend is a great way to send. But once an email leaves, its story scatters. Events go to an endpoint you still have to build. Replies arrive as bare metadata. Every account hides behind its own login.";

const ANSWER = "Wisemail gathers all of it back into one calm desk.";

function Word({
  children,
  progress,
  range,
}: {
  children: string;
  progress: MotionValue<number>;
  range: [number, number];
}) {
  const opacity = useTransform(progress, range, [0.16, 1]);
  return (
    <m.span style={{ opacity }} className="inline">
      {children}{" "}
    </m.span>
  );
}

/** The statement fills in as you read it: scroll-linked, so it moves only when you do. */
function ScrollStatement() {
  const ref = useRef<HTMLParagraphElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 85%", "end 45%"] });
  const words = STATEMENT.split(" ");
  return (
    <p
      ref={ref}
      className="max-w-[24ch] font-display text-[clamp(1.75rem,4.2vw,3.25rem)] leading-[1.12] font-bold tracking-[-0.035em] sm:max-w-[26ch]"
    >
      <span className="sr-only">{STATEMENT}</span>
      <span aria-hidden>
        {words.map((w, i) => (
          <Word
            key={i}
            progress={scrollYProgress}
            range={[i / words.length, (i + 1) / words.length]}
          >
            {w}
          </Word>
        ))}
      </span>
    </p>
  );
}

const PAYLOAD = `{
  "type": "email.opened",
  "created_at": "2026-10-14T09:44:12Z",
  "data": {
    "email_id": "4ef9a417-02e9-4d39",
    "to": ["maya@northwind.studio"],
    "subject": "Invoice 2291 is ready"
  }
}`;

const TIMELINE = [
  { label: "Sent", detail: "via billing@northwind.studio", time: "09:41:02", icon: Send, tone: "info" },
  { label: "Delivered", detail: "accepted by gmail.com", time: "09:41:05", icon: Truck, tone: "success" },
  { label: "Opened", detail: "first open, iPhone Mail", time: "09:44:12", icon: Eye, tone: "engaged" },
  { label: "Clicked", detail: "Pay invoice", time: "09:45:30", icon: MousePointerClick, tone: "engaged" },
] as const;

const toneClass = {
  info: "bg-info-soft text-info-ink",
  success: "bg-success-soft text-success-ink",
  engaged: "bg-engaged-soft text-engaged-ink",
} as const;

export function Problem() {
  return (
    <Tone
      tone="light"
      as="section"
      className="relative z-10 -mt-10 rounded-t-[2.5rem] bg-surface py-24 shadow-[0_-24px_60px_-30px_rgb(60_45_20_/0.3)] sm:-mt-14 sm:rounded-t-[3.5rem] sm:py-36"
    >
      <Container className="grid gap-16 sm:gap-24">
        <div className="grid gap-8">
          <ScrollStatement />
          <Reveal>
            <p className="font-display text-[clamp(1.375rem,2.6vw,2rem)] leading-tight font-bold tracking-[-0.03em] text-accent-fill">
              {ANSWER}
            </p>
          </Reveal>
        </div>

        <div className="grid items-center gap-6 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1.1fr)] lg:gap-8">
          <Reveal className="grid gap-3">
            <p className="text-sm font-semibold text-ink-muted">What Resend sends your server</p>
            <pre className="overflow-x-auto rounded-[1.5rem] border border-line bg-canvas-sunken p-5 font-mono text-[0.75rem] leading-6 text-ink-secondary sm:p-6 sm:text-[0.8125rem]">
              <code>{PAYLOAD}</code>
            </pre>
            <p className="text-sm text-ink-muted">
              One of hundreds a day. Catch it, verify it, store it, join it to the others.
            </p>
          </Reveal>

          <div className="flex justify-center" aria-hidden>
            <span className="grid size-12 rotate-90 place-items-center rounded-full border border-line bg-surface text-ink-muted shadow-sm lg:rotate-0">
              <ArrowRight className="size-5" />
            </span>
          </div>

          <Reveal delay={0.12} className="grid gap-3">
            <p className="text-sm font-semibold text-ink-muted">What you see in Wisemail</p>
            <div className="rounded-[1.5rem] border border-line bg-surface p-5 shadow-md sm:p-6">
              <div className="flex items-center justify-between gap-3 border-b border-line pb-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">Invoice 2291 is ready</p>
                  <p className="truncate text-xs text-ink-muted">maya@northwind.studio</p>
                </div>
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-engaged-soft px-2.5 py-1 text-[0.6875rem] font-semibold text-engaged-ink">
                  <Check className="size-3" aria-hidden /> Read
                </span>
              </div>
              <ol className="mt-4 grid gap-0">
                {TIMELINE.map((t, i) => (
                  <m.li
                    key={t.label}
                    className="relative grid grid-cols-[auto_1fr_auto] items-center gap-3 py-2"
                    initial={{ opacity: 0, x: -10 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true, amount: 0.6 }}
                    transition={{ duration: 0.5, delay: 0.25 + i * 0.12 }}
                  >
                    {i < TIMELINE.length - 1 ? (
                      <span
                        aria-hidden
                        className="absolute top-[2.375rem] -bottom-2 left-[0.9375rem] w-px bg-line-strong"
                      />
                    ) : null}
                    <span
                      className={cn("relative grid size-[1.875rem] place-items-center rounded-full", toneClass[t.tone])}
                    >
                      <t.icon className="size-3.5" aria-hidden />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold">{t.label}</span>
                      <span className="block truncate text-xs text-ink-muted">{t.detail}</span>
                    </span>
                    <span className="font-mono text-[0.6875rem] text-ink-faint tabular-nums">
                      {t.time}
                    </span>
                  </m.li>
                ))}
              </ol>
            </div>
            <p className="text-sm text-ink-muted">
              Joined, threaded and kept, long after Resend's own log window closes.
            </p>
          </Reveal>
        </div>
      </Container>
    </Tone>
  );
}
