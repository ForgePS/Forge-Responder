const { readListItems } = require("./listStore");

const PERSONNEL_LIST_KEYS = [
  "hlfd-rms-personnel",
  "personnel",
];

async function loadPersonnelItems(db, departmentId) {
  for (const listKey of PERSONNEL_LIST_KEYS) {
    const items = await readListItems(db, departmentId, listKey);
    if (items.length) return items;
  }
  return [];
}

async function resolvePersonnelPhones(db, departmentId, personnelIds = []) {
  const targets = new Set(
    (Array.isArray(personnelIds) ? personnelIds : [])
      .map((id) => String(id || "").trim())
      .filter(Boolean)
  );

  if (!targets.size) return [];

  const items = await loadPersonnelItems(db, departmentId);
  return items
    .filter((person) => targets.has(String(person.id || "").trim()))
    .map((person) => ({
      personnelId: person.id,
      name: person.name || person.id,
      phone: person.phone || "",
      smsOptIn: person.smsOptIn !== false,
    }));
}

module.exports = {
  resolvePersonnelPhones,
  loadPersonnelItems,
};
