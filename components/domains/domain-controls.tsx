"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import {
  assignDomainProjectAction,
  setDomainTrackingAction,
} from "@/app/(app)/[orgSlug]/domains/actions";
import { friendlyError } from "@/components/composer/errors";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { DomainDTO } from "@/lib/dto/domain";
import { PROJECT_COLOR_CLASS, type ProjectColor } from "@/lib/validation/project";
import { cn } from "@/lib/utils";

export type ProjectChoice = { id: string; name: string; color: string };

const NONE = "none";

/** Open or click tracking switch. Updates Resend first, so it flips back if Resend says no. */
export function TrackingSwitch({
  orgSlug,
  domain,
  kind,
  disabled,
}: {
  orgSlug: string;
  domain: Pick<DomainDTO, "id" | "name" | "openTracking" | "clickTracking">;
  kind: "open" | "click";
  disabled?: boolean;
}) {
  const router = useRouter();
  const field = kind === "open" ? "openTracking" : "clickTracking";
  const [pending, setPending] = useState<boolean | null>(null);
  const checked = pending ?? domain[field];
  const label = `${kind === "open" ? "Open" : "Click"} tracking for ${domain.name}`;

  async function change(next: boolean) {
    setPending(next);
    const result = await setDomainTrackingAction(orgSlug, { domainId: domain.id, [field]: next });
    setPending(null);
    if (!result.ok) return void toast.error(friendlyError(result.error).message);
    toast.success(
      `${kind === "open" ? "Open" : "Click"} tracking ${next ? "on" : "off"} for ${domain.name}`,
    );
    router.refresh();
  }

  return (
    <Switch
      checked={checked}
      onCheckedChange={change}
      disabled={disabled || pending !== null}
      aria-label={label}
      data-testid={`${kind}-tracking`}
    />
  );
}

/** Project picker for one domain (needs `project:update`). */
export function ProjectSelect({
  orgSlug,
  domain,
  projects,
  disabled,
  className,
}: {
  orgSlug: string;
  domain: Pick<DomainDTO, "id" | "name" | "projectId">;
  projects: ProjectChoice[];
  disabled?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function change(value: string) {
    setPending(true);
    const result = await assignDomainProjectAction(orgSlug, {
      domainId: domain.id,
      projectId: value === NONE ? null : value,
    });
    setPending(false);
    if (!result.ok) return void toast.error(friendlyError(result.error).message);
    toast.success(
      result.data.projectName
        ? `${domain.name} is now in ${result.data.projectName}`
        : `${domain.name} is not in a project`,
    );
    router.refresh();
  }

  return (
    <Select value={domain.projectId ?? NONE} onValueChange={change} disabled={disabled || pending}>
      <SelectTrigger
        size="sm"
        aria-label={`Project for ${domain.name}`}
        className={cn("w-full min-w-0", className)}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>No project</SelectItem>
        {projects.map((p) => (
          <SelectItem key={p.id} value={p.id}>
            <span className="flex items-center gap-2">
              <i
                aria-hidden
                className={cn(
                  "size-2 rounded-full",
                  PROJECT_COLOR_CLASS[p.color as ProjectColor] ?? "bg-neutral",
                )}
              />
              {p.name}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
