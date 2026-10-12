import type { NotificationType } from "@/lib/notifications/types";

export type NotificationDTO = {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  /** In-app path, already prefixed with the org slug. */
  link: string;
  readAt: string | null;
  createdAt: string;
};

export type NotificationsPage = {
  items: NotificationDTO[];
  unreadCount: number;
  nextCursor: string | null;
};

export type NotificationPreferencesDTO = {
  channels: Record<string, { inApp: boolean; email: boolean }>;
  quietHours: { start: string; end: string; timezone: string } | null;
  digest: "none" | "daily";
  /** The org's time zone (quiet hours and the digest follow it). */
  orgTimezone: string;
  digestAllowed: boolean;
  planLabel: string;
};
