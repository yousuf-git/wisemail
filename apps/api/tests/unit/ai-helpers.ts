import { buildAnomalyPrompt } from "@/lib/ai/prompts/anomaly";
import { buildRewritePrompt, buildSubjectsPrompt } from "@/lib/ai/prompts/compose";
import { buildDraftPrompt } from "@/lib/ai/prompts/draft";

/** One prompt bundle per non-triage feature/action, for schema round-trip tests. */
export function buildComposePromptForTest() {
  const html = "<p>i dont recieve teh invoice. Can you check</p><p>Thanks</p>";
  return [
    buildSubjectsPrompt({ subject: "Invoice", bodyHtml: html }),
    buildRewritePrompt({ action: "rewrite", bodyHtml: html, tone: "professional" }),
    buildRewritePrompt({ action: "shorten", bodyHtml: html }),
    buildRewritePrompt({ action: "grammar", bodyHtml: html }),
    buildDraftPrompt({
      subject: "Invoice",
      tone: "empathetic",
      ourName: "Sam",
      messages: [{ direction: "inbound", who: "Jane Doe", text: "Where is my invoice?" }],
    }),
    buildAnomalyPrompt({
      alert: { title: "Bounce rate", kind: "bounce_rate", observedValue: 9, threshold: 3 },
      window: { hours: 1, sent: 100, delivered: 88, bounced: 9, complained: 0 },
      previous: null,
      bounceTypes: { hard: 8, soft: 1 },
      topBounceReasons: [{ reason: "mailbox not found", count: 6 }],
      topRecipientDomains: [{ domain: "gmail.com", bounced: 7, share: 0.78 }],
      domain: "acme.test",
    }),
  ];
}
