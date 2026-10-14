import { useQuery } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";

import { EmailDetail } from "@/components/activity/email-detail";
import {
  ResourceError,
  ResourcePage,
  ResourcePending,
} from "@/components/resource-page";
import { ApiError, getActivityEmail, getInsightFilterOptions } from "@/lib/api";

export function ActivityEmailPage() {
  const { orgSlug, emailId } = useParams({ from: "/$orgSlug/activity/$emailId" });

  const timeline = useQuery({
    queryKey: ["activity-email", orgSlug, emailId],
    queryFn: () => getActivityEmail(orgSlug, emailId),
    retry: (count, err) => !(err instanceof ApiError && err.status === 404) && count < 2,
  });

  const options = useQuery({
    queryKey: ["insight-options", orgSlug],
    queryFn: () => getInsightFilterOptions(orgSlug),
    enabled: !!timeline.data,
  });

  const notFound =
    timeline.isError && timeline.error instanceof ApiError && timeline.error.status === 404;

  return (
    <ResourcePage title="Email" description="Delivery timeline for one message.">
      {timeline.isPending ? (
        <ResourcePending />
      ) : notFound ? (
        <ResourceError message="That email was not found in this workspace." />
      ) : timeline.isError ? (
        <ResourceError message="Could not load this email." />
      ) : (
        <EmailDetail
          orgSlug={orgSlug}
          timeline={timeline.data}
          connectionName={
            options.data?.connections.find((c) => c.id === timeline.data.email.connectionId)
              ?.name ?? null
          }
          domainName={
            timeline.data.email.domainId
              ? (options.data?.domains.find((d) => d.id === timeline.data.email.domainId)?.name ??
                null)
              : null
          }
          canOpenThread={!!timeline.data.email.threadId}
        />
      )}
    </ResourcePage>
  );
}
