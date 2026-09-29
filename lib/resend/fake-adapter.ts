import "server-only";

import { createHash } from "node:crypto";

import { buildRawMime } from "@/lib/mail/fake-mime";
import { ResendError, mapResendError } from "./errors";
import type { ResendAdapter } from "./adapter";
import type {
  CreatedResendWebhook,
  Page,
  PageOptions,
  ResendApiKey,
  ResendAutomation,
  ResendBroadcast,
  ResendContactDetail,
  ResendContactProperty,
  ResendContactTopic,
  ResendDnsRecord,
  ResendDomain,
  ReceivedEmailEventData,
  ResendEventType,
  ResendReceivedAttachment,
  ResendReceivedEmail,
  ResendSegment,
  SendEmailInput,
  SendEmailResult,
  ResendTemplate,
  ResendTopic,
  UpdateDomainInput,
} from "./types";

/**
 * In-memory Resend for dev and tests (RESEND_MODE=fake). Deterministic and configurable through
 * the API key string, so the whole connect flow can be exercised in a browser without Resend.
 *
 * Key format: `re_<team>[_<trigger>…]`. The first segment after `re_` is the Resend *team*: two
 * keys with the same team are the same account (dedupe test). Later segments switch behaviour:
 *
 *   sending    sending-only key: every management call is forbidden (401 restricted_api_key)
 *   invalid    Resend rejects the key (invalid_api_key)
 *   ratelimit  every call answers 429
 *   slotfull   the account has no free webhook slot (creating a webhook is a validation error)
 *   nodomains  the team has no domains (identity then comes from the API key list)
 *   allgood    (first use of the team) every domain verified, both trackings on, receiving on:
 *              a fully green checklist
 *   manycontacts  (first use of the team) 230 contacts instead of 12, to exercise pagination
 *   ratelimitsync the first `templates` list call answers 429 once, then works (sync backoff)
 *
 * Anything else is a healthy full-access key. Webhook signing secrets are real Svix secrets, so
 * signatures made with them verify through the same path as live mode.
 */

export type FakeBehavior = "full" | "sending" | "invalid" | "ratelimit";

export type FakeWebhook = {
  id: string;
  endpoint: string;
  events: ResendEventType[];
  signingSecret: string;
  createdAt: string;
};

export type FakeContact = ResendContactDetail & {
  /** Resend ids of the segments the contact belongs to. */
  segmentIds: string[];
  topics: ResendContactTopic[];
};

export type FakeTeam = {
  id: string;
  domains: ResendDomain[];
  /** DNS records by domain id; a domain without an entry has none. */
  records: Record<string, ResendDnsRecord[]>;
  apiKeys: ResendApiKey[];
  webhooks: Map<string, FakeWebhook>;
  segments: ResendSegment[];
  topics: ResendTopic[];
  contactProperties: ResendContactProperty[];
  templates: ResendTemplate[];
  contacts: FakeContact[];
  broadcasts: ResendBroadcast[];
  automations: ResendAutomation[];
  /** Calls that already answered the one-off 429 (`ratelimitsync`). */
  throttled: Set<string>;
  /** Emails accepted by `sendEmail`, oldest first (tests and scripts inspect them). */
  sent: FakeSentEmail[];
  /** Idempotency key -> email id, so a retried send returns the same email. */
  idempotency: Map<string, string>;
  /** Received (inbound) emails by Resend id. */
  received: Map<string, FakeReceivedEmail>;
};

export type FakeSentEmail = {
  id: string;
  messageId: string;
  input: SendEmailInput;
  idempotencyKey: string;
  createdAt: string;
  status: "sent" | "scheduled" | "canceled";
};

export type FakeReceivedEmail = {
  meta: Omit<ResendReceivedEmail, "raw" | "attachments"> & {
    attachments: ResendReceivedEmail["attachments"];
  };
  raw: Buffer;
  files: { meta: ResendReceivedAttachment; content: Buffer }[];
};

/** Resend Pro allows 5 webhook endpoints (PRD §5.1). */
export const FAKE_WEBHOOK_LIMIT = 5;

