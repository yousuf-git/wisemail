"use client";

import { useSyncExternalStore } from "react";

import { Wizi } from "@/components/mascot/wizi";

const subscribe = () => () => {};

function timeOfDay(hour: number) {
  if (hour < 0) return "Hello";
  if (hour < 5) return "Good evening";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

/** Greeting card. The hour comes from the viewer's clock, so the server renders a neutral "Hello". */
export function Greeting({ name, children }: { name?: string; children?: React.ReactNode }) {
  const hour = useSyncExternalStore(
    subscribe,
    () => new Date().getHours(),
    () => -1,
  );
  const first = name?.trim().split(/\s+/)[0];
  return (
    <section
      aria-labelledby="greeting-title"
      className="flex flex-wrap items-center gap-x-3.5 gap-y-3 rounded-xl bg-surface px-[18px] py-3.5 shadow-md"
    >
      <Wizi mood="idle" size={64} greet />
      <div className="min-w-0 flex-1 basis-56">
        <h1
          id="greeting-title"
          className="text-[clamp(18px,2.4vw,24px)] leading-tight font-bold tracking-[-0.02em]"
        >
          {timeOfDay(hour)}
          {first ? `, ${first}` : ""}. What are we sending today?
        </h1>
        {children ? <p className="mt-0.5 text-[0.84rem] text-ink-muted">{children}</p> : null}
      </div>
    </section>
  );
}
