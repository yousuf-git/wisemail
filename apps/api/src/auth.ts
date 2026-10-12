import { createAuth } from "@/lib/auth/create-auth";

/** Fastify Better Auth instance — no `nextCookies` (Node handler sets cookies on the response). */
export const auth = createAuth();
