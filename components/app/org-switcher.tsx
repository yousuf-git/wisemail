"use client";

import { Check, ChevronsUpDown, Plus } from "lucide-react";
import Link from "next/link";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Org = { id: string; name: string; slug: string };

export function OrgAvatar({ name }: { name: string }) {
  return (
    <span
      aria-hidden
      className="grid size-[30px] shrink-0 place-items-center rounded-[9px] bg-linear-to-br from-accent to-[#2dd4bf] text-sm font-extrabold text-white"
    >
      {name.trim().charAt(0).toUpperCase() || "W"}
    </span>
  );
}

/** Org switcher at the top of the dock. Choosing an org navigates to its overview. */
export function OrgSwitcher({ org, orgs, role }: { org: Org; orgs: Org[]; role: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Organization: ${org.name}. Switch organization`}
        className="flex w-full items-center gap-2.5 rounded-md px-1.5 py-1 text-left outline-none hover:bg-canvas focus-visible:ring-2 focus-visible:ring-accent"
      >
        <OrgAvatar name={org.name} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm leading-tight font-bold">{org.name}</span>
          <span className="block truncate text-xs text-ink-muted capitalize">{role}</span>
        </span>
        <ChevronsUpDown aria-hidden className="size-4 shrink-0 text-ink-faint" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64 rounded-lg shadow-lg">
        <DropdownMenuLabel className="text-xs font-semibold tracking-[0.06em] text-ink-muted uppercase">
          Organizations
        </DropdownMenuLabel>
        {orgs.map((o) => (
          <DropdownMenuItem key={o.id} asChild>
            <Link href={`/${o.slug}`}>
              <OrgAvatar name={o.name} />
              <span className="min-w-0 flex-1 truncate">{o.name}</span>
              {o.id === org.id ? (
                <Check aria-label="Current" className="size-4 text-accent" />
              ) : null}
            </Link>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/onboarding">
            <Plus aria-hidden />
            Create organization
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
