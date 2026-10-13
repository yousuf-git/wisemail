"use client";

import { ActionForm, TextField } from "@/components/admin/action-form";
import { Panel } from "@/components/admin/admin-ui";
import type { PlatformCatalog } from "@wisemail/shared/catalog";

import { updatePlatformSettingsAction } from "../actions";

function bool(fd: FormData, name: string) {
  return fd.get(name) === "on" || fd.get(name) === "true";
}

export function PlatformSettingsForm({ catalog }: { catalog: PlatformCatalog }) {
  const s = catalog;
  return (
    <ActionForm
      action={updatePlatformSettingsAction}
      submit="Save platform settings"
      success="Platform settings saved"
      reset={false}
      build={(fd) => ({
        trialDays: Number(fd.get("trialDays")),
        trialAiCredits: Number(fd.get("trialAiCredits")),
        freeGraceDays: Number(fd.get("freeGraceDays")),
        freeOverAllowanceRetentionDays: Number(fd.get("freeOverAllowanceRetentionDays")),
        retentionNoticeDays: Number(fd.get("retentionNoticeDays")),
        paymentGraceDays: Number(fd.get("paymentGraceDays")),
        billingEnabled: bool(fd, "billingEnabled"),
        googleSignIn: bool(fd, "googleSignIn"),
        githubSignIn: bool(fd, "githubSignIn"),
        aiEnabled: bool(fd, "aiEnabled"),
        aiModel: String(fd.get("aiModel") || "") || null,
        aiModelFast: String(fd.get("aiModelFast") || "") || null,
        aiBaseUrl: String(fd.get("aiBaseUrl") || "") || null,
        systemFromEmail: String(fd.get("systemFromEmail") || "") || null,
        creditPackCredits: Number(fd.get("creditPackCredits")),
        creditPackPriceUsd: Number(fd.get("creditPackPriceUsd")),
        creditPackMaxPacks: Number(fd.get("creditPackMaxPacks")),
        reason: String(fd.get("reason") || "") || undefined,
      })}
    >
      <div className="grid gap-3.5">
        <Panel title="Trial & grace">
          <div className="grid gap-3 min-[700px]:grid-cols-2">
            <TextField
              name="trialDays"
              label="Trial days"
              type="number"
              defaultValue={String(s.trial.days)}
              required
            />
            <TextField
              name="trialAiCredits"
              label="Trial AI credits"
              type="number"
              defaultValue={String(s.trial.aiCredits)}
              required
            />
            <TextField
              name="freeGraceDays"
              label="Free over-allowance grace (days)"
              type="number"
              defaultValue={String(s.free.graceDays)}
              required
            />
            <TextField
              name="freeOverAllowanceRetentionDays"
              label="Free retention after grace (days)"
              type="number"
              defaultValue={String(s.free.overAllowanceRetentionDays)}
              required
            />
            <TextField
              name="retentionNoticeDays"
              label="Retention notice (days)"
              type="number"
              defaultValue={String(s.retentionNoticeDays)}
              required
            />
            <TextField
              name="paymentGraceDays"
              label="Payment grace (days)"
              type="number"
              defaultValue={String(s.paymentGraceDays)}
              required
            />
          </div>
        </Panel>

        <Panel title="Credit pack">
          <div className="grid gap-3 min-[700px]:grid-cols-3">
            <TextField
              name="creditPackCredits"
              label="Credits per pack"
              type="number"
              defaultValue={String(s.creditPack.credits)}
              required
            />
            <TextField
              name="creditPackPriceUsd"
              label="Pack price (USD)"
              type="number"
              step="0.01"
              defaultValue={String(s.creditPack.priceUsd)}
              required
            />
            <TextField
              name="creditPackMaxPacks"
              label="Max packs per purchase"
              type="number"
              defaultValue={String(s.creditPack.maxPacks)}
              required
            />
          </div>
        </Panel>

        <Panel title="AI & system email">
          <div className="grid gap-3 min-[700px]:grid-cols-2">
            <TextField name="aiModel" label="AI model" defaultValue={s.ai.model ?? ""} />
            <TextField name="aiModelFast" label="AI model (fast)" defaultValue={s.ai.modelFast ?? ""} />
            <TextField name="aiBaseUrl" label="AI base URL" defaultValue={s.ai.baseUrl ?? ""} />
            <TextField
              name="systemFromEmail"
              label="System from email"
              defaultValue={s.systemEmail.fromEmail ?? ""}
            />
          </div>
        </Panel>

        <Panel title="Toggles">
          <div className="grid gap-2 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" name="billingEnabled" defaultChecked={s.flags.billingEnabled} />
              Billing enabled
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="googleSignIn" defaultChecked={s.flags.googleSignIn} />
              Google sign-in
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="githubSignIn" defaultChecked={s.flags.githubSignIn} />
              GitHub sign-in
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="aiEnabled" defaultChecked={s.flags.aiEnabled} />
              AI enabled (platform)
            </label>
          </div>
        </Panel>

        <TextField name="reason" label="Reason (optional)" />
      </div>
    </ActionForm>
  );
}
