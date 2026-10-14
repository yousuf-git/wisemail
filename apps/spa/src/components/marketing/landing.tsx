import { BellRing, Eye, KeyRound, LineChart, Sparkles, Webhook } from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/utils";
import { Compare } from "./compare";
import { faqItems } from "./faq-items";
import { Hero } from "./hero";
import { PricingPlans } from "./pricing-plans";
import { Container, SectionHeading, Tone } from "./section";

function HowItWorks() {
  const steps = [
    {
      n: "01",
      icon: KeyRound,
      title: "Paste a key",
      body: "Full-access Resend key. We validate it, then encrypt it.",
    },
    {
      n: "02",
      icon: Webhook,
      title: "Webhook, done",
      body: "Registered for you. No handlers to write or deploy.",
    },
    {
      n: "03",
      icon: Sparkles,
      title: "Live picture",
      body: "Domains sync. Every new event lands in one place.",
    },
  ];
  return (
    <Tone tone="dark" as="section" id="how" className="scroll-mt-28 py-24 sm:py-32">
      <Container className="grid gap-14">
        <SectionHeading
          eyebrow="How it works"
          title="Three steps. Still your Resend."
          description="Nothing to install. Sending keeps going through Resend, exactly as before."
        />
        <ol className="grid gap-6 md:grid-cols-3 md:gap-5">
          {steps.map((s) => (
            <li key={s.n}>
              <div className="grid h-full gap-5 rounded-[1.75rem] border border-line/70 bg-surface p-6 shadow-sm sm:p-7">
                <div className="flex items-center justify-between">
                  <span className="grid size-11 place-items-center rounded-2xl bg-accent-soft text-accent-fill">
                    <s.icon className="size-5" aria-hidden />
                  </span>
                  <span className="font-display text-sm font-bold tracking-[0.12em] text-ink-faint">
                    {s.n}
                  </span>
                </div>
                <div className="grid gap-2">
                  <h3 className="font-display text-xl font-bold tracking-[-0.02em]">{s.title}</h3>
                  <p className="text-sm leading-6 text-ink-secondary">{s.body}</p>
                </div>
              </div>
            </li>
          ))}
        </ol>
      </Container>
    </Tone>
  );
}

function Features() {
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
            <span key={i} className="flex-1 rounded-t-md bg-accent/25" style={{ height: `${h}%` }} />
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

  return (
    <Tone tone="light" as="section" id="product" className="scroll-mt-28 py-24 sm:py-32">
      <Container className="grid gap-14">
        <SectionHeading
          eyebrow="Product"
          title="The layer Resend leaves to you."
          description="Keep sending through Resend. Wisemail turns the events into a desk you can actually use."
        />
        <div className="grid gap-4 md:grid-cols-12">
          {tiles.map((t) => (
            <article
              key={t.title}
              className={cn(
                "flex min-h-[220px] flex-col rounded-[1.75rem] border border-line/70 bg-surface p-6 shadow-sm sm:p-7",
                t.span,
              )}
            >
              <div className="mb-4 grid size-10 place-items-center rounded-2xl bg-accent-soft text-accent-fill">
                <t.icon className="size-5" aria-hidden />
              </div>
              <h3 className="font-display text-xl font-bold tracking-[-0.02em]">{t.title}</h3>
              <p className="mt-2 max-w-[32ch] text-sm leading-6 text-ink-secondary">{t.body}</p>
              {t.visual}
            </article>
          ))}
        </div>
      </Container>
    </Tone>
  );
}

function Faq() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <Tone tone="light" as="section" id="faq" className="scroll-mt-28 py-24 sm:py-32">
      <Container className="grid gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-16">
        <SectionHeading
          eyebrow="FAQ"
          title="Straight answers."
          description="Resend stays your sender. Wisemail is the desk on top."
        />
        <ul className="grid gap-2">
          {faqItems.map((item, i) => {
            const isOpen = open === i;
            return (
              <li key={item.q} className="rounded-2xl border border-line/70 bg-surface">
                <button
                  type="button"
                  aria-expanded={isOpen}
                  className="flex w-full items-start justify-between gap-4 px-5 py-4 text-left"
                  onClick={() => setOpen(isOpen ? null : i)}
                >
                  <span className="text-sm font-semibold sm:text-base">{item.q}</span>
                  <span
                    aria-hidden
                    className={cn(
                      "text-ink-muted tabular-nums transition-transform duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)]",
                      isOpen && "rotate-45",
                    )}
                  >
                    +
                  </span>
                </button>
                <div
                  className={cn(
                    "grid transition-[grid-template-rows,opacity] duration-[450ms] ease-[cubic-bezier(0.2,0.8,0.2,1)] motion-reduce:transition-none",
                    isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
                  )}
                >
                  <div className="min-h-0 overflow-hidden">
                    <p className="border-t border-line px-5 py-4 text-sm leading-6 text-ink-secondary">
                      {item.a}
                    </p>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </Container>
    </Tone>
  );
}

export function LandingPage() {
  return (
    <>
      <Hero />
      <HowItWorks />
      <Features />
      {/* Compare sticks; Pricing slides over it. */}
      <div className="relative">
        <div className="sticky top-0 z-0">
          <Compare />
        </div>

        <Tone
          tone="light"
          as="section"
          id="pricing"
          className="relative z-10 scroll-mt-28 overflow-hidden rounded-t-[2rem] py-24 shadow-[0_-24px_64px_-28px_rgba(0,0,0,0.35)] sm:py-32"
        >
          <img
            src="/marketing/pricing-grain.jpg"
            alt=""
            aria-hidden
            className="pointer-events-none absolute inset-0 size-full object-cover opacity-30 mix-blend-multiply"
          />
          <Container className="relative grid gap-12">
            <SectionHeading
              eyebrow="Pricing"
              title="Start free. Upgrade when you need to."
              description="One plan covers transactional and marketing on your Resend account."
            />
            <PricingPlans />
          </Container>
        </Tone>
      </div>
      <Faq />
    </>
  );
}
