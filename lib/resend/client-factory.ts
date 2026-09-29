import "server-only";

import { env } from "@/lib/env";
import { LiveResendAdapter, type ResendAdapter } from "./adapter";
import { FakeResendAdapter } from "./fake-adapter";

/** One adapter per API key: live Resend, or the in-memory fake, chosen by `RESEND_MODE`. */
export function getResendAdapter(apiKey: string): ResendAdapter {
  return env.RESEND_MODE === "live" ? new LiveResendAdapter(apiKey) : new FakeResendAdapter(apiKey);
}
