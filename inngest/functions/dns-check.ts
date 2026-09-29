import { domainDnsCheckRequested, inngest } from "@/inngest/client";
import { enqueueAlertEvaluation } from "@/lib/jobs/send";
import { checkDomain, listDnsCheckTargets, type DnsCheckTarget } from "@/lib/services/dns-check";
import type { GetStepTools } from "inngest";
import { Types } from "mongoose";

/** Domains per step: keeps each step short while DNS lookups run one domain after the other. */
const BATCH = 15;

async function checkBatch(targets: DnsCheckTarget[]) {
  let checked = 0;
  for (const target of targets) {
    try {
      // Alerts are requested once per org at the end, not once per domain.
      const outcome = await checkDomain(new Types.ObjectId(target.orgId), target.domainId, {
        requestAlerts: false,
      });
      if (outcome) checked++;
    } catch (error) {
      console.error("[dns-check] domain failed", target.domainId, error);
    }
  }
  return checked;
}

async function run(
  step: GetStepTools<typeof inngest>,
  filter: { orgId?: string; connectionId?: string; domainId?: string },
) {
  const targets = await step.run("list-domains", () => listDnsCheckTargets(filter));
  let checked = 0;
  for (let i = 0; i < targets.length; i += BATCH) {
    checked += await step.run(`check-${i / BATCH}`, () => checkBatch(targets.slice(i, i + BATCH)));
  }
  const orgs = [...new Set(targets.map((t) => t.orgId))];
  for (const orgId of orgs) {
    await step.run(`alerts-${orgId}`, () => enqueueAlertEvaluation({ orgId }));
  }
  return { domains: targets.length, checked };
}

/**
 * Daily DNS check (TRD §2.8): SPF, DKIM, DMARC and MX of every domain against the records Resend
 * expects. Results land on `domains.dnsCheck`, refresh the checklist and request an alert
 * evaluation so DNS drift opens a `domain_status` incident.
 */
export const dnsCheckDaily = inngest.createFunction(
  { id: "dns-check", triggers: [{ cron: "17 4 * * *" }], retries: 2 },
  async ({ step }) => run(step, {}),
);

/** On demand: one domain, one connection, or one organization. */
export const dnsCheckOnDemand = inngest.createFunction(
  { id: "dns-check-on-demand", triggers: [domainDnsCheckRequested], retries: 2 },
  async ({ event, step }) => run(step, event.data),
);
