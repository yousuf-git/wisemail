import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const shared = {
  setupFiles: ["./tests/setup.ts"],
  env: { MONGOMS_SYSTEM_BINARY: "/opt/mongo/mongod" },
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
