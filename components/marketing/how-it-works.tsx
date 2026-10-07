import { KeyRound, Sparkles, Webhook } from "lucide-react";

import { Reveal } from "./reveal";
import { Container, SectionHeading, Tone } from "./section";

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

export function HowItWorks() {
  return (
    <Tone tone="dark" as="section" id="how" className="scroll-mt-28 py-24 sm:py-32">
      <Container className="grid gap-14">
        <Reveal>
          <SectionHeading
            eyebrow="How it works"
            title="Three steps. Still your Resend."
            description="Nothing to install. Sending keeps going through Resend, exactly as before."
          />
        </Reveal>

        <ol className="grid gap-6 md:grid-cols-3 md:gap-5">
          {steps.map((s, i) => (
            <li key={s.n}>
              <Reveal delay={i * 0.08} className="h-full">
                <div className="group relative grid h-full gap-5 overflow-hidden rounded-[1.75rem] border border-line/70 bg-surface p-6 shadow-sm transition-shadow duration-500 ease-soft hover:shadow-md sm:p-7">
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
              </Reveal>
            </li>
          ))}
        </ol>
      </Container>
    </Tone>
  );
}
