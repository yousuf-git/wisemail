import "server-only";

import { loadEnv } from "./env-schema";

export type { Env } from "./env-schema";

export const env = loadEnv();
