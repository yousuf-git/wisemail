/**
 * Create or promote the single immutable platform Super Admin.
 *
 *   pnpm admin:create <email> [--name "Name"] [--password secret]
 *
 * Idempotent for the same email. Refuses when a different Super Admin already exists.
 * Never runs with NODE_ENV=production.
 */
import { existsSync } from "node:fs";
import { randomBytes } from "node:crypto";

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("--")));
const positionals = args.filter((a) => !a.startsWith("--"));

function flagValue(name: string): string | undefined {
  const idx = args.indexOf(name);
  if (idx < 0) return undefined;
  return args[idx + 1];
}

function die(message: string): never {
  console.error(`\nadmin:create: ${message}\n`);
  process.exit(1);
}

if ((process.env as Record<string, string | undefined>).NODE_ENV === "production") {
  die("refusing to run with NODE_ENV=production.");
}

for (const file of [".env.local", ".env"]) {
  if (existsSync(file)) process.loadEnvFile(file);
}
if ((process.env as Record<string, string | undefined>).NODE_ENV === "production") {
  die("refusing to run with NODE_ENV=production.");
}

const email = positionals[0]?.trim().toLowerCase();
if (!email || !email.includes("@")) {
  die("usage: pnpm admin:create <email> [--name Name] [--password secret]");
}

const name = flagValue("--name")?.trim() || email.split("@")[0] || "Super Admin";
const password =
  flagValue("--password")?.trim() ||
  (flags.has("--password") ? die("--password needs a value") : randomBytes(12).toString("base64url"));

const requestHeaders = { current: new Headers() };

function stubModule(id: string, exports: unknown) {
  const file = require.resolve(id);
  require.cache[file] = { id: file, filename: file, loaded: true, exports } as never;
}

stubModule("server-only", {});
stubModule("next/headers", {
  headers: async () => requestHeaders.current,
  cookies: async () => ({
    get() {},
    set() {},
    delete() {},
    has: () => false,
    getAll: () => [],
  }),
});

async function main() {
  const { connectDb, disconnectDb } = await import("../lib/db/connect");
  const { auth } = await import("../lib/auth/server");
  const { getPlatformCatalog } = await import("../lib/services/catalog");
  const { claimSuperAdmin, getSuperAdminUserId } = await import("../lib/admin/super-admin");
  const { ADMIN_ROLE } = await import("../lib/admin/allowlist");
  const mongoose = (await import("mongoose")).default;

  await connectDb();
  await getPlatformCatalog(); // seeds platform_settings when empty

  const users = mongoose.connection.collection("user");
  let user = await users.findOne({ email });

  if (!user) {
    try {
      await auth.api.signUpEmail({
        body: { email, password, name },
      });
    } catch (error) {
      die(`sign-up failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    await users.updateOne(
      { email },
      { $set: { emailVerified: true, name, role: ADMIN_ROLE } },
    );
    user = await users.findOne({ email });
  } else {
    await users.updateOne(
      { email },
      { $set: { emailVerified: true, name, role: ADMIN_ROLE } },
    );
    user = await users.findOne({ email });
  }

  if (!user) die("user row missing after create.");

  const userId = String(user._id);
  const existing = await getSuperAdminUserId();
  if (existing && existing !== userId) {
    die(
      `Super Admin already claimed by user ${existing}. Only one is allowed; refuse to replace.`,
    );
  }

  const claim = await claimSuperAdmin(userId);
  const createdPassword = !flagValue("--password") && !user.createdAt ? password : undefined;

  console.log("");
  console.log("Super Admin ready");
  console.log(`  email:     ${email}`);
  console.log(`  userId:    ${userId}`);
  console.log(`  claim:     ${claim}`);
  if (!flagValue("--password")) {
    console.log(`  password:  ${password}`);
    console.log("  (pass --password to set your own; store this if newly generated)");
  } else if (createdPassword) {
    console.log(`  password:  ${password}`);
  }
  console.log("  panel:     /admin");
  console.log("");

  await disconnectDb();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
