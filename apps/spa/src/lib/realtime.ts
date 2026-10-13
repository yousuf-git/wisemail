/**
 * Minimal SPA EventSource client (TRD §2.6 subset).
 * One connection per org; listeners filter by topic prefix/name.
 */

export type LiveStatus = "connecting" | "live" | "offline" | "paused";

type Listener = { topics: Set<string>; fn: (matched: string[]) => void };

export function createLiveConnection(url: string) {
  const listeners = new Set<Listener>();
  let status: LiveStatus = "connecting";
  let source: EventSource | null = null;
  let started = false;
  let lastId: string | null = null;
  let attempt = 0;
  let openedAt = 0;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  const pending = new Set<string>();
  let resync = false;
  const statusListeners = new Set<() => void>();

  const setStatus = (next: LiveStatus) => {
    if (status === next) return;
    status = next;
    statusListeners.forEach((fn) => fn());
  };

  const flush = () => {
    flushTimer = null;
    if (typeof document !== "undefined" && document.hidden) return;
    const topics = [...pending];
    const all = resync;
    pending.clear();
    resync = false;
    if (!all && topics.length === 0) return;
    for (const listener of [...listeners]) {
      if (all) {
        listener.fn(topics);
        continue;
      }
      const matched = topics.filter((t) => listener.topics.has(t));
      if (matched.length > 0) listener.fn(matched);
    }
  };

  const scheduleFlush = () => {
    if (flushTimer) return;
    flushTimer = setTimeout(flush, 100);
  };

  const close = () => {
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = null;
    source?.close();
    source = null;
  };

  const connect = () => {
    close();
    if (!started || typeof EventSource === "undefined") return;
    setStatus("connecting");
    const srcUrl = lastId
      ? `${url}${url.includes("?") ? "&" : "?"}lastEventId=${encodeURIComponent(lastId)}`
      : url;
    const es = new EventSource(srcUrl, { withCredentials: true });
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
      } catch {
        /* ignore bad payloads */
      }
    });
    es.addEventListener("resync", () => {
      if (source !== es) return;
      resync = true;
      scheduleFlush();
    });
    es.onerror = () => {
      if (source !== es) return;
      es.close();
      source = null;
      setStatus("offline");
      if (openedAt && Date.now() - openedAt > 10_000) attempt = 0;
      openedAt = 0;
      const delay = Math.min(30_000, 500 * 2 ** attempt) * (0.75 + Math.random() * 0.5);
      attempt++;
      retryTimer = setTimeout(connect, delay);
    };
  };

  return {
    start() {
      if (started) return;
      started = true;
      connect();
    },
    stop() {
      started = false;
      close();
      setStatus("paused");
    },
    subscribe(topics: string[], fn: (matched: string[]) => void) {
      const entry: Listener = { topics: new Set(topics), fn };
      listeners.add(entry);
      return () => {
        listeners.delete(entry);
      };
    },
    getStatus: () => status,
    onStatus(fn: () => void) {
      statusListeners.add(fn);
      return () => {
        statusListeners.delete(fn);
      };
    },
  };
}

export function notificationsTopic(userId: string) {
  return `notifications:${userId}`;
}
