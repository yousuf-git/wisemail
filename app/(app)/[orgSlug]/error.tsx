"use client";

import { useParams } from "next/navigation";

import { ErrorView } from "@/components/app/error-view";

// Renders inside the app shell (sidebar and top bar stay), so people can navigate elsewhere.
export default function OrgError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  return (
    <ErrorView
      error={error}
      retry={retry}
      homeHref={`/${orgSlug}`}
      homeLabel="Back to the overview"
      className="py-10"
    />
  );
}
