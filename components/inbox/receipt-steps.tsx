"use client";

import * as m from "motion/react-m";
import Link from "next/link";
import { Fragment } from "react";

import type { ReceiptSummaryDTO } from "@/lib/dto/mail";
import { cn } from "@/lib/utils";
import { useNow } from "./format";
import { deriveReceiptSteps, type StepTone } from "./receipt";

const tones: Record<StepTone, string> = {
  off: "bg-canvas-sunken text-ink-faint",
  info: "bg-info-soft text-info-ink",
  ok: "bg-success-soft text-success-ink",
  engaged: "bg-engaged-soft text-engaged-ink",
  warning: "bg-warning-soft text-warning-ink",
  danger: "bg-danger-soft text-danger-ink",
  neutral: "bg-neutral-soft text-neutral-ink",
};

/**
 * `Sent · Delivered · Opened 2m ago` (FED §5). The reached steps are filled; a newly reached
 * "Opened" gives one soft pulse in `engaged`. `now` can be passed for stable rendering in tests.
 */
export function ReceiptSteps({
  receipts,
  now,
  settingsHref,
  className,
}: {
  receipts: ReceiptSummaryDTO;
  now?: number;
  /** Where "Opens not tracked" links to (the setup checklist). */
  settingsHref?: string;
  className?: string;
}) {
  const clock = useNow();
  const steps = deriveReceiptSteps(receipts, now ?? clock);
  // `clock` is 0 while server-rendering and hydrating: steps that appear later get the pulse.
  const live = clock !== 0;

  return (
    <ol
      aria-label="Delivery progress"
      data-testid="receipt-steps"
      className={cn("flex flex-wrap items-center gap-1.5 text-xs", className)}
    >
      {steps.map((step, index) => (
        <Fragment key={`${step.key}-${step.tone}`}>
          {index > 0 ? (
            <li aria-hidden className="text-ink-faint">
              ·
            </li>
          ) : null}
          <m.li
            data-step={step.key}
            data-tone={step.tone}
            title={step.title}
            initial={
              step.tone === "engaged" && live ? { boxShadow: "0 0 0 0 var(--engaged-soft)" } : false
            }
            animate={{ boxShadow: "0 0 0 7px transparent" }}
            transition={{ duration: 0.9, ease: [0.2, 0.8, 0.2, 1] }}
            className={cn(
              "inline-flex items-center gap-[5px] rounded-full px-[9px] py-[3px] font-semibold transition-colors duration-300",
              tones[step.tone],
            )}
          >
            <i aria-hidden className="size-1.5 rounded-full bg-current" />
            {step.href === "checklist" && settingsHref ? (
              <Link href={settingsHref} className="underline-offset-2 hover:underline">
                {step.label}
              </Link>
            ) : (
              step.label
            )}
          </m.li>
        </Fragment>
      ))}
    </ol>
  );
}
