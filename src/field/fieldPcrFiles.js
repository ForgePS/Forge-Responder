/**
 * Billing photos on a field patient care report (driver's license or ID, insurance card, other papers).
 *
 * On the phone they're kept encrypted with the report (fieldRecords.storeSealedAttachment). When the report is sent
 * they go up first, before the chart is written, so a report posted from the phone still gets its photos (the server
 * only takes new files while a report is a draft). Each step is recorded on the attachment, so a retry after a lost
 * connection picks up where it stopped. Once a photo is on the server its copy on the phone is deleted.
 */
import { pcrFileRecord } from "../lib/pcr/pcrFiles.js";
import { FieldRejectedError } from "./fieldErrors.js";

/** Photos on a report not yet fully on the server. */
export function pendingPcrPhotos(record) {
  return (record?.attachments || []).filter((a) => !a.uploaded?.recorded);
}

function isRefused(error) {
  const code = String(error?.code || "");
  return code.includes("permission-denied") || code.includes("unauthorized");
}

/**
 * Upload a report's pending billing photos and record each one on the report.
 * @param {object} record the field record (opened)
 * @param {{ departmentId: string, actor: object, setAttachments: (a: object[]) => Promise<unknown> }} ctx
 * @param {{ newId: () => string, readBlob: (attachment: object) => Promise<Blob|null>,
 *   putBytes: (path: string, blob: Blob, contentType: string) => Promise<void>, fileExists: (path: string) => Promise<boolean>,
 *   recordExists: (departmentId: string, pcrId: string, fileId: string) => Promise<boolean>,
 *   writeRecord: (departmentId: string, pcrId: string, record: object) => Promise<void>, dropLocal: (id: string) => Promise<void> }} io
 */
export async function uploadPcrPhotos(record, ctx, io) {
  const attachments = [...(record.attachments || [])];
  const pcrId = record.data.id;
  const save = () => ctx.setAttachments(attachments);
  try {
    for (let i = 0; i < attachments.length; i += 1) {
      if (attachments[i].uploaded?.recorded) continue;
      const retry = Boolean(attachments[i].fileId);
      if (!retry) {
        attachments[i] = { ...attachments[i], fileId: io.newId() };
        await save();
      }
      const att = attachments[i];
      const file = pcrFileRecord({
        departmentId: ctx.departmentId,
        pcrId,
        id: att.fileId,
        kind: att.kind || "other",
        contentType: att.type,
        size: att.size,
        actor: ctx.actor,
        source: "field-app",
      });
      if (!att.uploaded?.bytes) {
        if (!(retry && (await io.fileExists(file.storagePath).catch(() => false)))) {
          const blob = await io.readBlob(att);
          if (!blob) throw new FieldRejectedError("A billing photo on this report is missing from this device. Remove it and send again.");
          await io.putBytes(file.storagePath, blob, file.contentType);
        }
        attachments[i] = { ...attachments[i], uploaded: { storagePath: file.storagePath, bytes: true } };
        await save();
      }
      if (!(retry && (await io.recordExists(ctx.departmentId, pcrId, att.fileId).catch(() => false)))) {
        await io.writeRecord(ctx.departmentId, pcrId, file);
      }
      attachments[i] = { ...attachments[i], uploaded: { ...attachments[i].uploaded, recorded: true } };
      await save();
      await io.dropLocal(attachments[i].id);
    }
  } catch (error) {
    if (isRefused(error)) {
      throw new FieldRejectedError("The server refused the billing photos on this report. If it has been posted, ask a supervisor to unlock it. Your photos are kept on this device.");
    }
    throw error;
  }
  return attachments;
}
