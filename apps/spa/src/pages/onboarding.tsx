import { useMutation } from "@tanstack/react-query";
import { Link, Navigate, useNavigate, useSearch } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { ImpersonationBanner } from "@/components/admin/impersonation-banner";
import { AuthShell, FormAlert } from "@/components/auth/auth-shell";
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
  const search = useSearch({ from: "/onboarding" });
  const wantsNew = search.new !== undefined;
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
        to: "/$orgSlug",
        params: { orgSlug: result.data.slug },
      });
    },
    onError: () => setError("Could not create that workspace."),
  });

  if (session.isPending || orgs.isPending) {
    return (
      <div className="grid min-h-dvh place-items-center bg-canvas text-sm text-ink-muted">
        Loading…
      </div>
    );
  }

  if (!session.data?.user) {
    return <Navigate to="/sign-in" search={{ next: "/onboarding" }} />;
  }

  const existing = orgs.data ?? [];
  if (!wantsNew && existing.length > 0) {
    const first = existing[0]!;
    return <Navigate to="/$orgSlug" params={{ orgSlug: first.slug }} />;
  }

  const firstName = session.data.user.name.split(" ")[0] || "there";

  return (
    <>
      <ImpersonationBanner />
      <AuthShell
        mood="happy"
        title={`Welcome, ${firstName}`}
        description="Let's name your workspace. It's where your Resend accounts, mail and team come together."
        footer={
          existing.length > 0 ? (
            <Link
              to="/$orgSlug"
              params={{ orgSlug: existing[0]!.slug }}
              className="font-medium text-accent-fill hover:underline"
            >
              Back to {existing[0]!.name}
            </Link>
          ) : (
            <Link to="/admin" className="font-medium text-accent-fill hover:underline">
              Platform admin
            </Link>
          )
        }
      >
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            create.mutate();
          }}
        >
          <FormAlert>{error}</FormAlert>
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium">Workspace name</span>
            <input
              required
              minLength={2}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-10 rounded-control border border-line bg-canvas-sunken px-3"
              placeholder="Acme Mail"
            />
          </label>
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium">URL slug</span>
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
      </AuthShell>
    </>
  );
}
