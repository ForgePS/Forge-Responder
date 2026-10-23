import { canonicalApparatusUnitName } from "./apparatusSchema.js";

function migrateRecordFields(record = {}, fields = []) {
  if (!record || typeof record !== "object") return record;
  let changed = false;
  const next = { ...record };
  fields.forEach((field) => {
    if (typeof next[field] !== "string" || !next[field].trim()) return;
    const migrated = canonicalApparatusUnitName(next[field]);
    if (migrated !== next[field]) {
      next[field] = migrated;
      changed = true;
    }
  });
  return changed ? next : record;
}

const LIST_FIELD_MIGRATIONS = {
  "hlfd-rms-apparatus": ["unit"],
  "hlfd-rms-work-orders": ["unit"],
  "hlfd-rms-roster": ["apparatus"],
  "hlfd-rms-hose-tests": ["apparatus"],
  "hlfd-rms-personnel": ["unit", "assignment", "apparatus"],
};

export function migrateTenantListItems(items = [], listKey = "") {
  const fields = LIST_FIELD_MIGRATIONS[listKey];
  if (!fields || !Array.isArray(items) || !items.length) return items;
  return items.map((record) => migrateRecordFields(record, fields));
}

export function tenantListItemsChanged(before = [], after = []) {
  return JSON.stringify(before) !== JSON.stringify(after);
}
