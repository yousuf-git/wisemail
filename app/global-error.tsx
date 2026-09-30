"use client";

import { ErrorView } from "@/components/app/error-view";
import "./globals.css";

// Replaces the root layout when it fails, so it brings its own <html> and <body>.
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <html lang="en" className="h-full">
      <body className="flex min-h-full flex-col bg-canvas text-ink">
        <ErrorView error={error} retry={retry} />
      </body>
    </html>
  );
}
