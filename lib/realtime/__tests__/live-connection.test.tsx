import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createLiveConnection } from "../live-connection";
import { LiveProvider } from "../live-context";
import { useLiveQuery } from "../use-live-query";

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  listeners = new Map<string, ((e: unknown) => void)[]>();
  onerror: (() => void) | null = null;
  closed = false;
  constructor(readonly url: string) {
    FakeEventSource.instances.push(this);
  }
  addEventListener(type: string, fn: (e: unknown) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
  }
  close() {
    this.closed = true;
  }
  emit(type: string, data = "{}", lastEventId = "") {
    for (const fn of this.listeners.get(type) ?? []) fn({ data, lastEventId });
  }
  invalidate(topics: string[], id: string) {
    this.emit("invalidate", JSON.stringify({ topics, patch: null }), id);
  }
}
const last = () => FakeEventSource.instances.at(-1)!;
const Impl = FakeEventSource as unknown as typeof EventSource;

function setHidden(hidden: boolean) {
  Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
  document.dispatchEvent(new Event("visibilitychange"));
}

beforeEach(() => {
  vi.useFakeTimers();
  FakeEventSource.instances = [];
  setHidden(false);
});
afterEach(() => {
  vi.useRealTimers();
});

describe("createLiveConnection", () => {
  it("opens one EventSource, reports status and batches matching invalidations", () => {
    const connection = createLiveConnection({
      url: "/api/stream?orgSlug=acme",
      EventSourceImpl: Impl,
    });
    const threads = vi.fn();
    const other = vi.fn();
    connection.subscribe(["threads"], threads);
    connection.subscribe(["domains"], other);
    connection.start();
    connection.start();
    expect(FakeEventSource.instances).toHaveLength(1);
    expect(connection.getStatus()).toBe("connecting");

    last().emit("ready", "{}", "aaa");
    expect(connection.getStatus()).toBe("live");

    last().invalidate(["threads", "thread:1"], "b1");
    last().invalidate(["threads"], "b2");
    expect(threads).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(threads).toHaveBeenCalledTimes(1);
    expect(threads).toHaveBeenCalledWith(["threads"]);
    expect(other).not.toHaveBeenCalled();
    connection.stop();
    expect(last().closed).toBe(true);
  });

  it("refetches everything on resync", () => {
    const connection = createLiveConnection({ url: "/s", EventSourceImpl: Impl });
    const fn = vi.fn();
    connection.subscribe(["threads"], fn);
    connection.start();
    last().emit("resync");
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
    connection.stop();
  });

  it("reconnects with exponential backoff and resumes from the last event id", () => {
    const connection = createLiveConnection({ url: "/s?orgSlug=a", EventSourceImpl: Impl });
    connection.start();
    last().emit("ready", "{}", "e1");
    last().invalidate(["threads"], "e2");

    last().onerror?.();
    expect(connection.getStatus()).toBe("offline");
    expect(FakeEventSource.instances).toHaveLength(1);
    vi.advanceTimersByTime(1000);
    expect(FakeEventSource.instances).toHaveLength(2);
    expect(last().url).toBe("/s?orgSlug=a&lastEventId=e2");

    // Failing again before "ready": the delay grows.
    last().onerror?.();
    vi.advanceTimersByTime(600);
    expect(FakeEventSource.instances).toHaveLength(2);
    vi.advanceTimersByTime(1500);
    expect(FakeEventSource.instances).toHaveLength(3);
    last().emit("ready", "{}", "e3");
    expect(connection.getStatus()).toBe("live");
    connection.stop();
  });

  it("pauses while hidden, holds invalidations, and resyncs on return", () => {
    const connection = createLiveConnection({
      url: "/s",
      EventSourceImpl: Impl,
      hiddenCloseMs: 5000,
    });
    const fn = vi.fn();
    connection.subscribe(["threads"], fn);
    connection.start();
    last().emit("ready", "{}", "e1");

    setHidden(true);
    last().invalidate(["threads"], "e2");
    vi.advanceTimersByTime(200);
    expect(fn).not.toHaveBeenCalled(); // held until the tab is visible

    setHidden(false);
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);

    setHidden(true);
    vi.advanceTimersByTime(5000);
    expect(connection.getStatus()).toBe("paused");
    expect(FakeEventSource.instances[0]!.closed).toBe(true);
    setHidden(false);
    expect(FakeEventSource.instances).toHaveLength(2);
    last().emit("ready", "{}", "e9");
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(2); // resync after the gap
    connection.stop();
  });
});

describe("useLiveQuery", () => {
  it("refetches when an event for its topic arrives, and ignores others", async () => {
    vi.useRealTimers();
    vi.stubGlobal("EventSource", FakeEventSource);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    let calls = 0;
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>
        <LiveProvider orgSlug="acme">{children}</LiveProvider>
      </QueryClientProvider>
    );
    const { result } = renderHook(
      () =>
        useLiveQuery({
          queryKey: ["threads", "acme"],
          queryFn: async () => ++calls,
          topics: ["threads"],
        }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.data).toBe(1));
    await waitFor(() => expect(FakeEventSource.instances.length).toBeGreaterThan(0));
    const es = last();
    expect(es.url).toContain("/api/stream?orgSlug=acme");

    act(() => es.invalidate(["domains"], "x1"));
    await new Promise((r) => setTimeout(r, 200));
    expect(calls).toBe(1);

    act(() => es.invalidate(["threads"], "x2"));
    await waitFor(() => expect(result.current.data).toBe(2));
    vi.unstubAllGlobals();
  });

  it("works as a plain query without a provider", async () => {
    vi.useRealTimers();
    const client = new QueryClient();
    const { result } = renderHook(
      () => useLiveQuery({ queryKey: ["x"], queryFn: async () => "ok", topics: ["threads"] }),
      {
        wrapper: ({ children }) => (
          <QueryClientProvider client={client}>{children}</QueryClientProvider>
        ),
      },
    );
    await waitFor(() => expect(result.current.data).toBe("ok"));
  });
});
