/** HTTP action clients — import from this file, not a barrel. */
import { org } from "@/lib/api/actions/_helpers";
import type { ActionResult } from "@/lib/actions/result";

export type { ActionResult };

export const createSenderAction = org("settings.senders.create");
export const deleteSenderAction = org("settings.senders.remove");
export const setSenderDisabledAction = org("settings.senders.disable");
export const updateSenderAction = org("settings.senders.update");
