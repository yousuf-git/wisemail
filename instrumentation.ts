import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { validateEnvOrExit, initSentry } = await import("./instrumentation-node");
    await validateEnvOrExit();
    await initSentry();
  }
}

// Reports unhandled server errors (render, route handlers, actions). Inert when Sentry is not initialised.
export const onRequestError = Sentry.captureRequestError;
