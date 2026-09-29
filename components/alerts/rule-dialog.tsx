"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { createAlertRuleAction, updateAlertRuleAction } from "@/app/(app)/[orgSlug]/alerts/actions";
import { FormAlert } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  ALERT_KINDS,
  ALERT_KIND_INFO,
  ALERT_PRESETS,
  isRollupKind,
  type AlertKind,
} from "@/lib/alerts/kinds";
import type { AlertRuleDTO, AlertScopeOptions } from "@/lib/dto/alert";
import { alertRuleInputSchema } from "@/lib/validation/alert";
import { cn } from "@/lib/utils";

const ROLLUP_WINDOWS = [60, 180, 360, 720, 1440, 4320, 10080];
const SILENCE_WINDOWS = [60, 180, 360, 720, 1440, 2880, 4320, 10080];

const windowText = (minutes: number) =>
  minutes < 1440
    ? `${minutes / 60} ${minutes === 60 ? "hour" : "hours"}`
    : `${minutes / 1440} ${minutes === 1440 ? "day" : "days"}`;

type FormState = {
  name: string;
  kind: AlertKind;
  threshold: string;
  windowMinutes: number;
  minVolume: string;
  connectionIds: string[];
  domainIds: string[];
  projectIds: string[];
  inApp: boolean;
  emailMembers: boolean;
  extraEmails: string;
  enabled: boolean;
};

function initialState(rule?: AlertRuleDTO): FormState {
  const preset = ALERT_PRESETS[0]!;
  const info = ALERT_KIND_INFO[rule?.kind ?? preset.kind];
  return {
    name: rule?.name ?? preset.name,
    kind: rule?.kind ?? preset.kind,
    threshold: String(rule?.condition.threshold ?? preset.condition.threshold),
    windowMinutes: rule?.condition.windowMinutes ?? info.defaults.windowMinutes,
    minVolume: String(rule?.condition.minVolume ?? preset.condition.minVolume),
    connectionIds: rule?.scope.connectionIds ?? [],
    domainIds: rule?.scope.domainIds ?? [],
    projectIds: rule?.scope.projectIds ?? [],
    inApp: rule?.channels.inApp ?? true,
    emailMembers: rule?.channels.emailMembers ?? true,
    extraEmails: (rule?.channels.email ?? []).join(", "),
    enabled: rule?.enabled ?? true,
  };
}

