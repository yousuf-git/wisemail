import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthShell } from "@/components/auth/auth-shell";
import { CreateOrgForm } from "@/components/auth/create-org-form";
import { getCurrentUser, getHomePath } from "@/lib/dal";

export const metadata: Metadata = { title: "Create your workspace" };

export default async function OnboardingPage({ searchParams }: PageProps<"/onboarding">) {
  const { new: wantsNew } = await searchParams;
  const user = await getCurrentUser();

  // People who already have a workspace land there, unless they asked for another (?new=1).
  if (wantsNew === undefined) {
    const home = await getHomePath();
    if (home !== "/onboarding") redirect(home);
  }

  const firstName = user.name.split(" ")[0];
  return (
    <AuthShell
      title={`Welcome, ${firstName}`}
      description="Let's name your workspace. It's where your Resend accounts, mail and team come together."
    >
      <CreateOrgForm />
    </AuthShell>
  );
}
