import { describe, expect, it } from "vitest";

import { formatEnvErrors, parseEnv } from "@/lib/env-schema";

const kek = Buffer.alloc(32, 1).toString("base64");

const devEnv = {
  NODE_ENV: "development",
  MONGODB_URI: "mongodb://127.0.0.1:27017/wisemail",
  BETTER_AUTH_SECRET: "x".repeat(32),
  BETTER_AUTH_URL: "http://localhost:3000",
  APP_URL: "http://localhost:3000",
  ENCRYPTION_KEK_CURRENT: kek,
  ENCRYPTION_KEK_ID: "dev-1",
};

const billingEnv = {
  ...devEnv,
  BILLING_ENABLED: "true",
  STRIPE_SANDBOX: "true",
  STRIPE_SECRET_KEY: "sk_test_abc",
  STRIPE_PUBLISHABLE_KEY: "pk_test_abc",
  STRIPE_WEBHOOK_SECRET: "whsec_a",
  STRIPE_BILLING_WEBHOOK_SECRET: "whsec_b",
  STRIPE_PRICE_PRO_MONTHLY: "price_1",
};

function errorsOf(source: Record<string, string>) {
  const result = parseEnv(source);
  if (result.success) throw new Error("expected env to be invalid");
  return result.errors;
}

describe("parseEnv", () => {
  it("accepts a minimal dev env and defaults services to fake", () => {
    const result = parseEnv(devEnv);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.RESEND_MODE).toBe("fake");
    expect(result.data.STORAGE_MODE).toBe("fake");
    expect(result.data.AI_MODE).toBe("fake");
    expect(result.data.INNGEST_DEV).toBe(true);
    expect(result.data.BILLING_ENABLED).toBe(false);
  });

  it("reports every missing required variable in one list", () => {
    const errors = errorsOf({ NODE_ENV: "development" });
    for (const name of [
      "MONGODB_URI",
      "BETTER_AUTH_SECRET",
      "BETTER_AUTH_URL",
      "APP_URL",
      "ENCRYPTION_KEK_CURRENT",
      "ENCRYPTION_KEK_ID",
    ]) {
      expect(errors.some((e) => e.startsWith(`${name}:`))).toBe(true);
    }
  });

  it("treats empty strings as unset", () => {
    expect(errorsOf({ ...devEnv, MONGODB_URI: "  " }).join("\n")).toContain("MONGODB_URI");
  });

  it("rejects a KEK that is not 32 bytes", () => {
    const errors = errorsOf({
      ...devEnv,
      ENCRYPTION_KEK_CURRENT: Buffer.alloc(16).toString("base64"),
    });
    expect(errors.join("\n")).toContain("ENCRYPTION_KEK_CURRENT");
  });

  it("requires live-mode variables in production", () => {
    const errors = errorsOf({
      ...devEnv,
      NODE_ENV: "production",
      APP_URL: "https://app.example.com",
      BETTER_AUTH_URL: "https://app.example.com",
    });
    const text = errors.join("\n");
    for (const name of [
      "SYSTEM_RESEND_API_KEY",
      "R2_BUCKET",
      "AI_API_KEY",
      "INNGEST_SIGNING_KEY",
    ]) {
      expect(text).toContain(name);
    }
  });

  it("requires https APP_URL in production", () => {
    const errors = errorsOf({
      ...devEnv,
      NODE_ENV: "production",
      APP_URL: "http://app.example.com",
      RESEND_MODE: "fake",
      STORAGE_MODE: "fake",
      AI_MODE: "fake",
      INNGEST_DEV: "true",
    });
    expect(errors).toEqual(["APP_URL: must be https in production"]);
  });

  describe("Stripe mode check", () => {
    it("accepts matching sandbox keys", () => {
      expect(parseEnv(billingEnv).success).toBe(true);
    });

    it("accepts matching live keys", () => {
      expect(
        parseEnv({
          ...billingEnv,
          STRIPE_SANDBOX: "false",
          STRIPE_SECRET_KEY: "rk_live_abc",
          STRIPE_PUBLISHABLE_KEY: "pk_live_abc",
        }).success,
      ).toBe(true);
    });

    it("rejects a test key when STRIPE_SANDBOX=false, naming variables and prefix only", () => {
      const errors = errorsOf({
        ...billingEnv,
        STRIPE_SANDBOX: "false",
        STRIPE_PUBLISHABLE_KEY: "",
      });
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain(
        "STRIPE_SANDBOX=false expects a live key (sk_live_… or rk_live_…)",
      );
      expect(errors[0]).toContain("STRIPE_SECRET_KEY is a test key (sk_test_…)");
      expect(errors[0]).not.toContain("sk_test_abc");
    });

    it("rejects a live key when STRIPE_SANDBOX=true", () => {
      const errors = errorsOf({
        ...billingEnv,
        STRIPE_SECRET_KEY: "sk_live_secret",
        STRIPE_PUBLISHABLE_KEY: "",
      });
      expect(errors[0]).toContain("STRIPE_SANDBOX=true expects a test key");
      expect(errors[0]).toContain("STRIPE_SECRET_KEY is a live key (sk_live_…)");
      expect(errors[0]).not.toContain("sk_live_secret");
    });

    it("rejects a mismatched publishable key", () => {
      const errors = errorsOf({ ...billingEnv, STRIPE_PUBLISHABLE_KEY: "pk_live_abc" });
      expect(errors[0]).toContain("STRIPE_PUBLISHABLE_KEY is a live key (pk_live_…)");
    });

    it("requires STRIPE_SANDBOX to be set when billing is enabled", () => {
      const { STRIPE_SANDBOX: _omit, ...rest } = billingEnv;
      void _omit;
      expect(errorsOf(rest).join("\n")).toContain("STRIPE_SANDBOX");
    });

    it("skips all Stripe checks when BILLING_ENABLED=false", () => {
      const result = parseEnv({
        ...devEnv,
        BILLING_ENABLED: "false",
        STRIPE_SANDBOX: "false",
        STRIPE_SECRET_KEY: "sk_test_abc",
      });
      expect(result.success).toBe(true);
    });
  });

  describe("Stripe mode (fake / live)", () => {
    const fakeBilling = { ...devEnv, BILLING_ENABLED: "true" };

    it("defaults to fake in development and needs no keys or prices when billing is on", () => {
      const result = parseEnv(fakeBilling);
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.STRIPE_MODE).toBe("fake");
    });

    it("accepts an explicit STRIPE_MODE=fake next to billing", () => {
      expect(parseEnv({ ...fakeBilling, STRIPE_MODE: "fake" }).success).toBe(true);
    });

    it("goes live when a secret key is set, and then checks keys, secrets and prices", () => {
      const result = parseEnv(billingEnv);
      expect(result.success && result.data.STRIPE_MODE).toBe("live");
      const errors = errorsOf({
        ...fakeBilling,
        STRIPE_SECRET_KEY: "sk_test_abc",
        STRIPE_SANDBOX: "true",
      });
      expect(errors.join("\n")).toContain("STRIPE_WEBHOOK_SECRET");
      expect(errors.join("\n")).toContain("STRIPE_BILLING_WEBHOOK_SECRET");
    });

    it("requires everything when STRIPE_MODE=live is explicit", () => {
      const errors = errorsOf({ ...fakeBilling, STRIPE_MODE: "live" });
      expect(errors.join("\n")).toContain("STRIPE_SECRET_KEY");
    });

    it("refuses the fake in production once billing is on", () => {
      const errors = errorsOf({
        ...fakeBilling,
        NODE_ENV: "production",
        BETTER_AUTH_URL: "https://app.example.com",
        APP_URL: "https://app.example.com",
        RESEND_MODE: "fake",
        STORAGE_MODE: "fake",
        AI_MODE: "fake",
        INNGEST_DEV: "true",
        STRIPE_MODE: "fake",
      });
      expect(errors).toEqual([
        "STRIPE_MODE: fake is not allowed in production when BILLING_ENABLED=true",
      ]);
    });

    it("leaves beta untouched: billing off ignores STRIPE_MODE entirely", () => {
      const result = parseEnv({ ...devEnv, STRIPE_MODE: "live" });
      expect(result.success).toBe(true);
    });
  });

  it("formats errors as a combined message", () => {
    expect(formatEnvErrors(["A: bad", "B: bad"])).toBe(
      "[env] Invalid environment configuration:\n  - A: bad\n  - B: bad",
    );
  });
});

