/**
 * FORGE FIELD: an inspector starting an inspection themselves (not assigned
 * from the RMS). Pure helpers so they run in unit tests without Firebase.
 *
 * The draft carries everything the form needs, so the inspection can be done
 * with no signal. It is created in the RMS when the record first syncs
 * (fieldSyncHandlers.syncInspection), under an id fixed when the draft is
 * started, so a retried sync finds the inspection instead of creating a second.
 */
import { prefillAnswersFromOccupancy, occupancySnapshotFor } from "../lib/inspections/occupancyPrefill.js";
import { occupancyEmails } from "../lib/inspections/inspectionEmailRecipients.js";

const HIDDEN_OCCUPANCY_STATUSES = new Set(["inactive", "archived", "deleted", "demolished"]);

function randomPart() {
  const random = typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID().replace(/-/g, "")
    : `${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
  return random.slice(0, 6).toUpperCase();
}

/** Id for an inspection started in the field (same family as the RMS's INS-… ids). */
export function newFieldInspectionId(now = Date.now()) {
  return `INS-F${now.toString(36).toUpperCase()}-${randomPart()}`;
}

export function isFieldInspectionId(id) {
  return /^INS-F[A-Z0-9]+-[A-Z0-9]+$/.test(String(id || ""));
}

/** Who a field-started inspection is assigned to: the signed-in member (as the RMS's "Assign to me"). */
export function selfAssignee(snapshot = {}) {
  const id = snapshot.personnelId || snapshot.uid || "";
  return { ids: id ? [id] : [], names: id && snapshot.displayName ? [snapshot.displayName] : [] };
}

/** Occupancies an inspector can start an inspection at (slim copies for the device). */
export function startableOccupancies(rows = []) {
  return rows
    .filter((row) => row?.id && !HIDDEN_OCCUPANCY_STATUSES.has(String(row.status || "").toLowerCase()) && !row.archivedAt)
    .map((row) => ({ ...occupancySnapshotFor(row), occupancyNumber: row.occupancyNumber || "", status: row.status || "" }))
    .sort((a, b) => String(a.name || a.address).localeCompare(String(b.name || b.address), undefined, { numeric: true }));
}

/** Inspection types still in use, with the checklist each one starts with. */
export function startableInspectionTypes(types = [], snapshotFor = () => null) {
  return types
    .filter((row) => row?.id && row.lifecycleStatus !== "archived" && row.active !== false)
    .map((row) => {
      const resolved = snapshotFor(row) || {};
      return {
        id: row.id,
        name: row.name || "Inspection",
        category: row.category || "",
        version: row.version || 1,
        templateId: resolved.templateId || "",
        templateVersionId: resolved.templateVersionId || "",
        templateSnapshot: resolved.templateSnapshot || null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
}

/**
 * The form's starting data for a new inspection.
 * @param {{ occupancy: object, type: object, snapshot: object, id?: string }} input
 */
export function buildNewInspectionDraft({ occupancy, type, snapshot = {}, id = newFieldInspectionId() }) {
  if (!occupancy?.id) throw new Error("Choose an occupancy");
  if (!type?.id) throw new Error("Choose an inspection type");
  const templateSnapshot = type.templateSnapshot || { sections: [] };
  const assignee = selfAssignee(snapshot);
  const answers = prefillAnswersFromOccupancy(templateSnapshot, occupancy, {}, {
    inspectionType: { name: type.name, category: type.category },
  }).answers;
  return {
    inspectionId: "",
    newInspection: {
      id,
      occupancyId: occupancy.id,
      inspectionTypeId: type.id,
      templateId: type.templateId || "",
      templateVersionId: type.templateVersionId || "",
      assignedInspectorIds: assignee.ids,
      assignedInspectorNames: assignee.names,
      startedAt: new Date().toISOString(),
    },
    inspection: {
      id,
      inspectionNumber: "",
      occupancyName: occupancy.name || "",
      address: occupancy.address || "",
      typeName: type.name || "Inspection",
      templateSnapshot,
      recordVersion: 0,
      updatedAt: "",
      isNew: true,
    },
    answers,
    emailReport: { send: false, to: occupancyEmails(occupancy).join(", "), note: "" },
    violations: [],
    result: "",
    summary: "",
    internalNotes: "",
    reinspectionRequired: false,
    nextReinspectionAt: "",
    finish: false,
  };
}

/**
 * What createInspection gets when a field-started inspection first syncs.
 * Assignment comes from who is signed in at sync time, never from the saved
 * draft, so a draft can't create inspections for someone else.
 */
export function fieldCreateInput(data = {}, snapshot = {}) {
  const pending = data.newInspection || {};
  if (!isFieldInspectionId(pending.id)) throw new Error("This new inspection has no valid id.");
  const assignee = selfAssignee(snapshot);
  return {
    id: pending.id,
    occupancyId: pending.occupancyId,
    inspectionTypeId: pending.inspectionTypeId,
    templateId: pending.templateId || "",
    templateVersionId: pending.templateVersionId || "",
    // The checklist the inspector actually answered on the device.
    templateSnapshot: data.inspection?.templateSnapshot || null,
    assignedInspectorIds: assignee.ids,
    assignedInspectorNames: assignee.names,
    internalNotes: "",
    source: "field-app",
  };
}

/** The RMS id a local inspection record belongs to (assigned or field-started). */
export function localInspectionKey(record) {
  return record?.data?.inspectionId || record?.data?.newInspection?.id || "";
}

/** Field-started inspections on this device that aren't in the downloaded list yet. */
export function localOnlyInspections(records = [], assigned = []) {
  const known = new Set(assigned.map((item) => item.id));
  return records.filter((row) => row.kind === "inspection"
    && row.status !== "synced"
    && row.data?.newInspection?.id
    && !known.has(localInspectionKey(row)));
}
