import { env } from "@/lib/env";

export type SocialProvider = "google" | "github";

/** Providers switched on by env (both id and secret set). Safe to call from server components. */
export function enabledSocialProviders(): SocialProvider[] {
  const providers: SocialProvider[] = [];
  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) providers.push("google");
  if (env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET) providers.push("github");
  return providers;
}
