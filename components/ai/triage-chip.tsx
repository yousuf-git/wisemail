import { Sparkles } from "lucide-react";

import { CATEGORY_LABEL, type TriageDTO } from "@/lib/ai/types";
import { cn } from "@/lib/utils";

const PRIORITY_LABEL = { low: "Low", normal: "Normal", high: "High", urgent: "Urgent" } as const;
const SENTIMENT_LABEL = { negative: "Negative", neutral: "Neutral", positive: "Positive" } as const;

/**
 * The AI chip of an inbox row (FED board): sparkle + category in the `engaged` tint, with an
 * "Urgent" / "High" dot when it matters. The summary is the chip's tooltip.
 */
export function TriageChip({ ai, className }: { ai: TriageDTO; className?: string }) {
  const hot = ai.priority === "urgent" || ai.priority === "high";
  return (
    <span
      data-slot="ai-chip"
      data-category={ai.category}
      data-priority={ai.priority}
      title={ai.summary ? `AI summary: ${ai.summary}` : undefined}
      className={cn(
        "inline-flex flex-none items-center gap-1 rounded-full bg-engaged-soft px-[7px] py-px text-[10.5px] font-bold text-engaged-ink",
        className,
      )}
    >
      <Sparkles aria-hidden className="size-2.5" />
      {CATEGORY_LABEL[ai.category]}
      {hot ? (
        <span className="inline-flex items-center gap-0.5 text-danger-ink">
          <i aria-hidden className="size-1 rounded-full bg-current" />
          {PRIORITY_LABEL[ai.priority]}
        </span>
      ) : null}
    </span>
  );
}

/** Thread header card: the one-line summary plus what the model read into it. */
export function TriageSummary({ ai }: { ai: TriageDTO }) {
  return (
    <div
      data-testid="ai-summary"
      className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-engaged-soft/60 px-3 py-2 text-[0.8125rem]"
    >
      <TriageChip ai={ai} className="bg-surface" />
      <span className="min-w-0 flex-1 basis-56 text-ink-secondary">{ai.summary}</span>
      <span className="text-xs text-ink-muted">
        {PRIORITY_LABEL[ai.priority]} priority · {SENTIMENT_LABEL[ai.sentiment]} tone
      </span>
    </div>
  );
}
