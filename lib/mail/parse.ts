import { simpleParser, type AddressObject, type ParsedMail } from "mailparser";

import { normalizeAddress, type MailAddress } from "./address";
import { normalizeContentId } from "./sanitize";
import { extractMessageIds } from "./thread";

export type ParsedAttachment = {
  filename: string;
  contentType: string;
  size: number;
  contentId?: string;
  disposition: "inline" | "attachment";
  content: Buffer;
};

export type ParsedMessage = {
  messageId?: string;
  inReplyTo?: string;
  references: string[];
  subject: string;
  from?: MailAddress;
  to: MailAddress[];
  cc: MailAddress[];
  bcc: MailAddress[];
  replyTo: MailAddress[];
  date?: Date;
  text: string | null;
  /** Raw (unsanitized) HTML; run it through `sanitizeEmailHtml`. */
  html: string | null;
  headers: { name: string; value: string }[];
  attachments: ParsedAttachment[];
};

const MAX_HEADERS = 200;
const MAX_HEADER_VALUE = 4_000;

/** Strips path separators and control characters only; the rest of the name is kept verbatim. */
export function sanitizeFilename(name: string | null | undefined): string {
  const cleaned = (name ?? "")
    .replace(/[\\/]/g, "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim();
  return cleaned || "attachment";
}

function addresses(field: AddressObject | AddressObject[] | undefined): MailAddress[] {
  if (!field) return [];
  const list = Array.isArray(field) ? field : [field];
  const out: MailAddress[] = [];
  for (const group of list) {
    for (const entry of group.value) {
      if (!entry.address) continue;
      const address = normalizeAddress(entry.address);
      out.push(entry.name ? { address, name: entry.name } : { address });
    }
  }
  return out;
}

/** Raw MIME -> normalized message + attachments (TRD §2.4 step 2). */
export async function parseRawMime(raw: Buffer | string): Promise<ParsedMessage> {
  const parsed: ParsedMail = await simpleParser(raw, { skipImageLinks: true });
  const references = extractMessageIds(
    Array.isArray(parsed.references) ? parsed.references.join(" ") : (parsed.references ?? ""),
  );
  const from = parsed.from?.value[0];
  return {
    messageId: parsed.messageId ? extractMessageIds(parsed.messageId)[0] : undefined,
    inReplyTo: parsed.inReplyTo ? extractMessageIds(parsed.inReplyTo)[0] : undefined,
    references,
    subject: parsed.subject ?? "",
    from: from?.address
      ? {
          address: normalizeAddress(from.address),
          ...(from.name ? { name: from.name } : {}),
        }
      : undefined,
    to: addresses(parsed.to),
    cc: addresses(parsed.cc),
    bcc: addresses(parsed.bcc),
    replyTo: addresses(parsed.replyTo),
    date: parsed.date,
    text: parsed.text ?? null,
    html: typeof parsed.html === "string" ? parsed.html : null,
    headers: parsed.headerLines.slice(0, MAX_HEADERS).map((h) => ({
      name: h.key,
      value: h.line
        .slice(h.key.length + 1)
        .replace(/\r?\n\s+/g, " ")
        .trim()
        .slice(0, MAX_HEADER_VALUE),
    })),
    attachments: parsed.attachments.map((a) => ({
      filename: sanitizeFilename(a.filename),
      contentType: a.contentType || "application/octet-stream",
      size: a.size ?? a.content.length,
      contentId: a.cid ? normalizeContentId(a.cid) : undefined,
      disposition: a.contentDisposition === "inline" ? "inline" : "attachment",
      content: a.content,
    })),
  };
}
