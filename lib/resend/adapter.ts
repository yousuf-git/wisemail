import "server-only";

import { Resend } from "resend";

import { mapResendError, ResendError, type SdkError } from "./errors";
import { singlePage, toPage } from "./pagination";
import type {
  CreatedResendWebhook,
  Page,
  PageOptions,
  ResendApiKey,
  ResendAutomation,
  ResendAutomationSummary,
  ResendBroadcast,
  ResendBroadcastSummary,
  ResendContact,
  ResendContactDetail,
  ResendContactProperty,
  ResendContactTopic,
  ResendDnsRecord,
  ResendDomain,
  ResendDomainDetail,
  ResendEventType,
  ResendSegment,
  ResendTemplate,
  ResendTemplateSummary,
  ResendTopic,
  ResendWebhookInfo,
  UpdateDomainInput,
} from "./types";

export { ResendError, isResendError, mapResendError } from "./errors";

/**
 * Every outbound Resend call goes through this interface (TRD §5). Methods return our own types
 * and throw `ResendError` with a mapped code; nothing SDK-shaped escapes. Add methods here as
 * later phases need them (sendEmail, getReceivedEmail, ...).
 */
export interface ResendAdapter {
  /** Cheap full-access probe: sending-only keys are rejected with `resend_forbidden`. */
  listDomains(options?: PageOptions): Promise<Page<ResendDomain>>;
  /** Also full-access only; used with domains for the team fingerprint. */
  listApiKeys(options?: PageOptions): Promise<Page<ResendApiKey>>;
  createWebhook(input: {
    endpoint: string;
    events: readonly ResendEventType[];
  }): Promise<CreatedResendWebhook>;
  /** Throws `resend_not_found` when it is already gone. */
  deleteWebhook(id: string): Promise<void>;
  /** Throws `resend_not_found` when the webhook no longer exists. */
  getWebhook(id: string): Promise<ResendWebhookInfo>;

  /* ------------------------------ sync reads (Phase 3) ------------------------------ */
  /** The list item lacks DNS records; `getDomain` has them. */
  getDomain(id: string): Promise<ResendDomainDetail>;
  /** Turns open/click tracking on or off. Throws `resend_not_found` for an unknown domain. */
  updateDomain(input: UpdateDomainInput): Promise<void>;
  listSegments(options?: PageOptions): Promise<Page<ResendSegment>>;
  /** Resend's topics list is not paginated: always one page. */
  listTopics(): Promise<Page<ResendTopic>>;
  listContactProperties(options?: PageOptions): Promise<Page<ResendContactProperty>>;
  listTemplates(options?: PageOptions): Promise<Page<ResendTemplateSummary>>;
  getTemplate(id: string): Promise<ResendTemplate>;
  /** `segmentId` narrows to one segment's members. */
  listContacts(options?: PageOptions & { segmentId?: string }): Promise<Page<ResendContact>>;
  /** Adds custom property values, which the list does not include. */
  getContact(id: string): Promise<ResendContactDetail>;
  listContactTopics(contactId: string, options?: PageOptions): Promise<Page<ResendContactTopic>>;
  listBroadcasts(options?: PageOptions): Promise<Page<ResendBroadcastSummary>>;
  getBroadcast(id: string): Promise<ResendBroadcast>;
  listAutomations(options?: PageOptions): Promise<Page<ResendAutomationSummary>>;
  getAutomation(id: string): Promise<ResendAutomation>;
}

type Envelope<T> = {
  data: T | null;
  error: SdkError | null;
  headers: Record<string, string> | null;
};

function unwrap<T>(res: Envelope<T>): T {
  if (res.error || res.data === null) {
    throw mapResendError(res.error ?? { message: "Empty response from Resend" }, res.headers);
  }
  return res.data;
}

async function call<T>(fn: () => Promise<Envelope<T>>): Promise<T> {
  try {
    return unwrap(await fn());
  } catch (error) {
    if (error instanceof ResendError) throw error;
    // Network failure, DNS, aborted request.
    throw new ResendError(
      "resend_unknown",
      error instanceof Error ? error.message : "Could not reach Resend.",
    );
  }
}

