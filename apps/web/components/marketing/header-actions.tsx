"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

// Checked in the browser so marketing pages stay static (no session lookup per visitor). The three
// header variants mount together and share one request. Any failure reads as "signed out".
let pending: Promise<boolean> | null = null;

function fetchSignedIn() {
  pending ??= fetch("/api/auth/get-session")
    .then((res) => (res.ok ? res.json() : null))
    .then((data: { session?: unknown } | null) => !!data?.session)
    .catch(() => false)
    .finally(() => {
      pending = null;
    });
  return pending;
}

export function HeaderActions({ variant }: { variant: "bar" | "compact" | "stack" }) {
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    let active = true;
    fetchSignedIn().then((value) => {
      if (active) setSignedIn(value);
    });
    return () => {
      active = false;
    };
  }, []);
  return <ActionButtons signedIn={signedIn} variant={variant} />;
}

function ActionButtons({
  signedIn,
  variant,
}: {
  signedIn: boolean;
  variant: "bar" | "compact" | "stack";
}) {
  if (variant === "compact") {
    return (
      <Button asChild size="sm" className="rounded-full font-semibold md:hidden">
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
        <Button asChild className="rounded-full font-semibold">
          <Link href="/onboarding">Open app</Link>
        </Button>
      ) : (
        <>
          <Button asChild variant="ghost" className="rounded-full font-medium">
            <Link href="/sign-in">Sign in</Link>
          </Button>
          <Button asChild className="rounded-full font-semibold">
            <Link href="/sign-up">Get started</Link>
          </Button>
        </>
      )}
    </div>
  );
}
