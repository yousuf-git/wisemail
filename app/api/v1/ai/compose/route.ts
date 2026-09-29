import { composeAssist } from "@/lib/services/ai-compose";
import { composeAssistSchema } from "@/lib/validation/ai";
import { aiPost } from "../_lib";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** `POST /api/v1/ai/compose?orgSlug=` `{ action, subject?, bodyHtml, tone? }` -> subjects or text. */
export function POST(request: Request) {
  return aiPost(request, composeAssistSchema, composeAssist);
}
