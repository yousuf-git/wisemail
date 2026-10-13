"use server";

import { z } from "zod";

import { adminAction } from "@/lib/admin/action";
import { OVERRIDABLE_KEYS } from "@/lib/admin/limits";
import { PLANS } from "@/lib/db/models/org-settings";
import {
  adminChangePlan,
  adminGrantTrial,
  setLimitOverrides,
  suspendOrg,
  unsuspendOrg,
} from "@/lib/services/admin/orgs";
import {
  adminUpdatePlanPrice,
  adminUpdatePlatformSettings,
} from "@/lib/services/admin/catalog";
import {
  banUser,
  resendVerification,
  revokeUserSessions,
  startImpersonation,
  unbanUser,
} from "@/lib/services/admin/users";

const id = z.string().regex(/^[0-9a-f]{24}$/i, "Invalid id.");
const reason = z.string().trim().min(5, "Give a reason (at least 5 characters).").max(500);
const optionalReason = z.string().trim().max(500).optional();

export const banUserAction = adminAction(
  {
    input: z.object({
      userId: id,
      reason,
      expiresInDays: z.number().int().min(1).max(3650).optional(),
    }),
  },
  async ({ input, admin }) => {
    await banUser(admin, input);
    return { done: true as const };
  },
);

export const unbanUserAction = adminAction(
  { input: z.object({ userId: id, reason: optionalReason }) },
  async ({ input, admin }) => {
    await unbanUser(admin, input);
    return { done: true as const };
  },
);

export const revokeSessionsAction = adminAction(
  { input: z.object({ userId: id, reason }) },
  async ({ input, admin }) => {
    await revokeUserSessions(admin, input);
    return { done: true as const };
  },
);

export const resendVerificationAction = adminAction(
  { input: z.object({ userId: id }) },
  async ({ input, admin }) => {
    await resendVerification(admin, input);
    return { done: true as const };
  },
);

export const impersonateAction = adminAction(
  { input: z.object({ userId: id, reason }) },
  ({ input, admin }) => startImpersonation(admin, input),
);

export const changePlanAction = adminAction(
  { input: z.object({ orgId: id, plan: z.enum(PLANS), reason }) },
  async ({ input, admin }) => {
    await adminChangePlan(admin, input);
    return { done: true as const };
  },
);

export const setLimitsAction = adminAction(
  {
    input: z.object({
      orgId: id,
      overrides: z.partialRecord(
        z.enum(OVERRIDABLE_KEYS as [string, ...string[]]),
        z.number().int().min(0).max(1_000_000_000).nullable(),
      ),
      reason,
    }),
  },
  async ({ input, admin }) => {
    await setLimitOverrides(admin, input as Parameters<typeof setLimitOverrides>[1]);
    return { done: true as const };
  },
);

export const grantTrialAction = adminAction(
  { input: z.object({ orgId: id, days: z.number().int().min(1).max(90), reason }) },
  async ({ input, admin }) => {
    await adminGrantTrial(admin, input);
    return { done: true as const };
  },
);

export const suspendOrgAction = adminAction(
  { input: z.object({ orgId: id, reason }) },
  async ({ input, admin }) => {
    await suspendOrg(admin, input);
    return { done: true as const };
  },
);

export const unsuspendOrgAction = adminAction(
  { input: z.object({ orgId: id, reason: optionalReason }) },
  async ({ input, admin }) => {
    await unsuspendOrg(admin, input);
    return { done: true as const };
  },
);

export const updatePlanPriceAction = adminAction(
  {
    input: z.object({
      plan: z.enum(["pro", "team", "agency"]),
      interval: z.enum(["month", "year"]),
      priceUsd: z.number().positive().max(10_000),
      reason: optionalReason,
    }),
  },
  ({ input, admin }) => adminUpdatePlanPrice(admin, input),
);

export const updatePlatformSettingsAction = adminAction(
  {
    input: z.object({
      trialDays: z.number().int().min(1).max(90).optional(),
      trialAiCredits: z.number().int().min(0).max(1_000_000).optional(),
      freeGraceDays: z.number().int().min(0).max(90).optional(),
      freeOverAllowanceRetentionDays: z.number().int().min(1).max(365).optional(),
      retentionNoticeDays: z.number().int().min(0).max(90).optional(),
      paymentGraceDays: z.number().int().min(0).max(90).optional(),
      billingEnabled: z.boolean().optional(),
      googleSignIn: z.boolean().optional(),
      githubSignIn: z.boolean().optional(),
      aiEnabled: z.boolean().optional(),
      aiModel: z.string().trim().max(200).nullable().optional(),
      aiModelFast: z.string().trim().max(200).nullable().optional(),
      aiBaseUrl: z.string().trim().max(500).nullable().optional(),
      systemFromEmail: z.string().trim().max(320).nullable().optional(),
      creditPackCredits: z.number().int().min(1).max(1_000_000).optional(),
      creditPackPriceUsd: z.number().positive().max(10_000).optional(),
      creditPackMaxPacks: z.number().int().min(1).max(100).optional(),
      reason: optionalReason,
    }),
  },
  async ({ input, admin }) => {
    await adminUpdatePlatformSettings(admin, input);
    return { done: true as const };
  },
);
