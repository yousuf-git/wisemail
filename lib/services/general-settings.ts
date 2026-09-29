import "server-only";

import { Types } from "mongoose";
import mongoose from "mongoose";

import { authorize, type OrgContext } from "@/lib/dal";
import { connectDb } from "@/lib/db/connect";
import { OrgSettingsModel } from "@/lib/db/models/org-settings";
import { withTransaction } from "@/lib/db/transaction";
import type { RequestDeletionInput, UpdateGeneralInput } from "@/lib/validation/general-settings";
import { writeAuditLog } from "./audit";
import { ServiceError } from "./errors";

export type GeneralSettingsDTO = { name: string; slug: string; timezone: string };

const orgOid = (ctx: OrgContext) => new Types.ObjectId(ctx.org.id);

export async function getGeneralSettings(ctx: OrgContext): Promise<GeneralSettingsDTO> {
  await connectDb();
  const settings = await OrgSettingsModel.findOne({ orgId: orgOid(ctx) }, { timezone: 1 }).lean();
  return { name: ctx.org.name, slug: ctx.org.slug, timezone: settings?.timezone ?? "UTC" };
}

/**
 * Renames the workspace, changes its address (slug) and time zone. The slug must be free and not
 * reserved; the caller redirects to the new address because the old one stops working.
 */
export async function updateGeneralSettings(
  ctx: OrgContext,
  input: UpdateGeneralInput,
): Promise<GeneralSettingsDTO> {
  authorize(ctx, "organization:update");
  await connectDb();
  const orgId = orgOid(ctx);
  const orgs = mongoose.connection.collection("organization");

  if (input.slug !== ctx.org.slug) {
    const taken = await orgs.findOne(
      { slug: input.slug, _id: { $ne: orgId } },
      { projection: { _id: 1 } },
    );
    if (taken) {
      throw new ServiceError("conflict", "That address is already taken.", {
        slug: ["That address is already taken."],
      });
    }
  }

  return withTransaction(async (session) => {
    const before = await OrgSettingsModel.findOne({ orgId }, { timezone: 1 }, { session }).lean();
    await orgs.updateOne(
      { _id: orgId },
      { $set: { name: input.name, slug: input.slug } },
      { session },
    );
    await OrgSettingsModel.updateOne(
      { orgId },
      { $set: { timezone: input.timezone } },
      { session },
    );
    const beforeState = {
      name: ctx.org.name,
      slug: ctx.org.slug,
      timezone: before?.timezone ?? "UTC",
    };
    if (
      beforeState.name !== input.name ||
      beforeState.slug !== input.slug ||
      beforeState.timezone !== input.timezone
    ) {
      await writeAuditLog(
        {
          orgId,
          actor: { type: "user", id: new Types.ObjectId(ctx.user.id) },
          action: "organization.updated",
          target: { type: "organization", id: orgId },
          changes: { before: beforeState, after: input },
        },
        { session },
      );
    }
    return { name: input.name, slug: input.slug, timezone: input.timezone };
  });
}

/**
 * Placeholder for workspace deletion (DBD §5: 30-day soft delete, then purge): the Owner's
 * request is recorded in the audit log and nothing is deleted yet.
 * TODO: soft delete + purge job with connection webhook clean-up.
 */
export async function requestOrganizationDeletion(
  ctx: OrgContext,
  input: RequestDeletionInput,
): Promise<{ recorded: true }> {
  authorize(ctx, "organization:delete");
  if (input.confirmName.trim() !== ctx.org.name) {
    throw new ServiceError("validation", "The name does not match.", {
      confirmName: ["Type the workspace name exactly."],
    });
  }
  await connectDb();
  const orgId = orgOid(ctx);
  await writeAuditLog({
    orgId,
    actor: { type: "user", id: new Types.ObjectId(ctx.user.id) },
    action: "organization.deletion_requested",
    target: { type: "organization", id: orgId },
  });
  return { recorded: true };
}
