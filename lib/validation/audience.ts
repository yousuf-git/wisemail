import { z } from "zod";

import { isValidEmail } from "@/lib/mail/address";
import { VARIABLE_KEY } from "@/lib/mail/template-vars";

export const objectId = z.string().regex(/^[0-9a-f]{24}$/i, "Invalid id");
const email = z
  .string()
  .trim()
  .toLowerCase()
  .refine(isValidEmail, { message: "Enter a valid email address" });
const name = z.string().trim().max(100);
const propertyValue = z.union([z.string().trim().max(500), z.number().finite()]);

export const PROPERTY_KEY = /^[a-z][a-z0-9_]{0,49}$/;

/* --------------------------------------------- contacts -------------------------------------------- */

export const topicSubscription = z.object({
  topicId: objectId,
  subscription: z.enum(["opt_in", "opt_out"]),
});

export const createContactInput = z.object({
  connectionId: objectId,
  email,
  firstName: name.optional(),
  lastName: name.optional(),
  unsubscribed: z.boolean().default(false),
  properties: z.record(z.string(), propertyValue).default({}),
  segmentIds: z.array(objectId).max(100).default([]),
  topicSubscriptions: z.array(topicSubscription).max(100).default([]),
});
export type CreateContactInput = z.input<typeof createContactInput>;

export const updateContactInput = z.object({
  id: objectId,
  firstName: name.nullable().optional(),
  lastName: name.nullable().optional(),
  unsubscribed: z.boolean().optional(),
  /** `null` clears a property. */
  properties: z.record(z.string(), propertyValue.nullable()).optional(),
});
export type UpdateContactInput = z.input<typeof updateContactInput>;

export const setContactSegmentsInput = z.object({
  id: objectId,
  segmentIds: z.array(objectId).max(100),
});
export const setContactTopicsInput = z.object({
  id: objectId,
  subscriptions: z.array(topicSubscription).max(100),
});

export const importRow = z.object({
  email,
  firstName: name.optional(),
  lastName: name.optional(),
  properties: z.record(z.string(), propertyValue).optional(),
});

/** A batch is at most this many rows; each row is one to three Resend calls. */
export const IMPORT_BATCH_SIZE = 25;
/** Above this many rows the browser hands the import to a background job. */
export const IMPORT_INLINE_LIMIT = 500;
export const IMPORT_MAX_ROWS = 20_000;

export const importBatchInput = z.object({
  connectionId: objectId,
  /** 1-based file line numbers ride along so errors point at the right line. */
  rows: z
    .array(z.object({ row: z.number().int().positive(), value: importRow }))
    .min(1)
    .max(IMPORT_BATCH_SIZE),
  segmentIds: z.array(objectId).max(20).default([]),
  updateExisting: z.boolean().default(false),
});
export type ImportBatchInput = z.input<typeof importBatchInput>;

export const createImportInput = z.object({
  connectionId: objectId,
  segmentIds: z.array(objectId).max(20).default([]),
  updateExisting: z.boolean().default(false),
  total: z.number().int().positive().max(IMPORT_MAX_ROWS),
});
export const appendImportRowsInput = z.object({
  importId: objectId,
  rows: z
    .array(z.object({ row: z.number().int().positive(), value: importRow }))
    .min(1)
    .max(1000),
});

/* -------------------------------- segments, topics, properties ------------------------------------ */

export const createSegmentInput = z.object({
  connectionId: objectId,
  name: z.string().trim().min(1, "Give the segment a name").max(100),
});
export const renameSegmentInput = z.object({ id: objectId, name: createSegmentInput.shape.name });

export const createTopicInput = z.object({
  connectionId: objectId,
  name: z.string().trim().min(1, "Give the topic a name").max(100),
  description: z.string().trim().max(300).default(""),
  defaultSubscription: z.enum(["opt_in", "opt_out"]).default("opt_in"),
});
export const updateTopicInput = z.object({
  id: objectId,
  name: createTopicInput.shape.name.optional(),
  description: z.string().trim().max(300).optional(),
});

