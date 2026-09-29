import "server-only";

import { Types } from "mongoose";

import { connectDb } from "@/lib/db/connect";
import { RealtimeEventModel } from "@/lib/db/models/realtime-event";

/**
 * In-process fan-out of `realtime_events` (TRD §2.6). One MongoDB change stream per server
 * instance (inserts only), opened when the first SSE client subscribes and closed shortly after
 * the last one leaves. Each event is routed in memory to the subscribers of its organization,
 * after the per-member visibility rules:
 *  - a user-targeted event (`userId` set) only reaches that user;
 *  - a project-scoped member only receives events whose `projectId` is in scope or null.
 * Without a replica set (no change streams) the hub polls the collection by `_id` instead.
 */

export type HubEvent = {
  /** `realtime_events._id` hex; the SSE `id:` and the replay cursor. */
  id: string;
  orgId: string;
  projectId: string | null;
  userId: string | null;
  topics: string[];
  patch: Record<string, unknown> | null;
};

export type HubSubscriber = {
  orgId: string;
  userId: string;
  /** Project ids the member is restricted to, or null when unrestricted. Mutable: see `access`. */
  projectScope: string[] | null;
  send(event: HubEvent): void;
  /** The hub lost events (change stream restarted without a resume point): refetch everything. */
  resync?(): void;
};

/** Visibility rule shared by live fan-out and replay. */
export function isVisibleTo(
  event: Pick<HubEvent, "orgId" | "projectId" | "userId">,
  sub: Pick<HubSubscriber, "orgId" | "userId" | "projectScope">,
): boolean {
  if (event.orgId !== sub.orgId) return false;
  if (event.userId && event.userId !== sub.userId) return false;
  if (sub.projectScope !== null && event.projectId && !sub.projectScope.includes(event.projectId)) {
    return false;
  }
  return true;
}

type RawEvent = {
  _id: Types.ObjectId;
  orgId: Types.ObjectId;
  projectId?: Types.ObjectId | null;
  userId?: Types.ObjectId | null;
  topics?: string[];
  patch?: Record<string, unknown> | null;
};

export function toHubEvent(doc: RawEvent): HubEvent {
  return {
    id: doc._id.toHexString(),
    orgId: doc.orgId.toHexString(),
    projectId: doc.projectId ? doc.projectId.toHexString() : null,
    userId: doc.userId ? doc.userId.toHexString() : null,
    topics: doc.topics ?? [],
    patch: doc.patch ?? null,
  };
}

type ChangeStreamLike = {
  tryNext(): Promise<{ fullDocument?: RawEvent } | null>;
  next(): Promise<{ fullDocument?: RawEvent }>;
  close(): Promise<void>;
  resumeToken?: unknown;
};

export type HubOptions = {
  /** `auto` tries a change stream and falls back to polling; tests pin one of the two. */
  mode?: "auto" | "changestream" | "poll";
  pollMs?: number;
  /** How long the source stays open after the last subscriber leaves. */
  idleCloseMs?: number;
};

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Errors that mean "this deployment has no change streams" (standalone mongod, some proxies). */
function isUnsupported(error: unknown): boolean {
  const e = error as { code?: number; message?: string } | null;
  return (
    e?.code === 40573 ||
    e?.code === 115 ||
    /only supported on replica sets|not supported|not a replica set|no replset config/i.test(
      e?.message ?? "",
    )
  );
}

export class RealtimeHub {
  private readonly byOrg = new Map<string, Set<HubSubscriber>>();
  private readonly options: Required<HubOptions>;
  private running: Promise<void> | null = null;
  private generation = 0;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private stream: ChangeStreamLike | null = null;
  private resumeToken: unknown = null;
  private lastPolledId: Types.ObjectId | null = null;
  private activeMode: "changestream" | "poll" | null = null;

  constructor(options: HubOptions = {}) {
    this.options = { mode: "auto", pollMs: 1000, idleCloseMs: 2000, ...options };
  }

  get size(): number {
    let n = 0;
    for (const set of this.byOrg.values()) n += set.size;
    return n;
  }

  /** Which source is feeding the hub right now (null while stopped). */
  get mode() {
    return this.activeMode;
  }

  /**
   * Registers a subscriber, starting the source if needed. Resolves once the source is
   * listening, so events published after this returns are not missed. Returns the unsubscribe.
   */
  async subscribe(sub: HubSubscriber): Promise<() => void> {
    let set = this.byOrg.get(sub.orgId);
    if (!set) this.byOrg.set(sub.orgId, (set = new Set()));
    set.add(sub);
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
    let removed = false;
    const unsubscribe = () => {
      if (removed) return;
      removed = true;
      const current = this.byOrg.get(sub.orgId);
      current?.delete(sub);
      if (current?.size === 0) this.byOrg.delete(sub.orgId);
      if (this.size === 0) this.scheduleStop();
    };
    try {
      await this.start();
    } catch (error) {
      unsubscribe();
      throw error;
    }
    return unsubscribe;
  }

  /** Routes one event to its org's subscribers. Exposed for tests. */
  dispatch(event: HubEvent): void {
    const set = this.byOrg.get(event.orgId);
    if (!set) return;
    for (const sub of [...set]) {
      if (!isVisibleTo(event, sub)) continue;
      try {
        sub.send(event);
      } catch (error) {
        console.warn("[realtime] subscriber send failed", error);
      }
    }
  }

