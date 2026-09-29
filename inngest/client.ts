import { Inngest } from "inngest";

import { env } from "@/lib/env";

export * from "./events";

/** One client for sending events and defining functions. Local dev server when INNGEST_DEV. */
export const inngest = new Inngest({
  id: "wisemail",
  isDev: env.INNGEST_DEV,
  eventKey: env.INNGEST_EVENT_KEY,
  signingKey: env.INNGEST_SIGNING_KEY,
});
