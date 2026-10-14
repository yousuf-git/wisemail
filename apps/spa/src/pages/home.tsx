import { Navigate } from "@tanstack/react-router";

import { LandingPage } from "@/components/marketing/landing";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { authClient } from "@/lib/auth/client";

/** Marketing home for visitors; signed-in users go to first org or onboarding. */
export function HomePage() {
  const session = authClient.useSession();
  const orgs = authClient.useListOrganizations();

  if (session.isPending || orgs.isPending) {
    return <p className="p-6 text-sm text-ink-muted">Loading…</p>;
  }

  if (session.data?.user) {
    const first = orgs.data?.[0];
    if (first?.slug) {
      return <Navigate to="/$orgSlug" params={{ orgSlug: first.slug }} />;
    }
    return <Navigate to="/onboarding" />;
  }

  return (
    <MarketingShell>
      <LandingPage />
    </MarketingShell>
  );
}
