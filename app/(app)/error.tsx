"use client";

import { ErrorView } from "@/components/app/error-view";

// Covers failures of the org layout itself (before the shell exists).
export default function AppError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <ErrorView
      error={error}
      retry={retry}
      homeHref="/onboarding"
      homeLabel="Back to my organizations"
    />
  );
}