type Store = {
  teams: Map<string, FakeTeam>;
  counter: number;
  /** Downloadable files by URL (`download_url`s handed out by the fake). */
  files: Map<string, Buffer>;
};
const globalForFake = globalThis as unknown as { __wisemailFakeResend?: Store };

/** Shared through `globalThis`: Next.js may load this module more than once per process. */
export function fakeStore(): Store {
  globalForFake.__wisemailFakeResend ??= { teams: new Map(), counter: 0, files: new Map() };
  return globalForFake.__wisemailFakeResend;
}

export function resetFakeResend(): void {
  globalForFake.__wisemailFakeResend = undefined;
}

export function parseFakeKey(apiKey: string): { team: string; flags: Set<string> } {
  const parts = apiKey.replace(/^re_/, "").split("_").filter(Boolean);
  const [team = "default", ...flags] = parts;
  return { team: team.toLowerCase(), flags: new Set(flags.map((f) => f.toLowerCase())) };
}

function behaviorOf(flags: Set<string>): FakeBehavior {
  if (flags.has("invalid")) return "invalid";
  if (flags.has("ratelimit")) return "ratelimit";
  if (flags.has("sending")) return "sending";
  return "full";
}

const sha = (s: string) => createHash("sha256").update(s).digest();

const pad = (n: number, width = 3) => String(n).padStart(width, "0");

function dnsRecords(
  name: string,
  status: string,
  options: { receiving?: boolean; receivingStatus?: string; dkimStatus?: string } = {},
): ResendDnsRecord[] {
  const records: ResendDnsRecord[] = [
    {
      record: "SPF",
      type: "MX",
      name: `send.${name}`,
      value: "feedback-smtp.us-east-1.amazonses.com",
      ttl: "Auto",
      priority: 10,
      status,
    },
    {
      record: "SPF",
      type: "TXT",
      name: `send.${name}`,
      value: "v=spf1 include:amazonses.com ~all",
      ttl: "Auto",
      status,
    },
    {
      record: "DKIM",
      type: "TXT",
      name: `resend._domainkey.${name}`,
      value: "p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQ...",
      ttl: "Auto",
      status: options.dkimStatus ?? status,
    },
  ];
  if (options.receiving) {
    records.push({
      record: "Receiving",
      type: "MX",
      name,
      value: "inbound-smtp.us-east-1.amazonaws.com",
      ttl: "Auto",
      priority: 10,
      status: options.receivingStatus ?? status,
    });
  }
  return records;
}

/**
 * Deterministic data per team, so sync, checklist and UI work is repeatable. Three domains in
 * mixed states: #1 verified with receiving but open tracking off, #2 verified without receiving,
 * #3 still pending DNS (`allgood` makes everything green instead).
 */
