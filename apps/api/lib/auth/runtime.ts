import "server-only";

import { createAuth } from "./create-auth";

/**
 * Better Auth for HTTP (Fastify / Node). No `nextCookies` — cookies are set on the response by
 * `toNodeHandler`. Session reads (`dal-request`, webhooks helpers) use this instance.
 */
export const auth = createAuth();

export type { Auth } from "./create-auth";
