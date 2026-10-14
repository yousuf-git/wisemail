import type { WiziMood } from "@/components/mascot/moods";
import { EmptyState } from "@/components/app/empty-state";

/** Shared loading / error / empty chrome for list pages (composition over boolean props). */

export function ResourcePage({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="grid gap-3">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {description ? <p className="text-sm text-ink-muted">{description}</p> : null}
      </header>
      {children}
    </section>
  );
}

export function ResourcePending() {
  return <p className="text-sm text-ink-muted">Loading…</p>;
}

export function ResourceError({ message }: { message: string }) {
  return (
    <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger-ink">
      {message}
    </p>
  );
}

export function ResourceEmpty({
  title,
  children,
  action,
  mood = "idle",
  mascot = true,
}: {
  /** When set, `children` is the supporting line under the title. */
  title?: React.ReactNode;
  children?: React.ReactNode;
  action?: React.ReactNode;
  mood?: WiziMood;
  mascot?: boolean;
}) {
  // Back-compat: most call sites pass only children (the empty message).
  if (title === undefined) {
    return (
      <EmptyState
        title={children ?? "Nothing here yet"}
        mood={mood}
        action={action}
        mascot={mascot}
        mascotSize={112}
      />
    );
  }
  return (
    <EmptyState title={title} mood={mood} action={action} mascot={mascot} mascotSize={112}>
      {children}
    </EmptyState>
  );
}
