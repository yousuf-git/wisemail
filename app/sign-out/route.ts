import { headers } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

import { auth } from "@/lib/auth/server";

async function signOut(request: NextRequest) {
  try {
    await auth.api.signOut({ headers: await headers() });
  } catch {
    // No session or already expired: the goal (being signed out) is met either way.
  }
  // 303 so a POST turns into a GET of the sign-in page.
  return NextResponse.redirect(new URL("/sign-in", request.url), 303);
}

export const GET = signOut;
export const POST = signOut;
