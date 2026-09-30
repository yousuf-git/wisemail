import { ArrowRight, Check, Inbox, KeyRound, LineChart, Webhook } from "lucide-react";

import { Reveal } from "./reveal";
import { Container, SectionHeading } from "./section";

const steps = [
  {
    n: "1",
    icon: KeyRound,
    title: "Paste a Resend API key",
    body: "Create a full-access key in Resend and paste it in. We check it, then store it encrypted.",
    visual: (
      <div className="flex items-center justify-between gap-2 rounded-lg bg-canvas-sunken px-3 py-2.5 font-mono text-xs">
        <span className="truncate text-ink-secondary">re_••••••••••••a1b2</span>
        <span className="inline-flex items-center gap-1 rounded-full bg-success-soft px-2 py-0.5 font-sans text-[0.6875rem] font-semibold text-success-ink">
          <Check className="size-3" aria-hidden /> Valid
        </span>
      </div>
    ),
  },
  {
    n: "2",
    icon: Webhook,
    title: "We register the webhook",
    body: "Wisemail adds one webhook endpoint to your Resend account, so you never configure it by hand.",
    visual: (
      <div className="grid gap-1.5 rounded-lg bg-canvas-sunken px-3 py-2.5 font-mono text-xs text-ink-secondary">
        <span>
          <span className="text-engaged-ink">POST</span> /webhooks
        </span>
        <span className="inline-flex items-center gap-1.5 font-sans text-[0.6875rem] font-semibold text-success-ink">
          <Check className="size-3" aria-hidden /> Registered, signature verified
        </span>
      </div>
    ),
  },
  {
    n: "3",
    icon: Inbox,
    title: "Everything lands in one place",
    body: "We sync your domains and history, then every new event shows up as it happens.",
    visual: (
      <div className="flex flex-wrap gap-1.5 text-[0.6875rem] font-semibold">
        {[
          [Inbox, "Inbox"],
          [LineChart, "Insights"],
          [Webhook, "Activity"],
        ].map(([Icon, label]) => {
          const I = Icon as typeof Inbox;
          return (
            <span
              key={label as string}
              className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-2.5 py-1.5 text-info-ink"
            >
              <I className="size-3.5" aria-hidden /> {label as string}
            </span>
          );
        })}
      </div>
    ),
  },
];

export function HowItWorks() {
  return (
    <section id="how" className="scroll-mt-20 py-20 sm:py-28">
      <Container className="grid gap-12">
        <Reveal>
          <SectionHeading
            eyebrow="How it works"
            title="From API key to a full picture in three steps"
            description="There is nothing to install and no code to deploy. Sending keeps going through Resend, exactly as before."
          />
        </Reveal>
        <ol className="relative grid gap-10 md:grid-cols-3 md:gap-8">
          <span
            aria-hidden
            className="absolute top-[22px] right-[16%] left-[16%] hidden h-px bg-line-strong md:block"
          />
          {steps.map((s, i) => (
            <li key={s.n} className="relative grid content-start gap-4">
              <Reveal delay={i * 0.12} className="grid gap-4">
                <div className="flex items-center gap-3">
                  <span className="relative grid size-11 place-items-center rounded-full border border-line bg-surface text-accent-fill shadow-md">
                    <s.icon className="size-5" aria-hidden />
                    <span className="absolute -top-1 -right-1 grid size-5 place-items-center rounded-full bg-accent-fill text-[0.6875rem] font-bold text-accent-ink">
                      {s.n}
                    </span>
                  </span>
                  {i < steps.length - 1 ? (
                    <ArrowRight className="size-4 text-ink-muted md:hidden" aria-hidden />
                  ) : null}
                </div>
                <h3 className="text-lg font-bold tracking-[-0.01em]">{s.title}</h3>
                <p className="text-[0.9375rem] leading-6 text-ink-secondary">{s.body}</p>
                {s.visual}
              </Reveal>
            </li>
          ))}
        </ol>
        <Reveal>
          <p className="max-w-[70ch] border-l-2 border-line-strong pl-4 text-sm leading-6 text-ink-secondary">
            Wisemail needs a <strong className="font-semibold text-ink">full-access</strong> key so
            it can read your domains and register the webhook. Sending-only keys are rejected with
            an explanation. The webhook uses one of your Resend account&apos;s webhook slots.
          </p>
        </Reveal>
      </Container>
    </section>
  );
}
