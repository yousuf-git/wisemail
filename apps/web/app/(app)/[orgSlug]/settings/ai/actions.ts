"use server";

import { orgAction } from "@/lib/actions/action";
import type { ActionResult } from "@/lib/actions/result";
import type { AiSwitches } from "@/lib/ai/access";
import { updateAiSettings } from "@/lib/services/ai-settings";
import { aiSettingsSchema, type AiSettingsInput } from "@/lib/validation/ai";

const update = orgAction(
  { input: aiSettingsSchema, permission: "ai:configure" },
  ({ ctx, input }) => updateAiSettings(ctx, input),
);

export async function updateAiSettingsAction(
  orgSlug: string,
  input: AiSettingsInput,
): Promise<ActionResult<AiSwitches>> {
  return update(orgSlug, input);
}
