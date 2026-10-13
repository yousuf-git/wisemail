"use server";

import { z } from "zod";

import { orgAction } from "@/lib/actions/org-action";
import type { ActionResult } from "@/lib/actions/result";
import type {
  ContactImportStatusDTO,
  ContactRowDTO,
  ImportBatchResult,
  PropertyDTO,
  SegmentDTO,
  TopicDTO,
} from "@/lib/dto/audience";
import {
  appendImportRows,
  auditImportFinished,
  createContact,
  createContactImport,
  deleteContact,
  getContactImport,
  importContactsBatch,
  setContactSegments,
  setContactTopics,
  startContactImport,
  updateContact,
} from "@/lib/services/contacts";
import {
  createContactProperty,
  deleteContactProperty,
  updateContactProperty,
} from "@/lib/services/contact-properties";
import { createSegment, deleteSegment, renameSegment } from "@/lib/services/segments";
import { createTopic, deleteTopic, updateTopic } from "@/lib/services/topics";
import {
  appendImportRowsInput,
  createContactInput,
  createImportInput,
  createPropertyInput,
  createSegmentInput,
  createTopicInput,
  importBatchInput,
  objectId,
  renameSegmentInput,
  setContactSegmentsInput,
  setContactTopicsInput,
  updateContactInput,
  updatePropertyInput,
  updateTopicInput,
  type CreateContactInput,
  type ImportBatchInput,
  type UpdateContactInput,
} from "@/lib/validation/audience";

/* Each action checks the permission the service checks again: contacts (Support may only unsubscribe). */

const idInput = z.object({ id: objectId });
const removed = (id: string) => ({ id });

const create = orgAction({ id: "audience.create", input: createContactInput }, ({ ctx, input }) =>
  createContact(ctx, input),
);
const update = orgAction({ id: "audience.update", input: updateContactInput }, ({ ctx, input }) =>
  updateContact(ctx, input),
);
const segmentsOf = orgAction({ id: "audience.segmentsOf", input: setContactSegmentsInput }, ({ ctx, input }) =>
  setContactSegments(ctx, input),
);
const topicsOf = orgAction({ id: "audience.topicsOf", input: setContactTopicsInput }, ({ ctx, input }) =>
  setContactTopics(ctx, input),
);
const removeContact = orgAction({ id: "audience.removeContact", input: idInput }, async ({ ctx, input }) => {
  await deleteContact(ctx, input.id);
  return removed(input.id);
});

export async function createContactAction(
  orgSlug: string,
  input: CreateContactInput,
): Promise<ActionResult<ContactRowDTO>> {
  return create(orgSlug, input);
}
export async function updateContactAction(
  orgSlug: string,
  input: UpdateContactInput,
): Promise<ActionResult<ContactRowDTO>> {
  return update(orgSlug, input);
}
export async function setContactSegmentsAction(
  orgSlug: string,
  input: z.input<typeof setContactSegmentsInput>,
): Promise<ActionResult<ContactRowDTO>> {
  return segmentsOf(orgSlug, input);
}
export async function setContactTopicsAction(
  orgSlug: string,
  input: z.input<typeof setContactTopicsInput>,
): Promise<ActionResult<ContactRowDTO>> {
  return topicsOf(orgSlug, input);
}
export async function deleteContactAction(
  orgSlug: string,
  input: { id: string },
): Promise<ActionResult<{ id: string }>> {
  return removeContact(orgSlug, input);
}

/* ---- CSV import ---- */

const batch = orgAction(
  { id: "audience.batch", input: importBatchInput, permission: "contact:import" },
  ({ ctx, input }) => importContactsBatch(ctx, input),
);
const startUpload = orgAction(
  { id: "audience.startUpload", input: createImportInput, permission: "contact:import" },
  ({ ctx, input }) => createContactImport(ctx, input),
);
const appendRows = orgAction(
  { id: "audience.appendRows", input: appendImportRowsInput, permission: "contact:import" },
  ({ ctx, input }) => appendImportRows(ctx, input),
);
const start = orgAction(
  { id: "audience.start", input: z.object({ importId: objectId }), permission: "contact:import" },
  ({ ctx, input }) => startContactImport(ctx, input.importId),
);
const status = orgAction(
  { id: "audience.status", input: z.object({ importId: objectId }), permission: "contact:import" },
  ({ ctx, input }) => getContactImport(ctx, input.importId),
);
const finished = orgAction(
  { id: "audience.finished",
    input: z.object({
      connectionId: objectId,
      created: z.number().int().min(0),
      updated: z.number().int().min(0),
      skipped: z.number().int().min(0),
      failed: z.number().int().min(0),
    }),
    permission: "contact:import",
  },
  async ({ ctx, input }) => {
    await auditImportFinished(ctx, input);
    return { ok: true as const };
  },
);

