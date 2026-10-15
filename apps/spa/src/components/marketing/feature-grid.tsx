import { CalendarClock, ChevronDown, Lock, Paperclip } from "lucide-react";

import { cn } from "@/lib/utils";
import { Container, Reveal, SectionHeading, Tone } from "./section";

const accounts = [
  { name: "Northwind Labs", domains: 3, state: "Healthy", tone: "bg-success-soft text-success-ink" },
  { name: "Bakehouse", domains: 2, state: "Healthy", tone: "bg-success-soft text-success-ink" },
  { name: "Tiny Lab", domains: 1, state: "Needs DNS", tone: "bg-warning-soft text-warning-ink" },
];

const members = [
  { initials: "AO", name: "Ada Owusu", role: "Owner", hue: "bg-engaged-soft text-engaged-ink" },
  { initials: "RK", name: "Rafael Kim", role: "Developer", hue: "bg-info-soft text-info-ink" },
  { initials: "SN", name: "Sofia Nunes", role: "Support · Bakehouse", hue: "bg-warning-soft text-warning-ink" },
];

function Cell({
  className,
  title,
  body,
  children,
}: {
  className?: string;
  title: string;
  body: string;
  children: React.ReactNode;
}) {
  return (
    <article
      className={cn(
        "relative flex min-h-[19rem] flex-col justify-between gap-8 overflow-hidden rounded-[2rem] border p-7 sm:p-8",
        className,
      )}
    >
      <div className="grid max-w-[30ch] gap-2">
        <h3 className="font-display text-xl font-bold tracking-[-0.025em] sm:text-2xl">{title}</h3>
        <p className="text-[0.9375rem] leading-7 opacity-80">{body}</p>
      </div>
      {children}
    </article>
  );
}

export function FeatureGrid() {
  return (
    <Tone tone="light" as="section" className="bg-canvas-sunken py-24 sm:py-32">
      <Container className="grid gap-14">
        <Reveal>
          <SectionHeading
            title="Built for people who run more than one thing."
            description="Freelancers with ten side projects. Agencies with a Resend account per client. Teams who share one inbox."
          />
        </Reveal>

        <div className="grid gap-4 md:grid-cols-6">
          <Reveal className="md:col-span-4">
            <Cell
              className="h-full border-accent/20 bg-[linear-gradient(135deg,var(--accent-soft),var(--surface)_70%)]"
              title="Every Resend account, one login"
              body="Connect as many accounts as your plan allows and group their domains into projects."
            >
              <ul className="grid gap-2 sm:max-w-[28rem]">
                {accounts.map((a) => (
                  <li
                    key={a.name}
                    className="flex items-center gap-3 rounded-2xl border border-line bg-surface/90 px-4 py-3 shadow-sm"
                  >
                    <span className="grid size-8 place-items-center rounded-xl bg-canvas-sunken font-display text-xs font-bold">
                      {a.name[0]}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{a.name}</span>
                      <span className="block text-xs text-ink-muted">
                        {a.domains} {a.domains === 1 ? "domain" : "domains"}
                      </span>
                    </span>
                    <span className={cn("rounded-full px-2.5 py-0.5 text-[0.6875rem] font-semibold", a.tone)}>
                      {a.state}
                    </span>
                  </li>
                ))}
              </ul>
            </Cell>
          </Reveal>

          <Reveal className="md:col-span-2" delay={0.08}>
            <Tone tone="dark" className="h-full rounded-[2rem]">
              <Cell
                className="h-full border-line bg-[radial-gradient(80%_60%_at_100%_100%,color-mix(in_oklab,var(--glow)_18%,transparent),transparent_70%)]"
                title="Your key stays yours"
                body="AES-256-GCM with a key per record. Decrypted only on the server, never sent to a browser."
              >
                <span className="grid size-16 place-items-center rounded-2xl border border-line bg-surface text-glow shadow-md">
                  <Lock className="size-7" aria-hidden />
                </span>
              </Cell>
            </Tone>
          </Reveal>

          <Reveal className="md:col-span-2" delay={0.04}>
            <Cell
              className="h-full border-line bg-surface"
              title="Roles that fit the team"
              body="Owner, Admin, Developer, Support or Viewer, optionally limited to one project."
            >
              <ul className="grid gap-2.5">
                {members.map((p) => (
                  <li key={p.name} className="flex items-center gap-3">
                    <span
                      className={cn(
                        "grid size-8 shrink-0 place-items-center rounded-full text-[0.625rem] font-bold",
                        p.hue,
                      )}
                    >
                      {p.initials}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{p.name}</span>
                    <span className="truncate text-xs text-ink-muted">{p.role}</span>
                  </li>
                ))}
              </ul>
            </Cell>
          </Reveal>

          <Reveal className="md:col-span-4" delay={0.12}>
            <Cell
              className="h-full border-glow/25 bg-[linear-gradient(160deg,var(--surface)_40%,var(--glow-soft))]"
              title="Write from any sender, on any domain"
              body="Rich text, HTML with live preview, or a Resend template. Schedule it, attach files, send a test first."
            >
              <div className="grid gap-0 overflow-hidden rounded-2xl border border-line bg-surface shadow-md sm:max-w-[32rem]">
                <div className="flex items-center gap-2 border-b border-line px-4 py-2.5 text-xs">
                  <span className="text-ink-muted">From</span>
                  <span className="font-semibold">Ada at Northwind &lt;ada@northwind.studio&gt;</span>
                  <ChevronDown className="ml-auto size-3.5 text-ink-muted" aria-hidden />
                </div>
                <div className="flex items-center gap-2 border-b border-line px-4 py-2.5 text-xs">
                  <span className="text-ink-muted">To</span>
                  <span className="rounded-full bg-canvas-sunken px-2 py-0.5 font-medium">
                    hello@bakehouse.co
                  </span>
                </div>
                <p className="px-4 py-3 text-[0.8125rem] leading-6 text-ink-secondary">
                  Hi Priya, the photos look great. Here is the final layout for Friday's send.
                </p>
                <div className="flex items-center gap-2 border-t border-line px-4 py-2.5 text-xs">
                  <span className="inline-flex min-w-0 items-center gap-1 truncate rounded-full bg-canvas-sunken px-2 py-0.5 whitespace-nowrap text-ink-secondary">
                    <Paperclip className="size-3" aria-hidden /> layout-v3.pdf
                  </span>
                  <span className="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-full bg-ink px-3 py-1 font-semibold whitespace-nowrap text-canvas">
                    <CalendarClock className="size-3" aria-hidden /> Send Friday 08:00
                  </span>
                </div>
              </div>
            </Cell>
          </Reveal>
        </div>
      </Container>
    </Tone>
  );
}
