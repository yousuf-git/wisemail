import { serve } from "inngest/next";

import { inngest } from "@/inngest/client";
import { dnsCheckDaily, dnsCheckOnDemand } from "@/inngest/functions/dns-check";
import { dailyDigest } from "@/inngest/functions/digest";
import { evaluateAlerts } from "@/inngest/functions/evaluate-alerts";
import { fetchInbound } from "@/inngest/functions/fetch-inbound";
import { importContacts } from "@/inngest/functions/import-contacts";
import { processEvent } from "@/inngest/functions/process-event";
import { sendBroadcast } from "@/inngest/functions/send-broadcast";
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
    sendBroadcast,
    importContacts,
    evaluateAlerts,
    silenceCheck,
    dailyDigest,
    dnsCheckDaily,
    dnsCheckOnDemand,
  ],
});
