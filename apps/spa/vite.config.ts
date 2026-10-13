import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * Wisemail SPA (M7). Proxies `/api` to Fastify (same-origin cookies).
 * Route pages use explicit `() => import(...)` maps (`bundle-analyzable-paths`).
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: process.env.VITE_API_PROXY ?? "http://127.0.0.1:4000",
        // Keep browser Host so Set-Cookie applies to :5173 (not the API host).
        changeOrigin: false,
        configure: (proxy) => {
          proxy.on("proxyRes", (proxyRes) => {
            const raw = proxyRes.headers["set-cookie"];
            if (!raw) return;
            const list = Array.isArray(raw) ? raw : [raw];
            // Host stays :5173 (`changeOrigin: false`); drop Domain/Secure/Partitioned so
            // the browser stores the session on the SPA origin over plain http.
            proxyRes.headers["set-cookie"] = list.map((cookie) => {
              let c = cookie
                .replace(/;\s*Domain=[^;]*/gi, "")
                .replace(/;\s*Secure/gi, "")
                .replace(/;\s*Partitioned/gi, "");
              if (!/;\s*SameSite=/i.test(c)) c += "; SameSite=Lax";
              else c = c.replace(/;\s*SameSite=[^;]*/gi, "; SameSite=Lax");
              if (!/;\s*Path=/i.test(c)) c += "; Path=/";
              return c;
            });
          });
        },
      },
    },
  },
  build: {
    target: "es2022",
    sourcemap: true,
  },
});
