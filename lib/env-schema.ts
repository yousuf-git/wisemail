import { z } from "zod";

const bool = z.enum(["true", "false"]).transform((v) => v === "true");

const base64Key = z.string().refine(
  (v) => {
    const buf = Buffer.from(v, "base64");
    return buf.length === 32 && buf.toString("base64") === v;
  },
  { message: "must be a base64-encoded 32-byte key" },
);

const optionalString = z.string().optional();

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  MONGODB_URI: z
    .string()
    .regex(/^mongodb(\+srv)?:\/\//, "must start with mongodb:// or mongodb+srv://"),

  BETTER_AUTH_SECRET: z.string().min(32, "must be at least 32 characters"),
  BETTER_AUTH_URL: z.url(),
  APP_URL: z.url(),

  ENCRYPTION_KEK_CURRENT: base64Key,
  ENCRYPTION_KEK_ID: z.string().min(1),
  ENCRYPTION_KEK_PREVIOUS: base64Key.optional(),

  RESEND_MODE: z.enum(["live", "fake"]).optional(),
  STORAGE_MODE: z.enum(["r2", "fake"]).optional(),
  AI_MODE: z.enum(["live", "fake"]).optional(),
  INNGEST_DEV: bool.optional(),

  INNGEST_EVENT_KEY: optionalString,
  INNGEST_SIGNING_KEY: optionalString,

  R2_ACCOUNT_ID: optionalString,
  R2_ACCESS_KEY_ID: optionalString,
  R2_SECRET_ACCESS_KEY: optionalString,
  R2_BUCKET: optionalString,

  AI_BASE_URL: z.url().optional(),
  AI_API_KEY: optionalString,
  AI_MODEL: optionalString,
  AI_MODEL_FAST: optionalString,

  SYSTEM_RESEND_API_KEY: optionalString,
  SYSTEM_FROM_EMAIL: optionalString,

  BILLING_ENABLED: bool.default(false),
  STRIPE_SANDBOX: bool.optional(),
  STRIPE_SECRET_KEY: optionalString,
  STRIPE_PUBLISHABLE_KEY: optionalString,
  STRIPE_WEBHOOK_SECRET: optionalString,
  STRIPE_BILLING_WEBHOOK_SECRET: optionalString,

  SENTRY_DSN: z.url().optional(),
});

type Parsed = z.infer<typeof schema>;

export type Env = Omit<Parsed, "RESEND_MODE" | "STORAGE_MODE" | "AI_MODE" | "INNGEST_DEV"> & {
  RESEND_MODE: "live" | "fake";
  STORAGE_MODE: "r2" | "fake";
  AI_MODE: "live" | "fake";
  INNGEST_DEV: boolean;
  STRIPE_PRICES: Record<string, string>;
};

export type EnvResult = { success: true; data: Env } | { success: false; errors: string[] };

type Source = Record<string, string | undefined>;

const isLocalHost = (url: string) => {
  try {
    const { hostname } = new URL(url);
    return hostname === "localhost" || hostname === "127.0.0.1";
  } catch {
    return false;
  }
};

const PRICE_PREFIX = "STRIPE_PRICE_";

function stripeModeIssues(env: Parsed): string[] {
  const issues: string[] = [];
  if (env.STRIPE_SANDBOX === undefined) {
    issues.push('STRIPE_SANDBOX: required when BILLING_ENABLED=true (must be "true" or "false")');
    return issues;
  }
  const sandbox = env.STRIPE_SANDBOX;
  const expected = sandbox ? "test" : "live";
  const other = sandbox ? "live" : "test";
  const keyPrefixes = sandbox ? "sk_test_… or rk_test_…" : "sk_live_… or rk_live_…";
  const secret = env.STRIPE_SECRET_KEY;
  if (secret) {
    const matches = [`sk_${expected}_`, `rk_${expected}_`].some((p) => secret.startsWith(p));
    if (!matches) {
      const isOther = [`sk_${other}_`, `rk_${other}_`].some((p) => secret.startsWith(p));
      const found = isOther
        ? `a ${other} key (sk_${other}_…)`
        : "not a recognised Stripe secret key";
      issues.push(
        `[env] Stripe mode conflict: STRIPE_SANDBOX=${sandbox} expects a ${expected} key (${keyPrefixes}), ` +
          `but STRIPE_SECRET_KEY is ${found}. Set STRIPE_SANDBOX=${!sandbox} or use a ${expected} key.`,
      );
    }
  }
  const publishable = env.STRIPE_PUBLISHABLE_KEY;
  if (publishable && !publishable.startsWith(`pk_${expected}_`)) {
    const isOther = publishable.startsWith(`pk_${other}_`);
    const found = isOther
      ? `a ${other} key (pk_${other}_…)`
      : "not a recognised Stripe publishable key";
    issues.push(
      `[env] Stripe mode conflict: STRIPE_SANDBOX=${sandbox} expects a ${expected} key (pk_${expected}_…), ` +
        `but STRIPE_PUBLISHABLE_KEY is ${found}. Set STRIPE_SANDBOX=${!sandbox} or use a ${expected} key.`,
    );
  }
  return issues;
}