function seedTeam(id: string, flags: Set<string>): FakeTeam {
  const slug = id.replace(/[^a-z0-9]/g, "") || "team";
  const good = flags.has("allgood");
  const at = (day: number) => new Date(Date.UTC(2026, 0, day)).toISOString();

  const d1 = `dom_${slug}_1`;
  const d2 = `dom_${slug}_2`;
  const d3 = `dom_${slug}_3`;
  const n1 = `${slug}.example.com`;
  const n2 = `mail.${slug}.example.com`;
  const n3 = `news.${slug}.example.com`;
  const cap = (receiving: boolean) => ({ sending: true, receiving });

  const domains: ResendDomain[] = flags.has("nodomains")
    ? []
    : [
        {
          id: d1,
          name: n1,
          status: "verified",
          region: "us-east-1",
          createdAt: "2026-01-01T00:00:00.000Z",
          openTracking: good,
          clickTracking: true,
          capabilities: cap(true),
        },
        {
          id: d2,
          name: n2,
          status: "verified",
          region: "us-east-1",
          createdAt: at(15),
          openTracking: true,
          clickTracking: true,
          capabilities: cap(good),
        },
        {
          id: d3,
          name: n3,
          status: good ? "verified" : "pending",
          region: "eu-west-1",
          createdAt: at(30),
          openTracking: true,
          clickTracking: true,
          capabilities: cap(good),
        },
      ];
  const records: Record<string, ResendDnsRecord[]> = flags.has("nodomains")
    ? {}
    : {
        [d1]: dnsRecords(n1, "verified", { receiving: true }),
        [d2]: dnsRecords(n2, "verified", { receiving: good }),
        [d3]: dnsRecords(n3, good ? "verified" : "pending", {
          receiving: good,
          dkimStatus: good ? "verified" : "pending",
        }),
      };

  const segments: ResendSegment[] = [
    { id: `seg_${slug}_1`, name: "Newsletter", createdAt: at(10) },
    { id: `seg_${slug}_2`, name: "Customers", createdAt: at(11) },
    { id: `seg_${slug}_3`, name: "Beta testers", createdAt: at(12) },
  ];
  const topics: ResendTopic[] = [
    {
      id: `top_${slug}_1`,
      name: "Product updates",
      description: "Release notes and new features",
      defaultSubscription: "opt_in",
      createdAt: at(10),
    },
    {
      id: `top_${slug}_2`,
      name: "Weekly digest",
      description: null,
      defaultSubscription: "opt_out",
      createdAt: at(11),
    },
  ];
  const contactCount = flags.has("manycontacts") ? 230 : 12;
  const contacts: FakeContact[] = Array.from({ length: contactCount }, (_, i) => {
    const n = i + 1;
    return {
      id: `con_${slug}_${pad(n)}`,
      email: `person${n}@${slug}-customers.example`,
      firstName: `Person`,
      lastName: `${n}`,
      unsubscribed: n % 7 === 0,
      createdAt: at(1 + (n % 28)),
      properties: { company: `Company ${n % 4}`, ...(n % 3 === 0 ? { plan_seats: n } : {}) },
      // Everyone is in Newsletter, every other contact is a Customer, every fifth a Beta tester.
      segmentIds: [
        segments[0]!.id,
        ...(n % 2 === 0 ? [segments[1]!.id] : []),
        ...(n % 5 === 0 ? [segments[2]!.id] : []),
      ],
      topics: [
        { id: topics[0]!.id, subscription: "opt_in" as const },
        ...(n % 4 === 0 ? [{ id: topics[1]!.id, subscription: "opt_in" as const }] : []),
      ],
    };
  });
  const tpl = (n: number, name: string, status: "draft" | "published"): ResendTemplate => ({
    id: `tpl_${slug}_${n}`,
    name,
    alias: name.toLowerCase().replace(/\s+/g, "-"),
    status,
    createdAt: at(5 + n),
    updatedAt: at(6 + n),
    subject: `${name} for {{{NAME}}}`,
    from: `no-reply@${n1}`,
    replyTo: null,
    html: `<h1>${name}</h1><p>Hello {{{NAME}}}</p>`,
    text: `${name}: hello {{{NAME}}}`,
    variables: [{ key: "NAME", type: "string", fallbackValue: "there" }],
  });

  return {
    id,
    domains,
    records,
    // The team's original key (it exists before any key is pasted into Wisemail).
    apiKeys: [
      {
        id: `key_${slug}_1`,
        name: "Onboarding",
        createdAt: "2025-12-01T00:00:00.000Z",
        lastUsedAt: null,
      },
      {
        id: `key_${slug}_2`,
        name: "Production app",
        createdAt: at(20),
        lastUsedAt: at(28),
      },
    ],
    webhooks: new Map(),
    segments,
    topics,
    contactProperties: [
      {
        id: `prop_${slug}_1`,
        key: "company",
        type: "string",
        fallbackValue: null,
        createdAt: at(10),
      },
      {
        id: `prop_${slug}_2`,
        key: "plan_seats",
        type: "number",
        fallbackValue: 1,
        createdAt: at(11),
      },
    ],
    templates: [
      tpl(1, "Welcome", "published"),
      tpl(2, "Password reset", "published"),
      tpl(3, "Invoice", "draft"),
    ],
    contacts,
    broadcasts: [
      {
        id: `bro_${slug}_1`,
        name: "September newsletter",
        segmentId: segments[0]!.id,
        status: "sent",
        createdAt: at(18),
        scheduledAt: null,
        sentAt: at(19),
        from: `News <news@${n1}>`,
        subject: "What's new in September",
        previewText: "Three things we shipped",
        replyTo: null,
        topicId: topics[0]!.id,
        html: "<p>September</p>",
        text: "September",
      },
      {
        id: `bro_${slug}_2`,
        name: "October draft",
        segmentId: segments[1]!.id,
        status: "draft",
        createdAt: at(25),
        scheduledAt: null,
        sentAt: null,
        from: `News <news@${n1}>`,
        subject: "Coming in October",
        previewText: null,
        replyTo: null,
        topicId: null,
        html: "<p>October</p>",
        text: null,
      },
    ],
    automations: [
      {
        id: `aut_${slug}_1`,
        name: "Welcome series",
        status: "enabled",
        createdAt: at(12),
        updatedAt: at(13),
        steps: [
          { key: "trigger", type: "trigger", config: { event_name: "contact.created" } },
          { key: "wait", type: "delay", config: { duration: "1 day" } },
          { key: "send", type: "send_email", config: { template_id: `tpl_${slug}_1` } },
        ],
        connections: [
          { from: "trigger", to: "wait", type: "default" },
          { from: "wait", to: "send", type: "default" },
        ],
      },
      {
        id: `aut_${slug}_2`,
        name: "Win-back",
        status: "disabled",
        createdAt: at(14),
        updatedAt: null,
        steps: [{ key: "trigger", type: "trigger", config: { event_name: "user.inactive" } }],
        connections: [],
      },
    ],
    throttled: new Set(),
    sent: [],
    idempotency: new Map(),
    received: new Map(),
  };
}

