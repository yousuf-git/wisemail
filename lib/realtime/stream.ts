import "server-only";

import { Types } from "mongoose";

import { connectDb } from "@/lib/db/connect";
import { REALTIME_TTL_SECONDS, RealtimeEventModel } from "@/lib/db/models/realtime-event";
import {
  getHub,
  isVisibleTo,
  toHubEvent,
  type HubEvent,
  type HubSubscriber,
  type RealtimeHub,
} from "./hub";

/**
 * The SSE body for `GET /api/stream` (TRD §2.6), separated from the route so it can be tested
 * without HTTP. Wire format:
 *  - `event: ready`      first frame; `id:` is the newest known event so a client that never saw
 *                        an event still has a replay cursor after a reconnect
 *  - `event: invalidate` `data: {"topics":[…],"patch":…}` with `id: <realtime_events._id>`
 *  - `event: resync`     events were lost (gap older than the TTL, replay too large, hub restart)
 *  - `: hb`              comment heartbeat
 */

export const HEARTBEAT_MS = 15_000;
/** Close before the platform kills the function; the client reconnects with `Last-Event-ID`. */
export const MAX_STREAM_MS = 270_000;
export const REPLAY_LIMIT = 500;
/** Queued frames beyond this mean the client is not reading: drop it, it will replay. */
const MAX_BACKLOG = 256;

export type StreamOptions = {
  orgId: string;
  userId: string;
  projectScope: string[] | null;
  lastEventId?: string | null;
  signal?: AbortSignal;
  hub?: RealtimeHub;
  /**
   * Re-evaluates the member's access after an `access` event addressed to them. Returns their
   * new project scope, or null when they lost access to the org (the stream then closes).
   */
  reauthorize?: () => Promise<{ projectScope: string[] | null } | null>;
  heartbeatMs?: number;
  maxDurationMs?: number;
  replayLimit?: number;
};

const encoder = new TextEncoder();

/**
 * True for the errors a client hanging up produces ("The destination stream closed early",
 * Node's premature close, aborted fetches, reset sockets). They are routine for a long-lived
 * stream (tab closed, navigation, network change) and must never reach the error log.
 */
export function isClientDisconnect(error: unknown): boolean {
  if (!error) return false;
  const e = error as { name?: string; code?: string; message?: string };
  if (e.name === "AbortError" || e.name === "ResponseAborted") return true;
  if (
    e.code === "ERR_STREAM_PREMATURE_CLOSE" ||
    e.code === "ECONNRESET" ||
    e.code === "ERR_STREAM_DESTROYED" ||
    e.code === "ERR_INVALID_STATE" ||
    e.code === "EPIPE"
  ) {
    return true;
  }
  return /closed early|premature close|stream (is )?(closed|destroyed)|aborted|socket hang up|invalid state/i.test(
    e.message ?? "",
  );
}

export function frame(event: HubEvent): string {
  const data = JSON.stringify({ topics: event.topics, patch: event.patch });
  return `id: ${event.id}\nevent: invalidate\ndata: ${data}\n\n`;
}

const simple = (name: string, data = "{}", id?: string) =>
  `${id ? `id: ${id}\n` : ""}event: ${name}\ndata: ${data}\n\n`;

function parseCursor(value: string | null | undefined): Types.ObjectId | null {
  return value && /^[0-9a-f]{24}$/i.test(value) ? new Types.ObjectId(value) : null;
}

