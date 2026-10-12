/**
 * Typed HTTP twins of server actions (SPA / Fastify). Prefer these over `"use server"` imports
 * when calling from the browser against `/api/v1/actions/:id`.
 *
 * Keep this module free of `server-only` imports so the client bundle can load it.
 */
import { callOrgAction } from "@/lib/api/client";
import type { ActionResult } from "@/lib/actions/result";
import type { ConnectionDTO } from "@/lib/dto/connection";
import type { SyncRequestResult } from "@/lib/dto/sync";

export const apiActions = {
  tour: {
    record: (
      orgSlug: string,
      input: {
        tourId: string;
        event: "start" | "step" | "complete" | "skip";
        step?: number;
        trigger?: "auto" | "manual";
      },
    ) => callOrgAction<{ tourId: string; event: string }>("tour.record", orgSlug, input),
  },
  connections: {
    add: (orgSlug: string, input: unknown) =>
      callOrgAction<ConnectionDTO>("settings.connections.add", orgSlug, input),
    rename: (orgSlug: string, input: unknown) =>
      callOrgAction<ConnectionDTO>("settings.connections.rename", orgSlug, input),
    remove: (orgSlug: string, input: unknown) =>
      callOrgAction<{ id: string }>("settings.connections.remove", orgSlug, input),
    retry: (orgSlug: string, input: unknown) =>
      callOrgAction<ConnectionDTO>("settings.connections.retry", orgSlug, input),
    sync: (orgSlug: string, input: unknown) =>
      callOrgAction<SyncRequestResult>("settings.connections.sync", orgSlug, input),
  },
} as const;

export type { ActionResult };
