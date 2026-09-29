import { z } from "zod";

export const signInSchema = z.object({
  email: z.email("That email doesn't look right."),
  password: z.string().min(1, "Enter your password."),
});
export type SignInInput = z.infer<typeof signInSchema>;

export const signUpSchema = z.object({
  name: z.string().trim().min(2, "What should we call you?").max(80),
  email: z.email("That email doesn't look right."),
  password: z
    .string()
    .min(8, "Use at least 8 characters.")
    .max(128, "Keep it under 128 characters."),
});
export type SignUpInput = z.infer<typeof signUpSchema>;

/** Only same-site relative paths, so `?next=` can't be used as an open redirect. */
export function safeNext(next: string | null | undefined, fallback = "/onboarding"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\"))
    return fallback;
  return next;
}
