/** Client-safe sync vocabulary and DTOs (no server imports). */

export const SYNC_STAGE_KEYS = [
  "domains",
  "api_keys",
  "segments",
  "topics",
  "contact_properties",
  "templates",
  "contacts",
  "contact_segments",
  "broadcasts",
  "automations",
] as const;
export type SyncStageKey = (typeof SYNC_STAGE_KEYS)[number];

export const SYNC_STAGE_LABELS: Record<SyncStageKey, string> = {
  domains: "Domains",
  api_keys: "API keys",
  segments: "Segments",
  topics: "Topics",
  contact_properties: "Contact properties",
  templates: "Templates",
  contacts: "Contacts",
  contact_segments: "Segment members",
  broadcasts: "Broadcasts",
  automations: "Automations",
};

export type SyncStageStatus = "pending" | "running" | "completed" | "failed";

export type SyncStatusDTO = {
  runId: string;
  state: "running" | "completed" | "failed";
  trigger: "initial" | "scheduled" | "manual";
  startedAt: string;
  finishedAt: string | null;
  /** The stage in progress, or the one that failed. */
  stage: { key: string; label: string } | null;
  /** Plain-language reason when `state` is `failed`. */
  error: string | null;
  progress: { key: string; label: string; status: SyncStageStatus; count: number }[];
};

/** How a requested sync is being run. */
export type SyncRequestResult = {
  mode: "queued" | "inline" | "already_running";
};
