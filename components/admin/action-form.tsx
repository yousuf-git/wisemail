"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { toast } from "sonner";

import { FormAlert } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/lib/actions/result";
import { cn } from "@/lib/utils";

/**
 * Form around an admin server action. `build` turns the form values into the action input; the
 * result is shown inline (errors) or as a toast (success) and the page data is refreshed.
 */
export function ActionForm<R>({
  action,
  build,
  submit,
  success,
  variant = "default",
  children,
  className,
  reset = true,
  onDone,
}: {
  action: (input: never) => Promise<ActionResult<R>>;
  build: (values: FormData) => unknown;
  submit: string;
  success: string;
  variant?: "default" | "destructive" | "outline";
  children?: React.ReactNode;
  className?: string;
  reset?: boolean;
  onDone?: (data: R) => void;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className={cn("grid gap-3", className)}
      onSubmit={async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        setPending(true);
        setError(null);
        const result = await action(build(new FormData(form)) as never);
        setPending(false);
        if (!result.ok) {
          setError(
            result.error.fieldErrors
              ? Object.values(result.error.fieldErrors)[0]![0]!
              : result.error.message,
          );
          return;
        }
        toast.success(success);
        if (reset) form.reset();
        onDone?.(result.data);
        router.refresh();
      }}
    >
      {children}
      <FormAlert>{error}</FormAlert>
      <div>
        <Button type="submit" size="sm" variant={variant} disabled={pending}>
          {pending ? "Working…" : submit}
        </Button>
      </div>
    </form>
  );
}

/** Labelled text input / textarea for admin forms. */
export function TextField({
  label,
  name,
  type = "text",
  required,
  placeholder,
  defaultValue,
  multiline,
  hint,
  min,
  max,
}: {
  label: string;
  name: string;
  type?: "text" | "number";
  required?: boolean;
  placeholder?: string;
  defaultValue?: string | number;
  multiline?: boolean;
  hint?: string;
  min?: number;
  max?: number;
}) {
  const id = useId();
  const cls =
    "w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1.5 text-sm shadow-xs outline-none placeholder:text-ink-muted focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";
  return (
    <div className="grid gap-1">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {multiline ? (
        <textarea
          id={id}
          name={name}
          required={required}
          placeholder={placeholder}
          defaultValue={defaultValue}
          rows={2}
          className={cn(cls, "min-h-16")}
        />
      ) : (
        <input
          id={id}
          name={name}
          type={type}
          required={required}
          placeholder={placeholder}
          defaultValue={defaultValue}
          min={min}
          max={max}
          inputMode={type === "number" ? "numeric" : undefined}
          className={cn(cls, "h-9")}
        />
      )}
      {hint ? <p className="text-xs text-ink-muted">{hint}</p> : null}
    </div>
  );
}

export function SelectField({
  label,
  name,
  options,
  defaultValue,
}: {
  label: string;
  name: string;
  options: { value: string; label: string }[];
  defaultValue?: string;
}) {
  const id = useId();
  return (
    <div className="grid gap-1">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <select
        id={id}
        name={name}
        defaultValue={defaultValue}
        className="h-9 w-full min-w-0 rounded-md border border-input bg-surface px-2.5 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Collapsible group so destructive forms stay out of the way until asked for. */
export function Disclosure({
  summary,
  tone,
  children,
}: {
  summary: string;
  tone?: "danger";
  children: React.ReactNode;
}) {
  return (
    <details
      className={cn(
        "group rounded-lg border border-line bg-canvas px-3.5 py-2.5",
        tone === "danger" && "border-danger/30",
      )}
    >
      <summary
        className={cn(
          "cursor-pointer text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-accent",
          tone === "danger" && "text-danger-ink",
        )}
      >
        {summary}
      </summary>
      <div className="pt-3">{children}</div>
    </details>
  );
}
