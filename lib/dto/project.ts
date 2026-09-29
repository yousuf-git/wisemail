import type { ProjectColor } from "@/lib/validation/project";

export type ProjectDTO = {
  id: string;
  name: string;
  slug: string;
  color: ProjectColor;
  description: string;
  /** Domains assigned to the project (0 until domains are synced and assigned). */
  domainCount: number;
  /** Members restricted to this project. */
  scopedMemberCount: number;
  createdAt: string;
};

export type ProjectQuota = {
  used: number;
  /** `null` = unlimited. */
  limit: number | null;
  planLabel: string;
  nextTierLabel: string | null;
};
