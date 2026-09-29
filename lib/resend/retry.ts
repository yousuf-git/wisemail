import { isResendError } from "./errors";

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * For interactive calls that run inline in a server action (TRD §2.3): on a 429, wait for
 * Resend's `retry-after` (capped, so the person is not left waiting) and try again.
 * Background jobs do not use this; they sleep durably in Inngest instead.
 */
export async function withRateLimitRetry<T>(
  fn: () => Promise<T>,
  options: { attempts?: number; maxWaitMs?: number; sleep?: (ms: number) => Promise<void> } = {},
): Promise<T> {
  const attempts = options.attempts ?? 3;
  const maxWait = options.maxWaitMs ?? 3000;
  const sleep = options.sleep ?? defaultSleep;
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (!isResendError(error) || error.code !== "resend_rate_limited" || attempt >= attempts) {
        throw error;
      }
      const wait = Math.min((error.details.retryAfterSeconds ?? 1) * 1000, maxWait);
      await sleep(wait);
    }
  }
}
