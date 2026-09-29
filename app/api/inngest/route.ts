import { serve } from "inngest/next";

import { inngest } from "@/inngest/client";
import { aiTriage } from "@/inngest/functions/ai-triage";
import { applyPlanChange } from "@/inngest/functions/apply-plan-change";
import { bulkDelete } from "@/inngest/functions/bulk-delete";
import { cleanupRules } from "@/inngest/functions/cleanup-rules";
import { deleteConnectionData } from "@/inngest/functions/delete-connection-data";
import { dnsCheckDaily, dnsCheckOnDemand } from "@/inngest/functions/dns-check";
import { dailyDigest } from "@/inngest/functions/digest";
import { evaluateAlerts } from "@/inngest/functions/evaluate-alerts";
import { fetchInbound } from "@/inngest/functions/fetch-inbound";
import { importContacts } from "@/inngest/functions/import-contacts";
import { processEvent } from "@/inngest/functions/process-event";
import { purgeTrash } from "@/inngest/functions/purge-trash";
import { retention } from "@/inngest/functions/retention";
import { sendBroadcast } from "@/inngest/functions/send-broadcast";
import { sendEmail } from "@/inngest/functions/send-email";
import { silenceCheck } from "@/inngest/functions/silence-check";
import { syncConnection } from "@/inngest/functions/sync-connection";
import { trialEnd } from "@/inngest/functions/trial-end";
import { usageThresholds } from "@/inngest/functions/usage-thresholds";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    purgeTrash,
    retention,
    cleanupRules,
    bulkDelete,
    deleteConnectionData,
    aiTriage,
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
    usageThresholds,
    applyPlanChange,
    trialEnd,
  ],
});
