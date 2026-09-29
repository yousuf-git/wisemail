"use server";

import { z } from "zod";

import { orgAction } from "@/lib/actions/action";
import type { ActionResult } from "@/lib/actions/result";
import type { AttachmentDTO, DraftDTO } from "@/lib/dto/mail";
import {
  confirmAttachmentUpload,
  createAttachmentUpload,
  deleteDraft,
  getDraft,
  removeDraftAttachment,
  saveDraft,
} from "@/lib/services/drafts";
import { cancelScheduledEmail, sendEmail, type SendResult } from "@/lib/services/sending";
import {
  saveDraftInput,
  sendEmailInput,
  type SaveDraftInput,
  type SendEmailInput,
} from "@/lib/validation/mail";

const objectId = z.string().regex(/^[0-9a-f]{24}$/i, "Invalid id");

const save = orgAction({ input: saveDraftInput, permission: "email:send" }, ({ ctx, input }) =>
  saveDraft(ctx, input),
);
const load = orgAction(
  { input: z.object({ id: objectId }), permission: "email:send" },
  ({ ctx, input }) => getDraft(ctx, input.id),
);
const discard = orgAction(
  { input: z.object({ id: objectId }), permission: "email:send" },
  async ({ ctx, input }) => {
    await deleteDraft(ctx, input.id);
    return { id: input.id };
  },
);
const send = orgAction({ input: sendEmailInput, permission: "email:send" }, ({ ctx, input }) =>
  sendEmail(ctx, input),
);
const cancel = orgAction(
  { input: z.object({ emailId: objectId }), permission: "email:send" },
  ({ ctx, input }) => cancelScheduledEmail(ctx, input.emailId),
);

const uploadInput = z.object({
  draftId: objectId,
  filename: z.string().min(1).max(255),
  size: z.number().int().positive(),
  contentType: z.string().max(200),
});
const startUpload = orgAction({ input: uploadInput, permission: "email:send" }, ({ ctx, input }) =>
  createAttachmentUpload(ctx, input),
);
const confirmUpload = orgAction(
  {
    input: z.object({ draftId: objectId, attachmentId: objectId }),
    permission: "email:send",
  },
  ({ ctx, input }) => confirmAttachmentUpload(ctx, input),
);
const removeAttachment = orgAction(
  {
    input: z.object({ draftId: objectId, attachmentId: objectId }),
    permission: "email:send",
  },
  async ({ ctx, input }) => {
    await removeDraftAttachment(ctx, input);
    return { id: input.attachmentId };
  },
);

export async function saveDraftAction(
  orgSlug: string,
  input: SaveDraftInput,
): Promise<ActionResult<DraftDTO>> {
  return save(orgSlug, input);
}

export async function getDraftAction(
  orgSlug: string,
  input: { id: string },
): Promise<ActionResult<DraftDTO>> {
  return load(orgSlug, input);
}

export async function deleteDraftAction(
  orgSlug: string,
  input: { id: string },
): Promise<ActionResult<{ id: string }>> {
  return discard(orgSlug, input);
}

export async function sendEmailAction(
  orgSlug: string,
  input: SendEmailInput,
): Promise<ActionResult<SendResult>> {
  return send(orgSlug, input);
}

export async function cancelScheduledAction(
  orgSlug: string,
  input: { emailId: string },
): Promise<ActionResult<{ emailId: string; status: "canceled" }>> {
  return cancel(orgSlug, input);
}

export async function createUploadAction(
  orgSlug: string,
  input: z.input<typeof uploadInput>,
): Promise<
  ActionResult<{ attachmentId: string; uploadUrl: string; headers: Record<string, string> }>
> {
  return startUpload(orgSlug, input);
}

export async function confirmUploadAction(
  orgSlug: string,
  input: { draftId: string; attachmentId: string },
): Promise<ActionResult<AttachmentDTO>> {
  return confirmUpload(orgSlug, input);
}

export async function removeAttachmentAction(
  orgSlug: string,
  input: { draftId: string; attachmentId: string },
): Promise<ActionResult<{ id: string }>> {
  return removeAttachment(orgSlug, input);
}
