import Link from "next/link";

import { Button } from "@/components/ui/button";
import { getSession } from "@/lib/dal";

/** Signed-in state without forcing a redirect. Any failure reads as "signed out". */
async function isSignedIn() {
  try {
    return !!(await getSession());
  } catch {
    return false;
  }
}

export async function HeaderActions({ variant }: { variant: "bar" | "compact" | "stack" }) {
  const signedIn = await isSignedIn();
  return <ActionButtons signedIn={signedIn} variant={variant} />;
}

export function ActionButtons({
  signedIn,
  variant,
}: {
  signedIn: boolean;
  variant: "bar" | "compact" | "stack";
}) {
  if (variant === "compact") {
    return (
      <Button asChild size="sm" className="font-bold md:hidden">
        <Link href={signedIn ? "/onboarding" : "/sign-up"}>
          {signedIn ? "Open app" : "Get started"}
        </Link>
      </Button>
    );
  }
  const stack = variant === "stack";
  return (
    <div className={stack ? "grid gap-2" : "hidden items-center gap-1 md:flex"}>
      {signedIn ? (
        <Button asChild className="font-bold">
          <Link href="/onboarding">Open app</Link>
        </Button>
      ) : (
        <>
          <Button asChild variant="ghost" className="font-semibold">
            <Link href="/sign-in">Sign in</Link>
          </Button>
          <Button asChild className="font-bold">
            <Link href="/sign-up">Get started</Link>
          </Button>
        </>
      )}
    </div>
  );
}
