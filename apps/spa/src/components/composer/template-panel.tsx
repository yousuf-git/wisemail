import type { TemplateOption } from "@/lib/api";

/**
 * Template mode: pick a published template, then fill in its variables.
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
  templates: TemplateOption[];
  templateId: string | null;
  onTemplate: (id: string) => void;
  values: Record<string, string>;
  onValues: (values: Record<string, string>) => void;
  errors: Record<string, string>;
  disabled?: boolean;
}) {
  const template = templates.find((t) => t.id === templateId) ?? null;
  return (
    <div className="grid content-start gap-3" data-testid="template-panel">
      <div className="grid gap-1.5">
        <label htmlFor="composer-template" className="text-sm font-medium">
          Template
        </label>
        <select
          id="composer-template"
          value={templateId ?? ""}
          onChange={(e) => onTemplate(e.target.value)}
          disabled={disabled}
          aria-invalid={!!errors._template || undefined}
          className="h-10 w-full rounded-control border border-line bg-canvas px-3 text-sm"
        >
          <option value="" disabled>
            Choose a published template
          </option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        {errors._template ? (
          <p role="alert" className="text-xs text-danger-ink">
            {errors._template}
          </p>
        ) : null}
      </div>
      {template && template.variables.length === 0 ? (
        <p className="text-sm text-ink-muted">This template has no variables. It goes out as written.</p>
      ) : null}
      {template?.variables.map((variable) => (
        <div key={variable.key} className="grid gap-1.5">
          <label htmlFor={`composer-var-${variable.key}`} className="text-sm font-medium">
            <span className="font-mono">{variable.key}</span>
            <span className="font-normal text-ink-muted">
              {variable.fallback === null ? " (required)" : ` (default: ${variable.fallback})`}
            </span>
          </label>
          <input
            id={`composer-var-${variable.key}`}
            value={values[variable.key] ?? ""}
            inputMode={variable.type === "number" ? "decimal" : undefined}
            disabled={disabled}
            aria-invalid={!!errors[variable.key] || undefined}
            placeholder={variable.fallback === null ? "" : String(variable.fallback)}
            onChange={(event) => onValues({ ...values, [variable.key]: event.target.value })}
            className="h-10 rounded-control border border-line bg-canvas px-3 text-sm outline-none focus:ring-2 focus:ring-accent"
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