function teamFor(id: string, flags: Set<string>): FakeTeam {
  const store = fakeStore();
  let team = store.teams.get(id);
  if (!team) {
    team = seedTeam(id, flags);
    store.teams.set(id, team);
  }
  return team;
}

function fail(name: string, message: string, statusCode: number, headers?: Record<string, string>) {
  return mapResendError({ name, message, statusCode }, headers ?? null);
}

function paginate<T extends { id: string }>(items: T[], options: PageOptions = {}): Page<T> {
  // Newest first, like Resend.
  const sorted = [...items].sort((a, b) => b.id.localeCompare(a.id));
  const start = options.after ? sorted.findIndex((i) => i.id === options.after) + 1 : 0;
  const limit = options.limit ?? 20;
  const data = sorted.slice(start, start + limit);
  const hasMore = start + limit < sorted.length;
  return { data, hasMore, nextCursor: hasMore ? data.at(-1)?.id : undefined };
}

export class FakeResendAdapter implements ResendAdapter {
  private readonly team: FakeTeam;
  private readonly flags: Set<string>;
  private readonly behavior: FakeBehavior;
  private readonly ownKey: ResendApiKey;

  constructor(apiKey: string) {
    const parsed = parseFakeKey(apiKey);
    this.flags = parsed.flags;
    this.behavior = behaviorOf(parsed.flags);
    this.team = teamFor(parsed.team, parsed.flags);
    // The pasted key itself shows up in the team's key list, like in Resend.
    const hash = sha(apiKey).toString("hex").slice(0, 12);
    this.ownKey = {
      id: `key_${hash}`,
      name: "Wisemail",
      createdAt: "2026-06-01T00:00:00.000Z",
      lastUsedAt: null,
    };
  }

  private guard(managementOnly = true) {
    if (this.behavior === "invalid") throw fail("invalid_api_key", "API key is invalid", 400);
    if (this.behavior === "ratelimit") {
      throw fail("rate_limit_exceeded", "Too many requests", 429, { "retry-after": "1" });
    }
    if (this.behavior === "sending" && managementOnly) {
      throw fail("restricted_api_key", "This API key is restricted to only send emails", 401);
    }
  }

  async listDomains(options?: PageOptions) {
    this.guard();
    return paginate(this.team.domains, options);
  }

  async listApiKeys(options?: PageOptions) {
    this.guard();
    const keys = this.team.apiKeys.some((k) => k.id === this.ownKey.id)
      ? this.team.apiKeys
      : [...this.team.apiKeys, this.ownKey];
    return paginate(keys, options);
  }