const pageArgs = (options: PageOptions = {}) => ({
  limit: options.limit ?? 100,
  ...(options.after ? { after: options.after } : {}),
});

/** Real Resend, one client per API key. */
export class LiveResendAdapter implements ResendAdapter {
  private readonly client: Resend;

  constructor(apiKey: string) {
    this.client = new Resend(apiKey);
  }

  listDomains(options?: PageOptions) {
    return call(() => this.client.domains.list(pageArgs(options))).then((list) =>
      toPage(list, (d) => ({
        id: d.id,
        name: d.name,
        status: d.status,
        region: d.region,
        createdAt: d.created_at,
        openTracking: d.open_tracking,
        clickTracking: d.click_tracking,
        capabilities: d.capabilities
          ? {
              sending: d.capabilities.sending === "enabled",
              receiving: d.capabilities.receiving === "enabled",
            }
          : undefined,
      })),
    );
  }

  listApiKeys(options?: PageOptions) {
    return call(() => this.client.apiKeys.list(pageArgs(options))).then((list) =>
      toPage(list, (k) => ({
        id: k.id,
        name: k.name,
        createdAt: k.created_at,
        lastUsedAt: k.last_used_at,
      })),
    );
  }

  createWebhook(input: { endpoint: string; events: readonly ResendEventType[] }) {
    return call(() =>
      this.client.webhooks.create({ endpoint: input.endpoint, events: [...input.events] }),
    ).then((w) => ({ id: w.id, signingSecret: w.signing_secret }));
  }

  async deleteWebhook(id: string) {
    await call(() => this.client.webhooks.remove(id));
  }

  async getWebhook(id: string): Promise<ResendWebhookInfo> {
    const w = await call(() => this.client.webhooks.get(id));
    return { id: w.id, endpoint: w.endpoint, status: w.status };
  }

  async getDomain(id: string): Promise<ResendDomainDetail> {
    const d = await call(() => this.client.domains.get(id));
    return {
      id: d.id,
      name: d.name,
      status: d.status,
      region: d.region,
      createdAt: d.created_at,
      openTracking: d.open_tracking,
      clickTracking: d.click_tracking,
      capabilities: {
        sending: d.capabilities?.sending === "enabled",
        receiving: d.capabilities?.receiving === "enabled",
      },
      records: d.records.map((r): ResendDnsRecord => ({
        record: r.record,
        type: r.type,
        name: r.name,
        value: r.value,
        ttl: r.ttl,
        priority: "priority" in r ? r.priority : undefined,
        status: r.status,
      })),
    };
  }

  async updateDomain(input: UpdateDomainInput) {
    await call(() =>
      this.client.domains.update({
        id: input.id,
        ...(input.openTracking === undefined ? {} : { openTracking: input.openTracking }),
        ...(input.clickTracking === undefined ? {} : { clickTracking: input.clickTracking }),
      }),
    );
  }

  listSegments(options?: PageOptions) {
    return call(() => this.client.segments.list(pageArgs(options))).then((list) =>
      toPage(list, (s): ResendSegment => ({ id: s.id, name: s.name, createdAt: s.created_at })),
    );
  }

  listTopics() {
    return call(() => this.client.topics.list()).then((list) =>
      singlePage(
        list.data.map((t): ResendTopic => ({
          id: t.id,
          name: t.name,
          description: t.description ?? null,
          defaultSubscription: t.default_subscription,
          createdAt: t.created_at,
        })),
      ),
    );
  }

  listContactProperties(options?: PageOptions) {
    return call(() => this.client.contactProperties.list(pageArgs(options))).then((list) =>
      toPage(list, (p): ResendContactProperty => ({
        id: p.id,
        key: p.key,
        type: p.type,
        fallbackValue: p.fallbackValue,
        createdAt: p.createdAt,
      })),
    );
  }

