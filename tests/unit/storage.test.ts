import { S3Client } from "@aws-sdk/client-s3";
import { describe, expect, it } from "vitest";

import { contentDisposition, isInlineImageType } from "@/lib/storage/disposition";
import { storageKeys } from "@/lib/storage/keys";
import { createR2Store, r2Endpoint } from "@/lib/storage/r2";
import { FakeStore, signFakeToken, verifyFakeToken } from "@/lib/storage/fake";

describe("storage keys (TRD §2.13)", () => {
  it("builds the documented layout, org first", () => {
    expect(storageKeys.inboundRaw("o1", "e1")).toBe("orgs/o1/inbound/e1/raw.eml");
    expect(storageKeys.inboundAttachment("o1", "e1", "a1")).toBe("orgs/o1/inbound/e1/att/a1");
    expect(storageKeys.outboundAttachment("o1", "e1", "a1")).toBe("orgs/o1/outbound/e1/att/a1");
    expect(storageKeys.draftUpload("o1", "d1", "a1")).toBe("drafts/o1/d1/a1");
  });

  it("refuses ids that could escape the layout", () => {
    expect(() => storageKeys.inboundRaw("../x", "e1")).toThrow();
    expect(() => storageKeys.draftUpload("o1", "d/1", "a1")).toThrow();
  });
});

describe("Content-Disposition", () => {
  it("carries an ASCII fallback and the exact UTF-8 name", () => {
    const header = contentDisposition("attachment", 'Rechnung "März" ✓.pdf');
    expect(header).toContain('attachment; filename="Rechnung _M_rz_ _.pdf"');
    expect(header).toContain("filename*=UTF-8''Rechnung%20%22M%C3%A4rz%22%20%E2%9C%93.pdf");
  });

  it("removes path separators and control characters", () => {
    const header = contentDisposition("attachment", "a/b\\c\u0000.txt");
    expect(header).toContain('filename="abc.txt"');
  });

  it("allows only safe image types inline (never SVG)", () => {
    expect(isInlineImageType("image/png")).toBe(true);
    expect(isInlineImageType("image/jpeg; charset=x")).toBe(true);
    expect(isInlineImageType("image/svg+xml")).toBe(false);
    expect(isInlineImageType("application/pdf")).toBe(false);
  });
});

describe("R2 presigning (offline)", () => {
  const client = new S3Client({
    region: "auto",
    endpoint: r2Endpoint("acct123"),
    credentials: { accessKeyId: "AKIATEST", secretAccessKey: "secret" },
  });
  const store = createR2Store(client, "wisemail-test");

  it("derives the endpoint from the account id", () => {
    expect(r2Endpoint("acct123")).toBe("https://acct123.r2.cloudflarestorage.com");
  });

  it("signs a 5-minute GET with the response disposition", async () => {
    const url = new URL(
      await store.presignGet("orgs/o1/inbound/e1/att/a1", {
        expiresIn: 300,
        disposition: "attachment",
        filename: "Report.pdf",
        contentType: "application/pdf",
      }),
    );
    expect(url.host).toBe("wisemail-test.acct123.r2.cloudflarestorage.com");
    expect(url.searchParams.get("X-Amz-Expires")).toBe("300");
    expect(url.searchParams.get("response-content-disposition")).toContain(
      'attachment; filename="Report.pdf"',
    );
    expect(url.searchParams.get("response-content-type")).toBe("application/pdf");
  });

  it("signs the size and type of an upload", async () => {
    const { url, headers } = await store.presignPut("drafts/o1/d1/a1", {
      expiresIn: 300,
      contentType: "image/png",
      size: 1234,
    });
    const parsed = new URL(url);
    expect(parsed.searchParams.get("X-Amz-Expires")).toBe("300");
    const signed = parsed.searchParams.get("X-Amz-SignedHeaders") ?? "";
    expect(signed).toContain("content-type");
    expect(signed).toContain("content-length");
    expect(headers).toEqual({ "content-type": "image/png", "content-length": "1234" });
  });
});

describe("fake store tokens", () => {
  it("verifies, expires and rejects tampering", () => {
    const token = signFakeToken({ m: "get", k: "orgs/o1/x", e: Date.now() + 60_000 });
    expect(verifyFakeToken(token)?.k).toBe("orgs/o1/x");
    expect(verifyFakeToken(token, Date.now() + 120_000)).toBeNull();
    const [body, sig] = token.split(".");
    const forged = Buffer.from(
      JSON.stringify({ m: "get", k: "orgs/o2/x", e: Date.now() + 60_000 }),
    ).toString("base64url");
    expect(verifyFakeToken(`${forged}.${sig}`)).toBeNull();
    expect(verifyFakeToken(`${body}.AAAA`)).toBeNull();
    expect(verifyFakeToken("garbage")).toBeNull();
  });

  it("stores, heads, copies and deletes objects, and refuses path traversal", async () => {
    const store = new FakeStore();
    await store.put("orgs/o1/a.txt", Buffer.from("hello"), { contentType: "text/plain" });
    expect(await store.head("orgs/o1/a.txt")).toEqual({ size: 5, contentType: "text/plain" });
    await store.copy("orgs/o1/a.txt", "orgs/o1/b.txt");
    expect((await store.get("orgs/o1/b.txt"))!.body.toString()).toBe("hello");
    expect(await store.deletePrefix("orgs/o1/")).toBe(2);
    expect(await store.get("orgs/o1/a.txt")).toBeNull();
    await expect(store.put("../escape", Buffer.from("x"))).rejects.toThrow();
    await expect(store.get("orgs/../../etc/passwd")).rejects.toThrow();
  });
});
