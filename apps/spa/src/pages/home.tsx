import { useQuery } from "@tanstack/react-query";
import { Link, Navigate } from "@tanstack/react-router";

import { authClient } from "@/lib/auth/client";
import { getCatalog } from "@/lib/api";

/** Landing: signed-in users go to first org inbox; visitors see catalog + sign-in. */
export function HomePage() {
  const session = authClient.useSession();
  const orgs = authClient.useListOrganizations();
  const catalog = useQuery({
    queryKey: ["catalog"],
    queryFn: getCatalog,
    enabled: !session.data?.user,
  });

  if (session.isPending || orgs.isPending) {
    return <p className="text-sm text-ink-muted">Loading…</p>;
  }

  if (session.data?.user) {
    const first = orgs.data?.[0];
    if (first?.slug) {
      return <Navigate to="/$orgSlug" params={{ orgSlug: first.slug }} />;
    }
    return <Navigate to="/onboarding" />;
  }

  return (
    <section className="mx-auto max-w-lg py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Wisemail</h1>
      <p className="mt-2 text-sm text-ink-muted">
        SPA shell (M7). Sign in to open a workspace inbox against Fastify.
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          to="/sign-in"
          className="inline-flex h-9 items-center rounded-control bg-accent-fill px-4 text-sm font-semibold text-accent-ink hover:bg-accent-fill-hover"
        >
          Sign in
        </Link>
        <Link
          to="/sign-up"
          className="inline-flex h-9 items-center rounded-control border border-line px-4 text-sm font-medium hover:bg-canvas-sunken"
        >
          Create account
        </Link>
      </div>
      <p className="mt-6 text-sm text-ink-muted">
        {catalog.isPending
          ? "Checking catalog…"
          : catalog.isError
            ? "API catalog unreachable — start `pnpm dev:api`."
            : typeof catalog.data === "object" && catalog.data && "plans" in catalog.data
              ? `Catalog OK · ${(catalog.data as { plans?: unknown[] }).plans?.length ?? 0} plans`
              : "Catalog OK"}
      </p>
    </section>
  );
}
