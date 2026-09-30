import { existsSync } from "node:fs";

for (const file of [".env.local", ".env"]) {
  if (existsSync(file)) process.loadEnvFile(file);
}

async function checkStripePrices(secretKey: string, prices: Record<string, string>) {
  const failures: string[] = [];
  // Every price the integration uses must be configured (`lib/billing/stripe-price-keys.ts`).
  const { REQUIRED_PRICE_KEYS } = await import("../lib/billing/stripe-price-keys");
  for (const key of REQUIRED_PRICE_KEYS) {
    if (!prices[`STRIPE_PRICE_${key}`])
      failures.push(`STRIPE_PRICE_${key}: required when BILLING_ENABLED=true`);
  }
  await Promise.all(
    Object.entries(prices).map(async ([name, id]) => {
      const res = await fetch(`https://api.stripe.com/v1/prices/${encodeURIComponent(id)}`, {
        headers: { Authorization: `Bearer ${secretKey}` },
      });
      if (!res.ok)
        failures.push(`${name}: Stripe returned ${res.status} (wrong mode or unknown price)`);
    }),
  );
  return failures;
}

async function checkR2Bucket(config: {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}) {
  const { S3Client, HeadBucketCommand } = await import("@aws-sdk/client-s3");
  const client = new S3Client({
    region: "auto",
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
  });
  try {
    await client.send(new HeadBucketCommand({ Bucket: config.bucket }));
    return [];
  } catch (error) {
    const reason = error instanceof Error ? error.name : "unknown error";
    return [`R2_BUCKET: HeadBucket failed (${reason}); check R2_BUCKET and the R2_* credentials`];
  }
}

async function main() {
  let env: import("../lib/env-schema").Env;
  try {
    const { loadEnv } = await import("../lib/env-schema");
    env = loadEnv();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }

  const failures: string[] = [];

  // Fake Stripe (STRIPE_MODE=fake) has no account to ask: the price check is skipped.
  if (env.BILLING_ENABLED && env.STRIPE_MODE === "live" && env.STRIPE_SECRET_KEY) {
    failures.push(...(await checkStripePrices(env.STRIPE_SECRET_KEY, env.STRIPE_PRICES)));
  }

  if (env.STORAGE_MODE === "r2") {
    failures.push(
      ...(await checkR2Bucket({
        accountId: env.R2_ACCOUNT_ID!,
        accessKeyId: env.R2_ACCESS_KEY_ID!,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY!,
        bucket: env.R2_BUCKET!,
      })),
    );
  }

  if (failures.length > 0) {
    console.error(`[env] Service checks failed:\n${failures.map((f) => `  - ${f}`).join("\n")}`);
    process.exit(1);
  }

  const skipped = [
    !env.BILLING_ENABLED && "stripe (billing disabled)",
    env.BILLING_ENABLED && env.STRIPE_MODE === "fake" && "stripe (fake mode)",
    env.STORAGE_MODE === "fake" && "r2 (fake storage)",
  ].filter(Boolean);
  console.log(
    `[env] OK (${env.NODE_ENV})${skipped.length ? `; skipped network checks: ${skipped.join(", ")}` : ""}`,
  );
}

void main();
