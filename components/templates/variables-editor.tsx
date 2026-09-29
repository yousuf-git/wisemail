"use client";

import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { VARIABLE_KEY } from "@/lib/mail/template-vars";

export type VariableRow = {
  key: string;
  type: "string" | "number";
  /** Text as typed; empty means no fallback. */
  fallback: string;
  /** Value used in the preview only. */
  sample: string;
};

export const emptyVariable = (key = ""): VariableRow => ({
  key,
  type: "string",
  fallback: "",
  sample: "",
});

/** Problems per row index, for inline messages. */
export function variableErrors(rows: VariableRow[]): Record<number, string> {
  const errors: Record<number, string> = {};
  const seen = new Set<string>();
  rows.forEach((row, i) => {
    const key = row.key.trim();
    if (!VARIABLE_KEY.test(key))
      errors[i] = "Start with a letter; then letters, numbers or underscores.";
    else if (seen.has(key.toLowerCase())) errors[i] = "Each variable needs its own name.";
    else if (
      row.type === "number" &&
      row.fallback.trim() &&
      !Number.isFinite(Number(row.fallback))
    ) {
      errors[i] = "The default must be a number.";
    }
    seen.add(key.toLowerCase());
  });
  return errors;
}

/**
 * The variables a template declares. In the HTML they are `{{{NAME}}}`. A variable without a
 * default must be filled in every time the template is sent.
 */
export function VariablesEditor({
  rows,
  onChange,
  undeclared,
  disabled,
}: {
  rows: VariableRow[];
  onChange: (rows: VariableRow[]) => void;
  /** Names used in the HTML that no row declares yet. */
  undeclared: string[];
  disabled?: boolean;
}) {
  const errors = variableErrors(rows);
  const patch = (i: number, next: Partial<VariableRow>) =>
    onChange(rows.map((row, index) => (index === i ? { ...row, ...next } : row)));

  return (
    <div className="grid gap-2" data-testid="variables-editor">
      {rows.length === 0 ? (
        <p className="text-sm text-ink-muted">
          No variables yet. Put{" "}
          <code className="rounded bg-canvas-sunken px-1 font-mono text-xs">{"{{{NAME}}}"}</code> in
          the HTML, and it appears here.
        </p>
      ) : (
        <ul className="grid gap-2">
          {rows.map((row, i) => (
            <li key={i} className="grid gap-1">
              <div className="grid grid-cols-[minmax(0,1.2fr)_6.5rem] gap-2 min-[560px]:grid-cols-[minmax(0,1.2fr)_6.5rem_minmax(0,1fr)_minmax(0,1fr)_auto]">
                <Input
                  aria-label="Variable name"
                  value={row.key}
                  disabled={disabled}
                  placeholder="NAME"
                  aria-invalid={!!errors[i]}
                  onChange={(e) => patch(i, { key: e.target.value })}
                  className="h-8 font-mono text-[13px]"
                />
                <Select
                  value={row.type}
                  disabled={disabled}
                  onValueChange={(v) => patch(i, { type: v as "string" | "number" })}
                >
                  <SelectTrigger size="sm" aria-label="Variable type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="string">Text</SelectItem>
                    <SelectItem value="number">Number</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  aria-label="Default value"
                  value={row.fallback}
                  disabled={disabled}
                  placeholder="Default"
                  onChange={(e) => patch(i, { fallback: e.target.value })}
                  className="col-span-2 h-8 text-[13px] min-[560px]:col-span-1"
                />
                <Input
                  aria-label="Preview value"
                  value={row.sample}
                  placeholder="Preview value"
                  onChange={(e) => patch(i, { sample: e.target.value })}
                  className="col-span-2 h-8 text-[13px] min-[560px]:col-span-1"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  disabled={disabled}
                  aria-label={`Remove ${row.key || "variable"}`}
                  onClick={() => onChange(rows.filter((_, index) => index !== i))}
                >
                  <Trash2 aria-hidden />
                </Button>
              </div>
              {errors[i] ? (
                <p role="alert" className="text-xs text-danger-ink">
                  {errors[i]}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {undeclared.length > 0 && !disabled ? (
        <div className="flex flex-wrap items-center gap-1.5 rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning-ink">
          <span>Used in the HTML but not declared:</span>
          {undeclared.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => onChange([...rows, emptyVariable(key)])}
              className="rounded-full bg-surface px-2.5 py-0.5 font-mono text-xs font-semibold ring-1 ring-line outline-none hover:ring-accent focus-visible:ring-2 focus-visible:ring-accent"
            >
              + {key}
            </button>
          ))}
        </div>
      ) : null}
      {!disabled ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-fit"
          onClick={() => onChange([...rows, emptyVariable()])}
        >
          <Plus aria-hidden /> Add variable
        </Button>
      ) : null}
    </div>
  );
}
