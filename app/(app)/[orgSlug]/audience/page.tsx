import { redirect } from "next/navigation";

export default async function AudienceIndex({ params }: PageProps<"/[orgSlug]/audience">) {
  const { orgSlug } = await params;
  redirect(`/${orgSlug}/audience/contacts`);
}
