import { afterAll, beforeAll, expect, it } from "vitest";

import { startTestDb, uniqueEmail } from "./helpers";

let stop: () => Promise<void>;
beforeAll(async () => {
  ({ stop } = await startTestDb("wisemail-auth-concurrency"));
});
afterAll(async () => stop?.());

const password = "correct horse battery";

it("concurrent sign-ups on a fresh database all succeed", async () => {
  const { auth } = await import("@/lib/auth/server");
  const { connectDb } = await import("@/lib/db/connect");
  await connectDb();
  const results = await Promise.allSettled(
    Array.from({ length: 6 }, (_, i) =>
      auth.api.signUpEmail({ body: { name: `User ${i}`, email: uniqueEmail(), password } }),
    ),
  );
  expect(results.map((r) => r.status)).toEqual(Array(6).fill("fulfilled"));
});

it("the same email can never create two users", async () => {
  const { auth } = await import("@/lib/auth/server");
  const { getMongoClient } = await import("@/lib/db/connect");
  const email = uniqueEmail("dup");
  await Promise.allSettled(
    Array.from({ length: 4 }, () =>
      auth.api.signUpEmail({ body: { name: "Dup", email, password } }),
    ),
  );
  expect(await getMongoClient().db().collection("user").countDocuments({ email })).toBe(1);
});
