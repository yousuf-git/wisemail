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

/**
 * Creates a user the way production does (sign-up), marks the address verified (what clicking
 * the emailed link does) and signs in, returning the session cookie headers. Sign-up itself no
 * longer creates a session because email verification is required.
 */
export async function signUpVerified(
  auth: {
    api: {
      signUpEmail: (o: { body: { name: string; email: string; password: string } }) => Promise<{
        user: { id: string };
      }>;
      signInEmail: (o: {
        body: { email: string; password: string };
        returnHeaders: true;
      }) => Promise<{
        headers: Headers;
        response: { user: { id: string } };
      }>;
    };
  },
  input: { name: string; email: string; password?: string },
) {
  const password = input.password ?? "correct horse battery";
  await auth.api.signUpEmail({ body: { name: input.name, email: input.email, password } });
  const { default: mongoose } = await import("mongoose");
  await mongoose.connection
    .collection("user")
    .updateOne({ email: input.email.toLowerCase() }, { $set: { emailVerified: true } });
  const res = await auth.api.signInEmail({
    body: { email: input.email, password },
    returnHeaders: true,
  });
  const cookie = res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  return { id: res.response.user.id, headers: new Headers({ cookie }) };
}
