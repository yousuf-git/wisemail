import { useSyncExternalStore } from "react";

/* ------------------------------------------------------------------------------------------ */
/* A shared "now" that is 0 on the server and during hydration, so times never mismatch.       */
/* ------------------------------------------------------------------------------------------ */

let current = 0;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!timer) {
    timer = setInterval(() => {
      current = Date.now();
      listeners.forEach((l) => l());
    }, 30_000);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

/** Milliseconds since epoch, refreshed every 30 s; `0` while server-rendering or hydrating. */
export function useNow(): number {
  return useSyncExternalStore(
    subscribe,
    () => (current ||= Date.now()),
    () => 0,
  );
}

/* ------------------------------------------------------------------------------------------ */
/* Formatting                                                                                  */
/* ------------------------------------------------------------------------------------------ */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "just now", "2m ago", "3h ago", "4d ago", then a short date. */
export function relativeTime(iso: string, now: number): string {
  const diff = now - new Date(iso).getTime();
  if (diff < 45_000) return "just now";
  if (diff < HOUR) return `${Math.max(1, Math.round(diff / MINUTE))}m ago`;
  if (diff < DAY) return `${Math.round(diff / HOUR)}h ago`;
  if (diff < 7 * DAY) return `${Math.round(diff / DAY)}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** List rows: time today, weekday this week, otherwise "Sep 12". `now = 0` (SSR) falls back to a UTC date. */
export function listTime(iso: string, now: number): string {
  const date = new Date(iso);
  if (!now) {
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  }
  const diff = now - date.getTime();
  if (diff < DAY && new Date(now).getDate() === date.getDate()) {
    return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  }
  if (diff < 6 * DAY) return date.toLocaleDateString("en-US", { weekday: "short" });
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function absoluteTime(iso: string, timeZone?: string): string {
  return new Date(iso).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    timeZone,
  });
}

export function messageTime(iso: string, timeZone?: string): string {
  return new Date(iso).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  });
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

/* ------------------------------------------------------------------------------------------ */
/* People                                                                                      */
/* ------------------------------------------------------------------------------------------ */

/** "jane@x.com" -> "jane"; "Jane Cooper <jane@x.com>" already split by the caller. */
export function displayName(address: string, name?: string): string {
  if (name?.trim()) return name.trim();
  const local = address.split("@")[0] ?? address;
  return local || address;
}

export function initials(label: string): string {
  const words = label
    .replace(/[<>()"]/g, " ")
    .split(/[\s._-]+/)
    .filter(Boolean);
  const letters = words.length >= 2 ? words[0]![0]! + words[1]![0]! : (words[0] ?? "?").slice(0, 2);
  return letters.toUpperCase();
}

const AVATAR_COLORS = ["#0EA5E9", "#8B5CF6", "#10B981", "#E07A5F", "#F59E0B", "#52504B", "#EC4899"];

/** Stable color per address (the board's avatars use these hues; white initials on top). */
export function avatarColor(seed: string): string {
  let hash = 0;
  for (const char of seed.toLowerCase()) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]!;
}
