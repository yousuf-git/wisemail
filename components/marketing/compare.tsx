import { Check, Minus } from "lucide-react";

import { PLAN_CATALOG } from "@/lib/billing/plans";
import { Reveal } from "./reveal";
import { Container, SectionHeading } from "./section";
import { costExamples } from "./pricing-data";
import { formatRetention, usd } from "./format";

const rows = [
  {
    topic: "History",
    resend: "Kept for your Resend plan's retention window (30 days on Free).",
    wise: `Kept from ${formatRetention(PLAN_CATALOG.free.limits.retentionDays)} on Free up to ${formatRetention(PLAN_CATALOG.agency.limits.retentionDays)} on Agency.`,
  },
  {
    topic: "Webhook events",
    resend: "Pushed to your endpoint. You build the handler and the store.",
    wise: "Webhook registered for you. Every event stored and shown as a timeline per email.",
  },
  {
    topic: "Inbound mail",
    resend: "The received event has metadata. Body and attachments are fetched separately.",
    wise: "A threaded inbox with attachments, read state and replies.",
  },
  {
    topic: "Read receipts on replies",
    resend: "Open and click events exist. You wire them up yourself.",
    wise: "Sent, Delivered, Opened, Clicked on every email, with a notification on open.",
  },
  {
    topic: "Several accounts",
    resend: "Each account is its own dashboard.",
    wise: "All connected accounts, domains and keys in one view, grouped into projects.",
  },
  {
    topic: "Insights and alerts",
    resend: "Logs and per-email status.",
    wise: "Rates by domain and period, deliverability thresholds, rule-based alerts.",
  },
  {
    topic: "Cleaning up",
    resend: "Sent and received emails can't be deleted in the dashboard or API.",
    wise: "Trash with undo, bulk and filter-based delete. Resend keeps its own copy.",
  },
];

export function Compare() {
  return (
    <section id="compare" className="scroll-mt-20 py-20 sm:py-28">
      <Container className="grid gap-12">
        <Reveal>
          <SectionHeading
            eyebrow="Resend alone vs Resend + Wisemail"
            title="Not a replacement. A layer on top."
            description="You keep sending through Resend, from your own account, and you keep paying Resend. Wisemail reads from that account and adds what the dashboard leaves to you."
          />
        </Reveal>

        <Reveal>
          <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-md">
            <div className="hidden grid-cols-[0.8fr_1.1fr_1.3fr] border-b border-line bg-canvas-sunken text-xs font-semibold tracking-[0.06em] text-ink-secondary uppercase md:grid">
              <div className="px-5 py-3" />
              <div className="px-5 py-3">Resend on its own</div>
              <div className="px-5 py-3 text-accent-fill">With Wisemail</div>
            </div>
            <dl>
              {rows.map((r) => (
                <div
                  key={r.topic}
                  className="grid gap-1 border-b border-line px-5 py-4 last:border-b-0 md:grid-cols-[0.8fr_1.1fr_1.3fr] md:gap-0 md:p-0"
                >
                  <dt className="text-sm font-bold md:px-5 md:py-4">{r.topic}</dt>
                  <dd className="flex items-start gap-2 text-sm leading-6 text-ink-secondary md:px-5 md:py-4">
                    <Minus className="mt-1 size-3.5 shrink-0 text-ink-muted" aria-hidden />
                    <span>
                      <span className="sr-only">Resend on its own: </span>
                      {r.resend}
                    </span>
                  </dd>
                  <dd className="flex items-start gap-2 text-sm leading-6 md:bg-accent-soft/50 md:px-5 md:py-4">
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
          <p className="mt-3 max-w-[80ch] text-xs leading-5 text-ink-secondary">
            Based on Resend&apos;s dashboard and API as of September 2026. Resend ships often, so
            check resend.com for what it offers today.
          </p>
        </Reveal>

        <div className="grid items-start gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
          <Reveal className="grid gap-3">
            <h3 className="text-2xl leading-tight font-extrabold tracking-[-0.02em] text-balance">
              A fraction of what you already pay Resend
            </h3>
            <p className="max-w-[46ch] text-base leading-7 text-ink-secondary">
              Wisemail is an add-on, so we price it against your email bill. Three examples, using
              Resend&apos;s public prices and our plans.
            </p>
            <p className="max-w-[46ch] text-sm leading-6 text-ink-secondary">
              We meter tracked emails: each email sent, each broadcast recipient and each email
              received. Resend meters marketing by contacts, so a big broadcast counts here even
              though it doesn&apos;t change your Resend plan.
            </p>
          </Reveal>
          <Reveal delay={0.1}>
            <div
              className="overflow-x-auto rounded-xl border border-line bg-surface shadow-md"
              role="region"
              aria-label="Cost examples"
              tabIndex={0}
            >
              <table className="w-full min-w-[480px] text-left text-sm">
                <thead className="bg-canvas-sunken text-xs font-semibold text-ink-secondary">
                  <tr>
                    <th scope="col" className="px-4 py-3">
                      Your setup
                    </th>
                    <th scope="col" className="px-4 py-3 text-right">
                      Resend
                    </th>
                    <th scope="col" className="px-4 py-3 text-right">
                      Wisemail
                    </th>
                    <th scope="col" className="px-4 py-3 text-right">
                      Share
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {costExamples.map((e) => (
                    <tr key={e.label} className="border-t border-line">
                      <td className="px-4 py-3.5 leading-5">
                        {e.label}
                        <span className="block text-xs text-ink-secondary">
                          About {e.trackedEmails.toLocaleString("en-US")} tracked emails a month
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-right tabular-nums">
                        {usd(e.resendBillUsd)}
                      </td>
                      <td className="px-4 py-3.5 text-right font-bold tabular-nums">
                        {usd(e.wisemailUsd)}
                        <span className="block text-xs font-normal text-ink-secondary">
                          {PLAN_CATALOG[e.plan].label}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-right tabular-nums">{e.sharePct}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs leading-5 text-ink-secondary">
              Monthly prices per month. Resend&apos;s own plans range in price, these are the tiers
              that fit each example.
            </p>
          </Reveal>
        </div>
      </Container>
    </section>
  );
}
