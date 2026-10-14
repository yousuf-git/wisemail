import { Link, Navigate, useParams } from "@tanstack/react-router";

import { EmptyState } from "@/components/app/empty-state";

/** Catch-all for unknown org paths. Known settings typos redirect home to Settings. */
export function PlaceholderPage() {
  const { orgSlug, _splat } = useParams({ from: "/$orgSlug/$" });
  const splat = _splat ?? "";

  if (splat === "settings" || splat.startsWith("settings/")) {
    return <Navigate to="/$orgSlug/settings/general" params={{ orgSlug }} />;
  }

  return (
    <EmptyState
      title="That page isn't here"
      mood="worried"
      action={
        <Link
          to="/$orgSlug"
          params={{ orgSlug }}
          className="inline-flex h-9 items-center rounded-control bg-accent-fill px-4 text-sm font-semibold text-accent-ink"
        >
          Back to overview
        </Link>
      }
    >
      <code className="text-ink">/{orgSlug}/{splat}</code> doesn&apos;t match a Wisemail screen.
    </EmptyState>
  );
}
