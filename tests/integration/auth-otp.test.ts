import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { startTestDb, uniqueEmail } from "./helpers";

vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
  cookies: async () => ({ set() {}, get() {}, delete() {}, getAll: () => [] }),
}));

let stop: () => Promise<void>;
let auth: typeof import("@/lib/auth/server").auth;
let connect: typeof import("@/lib/db/connect");
let outbox: typeof import("@/lib/services/system-email");

beforeAll(async () => {
  ({ stop } = await startTestDb("auth-otp"));
  connect = await import("@/lib/db/connect");
  auth = (await import("@/lib/auth/server")).auth;
  outbox = await import("@/lib/services/system-email");
  await connect.connectDb();
}, 120_000);

afterAll(async () => {
  await connect?.disconnectDb();
  await stop?.();
});

const password = "correct horse battery";

async function signUp(prefix: string) {
  const email = uniqueEmail(prefix);
  await auth.api.signUpEmail({ body: { name: "Otto Otp", email, password } });
  return email;
}

const mailFor = (email: string, kind: "verify-email" | "reset-password") =>
  vi.waitFor(
    () => {
      const mail = outbox.findOutbox(email, kind);
      if (!mail) throw new Error("no mail yet");
      return mail;
    },
    { timeout: 5_000 },
  );

describe("email verification with a code", () => {
  it("the sign-up email carries both a 6-digit code and the link", async () => {
    const email = await signUp("both");
    const mail = await mailFor(email, "verify-email");
    expect(mail.code).toMatch(/^\d{6}$/);
    expect(mail.link).toContain("/api/auth/verify-email");
    expect(mail.html).toContain(`${mail.code!.slice(0, 3)} ${mail.code!.slice(3)}`);
    expect(mail.text).toContain("Confirm email");
  });

  it("a wrong code changes nothing, the right one verifies and signs in, once", async () => {
    const email = await signUp("verify");
    const first = await mailFor(email, "verify-email");
    const wrong = first.code === "000000" ? "111111" : "000000";

    await expect(auth.api.verifyEmailOTP({ body: { email, otp: wrong } })).rejects.toMatchObject({
      body: { code: "INVALID_OTP" },
    });
    await expect(auth.api.signInEmail({ body: { email, password } })).rejects.toMatchObject({
      status: "FORBIDDEN",
    });
    // An unverified sign-in mails a fresh code and link, and the new code replaces the old one.
    const code = (
      await vi.waitFor(() => {
        const mail = outbox.findOutbox(email, "verify-email");
        if (!mail || mail.code === first.code) throw new Error("no new mail yet");
        return mail;
      })
    ).code;

    const ok = await auth.api.verifyEmailOTP({
      body: { email, otp: code! },
      returnHeaders: true,
    });
    expect(ok.response.status).toBe(true);
    expect(ok.response.user.emailVerified).toBe(true);
    // autoSignInAfterVerification: the code starts a session like the link does.
    expect(ok.headers.getSetCookie().join(";")).toContain("session_token");
    await expect(auth.api.signInEmail({ body: { email, password } })).resolves.toBeTruthy();

    // A used code is gone.
    await expect(auth.api.verifyEmailOTP({ body: { email, otp: code! } })).rejects.toBeTruthy();
  });

  it("limits wrong guesses: after too many, even the right code is refused", async () => {
    const { OTP_ALLOWED_ATTEMPTS } = await import("@/lib/auth/otp-config");
    const email = await signUp("attempts");
    const { code } = await mailFor(email, "verify-email");
    const wrong = code === "000000" ? "111111" : "000000";
    for (let i = 0; i < OTP_ALLOWED_ATTEMPTS; i++) {
      await expect(auth.api.verifyEmailOTP({ body: { email, otp: wrong } })).rejects.toBeTruthy();
    }
    await expect(auth.api.verifyEmailOTP({ body: { email, otp: code! } })).rejects.toBeTruthy();
    await expect(auth.api.signInEmail({ body: { email, password } })).rejects.toMatchObject({
      status: "FORBIDDEN",
    });
  });

  it("codes expire", async () => {
    const email = await signUp("expiry");
    const { code } = await mailFor(email, "verify-email");
    const { default: mongoose } = await import("mongoose");
    await mongoose.connection
      .collection("verification")
      .updateMany(
        { identifier: { $regex: "email-verification" } },
        { $set: { expiresAt: new Date(0) } },
      );
    await expect(auth.api.verifyEmailOTP({ body: { email, otp: code! } })).rejects.toMatchObject({
      body: { code: "OTP_EXPIRED" },
    });
  });

  it("the plain resend endpoint mails nothing for unknown addresses or other code types", async () => {
    outbox.clearOutbox();
    const unknown = uniqueEmail("ghost");
    const res = await auth.api.sendVerificationOTP({
      body: { email: unknown, type: "email-verification" },
    });
    expect(res).toEqual({ success: true });
    // Codes never sign anyone in or create accounts.
    const known = await signUp("signin-type");
    outbox.clearOutbox();
    for (const type of ["sign-in", "change-email"] as const) {
      await auth.api.sendVerificationOTP({ body: { email: known, type } }).catch(() => {});
    }
    expect(outbox.getOutbox()).toHaveLength(0);
    expect(outbox.findOutbox(unknown)).toBeUndefined();
  });
});

