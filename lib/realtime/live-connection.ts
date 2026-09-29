/**
 * Browser side of the realtime stream (TRD §2.6): one EventSource per tab, exponential
 * reconnect, invalidations batched every 100 ms, released while the tab is hidden. Framework
 * free so it can be tested with a fake EventSource; `live-context.tsx` wires it into React.
 */

export type LiveStatus = "connecting" | "live" | "offline" | "paused";

export type LiveConnectionOptions = {
  url: string;
  /** Injectable for tests. */
  EventSourceImpl?: typeof EventSource;
  batchMs?: number;
  /** Close the stream after the tab has been hidden this long. */
  hiddenCloseMs?: number;
};

type Listener = { topics: Set<string>; fn: (matched: string[]) => void };

export type LiveConnection = {
  subscribe(topics: string[], fn: (matched: string[]) => void): () => void;
  getStatus(): LiveStatus;
  onStatus(fn: () => void): () => void;
  start(): void;
  stop(): void;
};

export function createLiveConnection(options: LiveConnectionOptions): LiveConnection {
  const batchMs = options.batchMs ?? 100;
  const hiddenCloseMs = options.hiddenCloseMs ?? 60_000;
  const listeners = new Set<Listener>();
  const statusListeners = new Set<() => void>();

  let status: LiveStatus = "connecting";
  let source: EventSource | null = null;
  let started = false;
  let lastId: string | null = null;
  let attempt = 0;
  let openedAt = 0;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  let hiddenTimer: ReturnType<typeof setTimeout> | null = null;
  const pending = new Set<string>();
  let resync = false;

  const isHidden = () => typeof document !== "undefined" && document.hidden;

  function setStatus(next: LiveStatus) {
    if (status === next) return;
    status = next;
    statusListeners.forEach((fn) => fn());
  }

  function flush() {
    flushTimer = null;
    if (isHidden()) return; // kept until the tab is visible again
    const topics = [...pending];
    const all = resync;
    pending.clear();
    resync = false;
    if (!all && topics.length === 0) return;
    for (const listener of [...listeners]) {
      const matched = all ? topics : topics.filter((t) => listener.topics.has(t));
      if (all || matched.length > 0) listener.fn(matched);
    }
  }

  function scheduleFlush() {
    if (flushTimer || isHidden()) return;
    flushTimer = setTimeout(flush, batchMs);
  }

  function close() {
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = null;
    source?.close();
    source = null;
  }

  function connect() {
    close();
    if (!started) return;
    const Impl = options.EventSourceImpl ?? globalThis.EventSource;
    if (!Impl) return;
    setStatus("connecting");
    const url = lastId
      ? `${options.url}${options.url.includes("?") ? "&" : "?"}lastEventId=${lastId}`
      : options.url;
    const es = new Impl(url);
    source = es;

    es.addEventListener("ready", (e) => {
      if (source !== es) return;
      lastId = (e as MessageEvent).lastEventId || lastId;
      openedAt = Date.now();
      setStatus("live");
    });
    es.addEventListener("invalidate", (e) => {
      if (source !== es) return;
      const message = e as MessageEvent<string>;
      lastId = message.lastEventId || lastId;
      try {
        const { topics } = JSON.parse(message.data) as { topics?: string[] };
        for (const topic of topics ?? []) pending.add(topic);
        scheduleFlush();
      } catch {}
    });
    es.addEventListener("resync", () => {
      if (source !== es) return;
      resync = true;
      scheduleFlush();
    });
    es.onerror = () => {
      if (source !== es) return;
      // Own the retry policy (native retry is a fixed delay and gives up on HTTP errors).
      es.close();
      source = null;
      setStatus("offline");
      if (openedAt && Date.now() - openedAt > 10_000) attempt = 0;
      openedAt = 0;
      const delay = Math.min(30_000, 500 * 2 ** attempt) * (0.75 + Math.random() * 0.5);
      attempt++;
      retryTimer = setTimeout(connect, delay);
    };
  }

  function onVisibility() {
    if (!started) return;
    if (isHidden()) {
      if (!hiddenTimer) {
        hiddenTimer = setTimeout(() => {
          hiddenTimer = null;
          close();
          setStatus("paused");
        }, hiddenCloseMs);
      }
      return;
    }
    if (hiddenTimer) clearTimeout(hiddenTimer);
    hiddenTimer = null;
    if (status === "paused") {
      resync = true; // the gap may be long: refetch what is on screen
      attempt = 0;
      connect();
    }
    scheduleFlush();
  }

  function onOnline() {
    if (started && !source && status !== "paused") {
      attempt = 0;
      connect();
    }
  }

  return {
    subscribe(topics, fn) {
      const listener: Listener = { topics: new Set(topics), fn };
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    getStatus: () => status,
    onStatus(fn) {
      statusListeners.add(fn);
      return () => void statusListeners.delete(fn);
    },
    start() {
      if (started) return;
      started = true;
      document.addEventListener("visibilitychange", onVisibility);
      window.addEventListener("online", onOnline);
      if (isHidden()) {
        setStatus("paused");
        onVisibility();
      } else connect();
    },
    stop() {
      started = false;
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onOnline);
      if (flushTimer) clearTimeout(flushTimer);
      if (hiddenTimer) clearTimeout(hiddenTimer);
      flushTimer = hiddenTimer = null;
      close();
    },
  };
}
