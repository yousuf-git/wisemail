import { Eye, EyeOff, TriangleAlert } from "lucide-react";
import { useState } from "react";

import { passwordStrength } from "@/lib/auth/password-strength";
import { cn } from "@/lib/utils";

/**
 * Password field with show/hide and Caps Lock hint. `strength` adds the sign-up meter.
 */
export function PasswordInput({
  strength = false,
  className,
  onKeyDown,
  onKeyUp,
  onBlur,
  ...props
}: Omit<React.ComponentProps<"input">, "type"> & { strength?: boolean }) {
  const [visible, setVisible] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const result = strength ? passwordStrength(String(props.value ?? "")) : null;

  const trackCaps = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (typeof event.getModifierState === "function") {
      setCapsLock(event.getModifierState("CapsLock"));
    }
  };

  return (
    <div className="grid gap-2">
      <div className="relative">
        <input
          {...props}
          type={visible ? "text" : "password"}
          autoCapitalize="none"
          spellCheck={false}
          className={cn(
            "h-10 w-full rounded-control border border-line-strong bg-canvas px-3 pr-10 outline-none focus:ring-2 focus:ring-accent",
            className,
          )}
          onKeyDown={(e) => {
            trackCaps(e);
            onKeyDown?.(e);
          }}
          onKeyUp={(e) => {
            trackCaps(e);
            onKeyUp?.(e);
          }}
          onBlur={(e) => {
            setCapsLock(false);
            onBlur?.(e);
          }}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          className="absolute inset-y-0 right-0 grid w-10 place-items-center rounded-r-md text-ink-muted outline-none hover:text-ink focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          {visible ? (
            <EyeOff className="size-4" aria-hidden />
          ) : (
            <Eye className="size-4" aria-hidden />
          )}
        </button>
      </div>
      {capsLock ? (
        <p role="status" className="flex items-center gap-1.5 text-[0.8125rem] text-warning-ink">
          <TriangleAlert className="size-3.5" aria-hidden /> Caps Lock is on.
        </p>
      ) : null}
      {result ? (
        <div className="grid gap-1.5" data-testid="password-strength" data-score={result.score}>
          <div className="flex gap-1" aria-hidden>
            {[1, 2, 3, 4].map((i) => (
              <span
                key={i}
                className={cn(
                  "h-1 flex-1 rounded-full bg-line-strong transition-colors",
                  result.score >= i &&
                    (result.score <= 1
                      ? "bg-danger"
                      : result.score === 2
                        ? "bg-warning"
                        : "bg-success"),
                )}
              />
            ))}
          </div>
          <p className="text-[0.8125rem] text-ink-muted" aria-live="polite">
            {result.label ? (
              <b className="font-semibold text-ink-secondary">{result.label}. </b>
            ) : null}
            {result.hint}
          </p>
        </div>
      ) : null}
    </div>
  );
}
