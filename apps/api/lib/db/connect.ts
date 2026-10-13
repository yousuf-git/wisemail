import "server-only";

import mongoose from "mongoose";
import type { MongoClient } from "mongodb";

import { env } from "@/lib/env";

import { ensureAuthCollections } from "./auth-collections";

/**
 * One MongoClient (one pool) shared by Mongoose and Better Auth's MongoDB adapter.
 *
 * Mongoose creates the client, so we borrow it via `mongoose.connection.getClient()`: the
 * `mongodb` package is installed in more than one version here and Mongoose rejects a client
 * built from a different copy (`setClient` does an `instanceof` check). The connection is cached
 * on `globalThis` so Next.js hot reloads don't leak pools.
 */
type Cache = { client: MongoClient; ready: Promise<typeof mongoose> };

const globalForMongo = globalThis as unknown as { __wisemailMongo?: Cache };

function open(): Cache {
  const connecting = mongoose.connect(env.MONGODB_URI, { maxPoolSize: 20 });
  // The client exists as soon as connect() is called; it also connects lazily on first use.
  const client = mongoose.connection.getClient() as unknown as MongoClient;
  const ready = connecting.then(async (m) => {
    await ensureAuthCollections(client.db());
    return m;
  });
  return { client, ready };
}

function cache(): Cache {
  globalForMongo.__wisemailMongo ??= open();
  return globalForMongo.__wisemailMongo;
}

/** Synchronous accessor used by Better Auth at module init. */
export function getMongoClient(): MongoClient {
  const c = cache();
  // A failed initial connect is retried on the next connectDb() call; don't crash on it here.
  c.ready.catch(() => undefined);
  return c.client;
}

/** Resolves once the shared connection is up. Idempotent; retries after a failed attempt. */
export async function connectDb(): Promise<typeof mongoose> {
  const c = cache();
  try {
    return await c.ready;
  } catch (error) {
    globalForMongo.__wisemailMongo = undefined;
    await mongoose.disconnect().catch(() => undefined);
    throw error;
  }
}

/** Closes the shared connection (tests, scripts). */
export async function disconnectDb(): Promise<void> {
  if (!globalForMongo.__wisemailMongo) return;
  globalForMongo.__wisemailMongo = undefined;
  await mongoose.disconnect().catch(() => undefined);
}
