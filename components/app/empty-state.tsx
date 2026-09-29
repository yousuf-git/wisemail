import type { WiziMood } from "@/components/mascot/moods";
import { Wizi } from "@/components/mascot/wizi";
import { cn } from "@/lib/utils";

/**
 * No blank canvases (FED §1.3): Wizi, what is missing, and the next concrete step.
 * `mood` picks the pose; pass `mascot={false}` when another Wizi already appears in the view.
 */
export function EmptyState({
  title,
  children,
  action,
  mood = "idle",
  mascot = true,
  mascotSize = 160,
  className,
}: {
  title: React.ReactNode;
  children?: React.ReactNode;
  action?: React.ReactNode;
  mood?: WiziMood;
  mascot?: boolean;
  mascotSize?: number;
  className?: string;
}) {
  return (
    <div
      data-slot="empty-state"
      className={cn(
        "flex flex-col items-center gap-4 rounded-xl bg-surface px-6 py-10 text-center shadow-md",
        className,
      )}
    >
      {mascot ? <Wizi mood={mood} size={mascotSize} /> : null}
      <div className="grid max-w-[46ch] gap-1.5">
        <h2 className="text-xl leading-7 font-semibold tracking-[-0.01em]">{title}</h2>
        {children ? <p className="text-ink-muted">{children}</p> : null}
      </div>
      {action ? (
        <div className="flex flex-wrap items-center justify-center gap-2">{action}</div>
      ) : null}
    </div>
  );
}
