/** Client-safe DTOs for trash, bulk operations and cleanup rules. */

export type BulkActionName = "trash" | "delete" | "restore";

export type BulkOperationDTO = {
  id: string;
  action: BulkActionName;
  status: "queued" | "running" | "done" | "failed";
  total: number;
  processed: number;
  error: string | null;
  /** Only a finished bulk trash can be undone, and only while its items are still in Trash. */
  undoable: boolean;
  createdAt: string;
};

export type PermanentDeleteResultDTO = {
  deleted: number;
  /** Scheduled emails Resend would not cancel, kept. */
  skipped: number;
};

export type CleanupActionName = "archive" | "trash" | "delete";

export type CleanupRuleDTO = {
  id: string;
  name: string;
  enabled: boolean;
  kind: "rule" | "block_sender";
  action: CleanupActionName;
  scope: { connectionIds: string[]; projectIds: string[]; mailboxAddresses: string[] };
  match: {
    direction?: "inbound" | "outbound";
    fromAddress?: string;
    fromDomain?: string;
    subjectContains?: string;
    tag?: { name: string; value?: string };
    aiCategory?: string;
    olderThanDays?: number;
  };
  lastRunAt: string | null;
  lastRunCount: number;
  createdAt: string;
};

export type CleanupPreviewDTO = {
  /** Items the rule would act on right now. */
  count: number;
};
