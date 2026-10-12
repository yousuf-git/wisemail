/**
 * Runs before the Playwright web server: makes sure a MongoDB replica set is reachable (starts
 * the local one via scripts/dev-mongo.sh when the target is localhost) and drops the e2e database
 * so every run starts clean. Refuses to touch a database that is not named like an e2e/test one.
 */
import { execFileSync } from "node:child_process";

import { MongoClient } from "mongodb";

const uri = process.env.E2E_MONGODB_URI ?? "mongodb://127.0.0.1:27017/wisemail_e2e?replicaSet=rs0";
const dbName = new URL(uri).pathname.slice(1);
if (!/e2e|test/i.test(dbName)) {
  console.error(`[e2e] Refusing to drop database "${dbName}": name must contain "e2e" or "test".`);
  process.exit(1);
}

async function reachable(): Promise<boolean> {
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 2_500 });
  try {
    await client.connect();
    await client.db("admin").command({ ping: 1 });
    return true;
  } catch {
    return false;
  } finally {
    await client.close().catch(() => {});
  }
}

async function main() {
  const { hostname, port } = new URL(uri.replace(/^mongodb(\+srv)?:/, "http:"));
  const local = hostname === "127.0.0.1" || hostname === "localhost";
  if (!(await reachable())) {
    if (!local) throw new Error(`MongoDB at ${hostname} is not reachable`);
    console.log("[e2e] Starting the local MongoDB replica set (scripts/dev-mongo.sh)");
    execFileSync("bash", ["scripts/dev-mongo.sh"], {
      stdio: "inherit",
      env: { ...process.env, MONGO_PORT: port || "27017" },
    });
    if (!(await reachable())) throw new Error("MongoDB did not become reachable");
  }
  const client = new MongoClient(uri);
  try {
    await client.connect();
    await client.db(dbName).dropDatabase();
    console.log(`[e2e] Dropped database ${dbName}`);
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
