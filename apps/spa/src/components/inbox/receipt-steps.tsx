import { Fragment } from "react";
import { Link } from "@tanstack/react-router";

import type { ReceiptSummary } from "@/lib/api";
import { cn } from "@/lib/utils";

import { useNow } from "./format";
import { deriveReceiptSteps, type StepTone } from "./receipt";

const tones: Record<StepTone, string> = {
  off: "bg-canvas-sunken text-ink-muted",
  info: "bg-info-soft text-info-ink",
  ok: "bg-success-soft text-success-ink",
  engaged: "bg-engaged-soft text-engaged-ink",
  warning: "bg-warning-soft text-warning-ink",
  danger: "bg-danger-soft text-danger-ink",
  neutral: "bg-neutral-soft text-neutral-ink",
};

export function ReceiptSteps({
  receipts,
  orgSlug,
  className,
}: {
  receipts: ReceiptSummary;
  orgSlug?: string;
  className?: string;
}) {
  const clock = useNow();
  const steps = deriveReceiptSteps(receipts, clock);

  return (
    <ol
      aria-label="Delivery progress"
      data-testid="receipt-steps"
      className={cn("flex flex-wrap items-center gap-1.5 text-xs", className)}
    >
      {steps.map((step, index) => (
        <Fragment key={`${step.key}-${step.tone}`}>
          {index > 0 ? (
            <li aria-hidden className="text-ink-muted">
              ·
            </li>
          ) : null}
          <li
            data-step={step.key}
            data-tone={step.tone}
            title={step.title}
            className={cn(
              "inline-flex items-center gap-[5px] rounded-full px-[9px] py-[3px] font-semibold",
              tones[step.tone],
            )}
          >
            <i aria-hidden className="size-1.5 rounded-full bg-current" />
            {step.href === "checklist" && orgSlug ? (
              <Link
                to="/$orgSlug/settings/connections"
                params={{ orgSlug }}
                className="underline-offset-2 hover:underline"
              >
                {step.label}
              </Link>
            ) : (
              step.label
            )}
          </li>
        </Fragment>
      ))}
    </ol>
  );
}
