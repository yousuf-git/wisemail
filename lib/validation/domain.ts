import { z } from "zod";

import { RESEND_REGIONS } from "@/lib/resend/types";

const idSchema = z.string().regex(/^[0-9a-f]{24}$/i, "Invalid id.");

/** Hostname with at least one dot; lower-cased and trimmed before matching. */
export const DOMAIN_NAME_RE =
  /^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

export const domainNameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(DOMAIN_NAME_RE, "Enter a domain like example.com (no https:// or path).");

export const REGION_LABELS: Record<(typeof RESEND_REGIONS)[number], string> = {
  "us-east-1": "US East (N. Virginia)",
  "eu-west-1": "Europe (Ireland)",
  "sa-east-1": "South America (São Paulo)",
  "ap-northeast-1": "Asia Pacific (Tokyo)",
};

export const createDomainSchema = z.object({
  connectionId: idSchema,
  name: domainNameSchema,
  region: z.enum(RESEND_REGIONS, { error: "Pick a region." }).default("us-east-1"),
  projectId: idSchema.nullish(),
});
export type CreateDomainFormInput = z.input<typeof createDomainSchema>;

export const domainIdSchema = z.object({ domainId: idSchema });

export const setDomainTrackingSchema = z
  .object({
    domainId: idSchema,
    openTracking: z.boolean().optional(),
    clickTracking: z.boolean().optional(),
  })
  .refine((v) => v.openTracking !== undefined || v.clickTracking !== undefined, {
    message: "Nothing to change.",
  });

export const assignDomainProjectSchema = z.object({
  domainId: idSchema,
  projectId: idSchema.nullable(),
});

export const deleteDomainSchema = z.object({
  domainId: idSchema,
  /** Typed by the person; must equal the domain name. */
  confirmName: z.string(),
});

export const checkDnsSchema = z.object({ domainId: idSchema });

/* API keys */

export const API_KEY_STALE_DAYS = 90;

export const apiKeyNameSchema = z
  .string()
  .trim()
  .min(2, "Give it a name (2+ characters).")
  .max(64, "Keep it under 64 characters.");

export const createApiKeySchema = z
  .object({
    connectionId: idSchema,
    name: apiKeyNameSchema,
    permission: z.enum(["full_access", "sending_access"], { error: "Pick a permission." }),
    /** Wisemail domain id (not Resend's); only for sending keys. */
    domainId: idSchema.nullish(),
  })
  .refine((v) => v.permission === "sending_access" || !v.domainId, {
    message: "Only sending keys can be limited to a domain.",
    path: ["domainId"],
  });
export type CreateApiKeyFormInput = z.input<typeof createApiKeySchema>;

export const deleteApiKeySchema = z.object({
  apiKeyId: idSchema,
  confirmName: z.string(),
  /** Set when the key may be the one Wisemail uses and the person still wants it gone. */
  acknowledgeInUse: z.boolean().optional(),
});
