import type { Metadata } from "next";

import { AdminShell } from "@/components/admin/admin-shell";
import { requirePlatformAdmin } from "@/lib/admin/guard";
import { getHomePath } from "@/lib/dal";

export const metadata: Metadata = {
  title: { default: "Admin", template: "%s · Wisemail Admin" },
  robots: { index: false, follow: false },
};

// Every page under /admin is a 404 unless the session user is a platform admin.
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const admin = await requirePlatformAdmin();
  const homePath = await getHomePath();
  return (
    <AdminShell admin={admin} homePath={homePath}>
      {children}
    </AdminShell>
  );
}
