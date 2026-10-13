/** HTTP action clients — import from this file, not a barrel. */
import { org } from "@/lib/api/actions/_helpers";
import type { ActionResult } from "@/lib/actions/result";

export type { ActionResult };

export const addConnectionAction = org("settings.connections.add");
export const enableTrackingAction = org("settings.connections.tracking");
export const removeConnectionAction = org("settings.connections.remove");
export const renameConnectionAction = org("settings.connections.rename");
export const reregisterWebhookAction = org("settings.connections.webhook");
export const retryConnectionAction = org("settings.connections.retry");
export const syncNowAction = org("settings.connections.sync");
