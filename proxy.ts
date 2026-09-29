import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Optimistic redirects only: this checks that a session cookie *exists*, never that it is valid
 * (no database access). Real checks happen in the Data Access Layer (`lib/dal.ts`).
 */
const PUBLIC_EXACT = new Set([
  "/",
  "/pricing",
  "/sign-out",
  "/forgot-password",
  "/reset-password",
  "/dev/outbox", // 404s in production
]);
const PUBLIC_PREFIXES = ["/invite/"];
const AUTH_PAGES = new Set(["/sign-in", "/sign-up"]);

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const hasSession = !!getSessionCookie(request);

  if (AUTH_PAGES.has(pathname)) {
    // `?expired` means the DAL found the cookie invalid: don't bounce back (would loop).
    if (hasSession && !request.nextUrl.searchParams.has("expired")) {
      return NextResponse.redirect(new URL("/onboarding", request.url));
    }
    return NextResponse.next();
  }

  const isPublic =
    PUBLIC_EXACT.has(pathname) || PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
  if (!isPublic && !hasSession) {
    const url = new URL("/sign-in", request.url);
    if (pathname !== "/") url.searchParams.set("next", pathname + search);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // Skip API routes, Next internals and files with an extension (assets).
  matcher: ["/((?!api|_next/static|_next/image|.*\\..*).*)"],
};