function ScopePicker({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { id: string; name: string }[];
  value: string[];
  onChange: (next: string[]) => void;
}) {
  if (options.length === 0) return null;
  return (
    <fieldset className="grid gap-1.5">
      <legend className="text-[0.8125rem] font-semibold text-ink-secondary">{label}</legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const on = value.includes(o.id);
          return (
            <button
              key={o.id}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(on ? value.filter((v) => v !== o.id) : [...value, o.id])}
              className={cn(
                "rounded-full px-3 py-1 text-[0.8125rem] font-medium ring-1 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent",
                on
                  ? "bg-accent-soft text-ink ring-accent"
                  : "bg-surface text-ink-secondary ring-line hover:bg-canvas-sunken",
              )}
            >
              {o.name}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

/** Create or edit an alert rule (UC-18): preset, condition, scope and channels. */
export function RuleDialog({
  orgSlug,
  rule,
  open,
  onOpenChange,
  scopeOptions,
}: {
  orgSlug: string;
  rule?: AlertRuleDTO;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scopeOptions: AlertScopeOptions;
}) {
  const router = useRouter();
  const [state, setState] = useState<FormState>(() => initialState(rule));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const info = ALERT_KIND_INFO[state.kind];
  const patch = (next: Partial<FormState>) => setState((s) => ({ ...s, ...next }));
  const windows = isRollupKind(state.kind) ? ROLLUP_WINDOWS : SILENCE_WINDOWS;

  function chooseKind(kind: AlertKind, name?: string) {
    const d = ALERT_KIND_INFO[kind].defaults;
    patch({
      kind,
      name: name ?? state.name,
      threshold: String(d.threshold),
      windowMinutes: d.windowMinutes,
      minVolume: String(d.minVolume),
      connectionIds: [],
      domainIds: [],
      projectIds: [],
    });
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);
    const emails = state.extraEmails
      .split(/[,\s]+/)
      .map((e) => e.trim())
      .filter(Boolean);
    const input = {
      name: state.name,
      kind: state.kind,
      scope: {
        connectionIds: state.connectionIds,
        domainIds: state.domainIds,
        projectIds: state.projectIds,
      },
      condition: {
        operator: "gt" as const,
        threshold:
          info.unit === null || state.kind === "connection_silent" ? 0 : Number(state.threshold),
        windowMinutes: info.windowed ? state.windowMinutes : 0,
        minVolume: Number(state.minVolume) || 0,
      },
      channels: { inApp: state.inApp, emailMembers: state.emailMembers, email: emails },
      enabled: state.enabled,
    };
    const parsed = alertRuleInputSchema.safeParse(input);
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [i.path.join("."), i.message])));
      return;
    }
    setErrors({});
    setSaving(true);
    const result = rule
      ? await updateAlertRuleAction(orgSlug, { id: rule.id, version: rule.version, rule: input })
      : await createAlertRuleAction(orgSlug, input);
    setSaving(false);
    if (!result.ok) {
      const fields = result.error.fieldErrors ?? {};
      if (Object.keys(fields).length) {
        setErrors(Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, v[0]!])));
      }
      setFormError(result.error.message);
      return;
    }
    toast.success(rule ? "Rule saved" : `Created “${result.data.name}”`);
    onOpenChange(false);
    router.refresh();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (next) {
          setState(initialState(rule));
          setErrors({});
          setFormError(null);
        }
      }}
    >
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl">
        <form onSubmit={submit} className="grid gap-4" noValidate>
          <DialogHeader>
            <DialogTitle className="text-xl">{rule ? "Edit rule" : "New alert rule"}</DialogTitle>
            <DialogDescription>
              Tell Wisemail what to watch. It opens an incident when the condition is met and closes
              it when things calm down.
            </DialogDescription>
          </DialogHeader>
          <FormAlert>{formError}</FormAlert>

          {rule ? null : (
            <div className="grid gap-1.5">
              <span className="text-[0.8125rem] font-semibold text-ink-secondary">
                Start from a preset
              </span>
              <div className="flex flex-wrap gap-1.5">
                {ALERT_PRESETS.map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => {
                      chooseKind(p.kind, p.name);
                      patch({
                        kind: p.kind,
                        name: p.name,
                        threshold: String(p.condition.threshold),
                        windowMinutes: p.condition.windowMinutes,
                        minVolume: String(p.condition.minVolume),
                      });
                    }}
                    className="rounded-full bg-surface px-3 py-1 text-[0.8125rem] font-medium text-ink-secondary ring-1 ring-line transition-colors outline-none hover:bg-canvas-sunken focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="grid gap-1.5">
            <Label htmlFor="rule-name">Name</Label>
            <Input
              id="rule-name"
              value={state.name}
              onChange={(e) => patch({ name: e.target.value })}
              autoComplete="off"
              aria-invalid={!!errors.name}
            />
            {errors.name ? <p className="text-sm text-danger-ink">{errors.name}</p> : null}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="rule-kind">Watch for</Label>
            <Select value={state.kind} onValueChange={(v) => chooseKind(v as AlertKind)}>
              <SelectTrigger id="rule-kind" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ALERT_KINDS.map((k) => (
                  <SelectItem key={k} value={k}>
                    {ALERT_KIND_INFO[k].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[0.8125rem] text-ink-muted">{info.blurb}</p>
          </div>

          {info.unit && state.kind !== "connection_silent" ? (
            <div className="grid gap-1.5">
              <Label htmlFor="rule-threshold">
                {info.unit === "complaints" ? "Alert when there are more than" : "Alert when above"}
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  id="rule-threshold"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step={info.unit === "%" ? 0.1 : 1}
                  value={state.threshold}
                  onChange={(e) => patch({ threshold: e.target.value })}
                  className="w-28"
                  aria-invalid={!!errors["condition.threshold"]}
                />
                <span className="text-sm text-ink-muted">
                  {info.unit === "%" ? "%" : "complaints"}
                </span>
              </div>
              {errors["condition.threshold"] ? (
                <p className="text-sm text-danger-ink">{errors["condition.threshold"]}</p>
              ) : null}
            </div>
          ) : null}

          {info.windowed ? (
            <div className="grid gap-1.5">
              <Label htmlFor="rule-window">
                {state.kind === "connection_silent" ? "Silent for" : "Over the last"}
              </Label>
              <Select
                value={String(state.windowMinutes)}
                onValueChange={(v) => patch({ windowMinutes: Number(v) })}
              >
                <SelectTrigger id="rule-window" className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {windows.map((w) => (
                    <SelectItem key={w} value={String(w)}>
                      {windowText(w)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {isRollupKind(state.kind) ? (
                <p className="text-[0.8125rem] text-ink-muted">
                  Measured in whole hours, so the newest partial hour is included.
                </p>
              ) : null}
            </div>
          ) : null}

          {state.kind === "bounce_rate" ||
          state.kind === "complaint_rate" ||
          state.kind === "delivery_delay_rate" ? (
            <div className="grid gap-1.5">
              <Label htmlFor="rule-volume">Only when at least this many emails were sent</Label>
              <Input
                id="rule-volume"
                type="number"
                min={0}
                value={state.minVolume}
                onChange={(e) => patch({ minVolume: e.target.value })}
                className="w-28"
              />
              <p className="text-[0.8125rem] text-ink-muted">
                Stops a single bounce out of two emails from raising the alarm.
              </p>
            </div>
          ) : null}

          {info.scopes.length > 0 &&
          scopeOptions.connections.length +
            scopeOptions.domains.length +
            scopeOptions.projects.length >
            0 ? (
            <details
              className="rounded-lg bg-canvas-sunken p-3"
              open={
                state.connectionIds.length + state.domainIds.length + state.projectIds.length > 0
              }
            >
              <summary className="cursor-pointer text-sm font-semibold">
                Limit to specific connections, domains or projects
              </summary>
              <div className="mt-3 grid gap-3">
                {info.scopes.includes("connections") ? (
                  <ScopePicker
                    label="Connections"
                    options={scopeOptions.connections}
                    value={state.connectionIds}
                    onChange={(connectionIds) => patch({ connectionIds })}
                  />
                ) : null}
                {info.scopes.includes("domains") ? (
                  <ScopePicker
                    label="Domains"
                    options={scopeOptions.domains}
                    value={state.domainIds}
                    onChange={(domainIds) => patch({ domainIds })}
                  />
                ) : null}
                {info.scopes.includes("projects") ? (
                  <ScopePicker
                    label="Projects"
                    options={scopeOptions.projects}
                    value={state.projectIds}
                    onChange={(projectIds) => patch({ projectIds })}
                  />
                ) : null}
                <p className="text-[0.8125rem] text-ink-muted">
                  Leave everything off to watch the whole workspace.
                </p>
              </div>
            </details>
          ) : null}

          <div className="grid gap-3 rounded-lg bg-canvas-sunken p-3">
            <p className="text-sm font-semibold">Tell people</p>
            <label className="flex items-center justify-between gap-3 text-sm">
              In the app (bell and notifications)
              <Switch
                checked={state.inApp}
                onCheckedChange={(inApp) => patch({ inApp })}
                aria-label="Notify in the app"
              />
            </label>
            <label className="flex items-center justify-between gap-3 text-sm">
              <span>
                Email teammates
                <span className="block text-[0.8125rem] text-ink-muted">
                  Each person&apos;s notification settings still apply.
                </span>
              </span>
              <Switch
                checked={state.emailMembers}
                onCheckedChange={(emailMembers) => patch({ emailMembers })}
                aria-label="Email teammates"
              />
            </label>
            <div className="grid gap-1.5">
              <Label htmlFor="rule-emails" className="font-medium">
                Also email these addresses{" "}
                <span className="font-normal text-ink-muted">(optional, up to 5)</span>
              </Label>
              <Input
                id="rule-emails"
                value={state.extraEmails}
                onChange={(e) => patch({ extraEmails: e.target.value })}
                placeholder="oncall@yourcompany.com"
                autoComplete="off"
              />
              {errors["channels.email.0"] ? (
                <p className="text-sm text-danger-ink">{errors["channels.email.0"]}</p>
              ) : null}
            </div>
          </div>

          <label className="flex items-center justify-between gap-3 text-sm font-medium">
            Rule is on
            <Switch
              checked={state.enabled}
              onCheckedChange={(enabled) => patch({ enabled })}
              aria-label="Rule enabled"
            />
          </label>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" className="font-bold" disabled={saving}>
              {saving ? "Saving…" : rule ? "Save rule" : "Create rule"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
