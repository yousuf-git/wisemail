"use client";

import { Lock, ShieldCheck, Sparkles } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { updateAiSettingsAction } from "@/app/(app)/[orgSlug]/settings/ai/actions";
import { EmptyState } from "@/components/app/empty-state";
import { FormAlert } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { AI_FLAGS, FEATURE_LABEL, FLAG_INFO, type AiFlag, type AiStatusDTO } from "@/lib/ai/types";
import type { AiUsageSummary } from "@/lib/services/ai-settings";
import { cn } from "@/lib/utils";

const number = new Intl.NumberFormat("en-US");
const day = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const when = (iso: string) =>
  new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  });

function PrivacyNote() {
  return (
    <section
      aria-labelledby="ai-privacy"
      className="flex gap-3 rounded-xl bg-canvas-sunken p-4 text-[0.8125rem] text-ink-secondary"
    >
      <ShieldCheck aria-hidden className="mt-0.5 size-4 flex-none text-success-ink" />
      <div className="grid gap-1">
        <h2 id="ai-privacy" className="text-sm font-semibold text-ink">
          What leaves Wisemail
        </h2>
        <p>
          When you use an AI feature, the text it needs is sent to the AI provider your Wisemail
          deployment is configured with: the newest message without quoted history or signature, cut
          to a few thousand characters. Attachments and recipient lists are never sent. Alert
          explanations send counts and error reasons only. Your content isn&apos;t used to train
          models, and AI never sends email or changes data by itself.
        </p>
        <p>Turn AI off here and nothing is sent, for anyone in this workspace.</p>
      </div>
    </section>
  );
}

function Credits({ status }: { status: AiStatusDTO }) {
  const c = status.credits;
  const share = c.allowance > 0 ? Math.min(100, Math.round((c.used / c.allowance) * 100)) : 0;
  const tone = share >= 100 ? "bg-danger" : share >= 80 ? "bg-warning" : "bg-engaged";
  return (
    <section
      aria-labelledby="ai-credits"
      className="grid gap-3 rounded-xl bg-surface p-5 shadow-md"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="ai-credits" className="text-base font-semibold">
          AI credits
        </h2>
        <p className="text-[0.8125rem] text-ink-muted">Allowance resets {day(c.resetsAt)}</p>
      </div>
      <div
        role="meter"
        aria-label="Monthly AI credits used"
        aria-valuemin={0}
        aria-valuemax={c.allowance}
        aria-valuenow={Math.min(c.used, c.allowance)}
        className="h-2.5 overflow-hidden rounded-full bg-canvas-sunken"
      >
        <div
          className={cn("h-full rounded-full transition-[width] duration-500", tone)}
          style={{ width: `${share}%` }}
        />
      </div>
      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          ["Left to use", c.available],
          ["Used this period", c.used],
          ["Monthly allowance", c.allowance],
          ["Pack credits", c.packs],
        ].map(([label, value]) => (
          <div key={label as string} className="grid gap-0.5">
            <dt className="text-xs font-semibold tracking-[0.04em] text-ink-muted uppercase">
              {label}
            </dt>
            <dd className="text-xl font-bold tabular-nums">{number.format(value as number)}</dd>
          </div>
        ))}
      </dl>
      <p className="text-[0.8125rem] text-ink-muted">
        Triage costs 1 credit, compose helpers 2, reply drafts and alert explanations 5. Allowance
        is used first, then credit packs.
      </p>
    </section>
  );
}

