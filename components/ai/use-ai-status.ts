"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";

import type { AiFeature, AiFlag, AiStatusDTO } from "@/lib/ai/types";
import { AI_CREDIT_COST, FEATURE_FLAG } from "@/lib/ai/types";
import { fetchAiStatus } from "./api";

const TTL_MS = 30_000;

type Entry = { at: number; status: AiStatusDTO | null };
const cache = new Map<string, Entry>();
const inflight = new Map<string, Promise<void>>();
const mounted = new Map<string, number>();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

function ensureFresh(orgSlug: string) {
  const entry = cache.get(orgSlug);
  if ((entry && Date.now() - entry.at < TTL_MS) || inflight.has(orgSlug)) return;
  const request = fetchAiStatus(orgSlug)
    // A failed refresh keeps what was known: the server re-checks every call anyway.
    .then((status) => cache.set(orgSlug, { at: Date.now(), status }))
    .catch(() => cache.set(orgSlug, { at: Date.now(), status: cache.get(orgSlug)?.status ?? null }))
    .finally(() => {
      inflight.delete(orgSlug);
      notify();
    });
  inflight.set(
    orgSlug,
    request.then(() => undefined),
  );
}

/** Mark the status stale (after an AI call, so the credit balance is fresh) and refetch it. */
export function invalidateAiStatus(orgSlug?: string) {
  if (orgSlug) {
    const entry = cache.get(orgSlug);
    if (entry) cache.set(orgSlug, { ...entry, at: 0 });
  } else {
    cache.clear();
  }
  for (const [slug, count] of mounted)
    if (count > 0 && (!orgSlug || slug === orgSlug)) ensureFresh(slug);
  notify();
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};

/**
 * AI availability for the current member and org: plan gate, opt-out, credits. `null` while
 * loading or when it could not be read (no AI UI is shown then; nothing depends on it for
 * correctness because every endpoint re-checks on the server). Shared across components.
 */
export function useAiStatus(orgSlug: string) {
  const status = useSyncExternalStore(
    subscribe,
    () => cache.get(orgSlug)?.status ?? null,
    () => null,
  );
  useEffect(() => {
    mounted.set(orgSlug, (mounted.get(orgSlug) ?? 0) + 1);
    ensureFresh(orgSlug);
    return () => void mounted.set(orgSlug, (mounted.get(orgSlug) ?? 1) - 1);
  }, [orgSlug]);
  const refresh = useCallback(() => {
    const entry = cache.get(orgSlug);
    if (entry) cache.set(orgSlug, { ...entry, at: 0 });
    ensureFresh(orgSlug);
  }, [orgSlug]);
  return { status, refresh };
}

export type AiAccessState =
  | { kind: "hidden" }
  | { kind: "locked"; reason: "not_in_plan" | "credits_exhausted"; message: string }
  | { kind: "ready" };

/** How a feature's controls should look right now. */
export function aiAccess(status: AiStatusDTO | null, feature: AiFeature): AiAccessState {
  if (!status || !status.canUse) return { kind: "hidden" };
  if (!status.planIncluded) {
    return {
      kind: "locked",
      reason: "not_in_plan",
      message: `AI assist is part of the paid plans (Pro and above). Your workspace is on ${status.planLabel}.`,
    };
  }
  const flag: AiFlag = FEATURE_FLAG[feature];
  if (!status.enabled || !status.features[flag]) return { kind: "hidden" };
  if (status.credits.available < AI_CREDIT_COST[feature]) {
    return {
      kind: "locked",
      reason: "credits_exhausted",
      message:
        "Your workspace has used all its AI credits for this period. They reset with the next billing period, and an Owner can add a credit pack.",
    };
  }
  return { kind: "ready" };
}
