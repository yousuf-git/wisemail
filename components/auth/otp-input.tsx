"use client";

import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";

/**
 * Segmented one-time-code input. One real <input> per digit, so screen readers announce each
 * box ("Digit 2 of 6") while the whole thing behaves like a single field: typing advances,
 * Backspace steps back, arrows move, and pasting (or a phone's SMS autofill) fills every box.
 */
export function OtpInput({
  value,
  onChange,
  onComplete,
  length = 6,
  label = "Verification code",
  disabled,
  invalid,
  autoFocus,
  idPrefix = "otp",
}: {
  value: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
  length?: number;
  label?: string;
  disabled?: boolean;
  invalid?: boolean;
  autoFocus?: boolean;
  idPrefix?: string;
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = Array.from({ length }, (_, i) => value[i] ?? "");

  useEffect(() => {
    if (autoFocus) refs.current[0]?.focus();
  }, [autoFocus]);

  const focusAt = (index: number) => {
    const target = refs.current[Math.max(0, Math.min(length - 1, index))];
    target?.focus();
    target?.select();
  };

  function commit(next: string, focusIndex: number) {
    const clean = next.slice(0, length);
    onChange(clean);
    if (clean.length === length && next !== value) onComplete?.(clean);
    else focusAt(focusIndex);
  }

  function insert(index: number, raw: string) {
    const typed = raw.replace(/\D/g, "");
    if (!typed) return;
    // Boxes fill left to right, so a click on a later empty box still appends.
    const at = Math.min(index, value.length);
    commit(
      value.slice(0, at) + typed + value.slice(at + typed.length),
      Math.min(at + typed.length, length - 1),
    );
  }

  return (
    <div
      role="group"
      aria-label={label}
      className="flex w-full min-w-0 justify-between gap-2 sm:gap-2.5"
    >
      {digits.map((digit, index) => (
        <input
          key={index}
          id={`${idPrefix}-${index}`}
          ref={(el) => {
            refs.current[index] = el;
          }}
          value={digit}
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete={index === 0 ? "one-time-code" : "off"}
          maxLength={index === 0 ? length : 1}
          aria-label={`Digit ${index + 1} of ${length}`}
          aria-invalid={invalid || undefined}
          disabled={disabled}
          onFocus={(e) => e.target.select()}
          onChange={(e) => insert(index, e.target.value)}
          onPaste={(e) => {
            e.preventDefault();
            insert(index, e.clipboardData.getData("text"));
          }}
          onKeyDown={(e) => {
            if (e.key === "Backspace") {
              e.preventDefault();
              if (digit) commit(value.slice(0, index) + value.slice(index + 1), index);
              else if (index > 0) commit(value.slice(0, index - 1) + value.slice(index), index - 1);
            } else if (e.key === "ArrowLeft") {
              e.preventDefault();
              focusAt(index - 1);
            } else if (e.key === "ArrowRight") {
              e.preventDefault();
              focusAt(index + 1);
            }
          }}
          className={cn(
            "h-12 w-0 min-w-0 flex-1 rounded-md border border-input bg-transparent text-center font-mono text-xl font-semibold text-ink shadow-xs transition-[color,box-shadow] outline-none sm:h-14 sm:text-2xl dark:bg-input/30",
            "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
            "aria-invalid:border-destructive aria-invalid:ring-destructive/20",
            "disabled:cursor-not-allowed disabled:opacity-50",
          )}
        />
      ))}
    </div>
  );
}
