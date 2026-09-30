"use client";

import { Bell, Check, Mail } from "lucide-react";
import Link from "next/link";
import { useReducedMotion } from "motion/react";
import * as m from "motion/react-m";
import { useEffect, useState } from "react";

import { Wizi, type WiziMood } from "@/components/mascot/wizi";
import { cn } from "@/lib/utils";

/** What Wizi says, per mood. Short and in Wisemail's voice (FED §8). */
const BUBBLES: Record<WiziMood, string> = {
  idle: "Good to see you.",
  happy: "Let's get you set up.",
  wow: "A fresh start!",
  thinking: "Let me check that.",
  detective: "Checking your code…",
  worried: "Hmm, that didn't work.",
  sleep: "All quiet.",
};

/** Only things Wisemail really does (PRD §5). */
const PROOF_POINTS = [
  "Read receipts on your replies: Sent, Delivered, Opened, Clicked.",
  "Every Resend account in one inbox, with threads that stay together.",
  "Bounce and complaint alerts before they dent your reputation.",
  "AI reply drafts you review first. Nothing is ever sent for you.",
  "Try Pro free for 14 days. No card needed.",
];

export function BrandMark({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      className={cn("flex items-center gap-2.5 text-ink", className)}
      aria-label="Go to the Wisemail home page"
    >
      <span className="grid size-9 place-items-center rounded-md bg-accent-fill text-accent-ink shadow-glow">
        <Mail className="size-5" aria-hidden />
      </span>
      <span className="text-lg font-bold tracking-[-0.02em]">Wisemail</span>
    </Link>
  );
}

/** A looping read-receipt moment: the thing Wisemail is best known for. Decorative. */
function ThreadVignette() {
  const reduced = useReducedMotion() ?? false;
  const [step, setStep] = useState(reduced ? 3 : 0);

  useEffect(() => {
    if (reduced) return;
    const timer = setTimeout(() => setStep((s) => (s + 1) % 5), step === 3 ? 3200 : 1100);
    return () => clearTimeout(timer);
  }, [step, reduced]);

  const stages = ["Sent", "Delivered", "Opened"];
  return (
    <div aria-hidden className="relative mb-6 w-full max-w-sm">
      <div className="rounded-xl border border-line bg-surface p-4 shadow-md">
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-full bg-engaged-soft text-sm font-bold text-engaged-ink">
            J
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-ink">Re: Saturday order</p>
            <p className="truncate text-[0.8125rem] text-ink-muted">To Jane · just now</p>
          </div>
          <span className="rounded-full bg-canvas-sunken px-2 py-0.5 text-[0.6875rem] font-semibold text-ink-muted">
            Example
          </span>
        </div>
        <p className="mt-3 text-sm text-ink-secondary">Thanks, Jane! Your order is ready at 9.</p>
        <ol className="mt-4 flex items-center gap-2">
          {stages.map((label, i) => {
            const done = step > i;
            return (
              <li key={label} className="flex flex-1 items-center gap-2 last:flex-none">
                <m.span
                  animate={{ scale: done && step === i + 1 ? [1, 1.25, 1] : 1 }}
                  transition={{ duration: 0.35 }}
                  className={cn(
                    "grid size-5 shrink-0 place-items-center rounded-full border",
                    done
                      ? "border-success bg-success text-accent-ink"
                      : "border-line-strong bg-transparent text-transparent",
                  )}
                >
                  <Check className="size-3" />
                </m.span>
                <span
                  className={cn(
                    "text-[0.8125rem] font-medium",
                    done ? "text-ink" : "text-ink-muted",
                  )}
                >
                  {label}
                </span>
                {i < stages.length - 1 ? (
                  <span className="relative h-0.5 flex-1 overflow-hidden rounded-full bg-line">
                    <m.span
                      className="absolute inset-y-0 left-0 w-full origin-left bg-success"
                      animate={{ scaleX: step > i + 1 ? 1 : 0 }}
                      transition={{ duration: 0.4 }}
                    />
                  </span>
                ) : null}
              </li>
            );
          })}
        </ol>
      </div>
      <m.div
        animate={{ y: step >= 3 ? 0 : 10 }}
        transition={{ type: "spring", stiffness: 260, damping: 22 }}
        // Opacity flips instantly (only the slide is animated) so a contrast check never sees a
        // half-faded label.
        className={cn(
          step >= 3 ? "opacity-100" : "opacity-0",
          "absolute -right-2 -bottom-9 flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-[0.8125rem] font-medium text-ink shadow-lg sm:-right-6",
        )}
      >
        <span className="grid size-6 place-items-center rounded-full bg-glow-soft text-warning-ink">
          <Bell className="size-3.5" />
        </span>
        Jane opened your reply
      </m.div>
    </div>
  );
}

function ProofPoints() {
  const reduced = useReducedMotion() ?? false;
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (reduced) return;
    const timer = setInterval(() => setIndex((i) => (i + 1) % PROOF_POINTS.length), 5200);
    return () => clearInterval(timer);
  }, [reduced]);

  return (
    <div className="grid gap-3">
      <p className="min-h-12 text-[0.9375rem] leading-6 text-ink-secondary">
        <m.span
          key={index}
          initial={{ y: 8 }}
          animate={{ y: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="block"
        >
          {PROOF_POINTS[index]}
        </m.span>
      </p>
      <div className="flex gap-1.5" aria-hidden>
        {PROOF_POINTS.map((_, i) => (
          <span
            key={i}
            className={cn(
              "h-1 rounded-full transition-all duration-500",
              i === index ? "w-6 bg-accent-fill" : "w-1.5 bg-line-strong",
            )}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * The brand half of the auth layout. From `lg` it is a full-height side panel (Wizi, a live
 * read-receipt vignette, a rotating proof point); below that it shrinks to a compact header.
 */
export function BrandPanel({ mood, bubble }: { mood: WiziMood; bubble?: string }) {
  const line = bubble ?? BUBBLES[mood];
  return (
    <aside className="relative overflow-hidden border-b border-line bg-accent-soft lg:min-h-dvh lg:border-r lg:border-b-0">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 -left-24 size-80 rounded-full bg-glow-soft blur-3xl"
      />
      {/* Compact header (below lg). */}
      <div className="relative flex items-center justify-between gap-3 px-4 py-3 lg:hidden">
        <div className="grid gap-0.5">
          <BrandMark />
        </div>
        <div className="flex items-center gap-2">
          <span className="max-w-[9rem] text-right text-[0.8125rem] font-medium text-ink-secondary">
            {line}
          </span>
          <Wizi mood={mood} size={44} interactive={false} />
        </div>
      </div>

      {/* Full panel (lg and up). */}
      <div className="relative hidden h-full flex-col justify-between gap-10 p-12 lg:flex xl:p-16">
        <BrandMark />
        <div className="grid gap-10">
          <div className="grid gap-4">
            <p className="max-w-md text-[2.25rem] leading-[2.75rem] font-bold tracking-[-0.03em] text-balance text-ink">
              See what your email has been up to.
            </p>
            <p className="max-w-md text-ink-secondary">
              One calm place for your Resend accounts, your inbox and what happens after you hit
              send.
            </p>
          </div>
          <div className="relative grid gap-8">
            <div className="flex items-end gap-4">
              <Wizi mood={mood} size={140} greet interactive />
              <p className="mb-8 rounded-lg rounded-bl-none border border-line bg-surface px-3 py-2 text-sm font-medium text-ink shadow-sm">
                {line}
              </p>
            </div>
            <ThreadVignette />
          </div>
        </div>
        <ProofPoints />
      </div>
    </aside>
  );
}