export async function importContactsBatchAction(
  orgSlug: string,
  input: ImportBatchInput,
): Promise<ActionResult<ImportBatchResult>> {
  return batch(orgSlug, input);
}
export async function createContactImportAction(
  orgSlug: string,
  input: z.input<typeof createImportInput>,
): Promise<ActionResult<{ importId: string }>> {
  return startUpload(orgSlug, input);
}
export async function appendImportRowsAction(
  orgSlug: string,
  input: z.input<typeof appendImportRowsInput>,
): Promise<ActionResult<{ received: number }>> {
  return appendRows(orgSlug, input);
}
export async function startContactImportAction(
  orgSlug: string,
  input: { importId: string },
): Promise<ActionResult<ContactImportStatusDTO>> {
  return start(orgSlug, input);
}
export async function getContactImportAction(
  orgSlug: string,
  input: { importId: string },
): Promise<ActionResult<ContactImportStatusDTO>> {
  return status(orgSlug, input);
}
export async function importFinishedAction(
  orgSlug: string,
  input: {
    connectionId: string;
    created: number;
    updated: number;
    skipped: number;
    failed: number;
  },
): Promise<ActionResult<{ ok: true }>> {
  return finished(orgSlug, input);
}

/* ---- segments, topics, properties ---- */

const manage = "audience:manage" as const;
const segCreate = orgAction({ id: "audience.segCreate", input: createSegmentInput, permission: manage }, ({ ctx, input }) =>
  createSegment(ctx, input),
);
const segRename = orgAction({ id: "audience.segRename", input: renameSegmentInput, permission: manage }, ({ ctx, input }) =>
  renameSegment(ctx, input),
);
const segDelete = orgAction({ id: "audience.segDelete", input: idInput, permission: manage }, async ({ ctx, input }) => {
  await deleteSegment(ctx, input.id);
  return removed(input.id);
});
const topCreate = orgAction({ id: "audience.topCreate", input: createTopicInput, permission: manage }, ({ ctx, input }) =>
  createTopic(ctx, input),
);
const topUpdate = orgAction({ id: "audience.topUpdate", input: updateTopicInput, permission: manage }, ({ ctx, input }) =>
  updateTopic(ctx, input),
);
const topDelete = orgAction({ id: "audience.topDelete", input: idInput, permission: manage }, async ({ ctx, input }) => {
  await deleteTopic(ctx, input.id);
  return removed(input.id);
});
const propCreate = orgAction({ id: "audience.propCreate", input: createPropertyInput, permission: manage }, ({ ctx, input }) =>
  createContactProperty(ctx, input),
);
const propUpdate = orgAction({ id: "audience.propUpdate", input: updatePropertyInput, permission: manage }, ({ ctx, input }) =>
  updateContactProperty(ctx, input),
);
const propDelete = orgAction({ id: "audience.propDelete", input: idInput, permission: manage }, async ({ ctx, input }) => {
  await deleteContactProperty(ctx, input.id);
  return removed(input.id);
});

export async function createSegmentAction(
  orgSlug: string,
  input: z.input<typeof createSegmentInput>,
): Promise<ActionResult<SegmentDTO>> {
  return segCreate(orgSlug, input);
}
export async function renameSegmentAction(
  orgSlug: string,
  input: z.input<typeof renameSegmentInput>,
): Promise<ActionResult<SegmentDTO>> {
  return segRename(orgSlug, input);
}
export async function deleteSegmentAction(
  orgSlug: string,
  input: { id: string },
): Promise<ActionResult<{ id: string }>> {
  return segDelete(orgSlug, input);
}
export async function createTopicAction(
  orgSlug: string,
  input: z.input<typeof createTopicInput>,
): Promise<ActionResult<TopicDTO>> {
  return topCreate(orgSlug, input);
}
export async function updateTopicAction(
  orgSlug: string,
  input: z.input<typeof updateTopicInput>,
): Promise<ActionResult<TopicDTO>> {
  return topUpdate(orgSlug, input);
}
export async function deleteTopicAction(
  orgSlug: string,
  input: { id: string },
): Promise<ActionResult<{ id: string }>> {
  return topDelete(orgSlug, input);
}
export async function createPropertyAction(
  orgSlug: string,
  input: z.input<typeof createPropertyInput>,
): Promise<ActionResult<PropertyDTO>> {
  return propCreate(orgSlug, input);
}
export async function updatePropertyAction(
  orgSlug: string,
  input: z.input<typeof updatePropertyInput>,
): Promise<ActionResult<PropertyDTO>> {
  return propUpdate(orgSlug, input);
}
export async function deletePropertyAction(
  orgSlug: string,
  input: { id: string },
): Promise<ActionResult<{ id: string }>> {
  return propDelete(orgSlug, input);
}
