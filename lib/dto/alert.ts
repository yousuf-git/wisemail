import type { AlertKind } from "@/lib/alerts/kinds";

export type AlertRuleDTO = {
  id: string;
  version: number;
  name: string;
  kind: AlertKind;
  scope: { connectionIds: string[]; projectIds: string[]; domainIds: string[] };
  condition: {
    operator: "gt" | "lt";
    threshold: number;
    windowMinutes: number;
    minVolume: number;
  };
  channels: { inApp: boolean; emailMembers: boolean; email: string[] };
  enabled: boolean;
  /** Incidents currently open or acknowledged for this rule. */
  activeIncidents: number;
  createdAt: string;
};

export type IncidentDTO = {
  id: string;
  ruleId: string;
  ruleName: string;
  kind: AlertKind;
  status: "open" | "resolved" | "acknowledged";
  title: string;
  summary: string;
  observedValue: number;
  openedAt: string;
  resolvedAt: string | null;
  acknowledgedAt: string | null;
  context: {
    connectionId?: string;
    connectionName?: string;
    domainId?: string;
    domainName?: string;
    threshold?: number;
    windowMinutes?: number;
    volume?: number;
    sampleEmailIds?: string[];
  };
};

export type AlertQuota = {
  used: number;
  /** `null` = unlimited. */
  limit: number | null;
  planLabel: string;
  nextTierLabel: string | null;
};

export type AlertScopeOptions = {
  connections: { id: string; name: string }[];
  domains: { id: string; name: string }[];
  projects: { id: string; name: string }[];
};
