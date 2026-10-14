import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { useState } from "react";

import { BreadcrumbLabel } from "@/components/app/breadcrumb-label";
import { DnsRecords } from "@/components/domains/dns-records";
import {
  CHECK_LABELS,
  VERDICT,
  domainStatus,
} from "@/components/domains/domain-status";
import {
  ResourceError,
  ResourcePage,
  ResourcePending,
} from "@/components/resource-page";
import {
  assignDomainProject,
  checkDomainDns,
  deleteDomain,
  setDomainTracking,
  verifyDomain,
} from "@/lib/actions";
import { getDomain, type DnsCheck } from "@/lib/api";
import { cn } from "@/lib/utils";

function DnsCheckPanel({ check }: { check: DnsCheck | null }) {
  if (!check) {
    return (
      <p className="text-sm text-ink-muted">
        Not checked yet. Wisemail checks DNS every day; press “Check DNS now” to run it now.
      </p>
    );
  }
  return (
    <div className="grid gap-3">
      <ul className="flex flex-wrap gap-2" aria-label="DNS check summary">
        {(["spf", "dkim", "dmarc", "mx"] as const).map((key) => {
          const verdict = VERDICT[check[key]];
          return (
            <li key={key}>
              <span
                className={cn(
                  "inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
                  verdict.tone,
                )}
              >
                {CHECK_LABELS[key]}: {verdict.label}
              </span>
            </li>
          );
        })}
      </ul>
      <ul className="grid gap-1.5 text-[0.8125rem] text-ink-secondary">
        {check.details.map((d, i) => (
          <li key={`${d.group}-${d.name}-${i}`} className="flex gap-2">
            <span
              aria-hidden
              className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", VERDICT[d.verdict].dot)}
            />
            <span className="min-w-0 break-words">{d.message}</span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-ink-muted">
        Checked {new Date(check.checkedAt).toLocaleString()}
      </p>
    </div>
  );
}

export function DomainDetailPage() {
  const { orgSlug } = useParams({ from: "/$orgSlug" });
  const { domainId } = useParams({ strict: false }) as { domainId: string };
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [confirmName, setConfirmName] = useState("");
  const [deleting, setDeleting] = useState(false);

  const detail = useQuery({
    queryKey: ["domain", orgSlug, domainId],
    queryFn: () => getDomain(orgSlug, domainId),
  });

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["domain", orgSlug, domainId] });
    await queryClient.invalidateQueries({ queryKey: ["domains", orgSlug] });
  };

  const verify = useMutation({
    mutationFn: () => verifyDomain(orgSlug, domainId),
    onSuccess: async (result) => {
      if (!result.ok) setError(result.error.message);
      else {
        setError(null);
        await invalidate();
      }
    },
  });

  const check = useMutation({
    mutationFn: () => checkDomainDns(orgSlug, domainId),
    onSuccess: async (result) => {
      if (!result.ok) setError(result.error.message);
      else {
        setError(null);
        await invalidate();
      }
    },
  });

  const tracking = useMutation({
    mutationFn: (input: { openTracking?: boolean; clickTracking?: boolean }) =>
      setDomainTracking(orgSlug, { domainId, ...input }),
    onSuccess: async (result) => {
      if (!result.ok) setError(result.error.message);
      else {
        setError(null);
        await invalidate();
      }
    },
  });

  const assign = useMutation({
    mutationFn: (projectId: string | null) =>
      assignDomainProject(orgSlug, { domainId, projectId }),
    onSuccess: async (result) => {
      if (!result.ok) setError(result.error.message);
      else {
        setError(null);
        await invalidate();
      }
    },
  });

  const remove = useMutation({
    mutationFn: () => deleteDomain(orgSlug, domainId, confirmName),
    onSuccess: async (result) => {
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["domains", orgSlug] });
      await navigate({ to: "/$orgSlug/domains", params: { orgSlug } });
    },
  });

  const domain = detail.data?.domain;
  const can = detail.data?.can;
  const projects = detail.data?.projects ?? [];
  const status = domain ? domainStatus(domain.status) : null;

  return (
    <ResourcePage
      title={domain?.name || "Domain"}
      description={
        domain
          ? `${domain.connectionName}${domain.region ? ` · ${domain.region}` : ""}`
          : "`GET /api/v1/domains/:id`"
      }
    >
      {domain ? <BreadcrumbLabel segment={domainId} label={domain.name} /> : null}
      <Link
        to="/$orgSlug/domains"
        params={{ orgSlug }}
        className="text-sm font-medium text-accent-fill hover:underline"
      >
        ← All domains
      </Link>

      {error ? (
        <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger-ink">
          {error}
        </p>
      ) : null}

      {detail.isPending ? (
        <ResourcePending />
      ) : detail.isError || !domain || !can ? (
        <ResourceError message="Could not load this domain." />
      ) : (
        <div className="grid gap-4">
          <div className="flex flex-wrap items-center gap-2">
            {status ? (
              <span
                className={cn(
                  "rounded-full px-2.5 py-0.5 text-xs font-semibold",
                  status.tone,
                )}
              >
                {status.label}
              </span>
            ) : null}
            {domain.receivingEnabled ? (
              <span className="text-xs text-ink-muted">
                Receiving {domain.receivingVerified ? "verified" : "pending"}
              </span>
            ) : null}
            <div className="ml-auto flex flex-wrap gap-2">
              {can.verify ? (
                <button
                  type="button"
                  disabled={verify.isPending}
                  onClick={() => {
                    setError(null);
                    verify.mutate();
                  }}
                  className="h-8 rounded-control border border-line px-3 text-xs font-medium hover:bg-canvas-sunken disabled:opacity-50"
                >
                  {verify.isPending ? "Verifying…" : "Verify with Resend"}
                </button>
              ) : null}
              {can.update ? (
                <button
                  type="button"
                  disabled={check.isPending}
                  onClick={() => {
                    setError(null);
                    check.mutate();
                  }}
                  className="h-8 rounded-control border border-line px-3 text-xs font-medium hover:bg-canvas-sunken disabled:opacity-50"
                >
                  {check.isPending ? "Checking…" : "Check DNS now"}
                </button>
              ) : null}
            </div>
          </div>

          <section className="grid gap-3 rounded-lg border border-line bg-surface p-4">
            <h2 className="text-sm font-semibold">Tracking & project</h2>
            <div className="flex flex-wrap items-center gap-4 text-sm">
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={domain.openTracking}
                  disabled={!can.update || tracking.isPending}
                  onChange={(e) =>
                    tracking.mutate({ openTracking: e.target.checked })
                  }
                />
                Open tracking
              </label>
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={domain.clickTracking}
                  disabled={!can.update || tracking.isPending}
                  onChange={(e) =>
                    tracking.mutate({ clickTracking: e.target.checked })
                  }
                />
                Click tracking
              </label>
              {can.assignProject && projects.length > 0 ? (
                <label className="inline-flex items-center gap-2">
                  Project
                  <select
                    value={domain.projectId ?? ""}
                    disabled={assign.isPending}
                    onChange={(e) => assign.mutate(e.target.value || null)}
                    className="h-8 rounded-control border border-line bg-canvas px-2 text-xs"
                  >
                    <option value="">No project</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : domain.projectName ? (
                <span className="text-ink-muted">Project: {domain.projectName}</span>
              ) : null}
            </div>
          </section>

          <section className="grid gap-3 rounded-lg border border-line bg-surface p-4">
            <h2 className="text-sm font-semibold">DNS check</h2>
            <DnsCheckPanel check={domain.dnsCheck} />
          </section>

          <section className="grid gap-3 rounded-lg border border-line bg-surface p-4">
            <h2 className="text-sm font-semibold">DNS records to create</h2>
            <p className="text-xs text-ink-muted">
              Add these at your DNS provider, then verify. Copy buttons paste into the other site.
            </p>
            <DnsRecords records={domain.records} />
          </section>

          {can.delete ? (
            <section className="grid gap-3 rounded-lg border border-danger/30 bg-danger-soft/30 p-4">
              <h2 className="text-sm font-semibold text-danger-ink">Delete domain</h2>
              {!deleting ? (
                <button
                  type="button"
                  onClick={() => setDeleting(true)}
                  className="h-8 w-fit rounded-control border border-line px-3 text-xs font-medium text-danger-ink hover:bg-danger-soft"
                >
                  Delete…
                </button>
              ) : (
                <form
                  className="grid max-w-md gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    setError(null);
                    remove.mutate();
                  }}
                >
                  <p className="text-sm text-ink-secondary">
                    Type <strong>{domain.name}</strong> to confirm.
                  </p>
                  <input
                    required
                    value={confirmName}
                    onChange={(e) => setConfirmName(e.target.value)}
                    className="h-9 rounded-control border border-line bg-canvas px-3 text-sm"
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={remove.isPending || confirmName !== domain.name}
                      className="h-9 rounded-control bg-danger px-4 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      {remove.isPending ? "Deleting…" : "Delete permanently"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDeleting(false);
                        setConfirmName("");
                      }}
                      className="h-9 rounded-control border border-line px-3 text-sm"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </section>
          ) : null}
        </div>
      )}
    </ResourcePage>
  );
}