describe("KEK rotation env", () => {
  const previous = Buffer.alloc(32, 2).toString("base64");
  it("requires the previous KEK's id alongside it", () => {
    expect(errorsOf({ ...devEnv, ENCRYPTION_KEK_PREVIOUS: previous })).toContain(
      "ENCRYPTION_KEK_PREVIOUS_ID: required when ENCRYPTION_KEK_PREVIOUS is set",
    );
    expect(errorsOf({ ...devEnv, ENCRYPTION_KEK_PREVIOUS_ID: "old" })).toContain(
      "ENCRYPTION_KEK_PREVIOUS: required when ENCRYPTION_KEK_PREVIOUS_ID is set",
    );
  });
  it("rejects a previous id equal to the current id, and accepts a valid pair", () => {
    expect(
      errorsOf({
        ...devEnv,
        ENCRYPTION_KEK_PREVIOUS: previous,
        ENCRYPTION_KEK_PREVIOUS_ID: "dev-1",
      }),
    ).toContain("ENCRYPTION_KEK_PREVIOUS_ID: must differ from ENCRYPTION_KEK_ID");
    expect(
      parseEnv({ ...devEnv, ENCRYPTION_KEK_PREVIOUS: previous, ENCRYPTION_KEK_PREVIOUS_ID: "old" })
        .success,
    ).toBe(true);
  });
});

describe("social sign-in variables", () => {
  it("are optional: none set is a valid env", () => {
    expect(parseEnv(devEnv).success).toBe(true);
  });
  it("accepts a complete pair per provider", () => {
    const result = parseEnv({
      ...devEnv,
      GOOGLE_CLIENT_ID: "g-id",
      GOOGLE_CLIENT_SECRET: "g-secret",
      GITHUB_CLIENT_ID: "h-id",
      GITHUB_CLIENT_SECRET: "h-secret",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.GOOGLE_CLIENT_ID).toBe("g-id");
  });
  it("rejects half a pair, naming what is missing", () => {
    expect(errorsOf({ ...devEnv, GOOGLE_CLIENT_ID: "g-id" })).toContain(
      "GOOGLE_CLIENT_SECRET: required when GOOGLE_CLIENT_ID is set (Google sign-in needs both)",
    );
    expect(errorsOf({ ...devEnv, GITHUB_CLIENT_SECRET: "h-secret" })).toContain(
      "GITHUB_CLIENT_ID: required when GITHUB_CLIENT_SECRET is set (GitHub sign-in needs both)",
    );
  });
  it("treats blank values as unset", () => {
    expect(parseEnv({ ...devEnv, GOOGLE_CLIENT_ID: "", GOOGLE_CLIENT_SECRET: "  " }).success).toBe(
      true,
    );
  });
});
