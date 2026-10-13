/** Server-owned shapes for usage sidebar / plan banner (SPA may mirror these). */

export type ConnectionHealth = "healthy" | "attention" | "down";

export type PlanBannerData = {
  kind: "over_allowance" | "trial" | "payment";
  message: string;
  action: { label: string; href: string };
};

export type UsageSummary = {
  plan?: string;
  connections?: { id: string; health: ConnectionHealth }[];
  connectionLimit?: number;
  used?: { transactional: number; broadcast: number; inbound: number };
  allowance?: number | null;
  aiCredits?: number | null;
  overageCostUsd?: number | null;
  banner?: PlanBannerData | null;
};
