import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Types } from "mongoose";

import { AuthShell } from "@/components/auth/auth-shell";
import { verifySession } from "@/lib/dal";
import { OrgSettingsModel } from "@/lib/db/models/org-settings";
import { listUserOrgs, resolveOrgAccess } from "@/lib/services/tenancy";

export const metadata: Metadata = { title: "Workspace suspended" };

/** Where `requireOrg` sends members of a suspended workspace. Non-members get a 404. */
export default async function SuspendedPage({ params }: PageProps<"/suspended/[orgSlug]">) {
  const { orgSlug } = await params;
  const { userId } = await verifySession();
  const access = await resolveOrgAccess(userId, orgSlug);
  if (!access) notFound();
  const settings = await OrgSettingsModel.findOne(
    { orgId: new Types.ObjectId(access.org.id) },
    { suspended: 1 },
  ).lean();
  if (!settings?.suspended) redirect(`/${orgSlug}`);
  const others = (await listUserOrgs(userId)).filter((o) => o.id !== access.org.id);

  return (
    <AuthShell
      title="Workspace suspended"
      description={`${access.org.name} has been put on hold by Wisemail. Nothing has been deleted.`}
    >
      <div className="grid gap-4 text-sm">
        <p>
          Mail keeps being collected in the background, but the workspace is closed until the
          suspension is lifted. Contact Wisemail support to find out why and how to get it back.
        </p>
        <div className="flex flex-wrap gap-3">
          {others.map((o) => (
            <Link
              key={o.id}
              href={`/${o.slug}`}
              className="rounded-md bg-accent-fill px-4 py-2 font-medium text-accent-ink outline-none hover:bg-accent-fill-hover focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              Open {o.name}
            </Link>
          ))}
          <Link
            href="/sign-out"
            prefetch={false}
            className="rounded-md border border-line-strong px-4 py-2 font-medium outline-none hover:bg-canvas-sunken focus-visible:ring-2 focus-visible:ring-accent"
          >
            Sign out
          </Link>
        </div>
      </div>
    </AuthShell>
  );
}
