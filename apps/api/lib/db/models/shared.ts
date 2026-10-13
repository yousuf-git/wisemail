import type { InferSchemaType } from "mongoose";
import { Schema } from "mongoose";

/**
 * `EncryptedValue` sub-document (DBD §1 rule 9). Produced by `lib/crypto/envelope.ts`; never
 * serialized to the client. Display values (`last4`) are stored beside it, in plain.
 */
export const EncryptedValueSchema = new Schema(
  {
    ciphertext: { type: String, required: true },
    iv: { type: String, required: true },
    tag: { type: String, required: true },
    wrappedDek: { type: String, required: true },
    kekId: { type: String, required: true },
  },
  { _id: false },
);

export type EncryptedValueDoc = InferSchemaType<typeof EncryptedValueSchema>;