  async createWebhook(input: {
    endpoint: string;
    events: readonly ResendEventType[];
  }): Promise<CreatedResendWebhook> {
    this.guard();
    if (this.flags.has("slotfull") || this.team.webhooks.size >= FAKE_WEBHOOK_LIMIT) {
      throw fail(
        "validation_error",
        "You have reached the maximum number of webhooks for your plan. Delete one and try again.",
        422,
      );
    }
    const store = fakeStore();
    const id = `wh_fake_${String(++store.counter).padStart(4, "0")}`;
    const signingSecret = `whsec_${sha(`fake-signing-secret:${this.team.id}:${id}`).toString("base64")}`;
    this.team.webhooks.set(id, {
      id,
      endpoint: input.endpoint,
      events: [...input.events],
      signingSecret,
      createdAt: new Date().toISOString(),
    });
    return { id, signingSecret };
  }

  async deleteWebhook(id: string) {
    this.guard();
    if (!this.team.webhooks.delete(id)) throw fail("not_found", "Webhook not found", 404);
  }

  async getWebhook(id: string) {
    this.guard();
    const hook = this.team.webhooks.get(id);
    if (!hook) throw fail("not_found", "Webhook not found", 404);
    return { id: hook.id, endpoint: hook.endpoint, status: "enabled" as const };
  }

  async getDomain(id: string) {
    this.guard();
    const domain = this.team.domains.find((d) => d.id === id);
    if (!domain) throw fail("not_found", "Domain not found", 404);
    return { ...domain, records: this.team.records[id] ?? [] };
  }

  async updateDomain(input: UpdateDomainInput) {
    this.guard();
    const domain = this.team.domains.find((d) => d.id === input.id);
    if (!domain) throw fail("not_found", "Domain not found", 404);
    if (input.openTracking !== undefined) domain.openTracking = input.openTracking;
    if (input.clickTracking !== undefined) domain.clickTracking = input.clickTracking;
  }

  async listSegments(options?: PageOptions) {
    this.guard();
    return paginate(this.team.segments, options);
  }

  async listTopics() {
    this.guard();
    return { data: [...this.team.topics], hasMore: false, nextCursor: undefined };
  }

  async listContactProperties(options?: PageOptions) {
    this.guard();
    return paginate(this.team.contactProperties, options);
  }

  async listTemplates(options?: PageOptions) {
    this.guard();
    if (this.flags.has("ratelimitsync") && !this.team.throttled.has("templates")) {
      this.team.throttled.add("templates");
      throw fail("rate_limit_exceeded", "Too many requests", 429, { "retry-after": "1" });
    }
    return paginate(this.team.templates, options);
  }

  async getTemplate(id: string) {
    this.guard();
    const template = this.team.templates.find((t) => t.id === id);
    if (!template) throw fail("not_found", "Template not found", 404);
    return { ...template };
  }

  async listContacts(options?: PageOptions & { segmentId?: string }) {
    this.guard();
    const contacts = options?.segmentId
      ? this.team.contacts.filter((c) => c.segmentIds.includes(options.segmentId!))
      : this.team.contacts;
    return paginate(contacts, options);
  }

  async getContact(id: string) {
    this.guard();
    const contact = this.team.contacts.find((c) => c.id === id);
    if (!contact) throw fail("not_found", "Contact not found", 404);
    const { segmentIds, topics, ...detail } = contact;
    void segmentIds;
    void topics;
    return { ...detail };
  }

  async listContactTopics(contactId: string, options?: PageOptions) {
    this.guard();
    const contact = this.team.contacts.find((c) => c.id === contactId);
    if (!contact) throw fail("not_found", "Contact not found", 404);
    return paginate(contact.topics, options);
  }

  async listBroadcasts(options?: PageOptions) {
    this.guard();
    return paginate(this.team.broadcasts, options);
  }

  async getBroadcast(id: string) {
    this.guard();
    const broadcast = this.team.broadcasts.find((b) => b.id === id);
    if (!broadcast) throw fail("not_found", "Broadcast not found", 404);
    return { ...broadcast };
  }

  async listAutomations(options?: PageOptions) {
    this.guard();
    return paginate(this.team.automations, options);
  }

  async getAutomation(id: string) {
    this.guard();
    const automation = this.team.automations.find((a) => a.id === id);
    if (!automation) throw fail("not_found", "Automation not found", 404);
    return { ...automation };
  }

