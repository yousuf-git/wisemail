import { explainIncident } from "@/lib/services/ai-anomaly";
import { explainIncidentSchema } from "@/lib/validation/ai";
import { aiPost } from "../_lib";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** `POST /api/v1/ai/explain?orgSlug=` `{ incidentId, refresh? }` -> `{ text, generatedAt, cached }`. */
export function POST(request: Request) {
  return aiPost(request, explainIncidentSchema, (ctx, input) =>
    explainIncident(ctx, input.incidentId, { refresh: input.refresh }),
  );
}
