/** Stub: Fastify uses request headers via ALS / dal-request, not next/headers. */
export async function headers(): Promise<Headers> {
  throw new Error("next/headers is unavailable on the API; use dal-request");
}
