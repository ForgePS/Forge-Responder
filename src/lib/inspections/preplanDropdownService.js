import {
  createRecord,
  listRecords,
  updateRecord,
} from "../firestoreService.js";
import {
  PREPLAN_DROPDOWN_LIBRARIES_COLLECTION,
  PREPLAN_DROPDOWN_OPTIONS_COLLECTION,
} from "./paths.js";
import { STARTER_PREPLAN_DROPDOWN_LIBRARIES } from "./preplanDropdownDefaults.js";
import { writeInspectionAuditLog } from "./inspectionAudit.js";

function nowIso() {
  return new Date().toISOString();
}

export async function ensurePreplanDropdownsSeeded(departmentId, audit = {}) {
  if (!departmentId) return { libraries: [], options: [] };
  const existing = await listRecords(departmentId, PREPLAN_DROPDOWN_LIBRARIES_COLLECTION);
  if (existing.length) {
    const options = await listRecords(departmentId, PREPLAN_DROPDOWN_OPTIONS_COLLECTION);
    return { libraries: existing, options };
  }
  const stamp = nowIso();
  const libraries = [];
  const options = [];
  for (const lib of STARTER_PREPLAN_DROPDOWN_LIBRARIES) {
    const library = {
      id: lib.key,
      departmentId,
      key: lib.key,
      name: lib.name,
      description: lib.description || "",
      systemLibrary: true,
      active: true,
      createdAt: stamp,
      updatedAt: stamp,
    };
    await createRecord(departmentId, PREPLAN_DROPDOWN_LIBRARIES_COLLECTION, library.id, library);
    libraries.push(library);
    let sortOrder = 0;
    for (const opt of lib.options || []) {
      const option = {
        id: `${lib.key}__${opt.id}`,
        departmentId,
        libraryId: lib.key,
        label: opt.label,
        internalCode: opt.id,
        description: opt.description || "",
        sortOrder: sortOrder++,
        active: true,
        systemDefault: true,
        createdAt: stamp,
        updatedAt: stamp,
      };
      await createRecord(departmentId, PREPLAN_DROPDOWN_OPTIONS_COLLECTION, option.id, option);
      options.push(option);
    }
  }
  await writeInspectionAuditLog(departmentId, {
    module: "Preplans",
    recordType: "preplanDropdown",
    action: "seed",
    summary: `Seeded ${libraries.length} preplan dropdown libraries`,
    actorUid: audit.actorUid || "",
    actorName: audit.actorName || "",
  });
  return { libraries, options };
}

export async function listDropdownLibraries(departmentId) {
  const seeded = await ensurePreplanDropdownsSeeded(departmentId);
  return seeded.libraries.sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

export async function listDropdownOptions(departmentId, libraryId = "") {
  await ensurePreplanDropdownsSeeded(departmentId);
  const rows = await listRecords(departmentId, PREPLAN_DROPDOWN_OPTIONS_COLLECTION);
  return rows
    .filter((row) => !libraryId || row.libraryId === libraryId)
    .sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0) || String(a.label).localeCompare(String(b.label)));
}

export async function saveDropdownOption(departmentId, payload = {}, audit = {}) {
  if (!departmentId) throw new Error("Department required.");
  const id = payload.id || `${payload.libraryId}__${Date.now().toString(36)}`;
  const stamp = nowIso();
  const existing = (await listRecords(departmentId, PREPLAN_DROPDOWN_OPTIONS_COLLECTION)).find((row) => row.id === id);
  const record = {
    ...(existing || {}),
    ...payload,
    id,
    departmentId,
    active: payload.active !== false,
    systemDefault: existing?.systemDefault || false,
    updatedAt: stamp,
    createdAt: existing?.createdAt || stamp,
  };
  if (existing) await updateRecord(departmentId, PREPLAN_DROPDOWN_OPTIONS_COLLECTION, id, record);
  else await createRecord(departmentId, PREPLAN_DROPDOWN_OPTIONS_COLLECTION, id, record);
  await writeInspectionAuditLog(departmentId, {
    module: "Preplans",
    recordType: "preplanDropdownOption",
    action: existing ? "update" : "create",
    recordId: id,
    summary: `Dropdown option ${record.label}`,
    actorUid: audit.actorUid || "",
    actorName: audit.actorName || "",
  });
  return record;
}

/** Soft-disable only — never hard-delete historical options. */
export async function disableDropdownOption(departmentId, optionId, audit = {}) {
  return saveDropdownOption(departmentId, { id: optionId, active: false }, audit);
}

export async function setDropdownOptionActive(departmentId, optionId, active, audit = {}) {
  return saveDropdownOption(departmentId, { id: optionId, active: Boolean(active) }, audit);
}
