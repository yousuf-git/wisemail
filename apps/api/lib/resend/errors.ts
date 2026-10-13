import type { ResendErrorCode } from "./types";

export class ResendError extends Error {
  constructor(
    readonly code: ResendErrorCode,
    message: string,
    readonly details: {
      status?: number | null;
      retryAfterSeconds?: number;
      resendName?: string;
    } = {},
  ) {
    super(message);
    this.name = "ResendError";
  }
}

export function isResendError(error: unknown): error is ResendError {
  return error instanceof ResendError;
}

/** Shape of `error` in the Resend SDK's `{ data, error, headers }` responses. */
export type SdkError = { name?: string; message?: string; statusCode?: number | null };

const VALIDATION_NAMES = new Set([
  "validation_error",
  "invalid_parameter",
  "invalid_region",
  "missing_required_field",
  "invalid_from_address",
  "invalid_attachment",
  "invalid_idempotency_key",
  "invalid_idempotent_request",
  "concurrent_idempotent_requests",
]);

/**
 * Maps a Resend API error to our codes (TRD §5). Error names win over status codes because Resend
 * reuses statuses (a restricted key is 401 but means "forbidden", not "bad key").
 * `headers` are the response headers, used for `retry-after`.
 */
export function mapResendError(
  error: SdkError,
  headers?: Record<string, string> | null,
): ResendError {
  const name = error.name ?? "";
  const status = error.statusCode ?? null;
  const message = error.message || "Resend returned an error.";
  const retry = Number(headers?.["retry-after"]);
  const details = {
    status,
    resendName: name || undefined,
    retryAfterSeconds: Number.isFinite(retry) && retry > 0 ? retry : undefined,
  };
  const as = (code: ResendErrorCode) => new ResendError(code, message, details);

  if (name === "rate_limit_exceeded" || status === 429) return as("resend_rate_limited");
  if (name === "restricted_api_key" || name === "invalid_access") return as("resend_forbidden");
  if (name === "invalid_api_key" || name === "missing_api_key") return as("resend_unauthorized");
  if (name === "not_found" || status === 404) return as("resend_not_found");
  if (VALIDATION_NAMES.has(name)) return as("resend_validation");
  if (status === 403) return as("resend_forbidden");
  if (status === 401) return as("resend_unauthorized");
  if (status === 400 || status === 422) return as("resend_validation");
  return as("resend_unknown");
}
