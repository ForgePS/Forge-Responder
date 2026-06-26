import { defaultDropdowns } from "../data/defaultDropdowns.js";
import { createRecord, listRecords, updateRecord } from "./firestoreService.js";

export async function ensureDefaultDropdowns(departmentId) {
  let existing = await listRecords(departmentId, "dropdowns");
  const existingIds = new Set(existing.map((item) => item.id));
  const missing = defaultDropdowns.filter((item) => !existingIds.has(item.id));

  if (!existing.length) {
    await Promise.all(defaultDropdowns.map((record) => createRecord(departmentId, "dropdowns", record.id, record)));
    return listRecords(departmentId, "dropdowns");
  }

  if (missing.length) {
    await Promise.all(missing.map((record) => createRecord(departmentId, "dropdowns", record.id, record)));
    existing = await listRecords(departmentId, "dropdowns");
  }

  await Promise.all(defaultDropdowns.map(async (defaults) => {
    const record = existing.find((item) => item.id === defaults.id);
    if (!record) return;
    if (record.label === defaults.label && record.module === defaults.module) return;
    await updateRecord(departmentId, "dropdowns", defaults.id, {
      label: defaults.label,
      module: defaults.module,
    });
  }));

  return listRecords(departmentId, "dropdowns");
}

export async function loadDropdownsMap(departmentId) {
  const dropdowns = await ensureDefaultDropdowns(departmentId);
  return Object.fromEntries(dropdowns.map((item) => [item.id, item]));
}

export function getActiveOptions(dropdown, currentValue = "") {
  if (!dropdown?.options) return currentValue ? [currentValue] : [];
  const active = dropdown.options
    .filter((option) => option.active)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    .map((option) => option.label);
  if (currentValue && !active.includes(currentValue)) {
    return [currentValue, ...active];
  }
  return active;
}

export async function saveDropdown(departmentId, dropdown) {
  return updateRecord(departmentId, "dropdowns", dropdown.id, dropdown);
}

export async function addDropdownOption(departmentId, dropdownId, label) {
  const dropdowns = await listRecords(departmentId, "dropdowns");
  const dropdown = dropdowns.find((item) => item.id === dropdownId);
  if (!dropdown) return null;
  const nextOption = {
    id: `${dropdownId}-${Date.now()}`,
    label,
    active: true,
    sortOrder: (dropdown.options?.length || 0) + 1
  };
  const updated = { ...dropdown, options: [...(dropdown.options || []), nextOption] };
  await updateRecord(departmentId, "dropdowns", dropdownId, updated);
  return updated;
}

export async function toggleDropdownOption(departmentId, dropdownId, optionId, active) {
  const dropdowns = await listRecords(departmentId, "dropdowns");
  const dropdown = dropdowns.find((item) => item.id === dropdownId);
  if (!dropdown) return null;
  const updated = {
    ...dropdown,
    options: (dropdown.options || []).map((option) =>
      option.id === optionId ? { ...option, active } : option
    )
  };
  await updateRecord(departmentId, "dropdowns", dropdownId, updated);
  return updated;
}
