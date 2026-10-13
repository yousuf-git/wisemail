import { randomBytes } from "node:crypto";

/**
 * Minimal RFC 5322 / MIME writer for the fake Resend adapter and tests: enough to produce
 * realistic inbound messages (text + HTML alternative, inline CID images, attachments,
 * `In-Reply-To` / `References`) that `mailparser` reads back. Not for production sending.
 */

export type FakeMimeAttachment = {
  filename: string;
  contentType: string;
  content: Buffer;
  /** Makes it an inline part referenced as `cid:<contentId>`. */
  contentId?: string;
};

export type FakeMimeInput = {
  from: string;
  to: string[];
  cc?: string[];
  replyTo?: string[];
  subject: string;
  messageId: string;
  date?: Date;
  inReplyTo?: string;
  references?: string[];
  text?: string;
  html?: string;
  attachments?: FakeMimeAttachment[];
  extraHeaders?: Record<string, string>;
};

const boundary = (label: string) => `----=_${label}_${randomBytes(8).toString("hex")}`;

const wrap76 = (b64: string) => b64.match(/.{1,76}/g)?.join("\r\n") ?? "";

/** RFC 2047 encoded-word for non-ASCII header text. */
const headerText = (value: string) =>
  /^[\u0020-\u007e]*$/.test(value) ? value : `=?UTF-8?B?${Buffer.from(value).toString("base64")}?=`;

/** RFC 2231 filename parameter (UTF-8 when needed). */
function filenameParam(name: string): string {
  if (/^[\u0020-\u007e]*$/.test(name) && !/["\\]/.test(name)) return `filename="${name}"`;
  const ascii = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

function textPart(contentType: string, body: string): string {
  return [
    `Content-Type: ${contentType}; charset=utf-8`,
    "Content-Transfer-Encoding: base64",
    "",
    wrap76(Buffer.from(body, "utf8").toString("base64")),
  ].join("\r\n");
}

function filePart(a: FakeMimeAttachment): string {
  const inline = !!a.contentId;
  return [
    `Content-Type: ${a.contentType}; ${filenameParam(a.filename).replace(/^filename/, "name")}`,
    `Content-Disposition: ${inline ? "inline" : "attachment"}; ${filenameParam(a.filename)}`,
    ...(inline ? [`Content-ID: <${a.contentId}>`] : []),
    "Content-Transfer-Encoding: base64",
    "",
    wrap76(a.content.toString("base64")),
  ].join("\r\n");
}

const multipart = (type: string, b: string, parts: string[]) =>
  `Content-Type: multipart/${type}; boundary="${b}"\r\n\r\n` +
  parts.map((p) => `--${b}\r\n${p}\r\n`).join("") +
  `--${b}--\r\n`;

export function buildRawMime(input: FakeMimeInput): Buffer {
  const attachments = input.attachments ?? [];
  const inline = attachments.filter((a) => a.contentId);
  const files = attachments.filter((a) => !a.contentId);
  const text = input.text ?? (input.html ? "" : "(no content)");

  let body: string;
  const alternatives: string[] = [];
  if (text) alternatives.push(textPart("text/plain", text));
  if (input.html) {
    const htmlPart = textPart("text/html", input.html);
    if (inline.length > 0) {
      alternatives.push(
        multipart("related", boundary("rel"), [htmlPart, ...inline.map(filePart)]).trimEnd(),
      );
    } else {
      alternatives.push(htmlPart);
    }
  }
  body =
    alternatives.length === 1
      ? alternatives[0]!
      : multipart("alternative", boundary("alt"), alternatives).trimEnd();
  if (files.length > 0) {
    body = multipart("mixed", boundary("mix"), [body, ...files.map(filePart)]).trimEnd();
  }

  const headers = [
    `From: ${input.from}`,
    `To: ${input.to.join(", ")}`,
    ...(input.cc?.length ? [`Cc: ${input.cc.join(", ")}`] : []),
    ...(input.replyTo?.length ? [`Reply-To: ${input.replyTo.join(", ")}`] : []),
    `Subject: ${headerText(input.subject)}`,
    `Message-ID: ${input.messageId}`,
    `Date: ${(input.date ?? new Date()).toUTCString()}`,
    ...(input.inReplyTo ? [`In-Reply-To: ${input.inReplyTo}`] : []),
    ...(input.references?.length ? [`References: ${input.references.join(" ")}`] : []),
    "MIME-Version: 1.0",
    ...Object.entries(input.extraHeaders ?? {}).map(([k, v]) => `${k}: ${v}`),
  ];
  return Buffer.from(`${headers.join("\r\n")}\r\n${body}`, "utf8");
}
