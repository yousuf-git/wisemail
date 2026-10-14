import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";

import { AuditView } from "@/components/audit/audit-view";
import {
  ResourceError,
  ResourcePage,
  ResourcePending,
} from "@/components/resource-page";
import { ApiError, getAuditFilters, listAuditLog } from "@/lib/api";

export function SettingsAuditPage() {
  const { orgSlug } = useParams({ from: "/$orgSlug/settings/audit" });

  const bootstrap = useQuery({
    queryKey: ["audit-bootstrap", orgSlug],
    queryFn: async () => {
      const [page, filters] = await Promise.all([
        listAuditLog(orgSlug),
        getAuditFilters(orgSlug),
      ]);
      return { page, filters };
    },
    retry: (count, err) => !(err instanceof ApiError && err.status === 403) && count < 2,
  });

  const err = bootstrap.error instanceof ApiError ? bootstrap.error : null;
  const planLocked = err?.code === "plan_feature_locked";
  const forbidden = err?.status === 403 && !planLocked;

  return (
    <ResourcePage
      title="Audit log"
      description="Who changed what in this workspace. Secrets are never recorded."
    >
      {bootstrap.isPending ? (
        <ResourcePending />
      ) : planLocked || forbidden ? (
        <div className="rounded-xl border border-dashed border-line bg-surface px-5 py-8 text-center">
          <p className="text-base font-semibold">
            {forbidden
              ? "The audit log is for Owners and Admins"
              : "The audit log needs a higher plan"}
          </p>
          <p className="mt-2 text-sm text-ink-muted">
            {forbidden
              ? "Ask an Owner or Admin if you need to know who changed something."
              : (err?.message ?? "Upgrade to unlock the audit log.")}
          </p>
          {planLocked ? (
            <Link
              to="/$orgSlug/settings/billing"
              params={{ orgSlug }}
              className="mt-4 inline-flex h-9 items-center rounded-control bg-accent-fill px-4 text-sm font-semibold text-accent-ink hover:bg-accent-fill-hover"
            >
              See plans
            </Link>
          ) : null}
        </div>
      ) : bootstrap.isError ? (
        <ResourceError message="Could not load the audit log." />
      ) : (
        <AuditView
          orgSlug={orgSlug}
          initial={bootstrap.data.page}
          filters={bootstrap.data.filters}
        />
      )}
    </ResourcePage>
  );
}
