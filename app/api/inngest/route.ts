import { serve } from "inngest/next";

import { inngest } from "@/inngest/client";
import { processEvent } from "@/inngest/functions/process-event";
import { syncConnection } from "@/inngest/functions/sync-connection";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [processEvent, syncConnection],
});
