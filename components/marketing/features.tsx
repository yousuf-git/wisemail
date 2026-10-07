import { BellRing, Eye, LineChart, Sparkles } from "lucide-react";

import { Reveal } from "./reveal";
import { Container, SectionHeading, Tone } from "./section";
import { cn } from "@/lib/utils";

const tiles = [
  {
    icon: Eye,
    title: "Read receipts",
    body: "Sent → Delivered → Opened on every reply. Notify when they open.",
    span: "md:col-span-7",
    visual: (
      <div className="mt-auto flex flex-wrap gap-2 pt-6">
        {["Sent", "Delivered", "Opened"].map((label, i) => (
          <span
            key={label}
            className={cn(
              "rounded-full px-3 py-1.5 text-xs font-semibold",
              i === 0 && "bg-info-soft text-info-ink",
              i === 1 && "bg-success-soft text-success-ink",
              i === 2 && "bg-engaged-soft text-engaged-ink",
            )}
          >
            {label}
          </span>
        ))}
      </div>
    ),
  },
  {
    icon: BellRing,
    title: "Alerts",
    body: "Bounce spikes, silent connections, unverified domains.",
    span: "md:col-span-5",
    visual: (
      <div className="mt-auto rounded-2xl bg-danger-soft/60 px-3.5 py-3 text-xs font-semibold text-danger-ink">
        Bounce rate crossed 4%
      </div>
    ),
  },
  {
    icon: LineChart,
    title: "Insights",
    body: "Delivery and engagement by domain — deltas, not raw logs.",
    span: "md:col-span-5",
    visual: (
      <div className="mt-auto flex h-16 items-end gap-1.5 pt-4" aria-hidden>
        {[40, 58, 48, 72, 64, 88, 76].map((h, i) => (
          <span
            key={i}
            className="flex-1 rounded-t-md bg-accent/25"
            style={{ height: `${h}%` }}
          />
        ))}
      </div>
    ),
  },
  {
    icon: Sparkles,
    title: "AI, optional",
    body: "Triage, drafts, plain-language alerts. Off whenever you want.",
    span: "md:col-span-7",
    visual: (
      <div className="mt-auto rounded-2xl border border-line bg-canvas-sunken/80 px-3.5 py-3 text-xs leading-5 text-ink-secondary">
        “Password reset — reply with the reset link, keep it short.”
      </div>
    ),
  },
] as const;

export function Features() {
  return (
    <Tone tone="light" as="section" id="product" className="scroll-mt-28 py-24 sm:py-32">
      <Container className="grid gap-14">
        <Reveal>
          <SectionHeading
            eyebrow="Product"
            title="The layer Resend leaves to you."
            description="Keep sending through Resend. Wisemail turns the events into a desk you can actually use."
          />
        </Reveal>

        <div className="grid gap-4 md:grid-cols-12">
          {tiles.map((t, i) => (
            <Reveal key={t.title} delay={i * 0.06} className={cn("min-h-0", t.span)}>
              <article className="flex h-full min-h-[220px] flex-col rounded-[1.75rem] border border-line/70 bg-surface p-6 shadow-sm sm:p-7">
                <div className="mb-4 grid size-10 place-items-center rounded-2xl bg-accent-soft text-accent-fill">
                  <t.icon className="size-5" aria-hidden />
                </div>
                <h3 className="font-display text-xl font-bold tracking-[-0.02em]">{t.title}</h3>
                <p className="mt-2 max-w-[32ch] text-sm leading-6 text-ink-secondary">{t.body}</p>
                {t.visual}
              </article>
            </Reveal>
          ))}
        </div>
      </Container>
    </Tone>
  );
}
