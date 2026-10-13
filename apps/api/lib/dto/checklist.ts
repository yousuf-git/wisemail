/** Client-safe setup checklist vocabulary, copy and DTOs (PRD §5.1). No server imports. */

export const CHECKLIST_KEYS = [
  "webhook",
  "domain_verified",
  "dns_records",
  "open_tracking",
  "click_tracking",
  "receiving",
  "dmarc",
] as const;
export type ChecklistKey = (typeof CHECKLIST_KEYS)[number];
export type ChecklistStatus = "ok" | "warn" | "fail";

/** A one-click fix the API allows. */
export type ChecklistFixKind =
  "reregister_webhook" | "enable_open_tracking" | "enable_click_tracking";

export type ChecklistItemDTO = {
  key: ChecklistKey;
  status: ChecklistStatus;
  checkedAt: string;
  title: string;
  /** Technical name, shown muted after the title (FED §8). */
  technical: string | null;
  detail: string;
  fix: { kind: ChecklistFixKind; label: string } | null;
  /** Domains the item is about (detail page only). */
  domains?: string[];
};

export const CHECKLIST_TITLES: Record<ChecklistKey, { title: string; technical: string | null }> = {
  webhook: { title: "Live events", technical: "Wisemail webhook" },
  domain_verified: { title: "Verified domain", technical: null },
  dns_records: { title: "Sending records", technical: "SPF and DKIM" },
  open_tracking: { title: "Read receipts", technical: "Resend open tracking" },
  click_tracking: { title: "Link clicks", technical: "Resend click tracking" },
  receiving: { title: "Inbox", technical: "Receiving (MX)" },
  dmarc: { title: "DMARC policy", technical: "DMARC record" },
};

type Copy = { detail: string; fix?: { kind: ChecklistFixKind; label: string } };

export const CHECKLIST_COPY: Record<ChecklistKey, Partial<Record<ChecklistStatus, Copy>>> = {
  webhook: {
    ok: { detail: "Wisemail's webhook is registered and events are arriving." },
    warn: {
      detail:
        "The webhook is registered, but no event has arrived yet. Send an email from this account and it should show up within seconds.",
    },
    fail: {
      detail: "Wisemail can't hear from this account: our webhook isn't registered in Resend.",
      fix: { kind: "reregister_webhook", label: "Register webhook" },
    },
  },
  domain_verified: {
    ok: { detail: "Every domain on this account is verified." },
    warn: { detail: "Some domains are still waiting for DNS. Verified ones can already send." },
    fail: {
      detail: "No verified domain yet. Add one in Resend → Domains, then sync again to pick it up.",
    },
  },
  dns_records: {
    ok: { detail: "SPF and DKIM are verified on every domain." },
    warn: {
      detail: "SPF or DKIM isn't verified on some domains. Add the records shown in Resend.",
    },
    fail: { detail: "SPF and DKIM aren't verified on any domain, so mail may land in spam." },
  },
  open_tracking: {
    ok: { detail: "Read receipts are on for every domain." },
    warn: {
      detail: "Read receipts are off on some domains, so opens there won't show up.",
      fix: { kind: "enable_open_tracking", label: "Turn on read receipts" },
    },
  },
  click_tracking: {
    ok: { detail: "Link clicks are tracked on every domain." },
    warn: {
      detail: "Link clicks aren't tracked on some domains.",
      fix: { kind: "enable_click_tracking", label: "Turn on click tracking" },
    },
  },
  receiving: {
    ok: { detail: "Inbox is ready: incoming mail reaches Wisemail on every domain." },
    warn: {
      detail:
        "Incoming mail isn't set up on some domains. Turn on receiving in Resend and add its MX record (a subdomain is safest).",
    },
  },
  dmarc: {
    ok: { detail: "A DMARC record is published on every domain." },
    warn: { detail: "Some domains have no DMARC record. Publishing one protects your name." },
    fail: { detail: "No DMARC record found. Publish one to protect your domains." },
  },
};

export function describeChecklistItem(
  key: ChecklistKey,
  status: ChecklistStatus,
): Pick<ChecklistItemDTO, "title" | "technical" | "detail" | "fix"> {
  const { title, technical } = CHECKLIST_TITLES[key];
  const copy = CHECKLIST_COPY[key][status] ?? { detail: "" };
  return { title, technical, detail: copy.detail, fix: copy.fix ?? null };
}

export function summarizeChecklist(items: readonly { status: ChecklistStatus }[]) {
  return {
    ok: items.filter((i) => i.status === "ok").length,
    warn: items.filter((i) => i.status === "warn").length,
    fail: items.filter((i) => i.status === "fail").length,
    total: items.length,
  };
}

export type MirrorCountsDTO = Record<
  | "domains"
  | "apiKeys"
  | "segments"
  | "topics"
  | "contactProperties"
  | "templates"
  | "contacts"
  | "broadcasts"
  | "automations",
  number
>;

export type ConnectionDetailDTO = {
  id: string;
  name: string;
  status: string;
  statusReason: string | null;
  apiKeyLast4: string | null;
  webhookRegistered: boolean;
  lastEventAt: string | null;
  lastSyncAt: string | null;
  checklist: ChecklistItemDTO[];
  counts: MirrorCountsDTO;
  domains: {
    id: string;
    name: string;
    status: string;
    openTracking: boolean;
    clickTracking: boolean;
    receiving: boolean;
    records: { record: string; type: string; name: string; value: string; status: string }[];
  }[];
  sync: import("./sync").SyncStatusDTO | null;
};
