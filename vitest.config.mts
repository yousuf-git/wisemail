import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// The sandbox cannot download mongod, so it ships one at /opt/mongo. Everywhere else (CI, laptops)
// mongodb-memory-server downloads its own binary.
const systemMongod = "/opt/mongo/mongod";
const shared = {
  setupFiles: ["./tests/setup.ts"],
  env: existsSync(systemMongod) ? { MONGOMS_SYSTEM_BINARY: systemMongod } : {},
};

const roots = ["tests/{unit,integration}", "lib", "components", "app"];
const glob = (ext: string) => roots.map((r) => `${r}/**/*.test.${ext}`);

export default defineConfig({
  plugins: [react()],
  resolve: {
    tsconfigPaths: true,
    alias: {
      "server-only": fileURLToPath(new URL("./tests/stubs/server-only.ts", import.meta.url)),
    },
  },
  test: {
    coverage: { provider: "v8", include: ["lib/**", "components/**"] },
    projects: [
      {
        extends: true,
        test: { ...shared, name: "node", environment: "node", include: glob("ts") },
      },
      {
        extends: true,
        test: { ...shared, name: "dom", environment: "jsdom", include: glob("tsx") },
      },
    ],
  },
});
