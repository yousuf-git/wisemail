export type AuditEntryDTO = {
  id: string;
  createdAt: string;
  actor: { type: "user" | "system"; id: string | null; name: string };
  action: string;
  target: { type: string; id: string };
  changes: { before?: Record<string, unknown>; after?: Record<string, unknown> } | null;
  ip: string | null;
  userAgent: string | null;
};

export type AuditPageDTO = { items: AuditEntryDTO[]; nextCursor: string | null };

export type AuditFiltersDTO = {
  actions: string[];
  targetTypes: string[];
  actors: { id: string; name: string }[];
  /** Days of history the plan lets you read. */
  windowDays: number;
};