export const createPropertyInput = z
  .object({
    connectionId: objectId,
    key: z
      .string()
      .trim()
      .toLowerCase()
      .regex(
        PROPERTY_KEY,
        "Use lowercase letters, numbers and underscores, starting with a letter",
      ),
    type: z.enum(["string", "number"]),
    fallbackValue: z
      .union([z.string().trim().max(500), z.number().finite(), z.null()])
      .default(null),
  })
  .superRefine((value, ctx) => {
    if (
      value.type === "number" &&
      value.fallbackValue !== null &&
      typeof value.fallbackValue !== "number"
    ) {
      ctx.addIssue({ code: "custom", path: ["fallbackValue"], message: "Use a number" });
    }
  });
export const updatePropertyInput = z.object({
  id: objectId,
  fallbackValue: z.union([z.string().trim().max(500), z.number().finite(), z.null()]),
});

/* ------------------------------------------------ templates ---------------------------------------- */

export const templateVariableInput = z.object({
  key: z
    .string()
    .trim()
    .regex(VARIABLE_KEY, "Start with a letter; letters, numbers and underscores"),
  type: z.enum(["string", "number"]).default("string"),
  fallback: z.union([z.string().max(500), z.number().finite(), z.null()]).default(null),
});

const templateFields = {
  name: z.string().trim().min(1, "Give the template a name").max(100),
  alias: z
    .string()
    .trim()
    .max(60)
    .regex(/^[a-z0-9][a-z0-9-]*$/i, "Letters, numbers and dashes only")
    .or(z.literal(""))
    .default(""),
  subject: z.string().trim().max(998).default(""),
  from: z.string().trim().max(320).default(""),
  html: z.string().min(1, "Add some HTML").max(2_000_000),
  text: z.string().max(2_000_000).default(""),
  variables: z.array(templateVariableInput).max(50).default([]),
};

const uniqueKeys = (variables: { key: string }[]) =>
  new Set(variables.map((v) => v.key.toLowerCase())).size === variables.length;

export const createTemplateInput = z
  .object({ connectionId: objectId, ...templateFields })
  .refine((v) => uniqueKeys(v.variables), {
    path: ["variables"],
    message: "Variable names must be unique",
  });
export type CreateTemplateInput = z.input<typeof createTemplateInput>;

export const updateTemplateInput = z
  .object({
    id: objectId,
    version: z.number().int().min(0),
    ...templateFields,
    /** Publish right after saving (always the case for an already published template). */
    publish: z.boolean().default(false),
  })
  .refine((v) => uniqueKeys(v.variables), {
    path: ["variables"],
    message: "Variable names must be unique",
  });
export type UpdateTemplateInput = z.input<typeof updateTemplateInput>;

export const duplicateTemplateInput = z.object({ id: objectId, connectionId: objectId.optional() });

/* ------------------------------------------------ broadcasts --------------------------------------- */

const broadcastFields = {
  name: z.string().trim().min(1, "Give the broadcast a name").max(150),
  segmentId: objectId,
  senderId: objectId,
  subject: z.string().trim().min(1, "Add a subject").max(998),
  previewText: z.string().trim().max(200).default(""),
  topicId: objectId.nullable().default(null),
  html: z.string().min(1, "Write the message").max(2_000_000),
  templateId: objectId.nullable().default(null),
};

export const createBroadcastInput = z.object({ connectionId: objectId, ...broadcastFields });
export type CreateBroadcastInput = z.input<typeof createBroadcastInput>;
export const updateBroadcastInput = z.object({
  id: objectId,
  version: z.number().int().min(0),
  ...broadcastFields,
});
export type UpdateBroadcastInput = z.input<typeof updateBroadcastInput>;

export const sendBroadcastInput = z.object({
  id: objectId,
  scheduledAt: z.coerce.date().optional(),
});
export const sendBroadcastTestInput = z.object({ id: objectId, to: email.optional() });
