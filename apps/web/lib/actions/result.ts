/** Typed server-action result (TRD §5). Safe to import from client components. */
export type ActionErrorCode =
  "unauthenticated" | "forbidden" | "not_found" | "validation" | "conflict" | "internal";

export type ActionError = {
  code: ActionErrorCode | (string & {});
  message: string;
  fieldErrors?: Record<string, string[]>;
};

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: ActionError };

export const ok = <T>(data: T): ActionResult<T> => ({ ok: true, data });

export const fail = (
  code: ActionError["code"],
  message: string,
  fieldErrors?: Record<string, string[]>,
): ActionResult<never> => ({ ok: false, error: { code, message, fieldErrors } });
