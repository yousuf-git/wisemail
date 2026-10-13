import type { Metadata } from "next";
import Link from "next/link";

import { AuthShell } from "@/components/auth/auth-shell";
import { VerifyNotice } from "@/components/auth/verify-notice";
import { env } from "@/lib/env";
import { Button } from "@/components/ui/button";
import { getHomePath, getSession } from "@/lib/dal";
import { ROLE_LABELS } from "@/lib/validation/member";
import { getInvitePreview } from "@/lib/services/members";
import { AcceptButton } from "./accept-button";

export const metadata: Metadata = { title: "Join a workspace" };

/** UC-02: signed in and matching -> accept; visitors sign in or sign up and come back here. */
export default async function InvitePage({ params }: PageProps<"/invite/[token]">) {
  const { token } = await params;
  const preview = await getInvitePreview(token);

  if (preview.status === "invalid") {
    return (
      <AuthShell
        mood="worried"
        title="This invite link isn't valid"
        description="Check that you copied the whole link, or ask for a new invitation."
      >
        <HomeButton />
      </AuthShell>
    );
  }
  if (preview.status === "expired") {
    return (
      <AuthShell
        mood="sleep"
        title="This invitation expired"
        description={`Invitations to ${preview.orgName} last 7 days. Ask an Owner or Admin to send a new one.`}
      >
        <HomeButton />
      </AuthShell>
    );
  }
  if (preview.status === "used") {
    return (
      <AuthShell
        mood="sleep"
        title="This invitation was already used"
        description={`It was accepted or canceled. If you're already in ${preview.orgName}, just open your workspace.`}
      >
        <HomeButton />
      </AuthShell>
    );
  }

  const session = await getSession();
  const next = encodeURIComponent(`/invite/${token}`);
  const title = `Join ${preview.orgName}`;
  const summary = `You're invited as ${ROLE_LABELS[preview.role]} (sent to ${preview.maskedEmail}).`;

  if (!session) {
    return (
      <AuthShell
        mood="happy"
        title={title}
        description={`${summary} Sign in or create an account with that address to continue.`}
      >
        <div className="grid gap-3">
          <Button asChild size="lg" className="w-full">
            <Link href={`/sign-up?next=${next}`}>Create an account</Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="w-full">
            <Link href={`/sign-in?next=${next}`}>I already have an account</Link>
          </Button>
        </div>
      </AuthShell>
    );
  }

  if (session.user.email.toLowerCase() !== preview.email.toLowerCase()) {
    return (
      <AuthShell
        mood="detective"
        title="Wrong account"
        description={`This invitation to ${preview.orgName} was sent to ${preview.maskedEmail}, but you're signed in as ${session.user.email}.`}
      >
        <div className="grid gap-3">
          <Button asChild size="lg" className="w-full">
            <Link href="/sign-out" prefetch={false}>
              Sign out and switch account
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="w-full">
            <Link href={await getHomePath()}>Back to my workspace</Link>
          </Button>
        </div>
      </AuthShell>
    );
  }

  if (!session.user.emailVerified) {
    return (
      <AuthShell
        mood="detective"
        title="Confirm your email first"
        description={`To join ${preview.orgName} we need to know ${session.user.email} is really yours. Use the link we emailed you, then come back to this page.`}
      >
        <VerifyNotice
          email={session.user.email}
          callbackURL={`/invite/${token}`}
          devOutbox={env.RESEND_MODE === "fake" && env.NODE_ENV !== "production"}
        />
      </AuthShell>
    );
  }

  return (
    <AuthShell mood="happy" title={title} description={summary}>
      <AcceptButton token={token} />
    </AuthShell>
  );
}

function HomeButton() {
  return (
    <Button asChild size="lg" className="h-11 w-full rounded-full font-semibold">
      <Link href="/sign-in">Go to sign in</Link>
    </Button>
  );
}
