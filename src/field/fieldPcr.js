/**
 * ePCR records in FORGE FIELD (pure; the sync handler in fieldSyncHandlers.js does the I/O).
 *
 * Device record data (kind "pcr", sealed on the device by fieldPhi.js):
 *   { id, uuid, number, status: "draft"|"posted", crewUids: string[], incidentNumber, unit, nemsis }
 * where `nemsis` is the NEMSIS PatientCareReport document (src/lib/nemsis/pcrModel.js).
 *
 * Server document departments/{id}/pcrs/{id}: the same fields plus bookkeeping (createdBy, updatedBy, postedAt,
 * lastWrite). Readable only by the crew on it and members allowed to read every report (firestore.rules).
 */
import { threeWayMerge } from "./fieldMerge.js";
import { newPcr, postCheck } from "../lib/nemsis/pcrModel.js";

export const PCR_KIND = "pcr";
export const PCR_COLLECTION = "pcrs";

/** Fields merged one by one when the server copy changed too. NEMSIS sections merge as a whole. */
export function pcrMergePaths(schema) {
  const sections = schema.node("EMSDataSet", "PatientCareReport").ch.map((c) => `nemsis.${c.n}`);
  return ["status", "crewUids", "incidentNumber", "unit", ...sections];
}

/** Number for a report started on a device: never clashes with another device or the RMS. */
export function fieldPcrNumber(now = new Date(), random = Math.random) {
  const stamp = now.getTime().toString(36).toUpperCase();
  return `PCR-${now.getFullYear()}-F${stamp.slice(-6)}${Math.floor(random() * 1296).toString(36).toUpperCase().padStart(2, "0")}`;
}

/**
 * Data for a new device record.
 * @param {object} schema
 * @param {{ uuid: string, number: string, softwareVersion: string, uid: string, agency: object, unit?: object,
 *   incidentNumber?: string, crew?: object[], crewUids?: string[], cad?: object }} input
 */
export function newPcrRecordData(schema, input) {
  const nemsis = newPcr(schema, {
    uuid: input.uuid,
    number: input.number,
    softwareVersion: input.softwareVersion,
    agency: input.agency,
    unit: input.unit,
    incidentNumber: input.incidentNumber,
    responseNumber: input.responseNumber,
    crew: input.crew,
    cad: input.cad,
  });
  return {
    id: input.uuid,
    uuid: input.uuid,
    number: input.number,
    status: "draft",
    crewUids: [...new Set([input.uid, ...(input.crewUids ?? [])].filter(Boolean))],
    incidentNumber: input.incidentNumber ?? "",
    unit: input.unit?.callSign ?? input.unit?.vehicleNumber ?? "",
    nemsis,
  };
}

/** Title and subtitle shown in device lists. Stored unencrypted, so never the patient's details. */
export function describePcr(data) {
  return {
    title: `Patient care report ${data.number ?? ""}`.trim(),
    subtitle: [data.status === "posted" ? "Posted" : "Draft", data.unit, data.incidentNumber].filter(Boolean).join(" · "),
  };
}

/** The part of the server copy the next edit merges against (kept, sealed, as record.base). */
export function pcrBase(doc) {
  if (!doc) return null;
  return {
    status: doc.status,
    crewUids: doc.crewUids ?? [],
    incidentNumber: doc.incidentNumber ?? "",
    unit: doc.unit ?? "",
    nemsis: doc.nemsis ?? {},
    updatedAt: doc.updatedAt ?? "",
  };
}

/** Remove undefined values (Firestore rejects them) without touching anything else. */
export function stripUndefined(value) {
  if (Array.isArray(value)) return value.filter((v) => v !== undefined).map(stripUndefined);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined).map(([k, v]) => [k, stripUndefined(v)]));
  }
  return value;
}

/**
 * Work out what to write for a device record, or why it can't be written.
 * @returns {{ action: "done", base } | { action: "write", doc, base }
 *   | { action: "reject", message } | { action: "conflict", conflicts, merged }}
 */
export function planPcrWrite(schema, { record, server, uid, actorName, now = new Date().toISOString() }) {
  const data = record.data;
  const token = `${record.localId}:${record.savedAt}`;
  // A retry after the write landed but the reply was lost: already done.
  if (server?.lastWrite === token) return { action: "done", base: pcrBase(server) };
  if (server?.status === "posted") {
    return {
      action: "reject",
      message: "This report has been posted and is locked. Ask a supervisor to unlock it if it needs an amendment. Your changes are kept on this device.",
    };
  }
  if (data.status === "posted") {
    const check = postCheck(schema, data.nemsis);
    if (!check.ok) {
      const n = check.blocking.length;
      return { action: "reject", message: `This report can't be posted yet: ${n} required item${n === 1 ? " is" : "s are"} missing or invalid. Open it to see what's left.` };
    }
  }
  const { merged, conflicts } = threeWayMerge(record.base, data, server, pcrMergePaths(schema));
  if (conflicts.length) return { action: "conflict", conflicts, merged };
  const posting = merged.status === "posted" && server?.status !== "posted";
  const doc = stripUndefined({
    ...(server ?? {}),
    ...merged,
    id: data.id,
    uuid: data.uuid,
    number: server?.number ?? data.number,
    crewUids: [...new Set([...(merged.crewUids ?? []), uid])],
    createdAt: server?.createdAt ?? record.createdAt ?? now,
    createdByUid: server?.createdByUid ?? uid,
    createdByName: server?.createdByName ?? actorName,
    updatedAt: now,
    updatedByUid: uid,
    updatedByName: actorName,
    source: server?.source ?? "field-app",
    lastWrite: token,
    ...(posting ? { postedAt: now, postedByUid: uid, postedByName: actorName } : {}),
  });
  return { action: "write", doc, base: pcrBase(doc) };
}
