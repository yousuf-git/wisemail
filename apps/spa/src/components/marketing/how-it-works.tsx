import { Check, KeyRound, Loader2, Webhook } from "lucide-react";
import * as m from "motion/react-m";

import { Container, easeOut, Reveal, SectionHeading, Tone } from "./section";

const steps = [
  {
    title: "Paste a Resend key",
    body: "A full-access key. We check it, encrypt it, and only ever show you the last four characters.",
    visual: (
      <div className="flex items-center gap-2 rounded-full border border-line bg-canvas py-1.5 pr-1.5 pl-4">
        <KeyRound className="size-4 shrink-0 text-ink-muted" aria-hidden />
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-ink-secondary">
          re_••••••••••••8Kq2
        </span>
        <span className="rounded-full bg-ink px-3 py-1.5 text-xs font-semibold text-canvas">
          Connect
        </span>
      </div>
    ),
  },
  {
    title: "We register the webhook",
    body: "Signed, verified and deduplicated on our side. Nothing to deploy, no handler to maintain.",
    visual: (
      <div className="grid gap-2 rounded-2xl border border-line bg-canvas p-3.5 text-xs">
        <span className="flex items-center gap-2 font-mono text-ink-secondary">
          <Webhook className="size-3.5 shrink-0" aria-hidden />
          <span className="truncate">/ingest/resend/conn_7Hk2</span>
        </span>
        <span className="flex items-center gap-1.5 font-semibold text-success-ink">
          <Check className="size-3.5" aria-hidden /> Receiving all event types
        </span>
      </div>
    ),
  },
  {
    title: "Your history fills in",
    body: "Domains, contacts, templates and past email sync in the background. New events land live.",
    visual: (
      <div className="grid gap-2 rounded-2xl border border-line bg-canvas p-3.5 text-xs">
        {[
          ["Domains", "3"],
          ["Contacts", "1,284"],
          ["Emails", "Syncing"],
        ].map(([k, v]) => (
          <span key={k} className="flex items-center justify-between">
            <span className="text-ink-muted">{k}</span>
            <span className="flex items-center gap-1.5 font-semibold tabular-nums">
              {v === "Syncing" ? <Loader2 className="size-3 animate-spin motion-reduce:animate-none" aria-hidden /> : null}
              {v}
            </span>
          </span>
        ))}
      </div>
    ),
  },
];

export function HowItWorks() {
  return (
    <Tone tone="light" as="section" id="how" className="relative scroll-mt-24 py-24 sm:py-32">
      <Container className="grid gap-16">
        <Reveal>
          <SectionHeading
            title="Connected before your coffee cools."
            description="Three steps, about a minute. Sending keeps going through Resend exactly as before."
          />
        </Reveal>

        <div className="relative">
          {/* The thread that ties the steps together draws itself as you arrive. */}
          <svg
            aria-hidden
            className="absolute top-6 left-0 hidden h-4 w-full text-line-strong md:block"
            viewBox="0 0 1000 16"
            preserveAspectRatio="none"
          >
            <m.path
              d="M20 8 C 250 -4, 420 20, 520 8 S 820 -4, 980 8"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              initial={{ pathLength: 0 }}
              whileInView={{ pathLength: 1 }}
              viewport={{ once: true, amount: 0.6 }}
              transition={{ duration: 1.6, ease: easeOut }}
            />
          </svg>

          <ol className="relative grid gap-12 md:grid-cols-3 md:gap-8">
            {steps.map((s, i) => (
              <li key={s.title}>
              <Reveal delay={0.15 + i * 0.15} className="grid content-start gap-5">
                <span className="grid size-12 place-items-center rounded-full border border-line bg-surface font-display text-base font-bold shadow-sm tabular-nums">
                  {i + 1}
                </span>
                <div className="grid gap-2">
                  <h3 className="font-display text-xl font-bold tracking-[-0.025em]">{s.title}</h3>
                  <p className="max-w-[34ch] text-[0.9375rem] leading-7 text-ink-secondary">
                    {s.body}
                  </p>
                </div>
                <div className="max-w-[20rem]">{s.visual}</div>
              </Reveal>
              </li>
            ))}
          </ol>
        </div>
      </Container>
    </Tone>
  );
}
