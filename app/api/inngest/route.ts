import { serve } from "inngest/next";

import { inngest } from "@/inngest/client";
import { dailyDigest } from "@/inngest/functions/digest";
import { evaluateAlerts } from "@/inngest/functions/evaluate-alerts";
import { fetchInbound } from "@/inngest/functions/fetch-inbound";
import { processEvent } from "@/inngest/functions/process-event";
import { sendEmail } from "@/inngest/functions/send-email";
import { silenceCheck } from "@/inngest/functions/silence-check";
import { syncConnection } from "@/inngest/functions/sync-connection";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    processEvent,
    syncConnection,
    fetchInbound,
    sendEmail,
    evaluateAlerts,
    silenceCheck,
    dailyDigest,
  ],
});
