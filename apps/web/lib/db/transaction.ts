import "server-only";

import type { ClientSession } from "mongoose";
import mongoose from "mongoose";

import { connectDb } from "./connect";

/**
 * Runs `fn` in a multi-document transaction (snapshot reads, majority writes).
 * The driver retries the callback on TransientTransactionError and the commit on
 * UnknownTransactionCommitResult, so `fn` must be safe to re-run: no external side effects,
 * and pass `session` to every query.
 */
export async function withTransaction<T>(fn: (session: ClientSession) => Promise<T>): Promise<T> {
  await connectDb();
  const session = await mongoose.connection.startSession();
  try {
    let result!: T;
    await session.withTransaction(
      async () => {
        result = await fn(session);
      },
      { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" } },
    );
    return result;
  } finally {
    await session.endSession();
  }
}
