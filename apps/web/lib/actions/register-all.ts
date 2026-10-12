import "server-only";

/**
 * Side-effect imports: each module calls `orgAction({ id: ... })` which fills the registry.
 * Loaded by the HTTP action route (Next + Fastify) before dispatching.
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

export { listOrgActionIds } from "@/lib/actions/registry";
