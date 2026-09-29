import type { ContactRowDTO } from "@/lib/dto/audience";
import type { Page } from "@/lib/dto/mail";

/** Client fetcher for `GET /api/v1/contacts` (session cookie authorizes; org named by slug). */

export type ContactFilters = {
  q: string;
  connectionId: string;
  segmentId: string;
  topicId: string;
  status: "" | "subscribed" | "unsubscribed";
};

export const EMPTY_CONTACT_FILTERS: ContactFilters = {
  q: "",
  connectionId: "",
  segmentId: "",
  topicId: "",
  status: "",
};

export const contactsKey = (orgSlug: string, filters: ContactFilters) =>
  ["contacts", orgSlug, filters] as const;

export async function fetchContacts(
  orgSlug: string,
  filters: ContactFilters,
  cursor: string | null,
): Promise<Page<ContactRowDTO>> {
  const search = new URLSearchParams({ orgSlug, limit: "50" });
  for (const [key, value] of Object.entries(filters)) {
    if (value) search.set(key, key === "q" ? value.trim() : value);
  }
  if (cursor) search.set("cursor", cursor);
  const response = await fetch(`/api/v1/contacts?${search}`, { credentials: "same-origin" });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(body?.message ?? "Request failed");
  }
  return (await response.json()) as Page<ContactRowDTO>;
}

export const hasContactFilters = (f: ContactFilters) => Object.values(f).some(Boolean);
