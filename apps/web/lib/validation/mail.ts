import { z } from "zod";

import { isValidEmail } from "@/lib/mail/address";

/** Resend accepts at most 50 recipients and 40 MB per email (TRD §2.5). */
export const MAX_RECIPIENTS = 50;
export const MAX_EMAIL_BYTES = 40 * 1024 * 1024;
export const MAX_ATTACHMENT_BYTES = MAX_EMAIL_BYTES;

const objectId = z.string().regex(/^[0-9a-f]{24}$/i, "Invalid id");
const address = z
  .string()
  .trim()
  .toLowerCase()
  .refine(isValidEmail, { message: "Enter a valid email address" });

export const sendEmailInput = z
  .object({
    senderId: objectId,
    to: z.array(address).max(MAX_RECIPIENTS),
    cc: z.array(address).max(MAX_RECIPIENTS).default([]),
    bcc: z.array(address).max(MAX_RECIPIENTS).default([]),
    replyTo: z.array(address).max(5).optional(),
    subject: z.string().trim().min(1, "Add a subject").max(998),
    html: z.string().max(2_000_000).optional(),
    text: z.string().max(2_000_000).optional(),
    /** Replying to this email: sets the threading headers and the thread. */
    inReplyToEmailId: objectId.optional(),
    draftId: objectId.optional(),
    attachmentIds: z.array(objectId).max(20).default([]),
    scheduledAt: z.coerce.date().optional(),
    /** Template mode: a published template and its variable values (Phase 6). */
    templateId: objectId.optional(),
    templateVariables: z.record(z.string(), z.union([z.string().max(5000), z.number()])).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.to.length === 0) {
      ctx.addIssue({ code: "custom", path: ["to"], message: "Add at least one recipient" });
    }
    if (value.to.length + value.cc.length + value.bcc.length > MAX_RECIPIENTS) {
      ctx.addIssue({
        code: "custom",
        path: ["to"],
        message: `Resend allows at most ${MAX_RECIPIENTS} recipients per email`,
      });
    }
    if (!value.templateId && !value.html?.trim() && !value.text?.trim()) {
      ctx.addIssue({ code: "custom", path: ["html"], message: "Write a message" });
    }
    if (value.scheduledAt && value.scheduledAt.getTime() <= Date.now()) {
      ctx.addIssue({
        code: "custom",
        path: ["scheduledAt"],
        message: "Pick a time in the future",
      });
    }
  });
export type SendEmailInput = z.input<typeof sendEmailInput>;

export const saveDraftInput = z.object({
  id: objectId.optional(),
  /** Version returned by the previous save; omit for a new draft. */
  version: z.number().int().min(0).optional(),
  senderId: objectId.nullable().optional(),
  threadId: objectId.nullable().optional(),
  inReplyToEmailId: objectId.nullable().optional(),
  to: z.array(z.string().trim().max(320)).max(200).optional(),
  cc: z.array(z.string().trim().max(320)).max(200).optional(),
  bcc: z.array(z.string().trim().max(320)).max(200).optional(),
  subject: z.string().max(998).optional(),
  mode: z.enum(["rich", "html", "template"]).optional(),
  bodyHtml: z.string().max(2_000_000).optional(),
  bodyText: z.string().max(2_000_000).optional(),
  templateId: objectId.nullable().optional(),
  templateVariables: z.record(z.string(), z.unknown()).optional(),
  scheduledAt: z.coerce.date().nullable().optional(),
});
export type SaveDraftInput = z.input<typeof saveDraftInput>;

export const createSenderInput = z.object({
  domainId: objectId,
  localPart: z
    .string()
    .trim()
    .toLowerCase()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9._+-]+$/, "Use letters, numbers, dots, dashes or underscores"),
  displayName: z.string().trim().max(100).default(""),
  replyTo: z.array(address).max(5).default([]),
  signatureHtml: z.string().max(20_000).default(""),
  isDefault: z.boolean().default(false),
});
export type CreateSenderInput = z.input<typeof createSenderInput>;

export const updateSenderInput = z.object({
  id: objectId,
  version: z.number().int().min(0),
  displayName: z.string().trim().max(100).optional(),
  replyTo: z.array(address).max(5).optional(),
  signatureHtml: z.string().max(20_000).optional(),
  isDefault: z.boolean().optional(),
});
export type UpdateSenderInput = z.input<typeof updateSenderInput>;
