/** HTTP action clients — import from this file, not a barrel. */
import { org } from "@/lib/api/actions/_helpers";
import type { ActionResult } from "@/lib/actions/result";

export type { ActionResult };

export const markThreadReadAction = org("inbox.read");
export const markThreadUnreadAction = org("inbox.unread");
export const restoreItemsAction = org("inbox.restore");
export const retryInboundAction = org("inbox.retry");
export const trashItemsAction = org("inbox.trash");
