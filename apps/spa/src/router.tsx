import {
  Outlet,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  lazyRouteComponent,
} from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";

export type RouterContext = {
  queryClient: QueryClient;
};

const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
});

function RootLayout() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <header
        style={{
          padding: "1rem 1.25rem",
          borderBottom: "1px solid color-mix(in oklab, currentColor 12%, transparent)",
        }}
      >
        <strong style={{ letterSpacing: "-0.02em", fontSize: "1.125rem" }}>Wisemail</strong>
      </header>
      <main style={{ flex: 1, padding: "1.5rem 1.25rem" }}>
        <Outlet />
      </main>
    </div>
  );
}

/** Explicit lazy map — analyzable by Vite (`bundle-dynamic-imports` / `bundle-analyzable-paths`). */
const PAGE_MODULES = {
  home: () => import("@/pages/home"),
} as const;

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: lazyRouteComponent(PAGE_MODULES.home, "HomePage"),
});

const routeTree = rootRoute.addChildren([indexRoute]);

export function createAppRouter(queryClient: QueryClient) {
  return createRouter({
    routeTree,
    context: { queryClient },
    defaultPreload: "intent",
  });
}

export type AppRouter = ReturnType<typeof createAppRouter>;

declare module "@tanstack/react-router" {
  interface Register {
    router: AppRouter;
  }
}