  async sendEmail(
    input: SendEmailInput,
    options: { idempotencyKey: string },
  ): Promise<SendEmailResult> {
    this.guard(false);
    const existing = this.team.idempotency.get(options.idempotencyKey);
    if (existing) {
      const email = this.team.sent.find((e) => e.id === existing)!;
      return { id: email.id, messageId: email.messageId };
    }
    const fromAddress = /<([^>]+)>/.exec(input.from)?.[1] ?? input.from;
    const domainName = fromAddress.slice(fromAddress.lastIndexOf("@") + 1).toLowerCase();
    const domain = this.team.domains.find((d) => d.name === domainName);
    if (!domain || domain.status !== "verified") {
      throw new ResendError(
        "resend_domain_rejected",
        `The ${domainName} domain is not verified. Please, add and verify your domain on https://resend.com/domains`,
        { status: 403, resendName: "validation_error" },
      );
    }
    if (input.to.length + (input.cc?.length ?? 0) + (input.bcc?.length ?? 0) > 50) {
      throw fail("validation_error", "Too many recipients (max 50).", 422);
    }
    const id = `em_fake_${String(++fakeStore().counter).padStart(5, "0")}`;
    const scheduled = input.scheduledAt && new Date(input.scheduledAt).getTime() > Date.now();
    const email: FakeSentEmail = {
      id,
      messageId: `<${id}@fake.resend.test>`,
      input,
      idempotencyKey: options.idempotencyKey,
      createdAt: new Date().toISOString(),
      status: scheduled ? "scheduled" : "sent",
    };
    this.team.sent.push(email);
    this.team.idempotency.set(options.idempotencyKey, id);
    return { id, messageId: email.messageId };
  }

  private sentEmail(id: string) {
    const email = this.team.sent.find((e) => e.id === id);
    if (!email) throw fail("not_found", "Email not found", 404);
    return email;
  }

  async cancelEmail(id: string) {
    this.guard(false);
    const email = this.sentEmail(id);
    if (
      email.status !== "scheduled" ||
      new Date(email.input.scheduledAt!).getTime() <= Date.now()
    ) {
      throw fail("validation_error", "Only scheduled emails can be canceled.", 422);
    }
    email.status = "canceled";
  }

  async updateScheduledEmail(input: { id: string; scheduledAt: string }) {
    this.guard(false);
    const email = this.sentEmail(input.id);
    if (
      email.status !== "scheduled" ||
      new Date(email.input.scheduledAt!).getTime() <= Date.now()
    ) {
      throw fail("validation_error", "Only scheduled emails can be rescheduled.", 422);
    }
    email.input = { ...email.input, scheduledAt: input.scheduledAt };
  }

  private receivedEmail(id: string) {
    const email = this.team.received.get(id);
    if (!email) throw fail("not_found", "Email not found", 404);
    return email;
  }

  async getReceivedEmail(id: string): Promise<ResendReceivedEmail> {
    this.guard();
    const email = this.receivedEmail(id);
    const url = `fake://raw/${this.team.id}/${id}`;
    fakeStore().files.set(url, email.raw);
    return {
      ...email.meta,
      raw: { downloadUrl: url, expiresAt: new Date(Date.now() + 3_600_000).toISOString() },
    };
  }

  async listReceivedAttachments(emailId: string) {
    this.guard();
    const email = this.receivedEmail(emailId);
    return email.files.map((f) => this.withUrl(emailId, f));
  }

  async getReceivedAttachment(emailId: string, id: string) {
    this.guard();
    const file = this.receivedEmail(emailId).files.find((f) => f.meta.id === id);
    if (!file) throw fail("not_found", "Attachment not found", 404);
    return this.withUrl(emailId, file);
  }

  private withUrl(
    emailId: string,
    file: FakeReceivedEmail["files"][number],
  ): ResendReceivedAttachment {
    const url = `fake://att/${this.team.id}/${emailId}/${file.meta.id}?n=${++fakeStore().counter}`;
    fakeStore().files.set(url, file.content);
    return {
      ...file.meta,
      downloadUrl: url,
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    };
  }

  async downloadFile(url: string) {
    const bytes = fakeStore().files.get(url);
    if (!bytes) throw fail("not_found", "The download link expired", 404);
    return Buffer.from(bytes);
  }
}

