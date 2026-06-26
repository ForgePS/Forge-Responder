import { normalizePersonnelRecord } from "./firestoreSanitize.js";
import { getPersonnelDropdownId } from "./personnelAdminFields.js";

export const BULK_EDIT_UNCHANGED = "";

export const BULK_EDIT_FIELDS = [
  { key: "rank", label: "Rank" },
  { key: "shift", label: "Shift" },
  { key: "unit", label: "Apparatus", syncAssignment: true },
  { key: "station", label: "Station" },
  { key: "status", label: "Status" },
  { key: "employmentType", label: "Employment Type" },
  { key: "position", label: "Position" },
  { key: "division", label: "Division" },
  { key: "district", label: "District" },
  { key: "driver", label: "Driver Status" },
  { key: "group", label: "Group" },
];

export function createEmptyBulkEditPatch() {
  return Object.fromEntries(BULK_EDIT_FIELDS.map((field) => [field.key, BULK_EDIT_UNCHANGED]));
}

export function getBulkEditDropdownId(fieldKey = "") {
  return getPersonnelDropdownId(fieldKey);
}

export function hasBulkEditChanges(patch = {}) {
  return BULK_EDIT_FIELDS.some((field) => {
    const value = patch[field.key];
    return value && value !== BULK_EDIT_UNCHANGED;
  });
}

export function summarizeBulkEditPatch(patch = {}) {
  return BULK_EDIT_FIELDS
    .filter((field) => patch[field.key] && patch[field.key] !== BULK_EDIT_UNCHANGED)
    .map((field) => `${field.label}: ${patch[field.key]}`);
}

export function applyPersonnelBulkEdit(records = [], selectedIds = [], patch = {}) {
  if (!hasBulkEditChanges(patch)) {
    return { records, updatedCount: 0, changes: [] };
  }

  const idSet = new Set(selectedIds);
  const now = new Date().toISOString();
  let updatedCount = 0;

  const nextRecords = records.map((person) => {
    if (!idSet.has(person.id)) return person;

    const updates = {};
    BULK_EDIT_FIELDS.forEach((field) => {
      const value = patch[field.key];
      if (!value || value === BULK_EDIT_UNCHANGED) return;
      updates[field.key] = value;
      if (field.syncAssignment) updates.assignment = value;
    });

    if (!Object.keys(updates).length) return person;
    updatedCount += 1;
    return normalizePersonnelRecord({
      ...person,
      ...updates,
      updated_at: now,
    });
  });

  return {
    records: nextRecords,
    updatedCount,
    changes: summarizeBulkEditPatch(patch),
  };
}
