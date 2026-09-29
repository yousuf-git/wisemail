"use server";

import { headers } from "next/headers";
import { APIError } from "better-auth/api";

import { userAction, ActionFailure } from "@/lib/actions/action";
import type { ActionResult } from "@/lib/actions/result";
import { auth } from "@/lib/auth/server";
import { isSlugTaken } from "@/lib/services/tenancy";
import { checkSlugSchema, createOrgSchema, type CreateOrgInput } from "@/lib/validation/org";

const create = userAction({ input: createOrgSchema }, async ({ input }) => {
  if (await isSlugTaken(input.slug)) {
    throw new ActionFailure("conflict", "That address is taken. Try another.", {
      slug: ["That address is taken."],
    });
  }
  try {
    // Session headers make the caller the owner; the org_settings + audit hook runs inside.
    const org = await auth.api.createOrganization({
      headers: await headers(),
      body: { name: input.name, slug: input.slug },
    });
    return { slug: org.slug };
  } catch (error) {
    if (error instanceof APIError) {
      throw new ActionFailure("conflict", error.message || "We couldn't create that workspace.");
    }
    throw error;
  }
});

const check = userAction({ input: checkSlugSchema }, async ({ input }) => ({
  available: !(await isSlugTaken(input.slug)),
}));

export async function createOrganization(
  input: CreateOrgInput,
): Promise<ActionResult<{ slug: string }>> {
  return create(input);
}

export async function checkSlug(input: {
  slug: string;
}): Promise<ActionResult<{ available: boolean }>> {
  return check(input);
}
