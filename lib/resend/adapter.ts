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
  ResendReceivedAttachment,
  ResendReceivedEmail,
  SendEmailInput,
  SendEmailResult,
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

  /* --------------------------- sending and inbound (Phase 4) --------------------------- */
  /**
   * Sends (or schedules) one email. `idempotencyKey` makes retries safe. A refusal caused by the
   * sending domain throws `resend_domain_rejected`.
   */
  sendEmail(input: SendEmailInput, options: { idempotencyKey: string }): Promise<SendEmailResult>;
  /** Cancels a scheduled email. Throws `resend_validation` / `resend_not_found` when it already went out. */
  cancelEmail(id: string): Promise<void>;
  /** Reschedules a scheduled email. */
  updateScheduledEmail(input: { id: string; scheduledAt: string }): Promise<void>;
  /** Throws `resend_not_found` when Resend no longer has the message. */
  getReceivedEmail(id: string): Promise<ResendReceivedEmail>;
  /** All attachments of a received email (pages are walked here). */
  listReceivedAttachments(emailId: string): Promise<ResendReceivedAttachment[]>;
  /** A fresh download URL for one attachment. Throws `resend_not_found` when it is gone. */
  getReceivedAttachment(emailId: string, id: string): Promise<ResendReceivedAttachment>;
  /**
   * Downloads a Resend-hosted file (raw MIME, attachment) by its `download_url`. Throws
   * `resend_not_found` for an expired or removed file and `resend_validation` past `maxBytes`.
   */
  downloadFile(url: string, options?: { maxBytes?: number }): Promise<Buffer>;
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

/** 40 MB per email is Resend's limit; raw MIME can be slightly larger with base64 overhead. */
export const DEFAULT_MAX_DOWNLOAD_BYTES = 64 * 1024 * 1024;

type SdkAttachment = {
  id: string;
  filename?: string;
  size: number;
  content_type: string;
  content_disposition: "inline" | "attachment";
  content_id?: string;
  download_url: string;
  expires_at: string;
};

const toReceivedAttachment = (a: SdkAttachment): ResendReceivedAttachment => ({
  id: a.id,
  filename: a.filename ?? null,
  size: a.size,
  contentType: a.content_type,
  contentDisposition: a.content_disposition ?? null,
  contentId: a.content_id ?? null,
  downloadUrl: a.download_url,
  expiresAt: a.expires_at,
});

/**
 * A validation or permission error that names the domain becomes `resend_domain_rejected`
 * (TRD §2.5), so the service can mark the domain and its senders unusable.
 */
export function asDomainRejection(error: unknown): unknown {
  if (
    error instanceof ResendError &&
    (error.code === "resend_validation" || error.code === "resend_forbidden") &&
    /domain/i.test(error.message) &&
    /verif|not found|not allowed|invalid/i.test(error.message)
  ) {
    return new ResendError("resend_domain_rejected", error.message, error.details);
  }
  return error;
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

  async sendEmail(input: SendEmailInput, options: { idempotencyKey: string }) {
    try {
      const res = await call(() =>
        this.client.emails.send(
          {
            from: input.from,
            to: input.to,
            ...(input.cc?.length ? { cc: input.cc } : {}),
            ...(input.bcc?.length ? { bcc: input.bcc } : {}),
            ...(input.replyTo?.length ? { replyTo: input.replyTo } : {}),
            subject: input.subject,
            ...(input.html === undefined ? {} : { html: input.html }),
            ...(input.text === undefined ? {} : { text: input.text }),
            ...(input.headers ? { headers: input.headers } : {}),
            ...(input.tags?.length ? { tags: input.tags } : {}),
            ...(input.attachments?.length ? { attachments: input.attachments } : {}),
            ...(input.scheduledAt ? { scheduledAt: input.scheduledAt } : {}),
          } as Parameters<Resend["emails"]["send"]>[0],
          { idempotencyKey: options.idempotencyKey },
        ),
      );
      return { id: res.id };
    } catch (error) {
      throw asDomainRejection(error);
    }
  }

  async cancelEmail(id: string) {
    await call(() => this.client.emails.cancel(id));
  }

  async updateScheduledEmail(input: { id: string; scheduledAt: string }) {
    await call(() => this.client.emails.update({ id: input.id, scheduledAt: input.scheduledAt }));
  }

  async getReceivedEmail(id: string): Promise<ResendReceivedEmail> {
    const e = await call(() => this.client.emails.receiving.get(id, { html_format: "cid" }));
    return {
      id: e.id,
      from: e.from,
      to: e.to,
      cc: e.cc ?? [],
      bcc: e.bcc ?? [],
      replyTo: e.reply_to ?? [],
      receivedFor: e.received_for,
      subject: e.subject,
      messageId: e.message_id,
      createdAt: e.created_at,
      html: e.html,
      text: e.text,
      raw: e.raw ? { downloadUrl: e.raw.download_url, expiresAt: e.raw.expires_at } : null,
      attachments: e.attachments.map((a) => ({
        id: a.id,
        filename: a.filename,
        size: a.size,
        contentType: a.content_type,
        contentId: a.content_id,
        contentDisposition: a.content_disposition,
      })),
    };
  }

  async listReceivedAttachments(emailId: string): Promise<ResendReceivedAttachment[]> {
    const all: ResendReceivedAttachment[] = [];
    let after: string | undefined;
    for (let page = 0; page < 20; page++) {
      const res = await call(() =>
        this.client.emails.receiving.attachments.list({
          emailId,
          limit: 100,
          ...(after ? { after } : {}),
        }),
      );
      all.push(...res.data.map(toReceivedAttachment));
      const last = res.data.at(-1);
      if (!res.has_more || !last) break;
      after = last.id;
    }
    return all;
  }

  async getReceivedAttachment(emailId: string, id: string) {
    const a = await call(() => this.client.emails.receiving.attachments.get({ emailId, id }));
    return toReceivedAttachment(a);
  }

  async downloadFile(url: string, options: { maxBytes?: number } = {}) {
    const maxBytes = options.maxBytes ?? DEFAULT_MAX_DOWNLOAD_BYTES;
    let res: Response;
    try {
      res = await fetch(url, { redirect: "follow" });
    } catch (error) {
      throw new ResendError(
        "resend_unknown",
        error instanceof Error ? error.message : "Could not download the file.",
      );
    }
    if ([403, 404, 410].includes(res.status)) {
      throw new ResendError("resend_not_found", "Resend no longer has this file.", {
        status: res.status,
      });
    }
    if (!res.ok) {
      throw new ResendError("resend_unknown", `Download failed (${res.status}).`, {
        status: res.status,
      });
    }
    const declared = Number(res.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > maxBytes) {
      throw new ResendError("resend_validation", "The file is too large.");
    }
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.length > maxBytes)
      throw new ResendError("resend_validation", "The file is too large.");
    return bytes;
  }
}