function requireAll(env: Parsed, names: (keyof Parsed)[], reason: string): string[] {
  return names.filter((name) => !env[name]).map((name) => `${name}: required ${reason}`);
}

export function parseEnv(source: Source): EnvResult {
  const cleaned: Source = {};
  for (const [key, value] of Object.entries(source)) {
    if (value !== undefined && value.trim() !== "") cleaned[key] = value.trim();
  }

  const result = schema.safeParse(cleaned);
  if (!result.success) {
    return {
      success: false,
      errors: result.error.issues.map((issue) => {
        const path = issue.path.join(".");
        return path ? `${path}: ${issue.message}` : issue.message;
      }),
    };
  }

  const parsed = result.data;
  const production = parsed.NODE_ENV === "production";

  const resolved: Env = {
    ...parsed,
    RESEND_MODE: parsed.RESEND_MODE ?? (production ? "live" : "fake"),
    STORAGE_MODE: parsed.STORAGE_MODE ?? (production ? "r2" : "fake"),
    AI_MODE: parsed.AI_MODE ?? (production ? "live" : "fake"),
    INNGEST_DEV: parsed.INNGEST_DEV ?? !production,
    STRIPE_PRICES: Object.fromEntries(
      Object.entries(cleaned).filter(([key]) => key.startsWith(PRICE_PREFIX)),
    ) as Record<string, string>,
  };

  const errors: string[] = [];

  if (production) {
    for (const key of ["APP_URL", "BETTER_AUTH_URL"] as const) {
      const value = parsed[key];
      if (!value.startsWith("https://") && !isLocalHost(value)) {
        errors.push(`${key}: must be https in production`);
      }
    }
  }

  if (resolved.RESEND_MODE === "live") {
    errors.push(
      ...requireAll(
        parsed,
        ["SYSTEM_RESEND_API_KEY", "SYSTEM_FROM_EMAIL"],
        "when RESEND_MODE=live",
      ),
    );
  }
  if (resolved.STORAGE_MODE === "r2") {
    errors.push(
      ...requireAll(
        parsed,
        ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"],
        "when STORAGE_MODE=r2",
      ),
    );
  }
  if (resolved.AI_MODE === "live") {
    errors.push(
      ...requireAll(parsed, ["AI_BASE_URL", "AI_API_KEY", "AI_MODEL"], "when AI_MODE=live"),
    );
  }
  if (!resolved.INNGEST_DEV) {
    errors.push(
      ...requireAll(parsed, ["INNGEST_EVENT_KEY", "INNGEST_SIGNING_KEY"], "when INNGEST_DEV=false"),
    );
  }

  if (resolved.BILLING_ENABLED) {
    errors.push(
      ...requireAll(
        parsed,
        ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "STRIPE_BILLING_WEBHOOK_SECRET"],
        "when BILLING_ENABLED=true",
      ),
    );
    errors.push(...stripeModeIssues(parsed));
    if (Object.keys(resolved.STRIPE_PRICES).length === 0) {
      errors.push(`${PRICE_PREFIX}*: at least one price id is required when BILLING_ENABLED=true`);
    }
  }

  return errors.length > 0 ? { success: false, errors } : { success: true, data: resolved };
}

export function formatEnvErrors(errors: string[]): string {
  const lines = errors.map((e) => (e.startsWith("[env]") ? `  ${e}` : `  - ${e}`));
  return `[env] Invalid environment configuration:\n${lines.join("\n")}`;
}

export function loadEnv(source: Source = process.env): Env {
  const result = parseEnv(source);
  if (!result.success) throw new Error(formatEnvErrors(result.errors));
  return result.data;
}
