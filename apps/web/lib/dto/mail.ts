/** Client-safe mail DTOs (no server imports). Dates are ISO strings, ids are hex strings. */

import type { TriageDTO } from "@/lib/ai/types";
import type { EmailStatus } from "@/lib/db/models/emails";

export type AddressDTO = { address: string; name?: string };

export type SenderDTO = {
  id: string;
  domainId: string;
  domainName: string;
  projectId: string | null;
  localPart: string;
  address: string;
  displayName: string;
  replyTo: string[];
  signatureHtml: string;
  isDefault: boolean;
  status: "active" | "domain_unverified" | "connection_inactive" | "disabled";
  statusReason: string | null;
  canReceiveReplies: boolean;
  /** Shown as a note when replies won't reach the inbox. */
  receivingNote: string | null;
  /** Optimistic-concurrency version; send it back when updating. */
  version: number;
};

export type DraftDTO = {
  id: string;
  senderId: string | null;
  threadId: string | null;
  inReplyToEmailId: string | null;
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  mode: "rich" | "html" | "template";
  bodyHtml: string;
  bodyText: string;
  templateId: string | null;
  templateVariables: Record<string, unknown>;
  attachments: AttachmentDTO[];
  scheduledAt: string | null;
  updatedAt: string;
  version: number;
};

export type AttachmentDTO = {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  disposition: "inline" | "attachment";
  embedded: boolean;
  /** `false` when Resend no longer has the file (Free plan). */
  available: boolean;
  /** Same-origin download route. */
  downloadUrl: string;
  /** Presigned inline URL for thumbnails of images that are not part of the body. */
  thumbnailUrl: string | null;
};

export type ReceiptDTO = {
  type: string;
  at: string;
};

export type ReceiptSummaryDTO = {
  status: EmailStatus;
  sentAt: string | null;
  deliveredAt: string | null;
  firstOpenedAt: string | null;
  lastOpenedAt: string | null;
  openCount: number;
  firstClickedAt: string | null;
  clickCount: number;
  likelyAutomatedOpen: boolean;
  /** False when open tracking is off on the sending domain: show "Opens not tracked". */
  opensTracked: boolean;
  bounce: { type: "hard" | "soft"; message: string | null } | null;
  /** Timeline entries (`email.delivered`, `email.opened`, ...), oldest first. */
  events: ReceiptDTO[];
};

export type MessageDTO = {
  id: string;
  direction: "inbound" | "outbound";
  status: EmailStatus;
  from: AddressDTO;
  to: AddressDTO[];
  cc: AddressDTO[];
  bcc: AddressDTO[];
  subject: string;
  snippet: string;
  at: string;
  scheduledAt: string | null;
  authorId: string | null;
  contentStatus: "pending" | "ready" | "failed" | "unavailable" | null;
  /** Sanitized HTML, `cid:` references replaced by signed URLs. Null while pending. */
  html: string | null;
  text: string | null;
  attachments: AttachmentDTO[];
  /** Outbound only. */
  receipts: ReceiptSummaryDTO | null;
};

export type ThreadDetailDTO = {
  id: string;
  subject: string;
  mailboxAddress: string;
  participants: string[];
  messageCount: number;
  starred: boolean;
  archived: boolean;
  assigneeId: string | null;
  unread: boolean;
  projectId: string | null;
  /** AI triage of the newest inbound message. */
  ai?: TriageDTO | null;
  messages: MessageDTO[];
};

export type MailFolder = "inbox" | "sent" | "scheduled" | "trash";

export type MailListRowDTO = {
  /** `thread` rows open a conversation; `email` rows (Sent, Scheduled, single trashed emails) one message. */
  kind: "thread" | "email";
  id: string;
  threadId: string | null;
  subject: string;
  snippet: string;
  /** Other party: participants (threads) or recipients (sent). */
  people: string[];
  /** Display name per entry of `people` (the address when no name is known). */
  peopleLabels?: string[];
  lastMessageAt: string;
  messageCount: number;
  unread: boolean;
  starred: boolean;
  hasAttachments: boolean;
  projectId: string | null;
  status: EmailStatus | null;
  scheduledAt: string | null;
  trashedAt: string | null;
  purgeAt: string | null;
  /** AI triage of the newest inbound message (paid plans with AI on); null when there is none. */
  ai?: TriageDTO | null;
};

export type Page<T> = { items: T[]; nextCursor: string | null };

export type ActivityRowDTO = {
  id: string;
  direction: "inbound" | "outbound";
  origin: "app" | "external" | "broadcast";
  status: EmailStatus;
  connectionId: string;
  domainId: string | null;
  projectId: string | null;
  from: AddressDTO;
  to: string[];
  subject: string;
  tags: { name: string; value: string }[];
  openCount: number;
  clickCount: number;
  at: string;
  threadId: string | null;
};

export type TimelineEntryDTO = {
  id: string;
  type: string;
  occurredAt: string;
  /** Raw payload (`data`) for the payload viewer; never includes secrets. */
  payload: unknown;
};

export type EmailTimelineDTO = {
  email: ActivityRowDTO;
  entries: TimelineEntryDTO[];
};
