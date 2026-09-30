import { FileClock, KeyRound, ShieldCheck, Sparkles, Trash2, UsersRound } from "lucide-react";

import { Reveal } from "./reveal";
import { Container, SectionHeading } from "./section";

const items = [
  {
    icon: KeyRound,
    title: "Keys stay encrypted",
    body: "Resend keys and webhook secrets are encrypted with AES-256-GCM, each with its own data key. They never go to your browser. You see the last four characters.",
  },
  {
    icon: ShieldCheck,
    title: "Verified webhooks only",
    body: "Every incoming event is signature-checked against your connection's secret, and duplicates are dropped before they count.",
  },
  {
    icon: UsersRound,
    title: "Roles and client access",
    body: "Owner, Admin, Developer, Support and Viewer. On Team and Agency, scope a member to a single project so a client sees only theirs.",
  },
  {
    icon: FileClock,
    title: "An audit log",
    body: "Connections, keys, sends, rules and member changes are recorded on Team and Agency.",
  },
  {
    icon: Trash2,
    title: "You can take it back",
    body: "Delete emails for good, remove a connection and its synced data, or delete the workspace. Removing a connection also removes our webhook from Resend.",
  },
  {
    icon: Sparkles,
    title: "AI you control",
    body: "Off for Free, switchable per workspace and per feature. Quoted history, signatures and attachments are not sent to the model.",
  },
];

export function Trust() {
  return (
    <section
      id="security"
      className="scroll-mt-20 border-y border-line bg-canvas-sunken py-20 sm:py-28"
    >
      <Container className="grid gap-12">
        <Reveal>
          <SectionHeading
            eyebrow="Security and trust"
            title="You are handing us a key to your email. We treat it that way."
            description="A full-access Resend key can do real things, so the basics are built in rather than promised."
          />
        </Reveal>
        <ul className="grid gap-x-12 gap-y-8 md:grid-cols-2 lg:grid-cols-3">
          {items.map((it, i) => (
            <li key={it.title} className="contents">
              <Reveal delay={(i % 3) * 0.07}>
                <div className="grid gap-2 border-t border-line-strong pt-4">
                  <h3 className="flex items-center gap-2.5 text-base font-bold">
                    <it.icon className="size-[18px] text-accent-fill" aria-hidden />
                    {it.title}
                  </h3>
                  <p className="text-sm leading-6 text-ink-secondary">{it.body}</p>
                </div>
              </Reveal>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}
