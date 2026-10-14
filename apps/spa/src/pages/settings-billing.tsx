import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";

import { BillingView } from "@/components/billing/billing-view";
import {
  ResourceEmpty,
  ResourceError,
  ResourcePage,
  ResourcePending,
} from "@/components/resource-page";
import { ApiError, getBillingOverview } from "@/lib/api";

export function SettingsBillingPage() {
  const { orgSlug } = useParams({ from: "/$orgSlug/settings/billing" });
  const queryClient = useQueryClient();
  const billing = useQuery({
    queryKey: ["settings", "billing", orgSlug],
    queryFn: () => getBillingOverview(orgSlug),
    retry: (count, err) => !(err instanceof ApiError && err.status === 403) && count < 2,
  });

  const forbidden =
    billing.isError && billing.error instanceof ApiError && billing.error.status === 403;

  return (
    <ResourcePage
      title="Billing"
      description="Plan, trial, Stripe checkout and AI credit packs for this workspace."
    >
      {billing.isPending ? (
        <ResourcePending />
      ) : forbidden ? (
        <ResourceEmpty>
          Only Owners and Admins can see billing. Ask an Owner if you need a plan change.
        </ResourceEmpty>
      ) : billing.isError ? (
        <ResourceError message="Could not load billing." />
      ) : !billing.data ? (
        <ResourceEmpty>No billing data.</ResourceEmpty>
      ) : (
        <BillingView
          orgSlug={orgSlug}
          overview={billing.data}
          onChanged={() => {
            void queryClient.invalidateQueries({ queryKey: ["settings", "billing", orgSlug] });
          }}
        />
      )}
    </ResourcePage>
  );
}
