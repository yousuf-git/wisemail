import Link from "next/link";

import { PenIcon } from "@/components/icons/animated";
import { NavLinks } from "./nav-links";
import { OrgSwitcher } from "./org-switcher";
import { UsageTile, type UsageSummary } from "./usage-tile";
import { UserMenu } from "./user-menu";

type Org = { id: string; name: string; slug: string };
type User = { name: string; email: string; image?: string | null };

/** Edge-flush sidebar: org switcher, Compose, grouped nav, usage tile and user menu. */
export function Dock({
  org,
  orgs,
  user,
  role,
  usage,
  footerSlot,
}: {
  org: Org;
  orgs: Org[];
  user: User;
  role: string;
  usage?: UsageSummary;
  /** Extra content above the user row (the mobile sheet puts the theme toggle here). */
  footerSlot?: React.ReactNode;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-2.5">
      <OrgSwitcher org={org} orgs={orgs} role={role} />
      <Link
        href={`/${org.slug}/compose`}
        className="flex h-9 items-center justify-center gap-2 rounded-control bg-accent-fill px-3 text-sm font-semibold text-accent-ink transition-[transform,background-color] duration-150 ease-soft outline-none hover:bg-accent-fill-hover focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface active:scale-[0.97]"
      >
        <PenIcon size={16} />
        Compose
      </Link>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <NavLinks orgSlug={org.slug} />
      </div>
      <div className="grid gap-2">
        <UsageTile usage={usage} />
        {footerSlot}
        <UserMenu user={user} orgSlug={org.slug} />
      </div>
    </div>
  );
}
