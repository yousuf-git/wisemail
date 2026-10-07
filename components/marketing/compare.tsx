import { Check, Minus } from "lucide-react";

import { Reveal } from "./reveal";
import { Container, SectionHeading, Tone } from "./section";

const rows = [
  {
    topic: "History",
    resend: "Plan retention window",
    wise: "Kept longer on every Wisemail plan",
  },
  {
    topic: "Events",
    resend: "You build the webhook store",
    wise: "Registered, stored, timeline per email",
  },
  {
    topic: "Inbound",
    resend: "Metadata + separate fetch",
    wise: "Threaded inbox with attachments",
  },
  {
    topic: "Alerts",
    resend: "Logs and per-email status",
    wise: "Rates, thresholds, rule-based alerts",
  },
];

export function Compare() {
  return (
    <Tone
      tone="dark"
      as="section"
      id="compare"
      className="flex min-h-[100dvh] scroll-mt-28 flex-col justify-center py-24 sm:py-32"
    >
      <Container className="grid gap-12">
        <Reveal>
          <SectionHeading
            eyebrow="Compare"
            title="Not a replacement. A layer on top."
            description="You keep paying Resend for sending. Wisemail adds what the dashboard leaves unfinished."
          />
        </Reveal>

        <Reveal>
          <div className="overflow-hidden rounded-[1.75rem] border border-line/70 bg-surface shadow-sm">
            <div className="hidden grid-cols-[1fr_1.1fr_1.2fr] border-b border-line bg-canvas-sunken/80 text-[0.6875rem] font-semibold tracking-[0.14em] text-ink-muted uppercase md:grid">
              <div className="px-6 py-3.5" />
              <div className="px-6 py-3.5">Resend alone</div>
              <div className="px-6 py-3.5 text-accent-fill">With Wisemail</div>
            </div>
            <dl>
              {rows.map((r) => (
                <div
                  key={r.topic}
                  className="grid gap-2 border-b border-line px-5 py-5 last:border-b-0 md:grid-cols-[1fr_1.1fr_1.2fr] md:gap-0 md:p-0"
                >
                  <dt className="text-sm font-semibold md:px-6 md:py-5">{r.topic}</dt>
                  <dd className="flex items-start gap-2 text-sm leading-6 text-ink-secondary md:px-6 md:py-5">
                    <Minus className="mt-1 size-3.5 shrink-0 text-ink-faint" aria-hidden />
                    <span>
                      <span className="sr-only">Resend alone: </span>
                      {r.resend}
                    </span>
                  </dd>
                  <dd className="flex items-start gap-2 text-sm leading-6 md:bg-accent-soft/40 md:px-6 md:py-5">
                    <Check className="mt-1 size-3.5 shrink-0 text-success-ink" aria-hidden />
                    <span>
                      <span className="sr-only">With Wisemail: </span>
                      {r.wise}
                    </span>
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </Reveal>
      </Container>
    </Tone>
  );
}
