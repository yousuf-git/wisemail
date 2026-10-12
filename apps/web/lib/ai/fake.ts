import type { FakePayload, PromptBundle } from "@/lib/ai/prompts/types";
import type { TriageCategory, TriagePriority, TriageSentiment } from "@/lib/ai/types";

/**
 * Deterministic stand-in for the model (`AI_MODE=fake`, tests and local development): the same
 * input always gives the same output, shaped like the real schemas, and it reads the input so
 * flows are visibly grounded ("Re: ..." quotes the last message). `[[ai-fail]]` anywhere in the
 * input makes the call fail, to exercise release-on-error paths.
 */

export const FAKE_FAIL_MARKER = "[[ai-fail]]";

const words = (text: string, n: number) => text.replace(/\s+/g, " ").trim().split(" ").slice(0, n);
const cap = (s: string) => (s ? s[0]!.toUpperCase() + s.slice(1) : s);
const firstName = (who: string) => (who.split(/[\s@<]/)[0] ?? "").replace(/[^\p{L}'-]/gu, "");

function triage(p: Extract<FakePayload, { kind: "triage" }>) {
  const text = `${p.subject}\n${p.body}`.toLowerCase();
  const has = (re: RegExp) => re.test(text);
  let category: TriageCategory = "other";
  if (has(/out of office|automatic reply|auto-?reply|undeliverable|delivery status/))
    category = "auto_reply";
  else if (has(/unsubscribe|lottery|winner|crypto|click here|limited offer/)) category = "spam";
  else if (has(/invoice|payment|refund|billing|charge|receipt/)) category = "billing";
  else if (has(/pricing|quote|demo|partnership|enterprise|proposal/)) category = "sales";
  else if (has(/help|issue|problem|error|broken|can'?t|cannot|not working|support|bug/))
    category = "support";

  let priority: TriagePriority = "normal";
  if (has(/urgent|asap|immediately|outage|is down|emergency/)) priority = "urgent";
  else if (has(/deadline|blocked|by today|by tomorrow/)) priority = "high";
  else if (category === "spam" || category === "auto_reply") priority = "low";

  let sentiment: TriageSentiment = "neutral";
  if (has(/angry|frustrated|unacceptable|disappointed|terrible|awful|broken|worst/))
    sentiment = "negative";
  else if (has(/thanks|thank you|great|love|appreciate|awesome/)) sentiment = "positive";

  const lead = words(p.body || p.subject, 22).join(" ");
  return {
    category,
    priority,
    sentiment,
    summary: lead ? `${cap(lead)}${/[.!?]$/.test(lead) ? "" : "."}` : "Empty message.",
  };
}

function draft(p: Extract<FakePayload, { kind: "draft" }>) {
  const name = firstName(p.theirName);
  const topic = words(p.lastMessage, 8).join(" ");
  const opener = name ? `Hi ${name},` : "Hi there,";
  const body: Record<string, string> = {
    friendly: `Thanks so much for reaching out about "${topic}". Happy to help, and I'm on it now.`,
    professional: `Thank you for your message regarding "${topic}". I am reviewing it and will respond with details shortly.`,
    concise: `Got it: "${topic}". I'll follow up shortly.`,
    empathetic: `I'm sorry for the trouble around "${topic}". I understand how frustrating that is, and I'm looking into it right away.`,
  };
  return { paragraphs: [opener, body[p.tone] ?? body.friendly!] };
}

const OPENERS: Record<string, string> = {
  friendly: "Hope you're doing well! ",
  professional: "Thank you for your time. ",
  concise: "",
  empathetic: "I understand this matters to you. ",
};

const TYPOS: [RegExp, string][] = [
  [/\bteh\b/gi, "the"],
  [/\brecieve\b/gi, "receive"],
  [/\bdont\b/gi, "don't"],
  [/\bcant\b/gi, "can't"],
  [/\bi\b/g, "I"],
  [/\bthier\b/gi, "their"],
];

function fixGrammar(paragraph: string) {
  let out = paragraph.replace(/\s{2,}/g, " ").trim();
  for (const [re, to] of TYPOS) out = out.replace(re, to);
  out = out.replace(/(^|[.!?]\s+)([a-z])/g, (_m, a: string, b: string) => a + b.toUpperCase());
  return /[.!?:]$/.test(out) ? out : `${out}.`;
}

function compose(p: Extract<FakePayload, { kind: "compose" }>) {
  const paragraphs = p.body
    .split(/\n{1,}/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (p.action === "subjects") {
    const topic =
      words(p.subject || p.body, 5)
        .join(" ")
        .replace(/[.!?,:;]+$/, "") || "your message";
    return {
      suggestions: [
        cap(topic),
        `Quick question: ${topic}`,
        `Following up on ${topic}`,
        `${cap(topic)}: next steps`,
      ].map((s) => s.slice(0, 80)),
    };
  }
  if (p.action === "shorten") {
    const sentences = paragraphs
      .flatMap((s) => s.match(/[^.!?]+[.!?]*/g) ?? [s])
      .map((s) => s.trim());
    const keep = sentences.slice(0, Math.max(1, Math.ceil(sentences.length / 2)));
    return { paragraphs: [keep.join(" ") || "…"] };
  }
  if (p.action === "grammar") {
    return { paragraphs: (paragraphs.length ? paragraphs : ["…"]).map(fixGrammar) };
  }
  const opener = OPENERS[p.tone ?? "friendly"] ?? "";
  const out = (paragraphs.length ? paragraphs : ["…"]).map(fixGrammar);
  out[0] = `${opener}${out[0]}`;
  return { paragraphs: out };
}

function anomaly(p: Extract<FakePayload, { kind: "anomaly" }>) {
  const f = p.facts as unknown as import("@/lib/ai/prompts/anomaly").AnomalyFacts;
  const rate = f.window.sent ? ((f.window.bounced / f.window.sent) * 100).toFixed(1) : "0.0";
  const parts = [
    `${f.alert.title}: ${f.window.bounced} of ${f.window.sent} emails bounced (${rate}%) in the last ${f.window.hours === 1 ? "hour" : `${f.window.hours} hours`}${f.domain ? ` on ${f.domain}` : ""}.`,
  ];
  const top = f.topRecipientDomains[0];
  if (top && top.share >= 0.5) {
    parts.push(
      `${Math.round(top.share * 100)}% of those bounces went to ${top.domain}, so the problem is probably on that side rather than with your domain.`,
    );
  }
  const reason = f.topBounceReasons[0];
  if (reason) parts.push(`The most common reason was "${reason.reason}" (${reason.count}).`);
  parts.push(
    f.bounceTypes.hard >= f.bounceTypes.soft
      ? "Mostly hard bounces: remove those addresses from your list before sending again."
      : "Mostly soft bounces: they usually clear on their own, so watch the next hour before acting.",
  );
  return { explanation: parts.join(" ") };
}

export function fakeOutput(payload: FakePayload): unknown {
  switch (payload.kind) {
    case "triage":
      return triage(payload);
    case "draft":
      return draft(payload);
    case "compose":
      return compose(payload);
    case "anomaly":
      return anomaly(payload);
  }
}

export const estimateTokens = (text: string) => Math.max(1, Math.ceil(text.length / 4));

export function fakeInputText(bundle: Pick<PromptBundle<unknown>, "system" | "user">) {
  return `${bundle.system}\n${bundle.user}`;
}