/* ------------------------------ inbound helpers (tests, scripts, dev) ------------------------------ */

export type FakeInboundInput = {
  from: string;
  to: string[];
  cc?: string[];
  subject: string;
  text?: string;
  html?: string;
  messageId?: string;
  inReplyTo?: string;
  references?: string[];
  date?: Date;
  /** Our address(es) that received it; defaults to `to`. */
  receivedFor?: string[];
  attachments?: {
    filename: string;
    contentType: string;
    content: Buffer | string;
    contentId?: string;
  }[];
};

/**
 * Creates a received email in the fake team behind `apiKey` and returns the `email.received`
 * webhook `data` Resend would send for it. Post that through the ingest route (or store it as a
 * `webhook_events` document) to run `process-event` -> `fetch-inbound`.
 */
export function createFakeReceivedEmail(
  apiKey: string,
  input: FakeInboundInput,
): { resendId: string; messageId: string; event: ReceivedEmailEventData } {
  const { team: teamId, flags } = parseFakeKey(apiKey);
  const team = teamFor(teamId, flags);
  const store = fakeStore();
  const n = ++store.counter;
  const resendId = `rcv_fake_${String(n).padStart(5, "0")}`;
  const messageId = input.messageId ?? `<${resendId}@sender.example>`;
  const createdAt = (input.date ?? new Date()).toISOString();
  const files = (input.attachments ?? []).map((a, i) => {
    const content = Buffer.isBuffer(a.content) ? a.content : Buffer.from(a.content);
    const meta: ResendReceivedAttachment = {
      id: `att_fake_${String(n).padStart(5, "0")}_${i + 1}`,
      filename: a.filename,
      size: content.length,
      contentType: a.contentType,
      contentDisposition: a.contentId ? "inline" : "attachment",
      contentId: a.contentId ?? null,
      downloadUrl: "",
      expiresAt: "",
    };
    return { meta, content };
  });
  const raw = buildRawMime({
    from: input.from,
    to: input.to,
    cc: input.cc,
    subject: input.subject,
    messageId,
    date: input.date,
    inReplyTo: input.inReplyTo,
    references: input.references,
    text: input.text,
    html: input.html,
    attachments: files.map((f, i) => ({
      filename: f.meta.filename ?? "file",
      contentType: f.meta.contentType,
      content: f.content,
      contentId: input.attachments![i]!.contentId,
    })),
  });
  const attachmentMeta = files.map((f) => ({
    id: f.meta.id,
    filename: f.meta.filename,
    size: f.meta.size,
    contentType: f.meta.contentType,
    contentId: f.meta.contentId,
    contentDisposition: f.meta.contentDisposition,
  }));
  team.received.set(resendId, {
    meta: {
      id: resendId,
      from: input.from,
      to: input.to,
      cc: input.cc ?? [],
      bcc: [],
      replyTo: [],
      receivedFor: input.receivedFor ?? input.to,
      subject: input.subject,
      messageId,
      createdAt,
      html: input.html ?? null,
      text: input.text ?? null,
      attachments: attachmentMeta,
    },
    raw,
    files,
  });
  return {
    resendId,
    messageId,
    event: {
      email_id: resendId,
      created_at: createdAt,
      from: input.from,
      to: input.to,
      cc: input.cc ?? [],
      bcc: [],
      received_for: input.receivedFor ?? input.to,
      message_id: messageId,
      subject: input.subject,
      attachments: attachmentMeta.map((a) => ({
        id: a.id,
        filename: a.filename,
        content_type: a.contentType,
        content_disposition: a.contentDisposition,
        content_id: a.contentId,
      })),
    },
  };
}

/** Simulates Resend dropping a received email (Free plan retention): later reads answer 404. */
export function expireFakeReceivedEmail(apiKey: string, resendId: string): void {
  const { team: teamId, flags } = parseFakeKey(apiKey);
  teamFor(teamId, flags).received.delete(resendId);
}

/** Emails the fake team behind `apiKey` has accepted for sending. */
export function fakeSentEmails(apiKey: string): FakeSentEmail[] {
  const { team: teamId, flags } = parseFakeKey(apiKey);
  return teamFor(teamId, flags).sent;
}
