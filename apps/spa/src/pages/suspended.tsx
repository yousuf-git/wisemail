import { Link, Navigate, useParams } from "@tanstack/react-router";

import { authClient } from "@/lib/auth/client";

/** Members of a suspended workspace land here; APIs refuse with `workspace_suspended`. */
export function SuspendedPage() {
  const { orgSlug } = useParams({ from: "/suspended/$orgSlug" });
  const session = authClient.useSession();
  const orgs = authClient.useListOrganizations();

  if (session.isPending || orgs.isPending) {
    return (
      <div className="grid min-h-dvh place-items-center bg-canvas text-sm text-ink-muted">
        Loading…
      </div>
    );
  }

  if (!session.data?.user) {
    return <Navigate to="/sign-in" search={{ next: `/suspended/${orgSlug}` }} />;
  }

  const current = (orgs.data ?? []).find((o) => o.slug === orgSlug);
  const others = (orgs.data ?? []).filter((o) => o.slug !== orgSlug);

  return (
    <section className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-4 py-10">
      <div>
        <p className="text-sm font-semibold tracking-tight text-accent-fill">Wisemail</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Workspace suspended</h1>
        <p className="mt-2 text-sm text-ink-muted">
          {current?.name ?? orgSlug} has been put on hold by Wisemail. Nothing has been deleted.
        </p>
      </div>
      <p className="text-sm text-ink-secondary">
        Mail keeps being collected in the background, but the workspace is closed until the
        suspension is lifted. Contact Wisemail support to find out why and how to get it back.
      </p>
      <div className="flex flex-wrap gap-3">
        {others.map((o) => (
          <Link
            key={o.id}
            to="/$orgSlug"
            params={{ orgSlug: o.slug }}
            className="rounded-control bg-accent-fill px-4 py-2 text-sm font-medium text-accent-ink hover:bg-accent-fill-hover"
          >
            Open {o.name}
          </Link>
        ))}
        <button
          type="button"
          className="rounded-control border border-line-strong px-4 py-2 text-sm font-medium hover:bg-canvas-sunken"
          onClick={async () => {
            await authClient.signOut();
            window.location.assign("/sign-in");
          }}
        >
          Sign out
        </button>
      </div>
    </section>
  );
}