describe("password reset with a code", () => {
  it("emails a code and a link; the code sets a new password once and revokes nothing else", async () => {
    const email = await signUp("reset");
    const { default: mongoose } = await import("mongoose");
    await mongoose.connection
      .collection("user")
      .updateOne({ email }, { $set: { emailVerified: true } });
    await auth.api.requestPasswordReset({ body: { email, redirectTo: "/reset-password" } });
    const mail = await mailFor(email, "reset-password");
    expect(mail.code).toMatch(/^\d{6}$/);
    expect(mail.link).toContain("/reset-password/");

    const wrong = mail.code === "000000" ? "111111" : "000000";
    await expect(
      auth.api.resetPasswordEmailOTP({ body: { email, otp: wrong, password: "a brand new pass" } }),
    ).rejects.toMatchObject({ body: { code: "INVALID_OTP" } });

    await expect(
      auth.api.resetPasswordEmailOTP({
        body: { email, otp: mail.code!, password: "a brand new pass" },
      }),
    ).resolves.toBeTruthy();
    await expect(auth.api.signInEmail({ body: { email, password } })).rejects.toBeTruthy();
    await expect(
      auth.api.signInEmail({ body: { email, password: "a brand new pass" } }),
    ).resolves.toBeTruthy();
    await expect(
      auth.api.resetPasswordEmailOTP({
        body: { email, otp: mail.code!, password: "another one here" },
      }),
    ).rejects.toBeTruthy();
  });

  it("answers the same for unknown addresses and sends nothing (no enumeration)", async () => {
    const known = await signUp("known");
    const unknown = uniqueEmail("nobody");
    const a = await auth.api.requestPasswordReset({
      body: { email: known, redirectTo: "/reset-password" },
    });
    outbox.clearOutbox();
    const b = await auth.api.requestPasswordReset({
      body: { email: unknown, redirectTo: "/reset-password" },
    });
    expect(b).toEqual(a);
    expect(outbox.findOutbox(unknown)).toBeUndefined();
    await expect(
      auth.api.resetPasswordEmailOTP({
        body: { email: unknown, otp: "123456", password: "a brand new pass" },
      }),
    ).rejects.toBeTruthy();
  });
});

describe("social sign-ups", () => {
  it("a provider-verified account is verified without any email step", async () => {
    const ctx = await auth.$context;
    const email = uniqueEmail("social");
    const created = await ctx.internalAdapter.createOAuthUser(
      { name: "Gia Github", email, emailVerified: true },
      { providerId: "github", accountId: "gh-123", userId: "" },
    );
    expect(created.user.emailVerified).toBe(true);
    // No password on the account, and no verification mail was needed.
    await expect(auth.api.signInEmail({ body: { email, password } })).rejects.toBeTruthy();
    expect(outbox.findOutbox(email)).toBeUndefined();
  });
});
