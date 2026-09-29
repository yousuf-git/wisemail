import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { mkdirSync, mkdtempSync } from "node:fs";
import { mkdir, readFile, readdir, rm, stat, writeFile, copyFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { env } from "@/lib/env";
import { contentDisposition } from "./disposition";
import type { ObjectStore, PresignGetOptions, PresignPutOptions, StoredObject } from "./types";

/**
 * Local-disk object store for `STORAGE_MODE=fake` (dev and tests). Objects live under
 * `.data/storage` (tests: a fresh temp dir). "Presigned" URLs are short-lived HMAC tokens served
 * by `app/api/dev-storage/[token]`: the token carries the operation, key, expiry and (for
 * uploads) the signed size and type, so it behaves like an R2 presigned URL. The route refuses
 * to run outside fake mode and in production.
 */

const globalForFake = globalThis as unknown as { __wisemailFakeStorageRoot?: string };

export function fakeStorageRoot(): string {
  if (!globalForFake.__wisemailFakeStorageRoot) {
    if (env.NODE_ENV === "test") {
      globalForFake.__wisemailFakeStorageRoot = mkdtempSync(
        path.join(tmpdir(), "wisemail-storage-"),
      );
    } else {
      const root = path.resolve(process.cwd(), ".data", "storage");
      mkdirSync(root, { recursive: true });
      globalForFake.__wisemailFakeStorageRoot = root;
    }
  }
  return globalForFake.__wisemailFakeStorageRoot;
}

/** Resolves a key inside the root; refuses anything that would escape it. */
function locate(key: string): string {
  if (
    !key ||
    key.startsWith("/") ||
    key.includes("\\") ||
    key.split("/").some((s) => s === ".." || s === "." || s === "")
  ) {
    throw new Error("Invalid storage key");
  }
  const root = fakeStorageRoot();
  const file = path.resolve(root, key);
  if (!file.startsWith(root + path.sep)) throw new Error("Invalid storage key");
  return file;
}

const metaPath = (file: string) => `${file}.meta.json`;

/* ------------------------------------------------------------------ tokens */

export type FakeTokenPayload = {
  /** Operation. */
  m: "get" | "put";
  /** Key. */
  k: string;
  /** Expiry, epoch ms. */
  e: number;
  disposition?: "inline" | "attachment";
  filename?: string;
  contentType?: string;
  size?: number;
};

const secret = () =>
  createHmac("sha256", env.BETTER_AUTH_SECRET).update("wisemail:fake-storage:v1").digest();

const b64 = (buf: Buffer | string) => Buffer.from(buf).toString("base64url");

export function signFakeToken(payload: FakeTokenPayload): string {
  const body = b64(JSON.stringify(payload));
  const sig = b64(createHmac("sha256", secret()).update(body).digest());
  return `${body}.${sig}`;
}

/** Returns the payload of a valid, unexpired token; null otherwise. */
export function verifyFakeToken(token: string, now = Date.now()): FakeTokenPayload | null {
  const [body, sig, extra] = token.split(".");
  if (!body || !sig || extra !== undefined) return null;
  const expected = createHmac("sha256", secret()).update(body).digest();
  let given: Buffer;
  try {
    given = Buffer.from(sig, "base64url");
  } catch {
    return null;
  }
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as FakeTokenPayload;
    if (typeof payload.k !== "string" || typeof payload.e !== "number" || payload.e < now)
      return null;
    if (payload.m !== "get" && payload.m !== "put") return null;
    return payload;
  } catch {
    return null;
  }
}

const urlFor = (token: string) => `${env.APP_URL.replace(/\/$/, "")}/api/dev-storage/${token}`;

/* ------------------------------------------------------------------ store */

export class FakeStore implements ObjectStore {
  async put(key: string, body: Buffer | Uint8Array, options: { contentType?: string } = {}) {
    const file = locate(key);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, body);
    await writeFile(metaPath(file), JSON.stringify({ contentType: options.contentType }));
  }

  async get(key: string): Promise<StoredObject | null> {
    const file = locate(key);
    try {
      const body = await readFile(file);
      const meta = await readFile(metaPath(file), "utf8").catch(() => "{}");
      return { body, contentType: (JSON.parse(meta) as { contentType?: string }).contentType };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  async head(key: string) {
    const file = locate(key);
    try {
      const info = await stat(file);
      const meta = await readFile(metaPath(file), "utf8").catch(() => "{}");
      return {
        size: info.size,
        contentType: (JSON.parse(meta) as { contentType?: string }).contentType,
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  async delete(keys: string[]) {
    for (const key of keys) {
      const file = locate(key);
      await rm(file, { force: true });
      await rm(metaPath(file), { force: true });
    }
  }

  async copy(from: string, to: string) {
    const source = locate(from);
    const target = locate(to);
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(source, target);
    await copyFile(metaPath(source), metaPath(target)).catch(() => undefined);
  }

  async deletePrefix(prefix: string) {
    const root = fakeStorageRoot();
    let count = 0;
    const walk = async (dir: string): Promise<void> => {
      let entries;
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) await walk(full);
        else if (!entry.name.endsWith(".meta.json")) {
          const key = path.relative(root, full).split(path.sep).join("/");
          if (key.startsWith(prefix)) {
            await rm(full, { force: true });
            await rm(metaPath(full), { force: true });
            count++;
          }
        }
      }
    };
    await walk(root);
    return count;
  }

  async presignGet(key: string, options: PresignGetOptions) {
    locate(key);
    return urlFor(
      signFakeToken({
        m: "get",
        k: key,
        e: Date.now() + options.expiresIn * 1000,
        disposition: options.disposition,
        filename: options.filename,
        contentType: options.contentType,
      }),
    );
  }

  async presignPut(key: string, options: PresignPutOptions) {
    locate(key);
    return {
      url: urlFor(
        signFakeToken({
          m: "put",
          k: key,
          e: Date.now() + options.expiresIn * 1000,
          contentType: options.contentType,
          size: options.size,
        }),
      ),
      headers: { "content-type": options.contentType, "content-length": String(options.size) },
    };
  }
}

export const responseDisposition = (payload: FakeTokenPayload) =>
  contentDisposition(payload.disposition ?? "attachment", payload.filename);
