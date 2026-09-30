import { ImpersonationBanner } from "@/components/admin/impersonation-banner";

/** Workspace pages; shows the impersonation banner when a platform admin is viewing as a user. */
export default function AppGroupLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <ImpersonationBanner />
    </>
  );
}
