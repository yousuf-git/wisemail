import { useMutation } from "@tanstack/react-query";
import { Link, Navigate, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { callUserAction } from "@/lib/api";
import { authClient } from "@/lib/auth/client";

function slugify(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
}

/** Create the first (or another) workspace when the user has none. */
export function OnboardingPage() {
  const navigate = useNavigate();
  const session = authClient.useSession();
  const orgs = authClient.useListOrganizations();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const derivedSlug = useMemo(() => slugify(name), [name]);
  const effectiveSlug = slugTouched ? slug : derivedSlug;

  const create = useMutation({
    mutationFn: () =>
      callUserAction<{ slug: string }>("onboarding.createOrg", {
        name: name.trim(),
        slug: effectiveSlug,
      }),
    onSuccess: async (result) => {
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      await orgs.refetch();
      await navigate({
        to: "/$orgSlug/inbox",
        params: { orgSlug: result.data.slug },
      });
    },
    onError: () => setError("Could not create that workspace."),
  });

  if (session.isPending || orgs.isPending) {
    return (
      <div className="grid min-h-dvh place-items-center text-sm text-ink-muted">Loading…</div>
    );
  }

  if (!session.data?.user) {
    return <Navigate to="/sign-in" search={{ next: "/onboarding" }} />;
  }

  const firstName = session.data.user.name.split(" ")[0] || "there";

  return (
    <section className="mx-auto grid min-h-dvh max-w-md content-center gap-4 px-4 py-10">
      <div>
        <p className="text-sm font-semibold tracking-tight text-ink-muted">Wisemail</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Welcome, {firstName}</h1>
        <p className="mt-2 text-sm text-ink-muted">
          Name your workspace — where Resend accounts, mail, and your team come together.
        </p>
      </div>
      {error ? (
        <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger-ink">
          {error}
        </p>
      ) : null}
      <form
        className="grid gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          create.mutate();
        }}
      >
        <label className="grid gap-1 text-sm">
          Workspace name
          <input
            required
            minLength={2}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-10 rounded-control border border-line bg-canvas-sunken px-3"
            placeholder="Acme Mail"
          />
        </label>
        <label className="grid gap-1 text-sm">
          URL slug
          <input
            required
            minLength={3}
            pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
            value={effectiveSlug}
            onChange={(e) => {
              setSlugTouched(true);
              setSlug(e.target.value.toLowerCase());
            }}
            className="h-10 rounded-control border border-line bg-canvas-sunken px-3 font-mono text-sm"
            placeholder="acme-mail"
          />
        </label>
        <button
          type="submit"
          disabled={create.isPending || name.trim().length < 2 || effectiveSlug.length < 3}
          className="h-11 rounded-control bg-accent-fill text-sm font-semibold text-accent-ink disabled:opacity-50"
        >
          {create.isPending ? "Creating…" : "Create workspace"}
        </button>
      </form>
      <Link to="/admin" className="text-center text-sm text-ink-muted hover:text-ink">
        Platform admin
      </Link>
    </section>
  );
}
