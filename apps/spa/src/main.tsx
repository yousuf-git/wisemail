import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";

import { ThemeProvider } from "@/components/theme/theme-provider";
import { queryClient } from "@/lib/query-client";
import { initSpaSentry } from "@/lib/sentry";
import { createAppRouter } from "@/router";
import "@/styles.css";

void initSpaSentry();

const router = createAppRouter(queryClient);

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root");

createRoot(root).render(
  <StrictMode>
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
);
