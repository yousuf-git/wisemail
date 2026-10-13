import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { useState } from "react";

import { callUserAction, getInvitePreview, type InvitePreview } from "@/lib/api";
import { authClient } from "@/lib/auth/client";

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  developer: "Developer",
  support: "Support",
  viewer: "Viewer",
};

type PendingInvite = Extract<InvitePreview, { status: "pending" }>;

export function InvitePage() {
  const { token } = useParams({ from: "/invite/$token" });
  const navigate = useNavigate();
  const session = authClient.useSession();
  const [error, setError] = useState<string | null>(null);
  const preview = useQuery({
    queryKey: ["invite-preview", token, session.data?.user?.id],
    queryFn: () => getInvitePreview(token),
  });

  const accept = useMutation({
    mutationFn: () => callUserAction<{ orgSlug: string }>("invite.accept", { token }),
    onSuccess: async (result) => {
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      await navigate({
        to: "/$orgSlug/inbox",
        params: { orgSlug: result.data.orgSlug },
      });
    },
    onError: () => setError("Could not accept this invitation."),
  });

  if (preview.isPending || session.isPending) {
    return <Shell title="Invitation" description="Checking this link…" />;
  }

  const data = preview.data;
  if (preview.isError || !data || data.status === "invalid") {
    return (
      <Shell
        title="This invite link isn't valid"
        description="Check that you copied the whole link, or ask for a new invitation."
      >
        <HomeLink />
      </Shell>
    );
  }

  if (data.status === "expired") {
    return (
      <Shell
        title="This invitation expired"
        description={`Invitations to ${data.orgName} last 7 days. Ask an Owner or Admin to send a new one.`}
      >
        <HomeLink />
      </Shell>
    );
  }

  if (data.status === "used") {
    return (
      <Shell
        title="This invitation was already used"
        description={`It was accepted or canceled. If you're already in ${data.orgName}, open your workspace.`}
      >
        <HomeLink />
      </Shell>
    );
  }

  const p: PendingInvite = data;
  const role = ROLE_LABELS[p.role] ?? p.role;
  const summary = `You're invited as ${role} (sent to ${p.maskedEmail}).`;
  const next = `/invite/${token}`;

  if (!session.data?.user) {
    return (
      <Shell
        title={`Join ${p.orgName}`}
        description={`${summary} Sign in with that address to continue.`}
      >
        <div className="grid gap-3">
          <Link
            to="/sign-in"
            search={{ next }}
            className="inline-flex h-11 items-center justify-center rounded-control bg-accent-fill text-sm font-semibold text-accent-ink"
          >
            Sign in to accept
          </Link>
        </div>
      </Shell>
    );
  }

  if (p.emailMatches === false) {
    return (
      <Shell
        title="Wrong account"
        description={`This invitation to ${p.orgName} was sent to ${p.maskedEmail}, but you're signed in as ${p.signedInEmail}.`}
      >
        <div className="grid gap-3">
          <button
            type="button"
            className="h-11 rounded-control bg-accent-fill text-sm font-semibold text-accent-ink"
            onClick={() => authClient.signOut()}
          >
            Sign out and switch account
          </button>
          <HomeLink />
        </div>
      </Shell>
    );
  }

  if (p.emailVerified === false) {
    return (
      <Shell
        title="Confirm your email first"
        description={`To join ${p.orgName} we need to know ${session.data.user.email} is really yours. Use the link we emailed you, then come back here.`}
      >
        <HomeLink />
      </Shell>
    );
  }

  return (
    <Shell title={`Join ${p.orgName}`} description={summary}>
      {error ? (
        <p role="alert" className="mb-3 rounded-md bg-danger-soft px-3 py-2 text-sm text-danger-ink">
          {error}
        </p>
      ) : null}
      <button
        type="button"
        disabled={accept.isPending}
        onClick={() => accept.mutate()}
        className="h-11 w-full rounded-control bg-accent-fill text-sm font-semibold text-accent-ink disabled:opacity-50"
      >
        {accept.isPending ? "Joining…" : "Accept invitation"}
      </button>
    </Shell>
  );
}

function Shell({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <section className="mx-auto grid min-h-dvh max-w-md content-center gap-4 px-4 py-10">
      <div>
        <p className="text-sm font-semibold tracking-tight text-ink-muted">Wisemail</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm text-ink-muted">{description}</p>
      </div>
      {children}
    </section>
  );
}

function HomeLink() {
  return (
    <Link
      to="/sign-in"
      className="inline-flex h-11 items-center justify-center rounded-control border border-line text-sm font-semibold"
    >
      Go to sign in
    </Link>
  );
}
