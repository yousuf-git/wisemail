import "server-only";

import { env } from "@/lib/env";
import { FakeStore } from "./fake";
import { getR2Store } from "./r2";
import type { ObjectStore } from "./types";

export * from "./types";
export { storageKeys } from "./keys";

const globalForStore = globalThis as unknown as { __wisemailFakeStore?: FakeStore };

/** R2 in production, the local fake otherwise (`STORAGE_MODE`). */
export function getStore(): ObjectStore {
  if (env.STORAGE_MODE === "r2") return getR2Store();
  globalForStore.__wisemailFakeStore ??= new FakeStore();
  return globalForStore.__wisemailFakeStore;
}
