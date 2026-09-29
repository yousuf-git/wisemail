"use client";

import { useRouter } from "next/navigation";
import { startTransition } from "react";

import { useLiveTopics } from "@/lib/realtime/live-context";

/** Re-renders the current Server Component page when one of `topics` changes. Renders nothing. */
export function LiveRefresh({ topics }: { topics: readonly string[] }) {
  const router = useRouter();
  useLiveTopics(topics, () => startTransition(() => router.refresh()));
  return null;
}
