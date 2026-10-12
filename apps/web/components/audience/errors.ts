import type { ActionError } from "@/lib/actions/result";

/** Plain-words copy for the Phase 6 action errors (FED §8): what happened, what to do. */
export function audienceError(error: ActionError): string {
  switch (error.code) {
    case "unauthenticated":
      return "Your session ended. Sign in again to keep going.";
    case "forbidden":
      return "Your role can't do that. Ask an Owner or Admin if you need access.";
    case "rate_limited":
      return "Resend is asking us to slow down. Give it a moment and try again.";
    case "connection_read_only":
    case "connection_inactive":
      return error.message;
    case "resend_rejected":
      return `Resend said: ${error.message}`;
    case "resend_not_found":
      return "Resend doesn't have that anymore. Sync the account to refresh.";
    case "conflict":
      return error.message;
    case "segment_empty":
    case "segment_missing":
    case "template_unpublished":
    case "sender_inactive":
    case "domain_unverified":
      return error.message;
    case "validation": {
      const first = Object.values(error.fieldErrors ?? {})[0]?.[0];
      return first ?? "Some fields need another look.";
    }
    default:
      return error.message || "Something went wrong on our side. Try again in a moment.";
  }
}

/** `properties.company` -> `properties`: first path segment, first message. */
export function fieldErrorMap(fieldErrors: ActionError["fieldErrors"]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [path, messages] of Object.entries(fieldErrors ?? {})) {
    out[path] ??= messages[0] ?? "";
    const head = path.split(".")[0] ?? path;
    out[head] ??= messages[0] ?? "";
  }
  return out;
}
