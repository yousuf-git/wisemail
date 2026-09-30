import { ChevronDown } from "lucide-react";

import {
  PLAN_CATALOG,
  FREE_GRACE_DAYS,
  FREE_OVER_ALLOWANCE_RETENTION_DAYS,
  TRIAL_DAYS,
} from "@/lib/billing/plans";
import { Reveal } from "./reveal";
import { Container, SectionHeading } from "./section";

export const faqItems = [
  {
    q: "Do I still need Resend?",
    a: "Yes. Wisemail doesn't send mail itself. It connects to your own Resend account, so you keep sending through Resend and keep paying Resend. Wisemail adds the inbox, history, insights and alerts on top.",
  },
  {
    q: "What does Wisemail need from my Resend account?",
    a: "A full-access API key, so we can read your domains and register a webhook. Sending-only keys are rejected with an explanation. The webhook uses one of your Resend account's webhook slots.",
  },
  {
    q: "Is my API key safe?",
    a: "The key is encrypted at rest with AES-256-GCM, using a separate data key for every record. It is decrypted only on the server to talk to Resend, never sent back to your browser, and you only ever see its last four characters.",
  },
  {
    q: "What counts as a tracked email?",
    a: "Each email you send, each recipient of a broadcast, and each email you receive. Delivered, opened and clicked events for the same email are included. A broadcast to 10,000 contacts counts as 10,000, even though Resend meters marketing by contacts.",
  },
  {
    q: "What happens if I go over my allowance?",
    a: `We keep collecting events, so nothing is lost. Paid plans are billed for the overage at the end of the period. On Free, after a ${FREE_GRACE_DAYS}-day grace period the emails beyond the allowance are kept for ${FREE_OVER_ALLOWANCE_RETENTION_DAYS} days instead of ${PLAN_CATALOG.free.limits.retentionDays}.`,
  },
  {
    q: "Are open rates accurate?",
    a: "Open tracking uses a tiny image, and privacy features such as Apple Mail Privacy Protection can inflate it. We label open rates as estimates and treat delivery and bounce data as the solid numbers.",
  },
  {
    q: "Can I delete emails?",
    a: "Yes. Deleting moves emails to Trash for 30 days with an undo, and Owners and Admins can delete permanently. Wisemail removes its copy and any stored files. Resend keeps its own copy until its retention ends, and the confirmation says so.",
  },
  {
    q: "What happens to my data if I disconnect or cancel?",
    a: "Removing a connection deletes our webhook in Resend and the encrypted key, and, after you confirm, the data we synced from it. If you cancel a paid plan, it runs until the period ends and then moves to Free.",
  },
  {
    q: "Does AI read my email?",
    a: "AI is for paid plans, and admins can turn it off for the whole workspace or per feature. Before text goes to the model we strip quoted history and signatures and shorten it, and attachments are never sent. Drafts are never sent automatically.",
  },
  {
    q: "Is there a free trial?",
    a: `New workspaces get Pro for ${TRIAL_DAYS} days with no card. After that you can pick a plan or stay on Free.`,
  },
];

export function Faq({
  items = faqItems,
  title = "Questions, answered plainly",
}: {
  items?: typeof faqItems;
  title?: string;
}) {
  return (
    <section id="faq" className="scroll-mt-20 py-20 sm:py-28">
      <Container className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
        <Reveal>
          <SectionHeading eyebrow="FAQ" title={title} />
        </Reveal>
        <Reveal delay={0.08}>
          <div className="divide-y divide-line border-y border-line">
            {items.map((item) => (
              <details key={item.q} className="group py-1">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-md py-4 text-left text-base font-semibold outline-none marker:hidden focus-visible:ring-[3px] focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
                  {item.q}
                  <ChevronDown
                    aria-hidden
                    className="size-4 shrink-0 text-ink-muted transition-transform duration-200 ease-soft group-open:rotate-180"
                  />
                </summary>
                <p className="pr-8 pb-4 text-[0.9375rem] leading-7 text-ink-secondary">{item.a}</p>
              </details>
            ))}
          </div>
        </Reveal>
      </Container>
    </section>
  );
}
