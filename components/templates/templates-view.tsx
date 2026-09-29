"use client";

import { Copy, MoreHorizontal, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { duplicateTemplateAction } from "@/app/(app)/[orgSlug]/templates/actions";
import { EmptyState } from "@/components/app/empty-state";
import { LiveRefresh } from "@/components/app/live-refresh";
import { StatusChip } from "@/components/app/status-chip";
import { audienceError } from "@/components/audience/errors";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { relativeTime, useNow } from "@/components/inbox/format";
import type { ConnectionOptionDTO, TemplateRowDTO } from "@/lib/dto/audience";

/** Templates across connections (PRD §5.9). Duplicating can copy a template to another account. */
export function TemplatesView({
  orgSlug,
  templates,
  connections,
  can,
}: {
  orgSlug: string;
  templates: TemplateRowDTO[];
  connections: ConnectionOptionDTO[];
  can: { create: boolean };
}) {
  const router = useRouter();
  const now = useNow();
  const [busy, setBusy] = useState<string | null>(null);
  const multi = connections.length > 1;
  const writable = connections.some((c) => c.writable);

  const newButton = can.create ? (
    <Button asChild className="font-bold" aria-disabled={!writable}>
      <Link href={`/${orgSlug}/templates/new`}>
        <Plus aria-hidden /> New template
      </Link>
    </Button>
  ) : null;

  async function duplicate(template: TemplateRowDTO, connectionId: string) {
    setBusy(template.id);
    const result = await duplicateTemplateAction(orgSlug, { id: template.id, connectionId });
    setBusy(null);
    if (!result.ok) return void toast.error(audienceError(result.error));
    toast.success(`Copied ${template.name} as a draft`);
    router.push(`/${orgSlug}/templates/${result.data.id}`);
  }

  if (connections.length === 0) {
    return (
      <EmptyState title="Connect Resend to see your templates" mood="idle">
        Templates live in your Resend accounts.{" "}
        <Link
          className="font-semibold text-accent underline"
          href={`/${orgSlug}/settings/connections`}
        >
          Open Connections
        </Link>
        .
      </EmptyState>
    );
  }

  return (
    <div className="grid gap-3">
      <LiveRefresh topics={["templates"]} />
      {templates.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-ink-muted">
            {templates.length} {templates.length === 1 ? "template" : "templates"}
          </p>
          {newButton}
        </div>
      ) : null}
      {templates.length === 0 ? (
        <EmptyState title="No templates yet" mood="idle" action={newButton}>
          A template is an email you write once and send many times, with variables like the
          person&apos;s name filled in.
        </EmptyState>
      ) : (
        <ul role="list" className="grid gap-0.5 rounded-xl bg-surface p-1.5 shadow-md">
          {templates.map((t) => (
            <li
              key={t.id}
              data-testid="template-row"
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-canvas"
            >
              <Link
                href={`/${orgSlug}/templates/${t.id}`}
                className="grid min-w-0 flex-1 gap-0.5 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <span className="truncate text-[13.5px] font-semibold">{t.name}</span>
                <span className="truncate text-xs text-ink-muted">
                  {[multi ? t.connectionName : "", t.alias ? `alias ${t.alias}` : "", t.subject]
                    .filter(Boolean)
                    .join(" · ") || "No subject"}
                </span>
              </Link>
              <span className="hidden text-xs text-ink-muted tabular-nums min-[560px]:block">
                {t.variableCount} {t.variableCount === 1 ? "variable" : "variables"}
              </span>
              <time
                dateTime={t.updatedAt}
                className="hidden w-24 text-right text-xs whitespace-nowrap text-ink-faint tabular-nums min-[700px]:block"
              >
                {now ? relativeTime(t.updatedAt, now) : t.updatedAt.slice(0, 10)}
              </time>
              <StatusChip state={t.status === "published" ? "success" : "neutral"}>
                {t.status === "published" ? "Published" : "Draft"}
              </StatusChip>
              {can.create ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Actions for ${t.name}`}
                      disabled={busy === t.id}
                    >
                      <MoreHorizontal aria-hidden />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem asChild>
                      <Link href={`/${orgSlug}/templates/${t.id}`}>Open</Link>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel className="flex items-center gap-1.5">
                      <Copy aria-hidden className="size-3.5" /> Duplicate to
                    </DropdownMenuLabel>
                    {connections.map((c) => (
                      <DropdownMenuItem
                        key={c.id}
                        disabled={!c.writable}
                        onSelect={() => void duplicate(t, c.id)}
                      >
                        {c.name}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
