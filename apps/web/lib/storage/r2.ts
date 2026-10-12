import "server-only";

import {
  CopyObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { env } from "@/lib/env";
import { contentDisposition } from "./disposition";
import type { ObjectStore, PresignGetOptions, PresignPutOptions, StoredObject } from "./types";

/** `https://<account>.r2.cloudflarestorage.com` (TRD §1 env). */
export const r2Endpoint = (accountId: string) => `https://${accountId}.r2.cloudflarestorage.com`;

const notFound = (error: unknown) =>
  error instanceof S3ServiceException &&
  (error.$metadata.httpStatusCode === 404 ||
    error.name === "NoSuchKey" ||
    error.name === "NotFound");

const DELETE_BATCH = 1000;

/** Cloudflare R2 through the S3 API: `region: "auto"`, account endpoint, private bucket. */
export class R2Store implements ObjectStore {
  constructor(
    private readonly client: S3Client,
    private readonly bucket: string,
  ) {}

  async put(key: string, body: Buffer | Uint8Array, options: { contentType?: string } = {}) {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: options.contentType,
      }),
    );
  }

  async get(key: string): Promise<StoredObject | null> {
    try {
      const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      const bytes = await res.Body!.transformToByteArray();
      return { body: Buffer.from(bytes), contentType: res.ContentType };
    } catch (error) {
      if (notFound(error)) return null;
      throw error;
    }
  }

  async head(key: string) {
    try {
      const res = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return { size: res.ContentLength ?? 0, contentType: res.ContentType };
    } catch (error) {
      if (notFound(error)) return null;
      throw error;
    }
  }

  async delete(keys: string[]) {
    for (let i = 0; i < keys.length; i += DELETE_BATCH) {
      const batch = keys.slice(i, i + DELETE_BATCH);
      if (batch.length === 0) continue;
      await this.client.send(
        new DeleteObjectsCommand({
          Bucket: this.bucket,
          Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true },
        }),
      );
    }
  }

  async copy(from: string, to: string) {
    await this.client.send(
      new CopyObjectCommand({
        Bucket: this.bucket,
        Key: to,
        CopySource: `${this.bucket}/${from.split("/").map(encodeURIComponent).join("/")}`,
      }),
    );
  }

  async deletePrefix(prefix: string) {
    let token: string | undefined;
    let total = 0;
    do {
      const page = await this.client.send(
        new ListObjectsV2Command({ Bucket: this.bucket, Prefix: prefix, ContinuationToken: token }),
      );
      const keys = (page.Contents ?? []).flatMap((o) => (o.Key ? [o.Key] : []));
      await this.delete(keys);
      total += keys.length;
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);
    return total;
  }

  presignGet(key: string, options: PresignGetOptions) {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ResponseContentDisposition: contentDisposition(options.disposition, options.filename),
        ...(options.contentType ? { ResponseContentType: options.contentType } : {}),
      }),
      { expiresIn: options.expiresIn },
    );
  }

  async presignPut(key: string, options: PresignPutOptions) {
    const url = await getSignedUrl(
      this.client,
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ContentType: options.contentType,
        ContentLength: options.size,
      }),
      {
        expiresIn: options.expiresIn,
        // Sign both, so the upload must send exactly this type and size.
        signableHeaders: new Set(["content-type", "content-length"]),
      },
    );
    return {
      url,
      headers: {
        "content-type": options.contentType,
        "content-length": String(options.size),
      },
    };
  }
}

const globalForR2 = globalThis as unknown as { __wisemailR2?: R2Store };

export function getR2Store(): R2Store {
  if (globalForR2.__wisemailR2) return globalForR2.__wisemailR2;
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } = env;
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET) {
    throw new Error(
      "R2 is not configured (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET).",
    );
  }
  const client = new S3Client({
    region: "auto",
    endpoint: r2Endpoint(R2_ACCOUNT_ID),
    credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
  });
  globalForR2.__wisemailR2 = new R2Store(client, R2_BUCKET);
  return globalForR2.__wisemailR2;
}

/** Test seam: a store around a caller-provided client (e.g. presign-only checks). */
export const createR2Store = (client: S3Client, bucket: string) => new R2Store(client, bucket);
