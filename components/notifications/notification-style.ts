import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  Globe,
  Mail,
  MailX,
  PlugZap,
  ShieldAlert,
  type LucideIcon,
} from "lucide-react";

import type { StatusState } from "@/components/app/status-chip";
import type { NotificationType } from "@/lib/notifications/types";

export type NotificationStyle = { icon: LucideIcon; state: StatusState; label: string };

/** Icon, FED §2.2 state color and a short label per notification type. */
export const NOTIFICATION_STYLE: Partial<Record<NotificationType, NotificationStyle>> = {
  inbound_received: { icon: Mail, state: "info", label: "Inbound" },
  reply_opened: { icon: Eye, state: "engaged", label: "Opened" },
  bounce: { icon: MailX, state: "danger", label: "Bounce" },
  complaint: { icon: ShieldAlert, state: "danger", label: "Complaint" },
  incident_opened: { icon: AlertTriangle, state: "danger", label: "Alert" },
  incident_resolved: { icon: CheckCircle2, state: "success", label: "Resolved" },
  connection_attention: { icon: PlugZap, state: "warning", label: "Connection" },
  domain_changed: { icon: Globe, state: "warning", label: "Domain" },
};

export const styleFor = (type: NotificationType): NotificationStyle =>
  NOTIFICATION_STYLE[type] ?? { icon: Mail, state: "neutral", label: "Update" };

/** Soft background + ink classes for the round icon well, per state (static for Tailwind). */
export const WELL_CLASS: Record<StatusState, string> = {
  success: "bg-success-soft text-success-ink",
  info: "bg-info-soft text-info-ink",
  engaged: "bg-engaged-soft text-engaged-ink",
  warning: "bg-warning-soft text-warning-ink",
  danger: "bg-danger-soft text-danger-ink",
  neutral: "bg-neutral-soft text-neutral-ink",
};
