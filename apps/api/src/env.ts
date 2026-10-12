import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().default("127.0.0.1"),
  PORT: z.coerce.number().int().positive().default(4000),
  APP_URL: z.url().optional(),
});

export type ApiEnv = z.infer<typeof schema>;

export function loadApiEnv(source: Record<string, string | undefined> = process.env): ApiEnv {
  const cleaned: Record<string, string> = {};
  for (const [key, value] of Object.entries(source)) {
    if (value !== undefined && value.trim() !== "") cleaned[key] = value.trim();
  }
  // Accept API_HOST / API_PORT aliases from .env.example.
  if (!cleaned.HOST && cleaned.API_HOST) cleaned.HOST = cleaned.API_HOST;
  if (!cleaned.PORT && cleaned.API_PORT) cleaned.PORT = cleaned.API_PORT;
  const result = schema.safeParse(cleaned);
  if (!result.success) {
    const lines = result.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`);
    throw new Error(`[api/env] Invalid configuration:\n${lines.join("\n")}`);
  }
  return result.data;
}
