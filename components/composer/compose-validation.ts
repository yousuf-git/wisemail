import { isValidEmail } from "@/lib/mail/address";
import { MAX_RECIPIENTS } from "@/lib/validation/mail";

export type ComposeCheck = {
  senderId: string | null;
  senderActive: boolean;
  senderReason?: string | null;
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  bodyHtml: string;
  scheduledAt: Date | null;
  uploading: boolean;
  now?: number;
};

/** True when the HTML has no text and no image. */
export function isBodyBlank(html: string): boolean {
  if (/<img\b/i.test(html)) return false;
  const text = html
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, "")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;|&#160;/gi, " ")
    .trim();
  return text.length === 0;
}

/** Client-side checks that mirror `sendEmailInput`, so problems show before the round trip. */
export function validateCompose(check: ComposeCheck): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!check.senderId) errors.senderId = "Choose who this is from.";
  else if (!check.senderActive) {
    errors.senderId = `This sender can't send right now${check.senderReason ? `: ${check.senderReason}` : "."} Pick another one.`;
  }
  for (const [field, list] of [
    ["to", check.to],
    ["cc", check.cc],
    ["bcc", check.bcc],
  ] as const) {
    if (list.some((v) => !isValidEmail(v))) {
      errors[field] = "Fix or remove the highlighted addresses.";
    }
  }
  if (!errors.to && check.to.length === 0) errors.to = "Add at least one recipient.";
  if (check.to.length + check.cc.length + check.bcc.length > MAX_RECIPIENTS) {
    errors.to = `Resend allows at most ${MAX_RECIPIENTS} recipients per email.`;
  }
  if (!check.subject.trim()) errors.subject = "Add a subject.";
  if (isBodyBlank(check.bodyHtml)) errors.html = "Write a message.";
  if (check.uploading) errors.attachments = "Wait for the attachments to finish uploading.";
  if (check.scheduledAt && check.scheduledAt.getTime() <= (check.now ?? Date.now())) {
    errors.scheduledAt = "Pick a time in the future.";
  }
  return errors;
}

/** Custom HTML that TipTap would flatten: ask before moving from HTML back to Rich text. */
export function isLossyForRich(html: string): boolean {
  return /<(table|style|div|span|center|font|section|head|body|html|form|iframe|video)\b|\sstyle\s*=/i.test(
    html,
  );
}
