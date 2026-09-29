"use client";

import { X } from "lucide-react";
import { useId, useRef, useState } from "react";

import { isValidEmail, normalizeAddress, parseAddress } from "@/lib/mail/address";
import { cn } from "@/lib/utils";

/**
 * Splits pasted or typed text into addresses. Commas, semicolons and newlines always separate;
 * a space separates only after something with an `@`, so `Jane Doe <jane@x.com>` stays whole.
 */
export function splitAddresses(text: string): string[] {
  const out: string[] = [];
  let current = "";
  let inAngle = false;
  const flush = () => {
    if (current.trim()) out.push(current.trim());
    current = "";
  };
  for (const char of text) {
    if (char === "<") inAngle = true;
    if (char === ">") inAngle = false;
    if (inAngle) current += char;
    else if (char === "," || char === ";" || char === "\n" || char === "\r") flush();
    else if (/\s/.test(char)) {
      if (current.includes("@")) flush();
      else current += char;
    } else current += char;
  }
  flush();
  return out;
}

/** Turns a token into the stored value: the bare address when it parses, else the raw text. */
export function toAddressValue(token: string): string {
  const parsed = parseAddress(token);
  if (parsed && isValidEmail(parsed.address)) return parsed.address;
  return normalizeAddress(token);
}

export const isValidAddress = (value: string) => isValidEmail(value);

export function AddressField({
  label,
  values,
  onChange,
  max = 50,
  error,
  disabled,
  autoFocus,
  placeholder,
  className,
  trailing,
}: {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  max?: number;
  error?: string | null;
  disabled?: boolean;
  autoFocus?: boolean;
  placeholder?: string;
  className?: string;
  trailing?: React.ReactNode;
}) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState("");
  const hasInvalid = values.some((v) => !isValidAddress(v));

  function commit(text: string) {
    const tokens = splitAddresses(text).map(toAddressValue);
    setDraft("");
    if (!tokens.length) return;
    const next = [...values];
    for (const token of tokens) if (!next.includes(token)) next.push(token);
    onChange(next);
  }

  return (
    <div className={cn("grid gap-1", className)}>
      <div
        className={cn(
          "flex min-h-10 items-start gap-2 border-b border-line py-1.5 pr-1 text-sm",
          error && "border-danger",
        )}
        onClick={() => inputRef.current?.focus()}
      >
        <label htmlFor={id} className="w-11 shrink-0 pt-1 text-[0.8125rem] text-ink-muted">
          {label}
        </label>
        <ul aria-label={`${label} recipients`} className="flex min-w-0 flex-1 flex-wrap gap-1.5">
          {values.map((value) => {
            const valid = isValidAddress(value);
            return (
              <li
                key={value}
                data-testid="address-pill"
                data-valid={valid}
                title={valid ? undefined : `“${value}” isn't a valid email address`}
                className={cn(
                  "inline-flex max-w-full items-center gap-1 rounded-full py-0.5 pr-1 pl-2.5 text-[0.8125rem] font-medium",
                  valid ? "bg-canvas-sunken text-ink" : "bg-danger-soft text-danger-ink",
                )}
              >
                <span className="truncate">{value}</span>
                {valid ? null : <span className="sr-only">(not a valid email address)</span>}
                <button
                  type="button"
                  disabled={disabled}
                  aria-label={`Remove ${value}`}
                  className="grid size-5 shrink-0 place-items-center rounded-full outline-none hover:bg-line-strong/60 focus-visible:ring-2 focus-visible:ring-accent"
                  onClick={(event) => {
                    event.stopPropagation();
                    onChange(values.filter((v) => v !== value));
                  }}
                >
                  <X aria-hidden className="size-3" />
                </button>
              </li>
            );
          })}
          <li className="min-w-[8rem] flex-1">
            <input
              ref={inputRef}
              id={id}
              type="text"
              inputMode="email"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              autoFocus={autoFocus}
              disabled={disabled}
              value={draft}
              placeholder={values.length === 0 ? placeholder : undefined}
              aria-invalid={hasInvalid || !!error || undefined}
              aria-describedby={error ? `${id}-error` : undefined}
              className="h-7 w-full bg-transparent text-sm outline-none placeholder:text-ink-faint"
              onChange={(event) => {
                const next = event.target.value;
                // A comma or semicolon finishes an address; so does a space after a valid one
                // (a space inside a display name, or inside `<...>`, does not).
                const open = /<[^>]*$/.test(next);
                const finished =
                  !open &&
                  (/[,;]$/.test(next) ||
                    (/\s$/.test(next) && isValidAddress(toAddressValue(next.trim()))));
                if (finished) commit(next);
                else setDraft(next);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && draft.trim()) {
                  event.preventDefault();
                  commit(draft);
                } else if (event.key === "Backspace" && !draft && values.length) {
                  onChange(values.slice(0, -1));
                }
              }}
              onBlur={() => draft.trim() && commit(draft)}
              onPaste={(event) => {
                const text = event.clipboardData.getData("text");
                if (/[,;\s]/.test(text.trim())) {
                  event.preventDefault();
                  commit(draft + text);
                }
              }}
            />
          </li>
        </ul>
        {trailing ? <div className="flex shrink-0 gap-1 pt-0.5">{trailing}</div> : null}
      </div>
      {error ? (
        <p id={`${id}-error`} role="alert" className="pl-[3.25rem] text-xs text-danger-ink">
          {error}
        </p>
      ) : values.length > max ? (
        <p className="pl-[3.25rem] text-xs text-danger-ink">At most {max} recipients.</p>
      ) : null}
    </div>
  );
}
