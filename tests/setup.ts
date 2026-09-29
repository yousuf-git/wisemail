import "@testing-library/jest-dom/vitest";

const defaults: Record<string, string> = {
  MONGODB_URI: "mongodb://127.0.0.1:27017/wisemail-test",
  BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret-0000",
  BETTER_AUTH_URL: "http://localhost:3000",
  APP_URL: "http://localhost:3000",
  ENCRYPTION_KEK_CURRENT: Buffer.alloc(32, 7).toString("base64"),
  ENCRYPTION_KEK_ID: "test-1",
};

for (const [key, value] of Object.entries(defaults)) {
  process.env[key] ??= value;
}
