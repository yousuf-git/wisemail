"use client";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import type { TemplateOptionDTO } from "@/lib/dto/audience";

/**
 * Template mode of the composer (UC-08): pick a published template, then fill in its variables.
 * The rendered result is what the composer's preview shows. A variable with a default can stay
 * empty; one without must be filled.
 */
export function TemplatePanel({
  templates,
  templateId,
  onTemplate,
  values,
  onValues,
  errors,
  disabled,
}: {
  templates: TemplateOptionDTO[];
  templateId: string | null;
  onTemplate: (id: string) => void;
  values: Record<string, string>;
  onValues: (values: Record<string, string>) => void;
  /** Messages by variable key. */
  errors: Record<string, string>;
  disabled?: boolean;
}) {
  const template = templates.find((t) => t.id === templateId) ?? null;
  return (
    <div className="grid content-start gap-3" data-testid="template-panel">
      <div className="grid gap-1.5">
        <Label htmlFor="composer-template">Template</Label>
        <Select value={templateId ?? ""} onValueChange={onTemplate} disabled={disabled}>
          <SelectTrigger
            id="composer-template"
            className="w-full"
            aria-invalid={!!errors._template}
          >
            <SelectValue placeholder="Choose a published template" />
          </SelectTrigger>
          <SelectContent>
            {templates.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {errors._template ? (
          <p role="alert" className="text-xs text-danger-ink">
            {errors._template}
          </p>
        ) : null}
      </div>
      {template && template.variables.length === 0 ? (
        <p className="text-sm text-ink-muted">
          This template has no variables. It goes out as written.
        </p>
      ) : null}
      {template?.variables.map((variable) => (
        <div key={variable.key} className="grid gap-1.5">
          <Label htmlFor={`composer-var-${variable.key}`}>
            <span className="font-mono">{variable.key}</span>
            <span className="font-normal text-ink-muted">
              {variable.fallback === null ? " (required)" : ` (default: ${variable.fallback})`}
            </span>
          </Label>
          <Input
            id={`composer-var-${variable.key}`}
            value={values[variable.key] ?? ""}
            inputMode={variable.type === "number" ? "decimal" : undefined}
            disabled={disabled}
            aria-invalid={!!errors[variable.key]}
            placeholder={variable.fallback === null ? "" : String(variable.fallback)}
            onChange={(event) => onValues({ ...values, [variable.key]: event.target.value })}
          />
          {errors[variable.key] ? (
            <p role="alert" className="text-xs text-danger-ink">
              {errors[variable.key]}
            </p>
          ) : null}
        </div>
      ))}
    </div>
  );
}