export async function openEventStream(options: StreamOptions): Promise<ReadableStream<Uint8Array>> {
  const hub = options.hub ?? getHub();
  const heartbeatMs = options.heartbeatMs ?? HEARTBEAT_MS;
  const maxDurationMs = options.maxDurationMs ?? MAX_STREAM_MS;
  const replayLimit = options.replayLimit ?? REPLAY_LIMIT;
  await connectDb();

  let controllerRef!: ReadableStreamDefaultController<Uint8Array>;
  let closed = false;
  let unsubscribe: (() => void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let deadline: ReturnType<typeof setTimeout> | null = null;

  const cleanup = () => {
    if (closed) return;
    closed = true;
    if (heartbeat) clearInterval(heartbeat);
    if (deadline) clearTimeout(deadline);
    unsubscribe?.();
    options.signal?.removeEventListener("abort", cleanup);
    try {
      controllerRef.close();
    } catch {}
  };

  const write = (text: string) => {
    if (closed) return;
    // desiredSize goes negative as frames queue up behind a slow reader.
    if ((controllerRef.desiredSize ?? 1) < -MAX_BACKLOG) return cleanup();
    try {
      controllerRef.enqueue(encoder.encode(text));
    } catch {
      cleanup();
    }
  };

  const sub: HubSubscriber = {
    orgId: options.orgId,
    userId: options.userId,
    projectScope: options.projectScope,
    send: () => {},
    resync: () => write(simple("resync")),
  };

  // Live events that arrive while the replay query runs are buffered, then flushed in order.
  let buffering: HubEvent[] | null = [];
  let replayedUntil: string | null = null;
  const deliver = (event: HubEvent) => {
    if (replayedUntil && event.id <= replayedUntil) return;
    write(frame(event));
    if (event.userId === options.userId && event.topics.includes("access")) void recheckAccess();
  };
  let rechecking = false;
  async function recheckAccess() {
    if (!options.reauthorize || rechecking) return;
    rechecking = true;
    try {
      const next = await options.reauthorize();
      if (!next) return cleanup();
      const before = JSON.stringify(sub.projectScope);
      sub.projectScope = next.projectScope;
      // Scope changed: what the member can see changed, so everything must be refetched.
      if (JSON.stringify(next.projectScope) !== before) write(simple("resync"));
    } catch {
    } finally {
      rechecking = false;
    }
  }
  sub.send = (event) => {
    if (buffering) buffering.push(event);
    else deliver(event);
  };

  const lastId = parseCursor(options.lastEventId);

  return new ReadableStream<Uint8Array>(
    {
      async start(controller) {
        controllerRef = controller;
        options.signal?.addEventListener("abort", cleanup);
        if (options.signal?.aborted) return cleanup();

        write("retry: 3000\n\n");
        try {
          unsubscribe = await hub.subscribe(sub);
        } catch (error) {
          if (!closed && !isClientDisconnect(error)) {
            console.error("[realtime] hub unavailable", error);
          }
          write(simple("resync"));
          return cleanup();
        }
        if (closed) return unsubscribe();

        try {
          if (lastId) {
            const tooOld =
              Date.now() - lastId.getTimestamp().getTime() > REALTIME_TTL_SECONDS * 1000;
            if (tooOld) {
              write(simple("resync"));
            } else {
              const docs = await RealtimeEventModel.collection
                .find({ orgId: new Types.ObjectId(options.orgId), _id: { $gt: lastId } })
                .sort({ _id: 1 })
                .limit(replayLimit + 1)
                .toArray();
              const truncated = docs.length > replayLimit;
              for (const doc of docs.slice(0, replayLimit)) {
                const event = toHubEvent(doc as never);
                replayedUntil = event.id;
                if (isVisibleTo(event, sub)) write(frame(event));
              }
              if (truncated) write(simple("resync"));
            }
          }
          const newest = replayedUntil
            ? replayedUntil
            : (
                await RealtimeEventModel.collection.findOne(
                  {},
                  { sort: { _id: -1 }, projection: { _id: 1 } },
                )
              )?._id?.toHexString();
          write(
            simple(
              "ready",
              "{}",
              newest ?? Types.ObjectId.createFromTime(Math.floor(Date.now() / 1000)).toHexString(),
            ),
          );
        } catch (error) {
          // A client that left mid-replay is not a failure: nobody is waiting for the frames.
          if (!closed && !isClientDisconnect(error))
            console.error("[realtime] replay failed", error);
          write(simple("resync"));
        }

        const pending = buffering ?? [];
        buffering = null;
        for (const event of pending) deliver(event);

        heartbeat = setInterval(() => write(": hb\n\n"), heartbeatMs);
        // Spread reconnects so a deploy does not make every client return at the same second.
        deadline = setTimeout(cleanup, maxDurationMs - Math.floor(Math.random() * 10_000));
      },
      // The reader went away (client disconnect, with whatever reason the platform gives): quiet.
      cancel: () => cleanup(),
    },
    { highWaterMark: 32 },
  );
}
