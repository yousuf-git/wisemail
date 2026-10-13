/** Stub: Next navigation APIs are unused on the Fastify runtime. */
export function notFound(): never {
  throw new Error("not_found");
}

export function redirect(_url: string): never {
  throw new Error("redirect_unsupported_on_api");
}

export function unstable_rethrow(error: unknown): void {
  throw error;
}
