export async function validateEnvOrExit() {
  try {
    await import("./lib/env");
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    console.error("[env] Shutting down.");
    process.exit(1);
  }
}
