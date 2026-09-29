import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Types } from "mongoose";

import { PageHeader } from "@/components/app/page-header";
import { Composer } from "@/components/composer/composer";
import { Button } from "@/components/ui/button";
import { requireOrg } from "@/lib/dal";
import { connectDb } from "@/lib/db/connect";
import type { DraftDTO } from "@/lib/dto/mail";
import { getDraft } from "@/lib/services/drafts";
import { ServiceError } from "@/lib/services/errors";
import { getOrgSettings } from "@/lib/services/org-settings";
import { listSenders } from "@/lib/services/senders";

export const metadata: Metadata = { title: "Compose" };

export default async function ComposePage({
  params,
  searchParams,
}: PageProps<"/[orgSlug]/compose">) {
  const { orgSlug } = await params;
  const query = await searchParams;
  const ctx = await requireOrg(orgSlug);
  const canSend = ctx.can("email:send");

  await connectDb();
  const [senders, settings] = await Promise.all([
    ctx.can("sender:read") ? listSenders(ctx) : Promise.resolve([]),
    getOrgSettings(new Types.ObjectId(ctx.org.id)),
  ]);

  let draft: DraftDTO | null = null;
  const draftId = typeof query.draft === "string" ? query.draft : null;
  if (draftId && canSend) {
    try {
      draft = await getDraft(ctx, draftId);
    } catch (error) {
      if (error instanceof ServiceError) notFound();
      throw error;
    }
  }

  const hasActive = senders.some((s) => s.status === "active");
  const canManageSenders = ctx.can("sender:create");

  return (
    <div className="mx-auto grid w-full max-w-[60rem] gap-5">
      <PageHeader
        title={draft ? "Continue your draft" : "What are we sending today?"}
        description="Write it, preview it, send it now or pick a time."
      />
      {!hasActive ? (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-warning-soft px-4 py-3 text-sm text-warning-ink"
        >
          <span>
            {senders.length === 0
              ? "You need a sender before you can send. A sender is an address on a verified domain, like support@yourdomain.com."
              : "None of your senders can send right now. Check why in Senders."}
          </span>
          <Button asChild size="sm" variant="outline">
            <Link
              href={
                canManageSenders || senders.length
                  ? `/${orgSlug}/settings/senders`
                  : `/${orgSlug}/settings/connections`
              }
            >
              {senders.length || canManageSenders ? "Open Senders" : "Open Connections"}
            </Link>
          </Button>
        </div>
      ) : null}
      <Composer
        key={draft?.id ?? "new"}
        orgSlug={orgSlug}
        senders={senders}
        canSend={canSend}
        draft={draft}
        variant="page"
        timezone={settings?.timezone}
      />
    </div>
  );
}