  listTemplates(options?: PageOptions) {
    return call(() => this.client.templates.list(pageArgs(options))).then((list) =>
      toPage(list, (t): ResendTemplateSummary => ({
        id: t.id,
        name: t.name,
        alias: t.alias ?? null,
        status: t.status,
        createdAt: t.created_at,
        updatedAt: t.updated_at,
      })),
    );
  }

  async getTemplate(id: string): Promise<ResendTemplate> {
    const t = await call(() => this.client.templates.get(id));
    return {
      id: t.id,
      name: t.name,
      alias: t.alias ?? null,
      status: t.status,
      createdAt: t.created_at,
      updatedAt: t.updated_at,
      subject: t.subject ?? null,
      from: t.from ?? null,
      replyTo: t.reply_to ?? null,
      html: t.html,
      text: t.text ?? null,
      variables: (t.variables ?? []).map((v) => ({
        key: v.key,
        type: v.type,
        fallbackValue: v.fallback_value ?? null,
      })),
    };
  }

  listContacts(options?: PageOptions & { segmentId?: string }) {
    return call(() =>
      this.client.contacts.list({
        ...pageArgs(options),
        ...(options?.segmentId ? { segmentId: options.segmentId } : {}),
      }),
    ).then((list) =>
      toPage(list, (c): ResendContact => ({
        id: c.id,
        email: c.email,
        firstName: c.first_name,
        lastName: c.last_name,
        unsubscribed: c.unsubscribed,
        createdAt: c.created_at,
      })),
    );
  }

  async getContact(id: string): Promise<ResendContactDetail> {
    const c = await call(() => this.client.contacts.get(id));
    return {
      id: c.id,
      email: c.email,
      firstName: c.first_name,
      lastName: c.last_name,
      unsubscribed: c.unsubscribed,
      createdAt: c.created_at,
      properties: Object.fromEntries(
        Object.entries(c.properties ?? {}).map(([key, p]) => [key, p.value]),
      ),
    };
  }

  listContactTopics(contactId: string, options?: PageOptions) {
    return call(() =>
      this.client.contacts.topics.list({ id: contactId, ...pageArgs(options) }),
    ).then((list) =>
      toPage(list, (t): ResendContactTopic => ({ id: t.id, subscription: t.subscription })),
    );
  }

  listBroadcasts(options?: PageOptions) {
    return call(() => this.client.broadcasts.list(pageArgs(options))).then((list) =>
      toPage(list, (b): ResendBroadcastSummary => ({
        id: b.id,
        name: b.name,
        segmentId: b.segment_id ?? b.audience_id ?? null,
        status: b.status,
        createdAt: b.created_at,
        scheduledAt: b.scheduled_at,
        sentAt: b.sent_at,
      })),
    );
  }

  async getBroadcast(id: string): Promise<ResendBroadcast> {
    const b = await call(() => this.client.broadcasts.get(id));
    return {
      id: b.id,
      name: b.name,
      segmentId: b.segment_id ?? b.audience_id ?? null,
      status: b.status,
      createdAt: b.created_at,
      scheduledAt: b.scheduled_at,
      sentAt: b.sent_at,
      from: b.from,
      subject: b.subject,
      previewText: b.preview_text,
      replyTo: b.reply_to,
      topicId: b.topic_id ?? null,
      html: b.html,
      text: b.text,
    };
  }

  listAutomations(options?: PageOptions) {
    return call(() => this.client.automations.list(pageArgs(options))).then((list) =>
      toPage(list, (a): ResendAutomationSummary => ({
        id: a.id,
        name: a.name,
        status: a.status,
        createdAt: a.created_at,
        updatedAt: a.updated_at,
      })),
    );
  }

  async getAutomation(id: string): Promise<ResendAutomation> {
    const a = await call(() => this.client.automations.get(id));
    return {
      id: a.id,
      name: a.name,
      status: a.status,
      createdAt: a.created_at,
      updatedAt: a.updated_at,
      steps: a.steps.map((st) => ({ key: st.key, type: st.type, config: st.config })),
      connections: a.connections.map((c) => ({ from: c.from, to: c.to, type: c.type })),
    };
  }
}
