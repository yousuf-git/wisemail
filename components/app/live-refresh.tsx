"use client";

import { useRouter } from "next/navigation";

import { useLiveTopics } from "@/lib/realtime/live-context";
import { scheduleRouterRefresh } from "@/lib/realtime/schedule-refresh";

/** Re-renders the current Server Component page when one of `topics` changes. Renders nothing. */
export function LiveRefresh({ topics }: { topics: readonly string[] }) {
  const router = useRouter();
  useLiveTopics(topics, () => scheduleRouterRefresh(router));
  return null;
}
