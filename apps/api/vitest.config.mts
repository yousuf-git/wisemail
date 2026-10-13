import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

const systemMongod = "/opt/mongo/mongod";
const shared = {
  setupFiles: ["./tests/setup.ts"],
  env: existsSync(systemMongod) ? { MONGOMS_SYSTEM_BINARY: systemMongod } : {},
};

export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: {
    alias: {
      "server-only": fileURLToPath(new URL("./src/stubs/server-only.ts", import.meta.url)),
      "next/navigation": fileURLToPath(new URL("./src/stubs/next-navigation.ts", import.meta.url)),
      "next/headers": fileURLToPath(new URL("./src/stubs/next-headers.ts", import.meta.url)),
      "next/server": fileURLToPath(new URL("./src/stubs/next-server.ts", import.meta.url)),
    },
  },
  test: {
    ...shared,
    environment: "node",
    include: ["tests/{unit,integration}/**/*.test.ts", "lib/**/*.test.ts", "src/**/*.test.ts"],
    exclude: ["**/node_modules/**", "archive/**"],
  },
});
