import { BellRing, Check, Eye, LayoutGrid, LineChart, Sparkles, Users } from "lucide-react";

import { Reveal } from "./reveal";
import { Container, Eyebrow, SectionHeading } from "./section";
import {
  AccountsVignette,
  AiVignette,
  AlertsVignette,
  ChecklistVignette,
  InsightsVignette,
  ReceiptsVignette,
} from "./vignettes";
import { cn } from "@/lib/utils";

function Split({
  eyebrow,
  title,
  body,
  points,
  reverse,
  children,
}: {
  eyebrow: string;
  title: string;
  body: string;
  points: string[];
  reverse?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
      <Reveal className={cn("grid gap-4", reverse && "lg:order-2")}>
        <Eyebrow>{eyebrow}</Eyebrow>
        <h3 className="text-2xl leading-tight font-extrabold tracking-[-0.02em] text-balance sm:text-3xl">
          {title}
        </h3>
        <p className="max-w-[52ch] text-base leading-7 text-ink-secondary">{body}</p>
        <ul className="mt-1 grid gap-2.5">
          {points.map((p) => (
            <li key={p} className="flex items-start gap-2.5 text-[0.9375rem] leading-6">
              <Check className="mt-1 size-4 shrink-0 text-success-ink" aria-hidden />
              <span>{p}</span>
            </li>
          ))}
        </ul>
      </Reveal>
      <Reveal delay={0.1} className={cn(reverse && "lg:order-1")}>
        {children}
      </Reveal>
    </div>
  );
}

function Tile({
  icon: Icon,
  title,
  body,
  className,
  children,
}: {
  icon: typeof Eye;
  title: string;
  body: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Reveal
      className={cn(
        "grid content-start gap-4 rounded-xl border border-line bg-surface p-5 shadow-md sm:p-6",
        className,
      )}
    >
      <div className="grid gap-1.5">
        <div className="flex items-center gap-2">
          <span className="grid size-8 place-items-center rounded-[10px] bg-accent-soft text-accent-fill">
            <Icon className="size-4" aria-hidden />
          </span>
          <h3 className="text-lg font-bold tracking-[-0.01em]">{title}</h3>
        </div>
        <p className="text-sm leading-6 text-ink-secondary">{body}</p>
      </div>
      {children}
    </Reveal>
  );
}

const alsoIncluded = [
  ["Composer", "Send from any verified domain, with an HTML preview and scheduled sends."],
  [
    "Inbound mail",
    "Threads, attachments under their real filenames, replies with correct headers.",
  ],
  ["Audience", "Contacts, segments, topics, templates and broadcasts across accounts."],
  ["Domains", "DNS checks for SPF, DKIM, DMARC and MX, with a note when a record drifts."],
  ["Trash with undo", "Clear out test mail and noise. Resend keeps its own copy, and we say so."],
  ["Projects and roles", "Group domains per product or client, and scope members to a project."],
] as const;

export function Features() {
  return (
    <section
      id="features"
      className="scroll-mt-20 border-y border-line bg-canvas-sunken py-20 sm:py-28"
    >
      <Container className="grid gap-24">
        <Reveal>
          <SectionHeading
            eyebrow="What you get"
            title="The parts of Resend you never had time to set up"
            description="Resend already does the hard part of sending. Wisemail keeps what it reports and turns it into something you can use every day."
          />
        </Reveal>

        <Split
          eyebrow="Inbox and read receipts"
          title="Know when your reply was read"
          body="Replies and outbound mail carry a timeline: Sent, Delivered, Opened, Clicked. You get a notification when someone opens, so support and founders stop guessing."
          points={[
            "Threaded inbox for mail to your own domains",
            "Open and click events per email, kept after Resend's retention ends",
            "Open rates are pixel-based, so we label them as estimates",
          ]}
        >
          <ReceiptsVignette />
        </Split>

        <Split
          reverse
          eyebrow="Setup checklist"
          title="A checklist that fixes itself, where it can"
          body="Open tracking, your webhook, receiving and DNS are checked for every account. Where the Resend API allows it, one click fixes the problem. Where it doesn't, you get the exact DNS value."
          points={[
            "One-click fixes for read receipts and a missing webhook",
            "If events stop, we notice and re-register the webhook",
            "Each item says what it unlocks",
          ]}
        >
          <ChecklistVignette />
        </Split>

        <div className="grid gap-5">
          <Reveal>
            <SectionHeading
              eyebrow="Insights and control"
              title="Answers first, logs one click deeper"
            />
          </Reveal>
          <div className="grid gap-5 lg:grid-cols-6">
            <Tile
              className="lg:col-span-4"
              icon={LineChart}
              title="Insights by domain"
              body="Delivered, opened, clicked and bounced at a glance, with the change since last period."
            >
              <InsightsVignette />
            </Tile>
            <Tile
              className="lg:col-span-2"
              icon={BellRing}
              title="Alerts"
              body="Rules for bounce rates, silent connections and unverified domains. In-app and email on every plan, Slack and Discord on Pro and up."
            >
              <AlertsVignette />
            </Tile>
            <Tile
              className="lg:col-span-3"
              icon={Users}
              title="Every account in one view"
              body="Indie projects, client accounts, several products. Connect each Resend account once and switch between them."
            >
              <AccountsVignette />
            </Tile>
            <Tile
              className="lg:col-span-3"
              icon={Sparkles}
              title="AI that stays in its lane"
              body="Summaries for inbound mail, reply drafts in your tone, and plain-language explanations of alerts. Paid plans only, and admins can switch it off."
            >
              <AiVignette />
            </Tile>
          </div>
        </div>

        <Reveal>
          <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr]">
            <div className="grid content-start gap-3">
              <Eyebrow>And the rest of the desk</Eyebrow>
              <h3 className="text-2xl leading-tight font-extrabold tracking-[-0.02em] text-balance">
                Everything around the inbox, in the same place
              </h3>
            </div>
            <dl className="grid gap-x-10 gap-y-5 sm:grid-cols-2">
              {alsoIncluded.map(([t, d]) => (
                <div key={t} className="grid gap-1 border-t border-line-strong pt-3">
                  <dt className="flex items-center gap-2 text-sm font-bold">
                    <LayoutGrid className="size-3.5 text-accent-fill" aria-hidden />
                    {t}
                  </dt>
                  <dd className="text-sm leading-6 text-ink-secondary">{d}</dd>
                </div>
              ))}
            </dl>
          </div>
        </Reveal>
      </Container>
    </section>
  );
}
