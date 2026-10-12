export type StoredObject = { body: Buffer; contentType?: string };

export type PresignGetOptions = {
  /** Seconds. */
  expiresIn: number;
  disposition: "inline" | "attachment";
  /** Original name, used for `Content-Disposition`. */
  filename?: string;
  contentType?: string;
};

export type PresignPutOptions = {
  expiresIn: number;
  /** Signed: the upload must send exactly this type... */
  contentType: string;
  /** ...and exactly this many bytes. */
  size: number;
};

/** What both R2 and the local fake implement. Keys come from `storageKeys`. */
export interface ObjectStore {
  put(key: string, body: Buffer | Uint8Array, options?: { contentType?: string }): Promise<void>;
  get(key: string): Promise<StoredObject | null>;
  head(key: string): Promise<{ size: number; contentType?: string } | null>;
  /** Missing keys are not an error. Up to 1,000 keys per call on R2; batched here. */
  delete(keys: string[]): Promise<void>;
  copy(from: string, to: string): Promise<void>;
  /** Deletes every object under `prefix`; resolves with the count. */
  deletePrefix(prefix: string): Promise<number>;
  presignGet(key: string, options: PresignGetOptions): Promise<string>;
  presignPut(
    key: string,
    options: PresignPutOptions,
  ): Promise<{ url: string; headers: Record<string, string> }>;
}
