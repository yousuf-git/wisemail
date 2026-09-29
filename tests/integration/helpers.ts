import { MongoMemoryReplSet } from "mongodb-memory-server";

/**
 * Starts an in-memory replica set and points MONGODB_URI at it. Call before importing anything
 * that loads `lib/env` (use dynamic imports after this resolves).
 */
export async function startTestDb(dbName = "wisemail-test") {
  const replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.MONGODB_URI = replSet.getUri(dbName);
  return {
    uri: process.env.MONGODB_URI,
    stop: async () => {
      await replSet.stop();
    },
  };
}

let counter = 0;
export const uniqueEmail = (prefix = "user") => `${prefix}${Date.now()}${counter++}@example.com`;
