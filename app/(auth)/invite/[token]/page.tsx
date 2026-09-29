import type { Metadata } from "next";
import Link from "next/link";

import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Join a workspace" };

// Stub: invitation acceptance lands with the members work (UC-02).
export default async function InvitePage({ params }: PageProps<"/invite/[token]">) {
  await params;
  return (
    <AuthShell
      title="Invitations are on the way"
      description="Joining a workspace from an invite link isn't ready yet. Check back soon."
    >
      <Button asChild size="lg" className="w-full">
        <Link href="/sign-in">Go to sign in</Link>
      </Button>
    </AuthShell>
  );
}
