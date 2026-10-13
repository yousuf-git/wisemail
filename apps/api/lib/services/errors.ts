/**
 * Expected, user-facing failure raised by a service. `orgAction` turns it into a typed
 * `{ ok: false, error }` result; anything else is an internal error.
 */
export class ServiceError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly fieldErrors?: Record<string, string[]>,
  ) {
    super(message);
    this.name = "ServiceError";
  }
}
