import "server-only";

/**
 * Side-effect imports: each module registers action ids. Loaded by HTTP action routes
 * (Next + Fastify) before dispatching.
 */
import "@/app/(app)/[orgSlug]/tour-actions";
import "@/app/(app)/[orgSlug]/alerts/actions";
import "@/app/(app)/[orgSlug]/api-keys/actions";
import "@/app/(app)/[orgSlug]/audience/actions";
import "@/app/(app)/[orgSlug]/broadcasts/actions";
import "@/app/(app)/[orgSlug]/compose/actions";
import "@/app/(app)/[orgSlug]/domains/actions";
import "@/app/(app)/[orgSlug]/inbox/actions";
import "@/app/(app)/[orgSlug]/inbox/bulk-actions";
import "@/app/(app)/[orgSlug]/notifications/actions";
import "@/app/(app)/[orgSlug]/scheduled/actions";
import "@/app/(app)/[orgSlug]/settings/ai/actions";
import "@/app/(app)/[orgSlug]/settings/billing/actions";
import "@/app/(app)/[orgSlug]/settings/cleanup/actions";
import "@/app/(app)/[orgSlug]/settings/connections/actions";
import "@/app/(app)/[orgSlug]/settings/general/actions";
import "@/app/(app)/[orgSlug]/settings/members/actions";
import "@/app/(app)/[orgSlug]/settings/notifications/actions";
import "@/app/(app)/[orgSlug]/settings/projects/actions";
import "@/app/(app)/[orgSlug]/settings/senders/actions";
import "@/app/(app)/[orgSlug]/templates/actions";
import "@/app/onboarding/actions";
import "@/app/(app)/impersonation-actions";
import "@/app/(auth)/invite/[token]/actions";
import "@/app/(admin)/admin/actions";

export {
  listOrgActionIds,
  listUserActionIds,
  listAdminActionIds,
} from "@/lib/actions/registry";
