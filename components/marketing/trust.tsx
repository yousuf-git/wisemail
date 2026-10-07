import { KeyRound, ShieldCheck, Trash2 } from "lucide-react";

import { Reveal } from "./reveal";
import { Container, SectionHeading, Tone } from "./section";

const items = [
  {
    icon: KeyRound,
    title: "Keys encrypted",
    body: "AES-256-GCM per record. Last four only in the browser.",
  },
  {
    icon: ShieldCheck,
    title: "Signed webhooks",
    body: "Every event verified. Duplicates dropped before they count.",
  },
  {
    icon: Trash2,
    title: "You can leave",
    body: "Delete mail, disconnect, or wipe the workspace anytime.",
  },
];

export function Trust() {
  return (
    <Tone tone="light" as="section" id="security" className="scroll-mt-28 py-24 sm:py-32">
      <Container className="grid gap-12">
        <Reveal>
          <SectionHeading eyebrow="Trust" title="A key to your email. Treated that way." />
        </Reveal>
        <ul className="grid gap-4 md:grid-cols-3">
          {items.map((it, i) => (
            <li key={it.title}>
              <Reveal delay={i * 0.07} className="h-full">
                <div className="grid h-full gap-3 rounded-[1.5rem] border border-line/70 bg-surface p-6">
                  <it.icon className="size-5 text-accent-fill" aria-hidden />
                  <h3 className="font-display text-lg font-bold tracking-[-0.02em]">{it.title}</h3>
                  <p className="text-sm leading-6 text-ink-secondary">{it.body}</p>
                </div>
              </Reveal>
            </li>
          ))}
        </ul>
      </Container>
    </Tone>
  );
}
