import { defaultDropdowns } from "../data/defaultDropdowns.js";
import { createRecord, listRecords, seedCollectionIfEmpty, updateRecord } from "./firestoreService.js";

export async function ensureDefaultDropdowns(departmentId) {
  return seedCollectionIfEmpty(departmentId, "dropdowns", defaultDropdowns);
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
