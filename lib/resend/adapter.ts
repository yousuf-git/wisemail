import "server-only";

import { Resend } from "resend";

import { mapResendError, ResendError, type SdkError } from "./errors";
import type {
  CreatedResendWebhook,
  Page,
  PageOptions,
  ResendApiKey,
  ResendDomain,
  ResendEventType,
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

function toPage<T, U extends { id: string }>(
  list: { data: U[]; has_more: boolean },
  map: (item: U) => T,
): Page<T> {
  return {
    data: list.data.map(map),
    hasMore: list.has_more,
    nextCursor: list.has_more ? list.data.at(-1)?.id : undefined,
  };
}

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
}
