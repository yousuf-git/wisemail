import { draftReply } from "@/lib/services/ai-draft";
import { draftReplySchema } from "@/lib/validation/ai";
import { aiPost } from "../_lib";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** `POST /api/v1/ai/draft?orgSlug=` `{ threadId, tone, instructions? }` -> `{ html, text, model }`. */
export function POST(request: Request) {
  return aiPost(request, draftReplySchema, draftReply);
}
