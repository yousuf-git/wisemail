import { toNextJsHandler } from "better-auth/next-js";

import { auth } from "@/lib/auth/server";
import { connectDb } from "@/lib/db/connect";

const handler = toNextJsHandler(auth);

// Better Auth uses the shared client directly; make sure its collections and indexes exist first.
export async function GET(request: Request) {
  await connectDb();
  return handler.GET(request);
}

export async function POST(request: Request) {
  await connectDb();
  return handler.POST(request);
}
