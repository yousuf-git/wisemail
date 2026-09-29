import type { ActionError } from "@/lib/actions/result";

export type FriendlyError = {
  message: string;
  /** Per-field messages (`to`, `subject`, `html`, `scheduledAt`, `senderId`, ...). */
  fields: Record<string, string>;
};

/** Field errors arrive as `to.1`, `cc.0`; the composer shows them under the field itself. */
export function fieldMessages(fieldErrors: ActionError["fieldErrors"]): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const [path, messages] of Object.entries(fieldErrors ?? {})) {
    const key = path.split(".")[0] || "_";
    fields[key] ??= messages[0] ?? "";
  }
  return fields;
}

/** ActionResult codes to plain-words copy that says what happened and what to do (FED §8). */
export function friendlyError(error: ActionError): FriendlyError {
  const fields = fieldMessages(error.fieldErrors);
  switch (error.code) {
    case "unauthenticated":
      return { message: "Your session ended. Sign in again to keep going.", fields };
    case "forbidden":
      return { message: "Your role can't send email. Ask an Owner or Admin for access.", fields };
    case "not_found":
      return { message: error.message || "We couldn't find that anymore.", fields };
    case "validation":
      return { message: "Some fields need another look.", fields };
    case "conflict":
      return { message: error.message, fields };
    case "sender_inactive":
      return { message: `${error.message} The sender list shows why each one is off.`, fields };
    case "domain_unverified":
      return {
        message: `${error.message} Verify it in Resend, then try again.`,
        fields,
      };
    case "connection_inactive":
      return {
        message:
          "This Resend connection needs attention, so it can't send. Open Settings, then Connections, to fix it.",
        fields,
      };
    case "attachment_too_large":
      return { message: error.message, fields };
    case "upload_failed":
      return { message: error.message, fields };
    case "resend_rejected":
      return { message: `Resend didn't accept this email: ${error.message}`, fields };
    case "disabled":
      return { message: error.message, fields };
    default:
      return {
        message: error.message || "Something went wrong on our side. Try again in a moment.",
        fields,
      };
  }
}