  private dispatchChange(change: { fullDocument?: RawEvent } | null) {
    if (change?.fullDocument) this.dispatch(toHubEvent(change.fullDocument));
  }

  private resyncAll(): void {
    for (const set of this.byOrg.values()) {
      for (const sub of [...set]) {
        try {
          sub.resync?.();
        } catch {}
      }
    }
  }

  private scheduleStop() {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    if (this.options.idleCloseMs <= 0) return void this.stop();
    this.idleTimer = setTimeout(() => {
      this.idleTimer = null;
      if (this.size === 0) void this.stop();
    }, this.options.idleCloseMs);
    this.idleTimer.unref?.();
  }

  async stop(): Promise<void> {
    this.generation++;
    const stream = this.stream;
    this.stream = null;
    this.running = null;
    this.activeMode = null;
    this.resumeToken = null;
    this.lastPolledId = null;
    await stream?.close().catch(() => undefined);
  }

  private start(): Promise<void> {
    if (this.running) return this.running;
    const generation = ++this.generation;
    const ready = this.open(generation);
    this.running = ready;
    ready.catch(() => {
      if (this.running === ready) this.running = null;
    });
    return ready;
  }

  private async open(generation: number): Promise<void> {
    await connectDb();
    if (this.options.mode !== "poll") {
      try {
        await this.openChangeStream(generation);
        return;
      } catch (error) {
        if (this.options.mode === "changestream" || !isUnsupported(error)) throw error;
        console.warn("[realtime] change streams unavailable, polling realtime_events instead");
      }
    }
    await this.openPolling(generation);
  }

  private async openChangeStream(generation: number): Promise<void> {
    const collection = RealtimeEventModel.collection;
    const open = (resumeAfter?: unknown) =>
      collection.watch([{ $match: { operationType: "insert" } }], {
        fullDocument: "default",
        maxAwaitTimeMS: 500,
        ...(resumeAfter ? { resumeAfter } : {}),
      } as never) as unknown as ChangeStreamLike;

    const stream = open();
    // The cursor is created lazily; the first read forces it so the hub is listening on return.
    const first = await stream.tryNext().catch(async (error) => {
      await stream.close().catch(() => undefined);
      throw error;
    });
    this.stream = stream;
    this.activeMode = "changestream";
    this.dispatchChange(first);
    this.resumeToken = stream.resumeToken ?? null;
    void this.consume(generation, stream, open);
  }

  /** Reads the stream until stopped; reopens it (with the resume token) after an error. */
  private async consume(
    generation: number,
    initial: ChangeStreamLike,
    open: (resumeAfter?: unknown) => ChangeStreamLike,
  ): Promise<void> {
    let stream = initial;
    let backoff = 500;
    while (generation === this.generation) {
      try {
        const change = await stream.next();
        backoff = 500;
        if (generation !== this.generation) return;
        this.resumeToken = stream.resumeToken ?? this.resumeToken;
        if (change.fullDocument) this.dispatch(toHubEvent(change.fullDocument));
      } catch (error) {
        if (generation !== this.generation) return;
        console.warn("[realtime] change stream error, reopening", (error as Error).message);
        await stream.close().catch(() => undefined);
        await sleep(backoff);
        backoff = Math.min(backoff * 2, 15_000);
        if (generation !== this.generation) return;
        try {
          stream = open(this.resumeToken ?? undefined);
          this.dispatchChange(await stream.tryNext());
        } catch (reopenError) {
          // The resume point is gone (oplog rolled over) or the server is down: start from now
          // and tell clients to refetch, since events in the gap are lost.
          console.warn("[realtime] resume failed", (reopenError as Error).message);
          this.resumeToken = null;
          try {
            stream = open();
            this.dispatchChange(await stream.tryNext());
            this.resyncAll();
          } catch {
            continue;
          }
        }
        this.stream = stream;
      }
    }
    await stream.close().catch(() => undefined);
  }

  private async openPolling(generation: number): Promise<void> {
    const collection = RealtimeEventModel.collection;
    const latest = await collection.findOne({}, { sort: { _id: -1 }, projection: { _id: 1 } });
    this.lastPolledId = latest?._id ?? Types.ObjectId.createFromTime(Math.floor(Date.now() / 1000));
    this.activeMode = "poll";
    void (async () => {
      while (generation === this.generation) {
        await sleep(this.options.pollMs);
        if (generation !== this.generation) return;
        try {
          const docs = (await collection
            .find({ _id: { $gt: this.lastPolledId! } })
            .sort({ _id: 1 })
            .limit(500)
            .toArray()) as unknown as RawEvent[];
          for (const doc of docs) {
            this.lastPolledId = doc._id;
            this.dispatch(toHubEvent(doc));
          }
        } catch (error) {
          console.warn("[realtime] poll failed", (error as Error).message);
        }
      }
    })();
  }
}

const globalForHub = globalThis as unknown as { __wisemailHub?: RealtimeHub };

/** The per-instance hub (survives Next.js hot reloads). */
export function getHub(): RealtimeHub {
  globalForHub.__wisemailHub ??= new RealtimeHub();
  return globalForHub.__wisemailHub;
}
