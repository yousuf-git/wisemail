/** HTTP action clients — import from this file, not a barrel. */
import { org } from "@/lib/api/actions/_helpers";
import type { ActionResult } from "@/lib/actions/result";

export type { ActionResult };

export const confirmUploadAction = org("compose.confirmUpload");
export const createUploadAction = org("compose.startUpload");
export const deleteDraftAction = org("compose.discard");
export const getDraftAction = org("compose.load");
export const removeAttachmentAction = org("compose.removeAttachment");
export const saveDraftAction = org("compose.save");
export const sendEmailAction = org("compose.send");