function UsageTable({ usage }: { usage: AiUsageSummary }) {
  return (
    <section aria-labelledby="ai-usage" className="grid gap-3">
      <h2 id="ai-usage" className="text-base font-semibold">
        Usage this period
      </h2>
      <ul className="flex flex-wrap gap-2" aria-label="Usage by feature">
        {(Object.keys(usage.byFeature) as (keyof typeof usage.byFeature)[]).map((f) => (
          <li key={f} className="rounded-full bg-canvas-sunken px-3 py-1 text-[0.8125rem]">
            <b className="font-semibold">{FEATURE_LABEL[f]}</b>{" "}
            <span className="text-ink-muted tabular-nums">
              {usage.byFeature[f].calls} {usage.byFeature[f].calls === 1 ? "call" : "calls"} ·{" "}
              {usage.byFeature[f].credits} {usage.byFeature[f].credits === 1 ? "credit" : "credits"}
            </span>
          </li>
        ))}
      </ul>
      {usage.rows.length === 0 ? (
        <p className="rounded-xl bg-surface p-4 text-sm text-ink-muted shadow-md">
          No AI calls yet this period. Triage, drafts and helpers show up here as they run.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl bg-surface shadow-md">
          <table className="w-full min-w-[34rem] text-left text-sm" data-testid="ai-usage-table">
            <thead className="border-b border-line bg-canvas-sunken text-xs font-semibold text-ink-muted">
              <tr>
                <th className="px-4 py-2">When (UTC)</th>
                <th className="px-4 py-2">Feature</th>
                <th className="px-4 py-2">Who</th>
                <th className="px-4 py-2">Model</th>
                <th className="px-4 py-2 text-right">Tokens</th>
                <th className="px-4 py-2 text-right">Credits</th>
              </tr>
            </thead>
            <tbody>
              {usage.rows.map((row) => (
                <tr key={row.id} className="border-b border-line last:border-b-0">
                  <td className="px-4 py-2 whitespace-nowrap text-ink-secondary">{when(row.at)}</td>
                  <td className="px-4 py-2">{FEATURE_LABEL[row.feature]}</td>
                  <td className="px-4 py-2 text-ink-secondary">{row.member ?? "Automatic"}</td>
                  <td className="px-4 py-2 font-mono text-xs text-ink-muted">{row.model}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{number.format(row.tokens)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{row.credits}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/** Settings → AI (UC AI & settings): per-feature switches, credits, usage, privacy, plan gate. */
export function AiSettings({
  orgSlug,
  status,
  usage,
}: {
  orgSlug: string;
  status: AiStatusDTO;
  usage: AiUsageSummary | null;
}) {
  const [enabled, setEnabled] = useState(status.enabled);
  const [features, setFeatures] = useState(status.features);
  const [saved, setSaved] = useState({ enabled: status.enabled, features: status.features });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty =
    enabled !== saved.enabled || AI_FLAGS.some((f) => features[f] !== saved.features[f]);
  const editable = status.canConfigure;

  if (!status.planIncluded) {
    return (
      <div className="grid gap-5" data-testid="ai-locked">
        <EmptyState
          mood="thinking"
          title="AI assist is part of the paid plans"
          action={
            status.canConfigure ? (
              <Button asChild>
                <Link href={`/${orgSlug}/settings/billing`}>
                  <Sparkles aria-hidden /> See plans
                </Link>
              </Button>
            ) : null
          }
        >
          Your workspace is on {status.planLabel}. Pro and above include a monthly credit allowance
          for inbox summaries, reply drafts, writing help and alert explanations.
          {status.canConfigure ? "" : " Ask an Owner about upgrading."}
        </EmptyState>
        <ul className="grid gap-2 sm:grid-cols-2">
          {AI_FLAGS.map((flag) => (
            <li key={flag} className="flex gap-3 rounded-xl bg-surface p-4 shadow-md">
              <Lock aria-hidden className="mt-0.5 size-4 flex-none text-ink-muted" />
              <div>
                <p className="text-sm font-semibold">{FLAG_INFO[flag].label}</p>
                <p className="text-[0.8125rem] text-ink-muted">{FLAG_INFO[flag].description}</p>
              </div>
            </li>
          ))}
        </ul>
        <PrivacyNote />
      </div>
    );
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const result = await updateAiSettingsAction(orgSlug, { enabled, features });
    setSaving(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setSaved({ enabled: result.data.enabled, features: result.data.features });
    toast.success(result.data.enabled ? "AI settings saved" : "AI is off for this workspace");
  }

  return (
    <div className="grid gap-5">
      <form onSubmit={save} className="grid gap-4" data-testid="ai-settings-form" noValidate>
        <FormAlert>{error}</FormAlert>
        {!editable ? (
          <p
            role="status"
            className="rounded-lg bg-canvas-sunken px-3 py-2 text-sm text-ink-secondary"
          >
            Only Owners and Admins can change these switches.
          </p>
        ) : null}
        <section className="overflow-hidden rounded-xl bg-surface shadow-md">
          <div className="flex items-center justify-between gap-4 border-b border-line p-4">
            <div>
              <h2 className="text-base font-semibold" id="ai-master">
                AI assist for this workspace
              </h2>
              <p className="text-[0.8125rem] text-ink-muted">
                The master switch. Off means nothing is sent to an AI provider and every AI button
                disappears.
              </p>
            </div>
            <Switch
              aria-labelledby="ai-master"
              checked={enabled}
              disabled={!editable}
              onCheckedChange={setEnabled}
            />
          </div>
          <ul>
            {AI_FLAGS.map((flag: AiFlag) => (
              <li
                key={flag}
                className="flex items-center justify-between gap-4 border-b border-line px-4 py-3 last:border-b-0"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold" id={`ai-${flag}`}>
                    {FLAG_INFO[flag].label}{" "}
                    <span className="font-normal text-ink-muted">
                      · {FLAG_INFO[flag].credits}{" "}
                      {FLAG_INFO[flag].credits === 1 ? "credit" : "credits"}
                    </span>
                  </p>
                  <p className="text-[0.8125rem] text-ink-muted">{FLAG_INFO[flag].description}</p>
                </div>
                <Switch
                  aria-labelledby={`ai-${flag}`}
                  checked={enabled && features[flag]}
                  disabled={!editable || !enabled}
                  onCheckedChange={(value) => setFeatures((f) => ({ ...f, [flag]: value }))}
                />
              </li>
            ))}
          </ul>
        </section>
        {editable ? (
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={!dirty || saving}>
              {saving ? "Saving…" : "Save changes"}
            </Button>
            {dirty ? <span className="text-sm text-ink-muted">Unsaved changes</span> : null}
          </div>
        ) : null}
      </form>

      <Credits status={status} />
      {usage ? <UsageTable usage={usage} /> : null}
      <PrivacyNote />
    </div>
  );
}
