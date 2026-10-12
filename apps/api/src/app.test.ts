import { afterAll, describe, expect, it } from "vitest";

import { buildApp } from "./app.js";

describe("api smoke", () => {
  const appPromise = buildApp();

  afterAll(async () => {
    const app = await appPromise;
    await app.close();
  });

  it("GET /health", async () => {
    const app = await appPromise;
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, service: "wisemail-api" });
  });

  it("GET /api/v1/_meta resolves shared package", async () => {
    const app = await appPromise;
    const res = await app.inject({ method: "GET", url: "/api/v1/_meta" });
    expect(res.statusCode).toBe(200);
    expect(res.json().plans).toEqual(["free", "pro", "team", "agency"]);
  });
});
