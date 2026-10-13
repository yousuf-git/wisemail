import "server-only";

import { nextCookies } from "better-auth/next-js";

import { createAuth } from "./create-auth";

/** Next.js Better Auth instance (`nextCookies` last for Server Actions). */
export const auth = createAuth({ trailingPlugins: [nextCookies()] });

export type { Auth } from "./create-auth";
