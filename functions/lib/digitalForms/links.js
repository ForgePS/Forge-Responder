/**
 * Digital Forms: the platform records a submission can be linked to.
 *
 * Every read is under departments/{departmentId}, where departmentId is the
 * caller's verified department (never the request's). A linked record's label is
 * always looked up here; a label sent by the browser is ignored.
 *
 *   apparatus  fleetAssets/{id}, plus units only on the classic Apparatus list
 *   occupancy  occupancies/{id}
 *   station    profile/main stations (the station name is its id)
 *   personnel  the personnel list (name only)
 */
const { readListItems } = require("../listStore");
const { loadPersonnelItems } = require("../personnel");
const { LINK_TYPES } = require("./schema");

const APPARATUS_LIST_KEY = "hlfd-rms-apparatus";
const MAX_OPTIONS = 2000;
const INACTIVE_FLEET = new Set(["decommissioned", "archived", "disposed", "sold"]);
const INACTIVE_OCCUPANCY = new Set(["archived", "inactive", "closed", "demolished"]);

const str = (value, max = 200) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);

function byLabel(a, b) {
  return a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: "base" });
}

async function apparatusOptions(db, departmentId) {
  const dept = db.doc(`departments/${departmentId}`);
  const [assetsSnap, listItems] = await Promise.all([
    dept.collection("fleetAssets").get(),
    readListItems(db, departmentId, APPARATUS_LIST_KEY).catch(() => []),
  ]);
  const options = [];
  const coveredLegacy = new Set();
  for (const docSnap of assetsSnap.docs) {
    const data = docSnap.data() || {};
    if (data.legacyApparatusId) coveredLegacy.add(String(data.legacyApparatusId));
    if (INACTIVE_FLEET.has(String(data.status || "").toLowerCase())) continue;
    const label = str(data.fleetNumber || data.unitDesignation || data.unit || data.name) || docSnap.id;
    const name = str(data.name);
    options.push({ id: `fleet:${docSnap.id}`, label, detail: [name !== label ? name : "", str(data.station)].filter(Boolean).join(" · ") });
  }
  for (const item of listItems) {
    const id = str(item?.id || item?.unit, 150);
    if (!id || coveredLegacy.has(id)) continue;
    options.push({ id: `list:${id}`, label: str(item.unit || item.name) || id, detail: str(item.station) });
  }
  return options;
}

async function occupancyOptions(db, departmentId) {
  const snap = await db.collection(`departments/${departmentId}/occupancies`).get();
  return snap.docs
    .map((d) => ({ id: d.id, data: d.data() || {} }))
    .filter(({ data }) => !INACTIVE_OCCUPANCY.has(String(data.status || "").toLowerCase()) && !data.archivedAt)
    .map(({ id, data }) => ({ id, label: str(data.name) || id, detail: str(data.address) }));
}

function stationNames(profile = {}) {
  const fromList = Array.isArray(profile.stations)
    ? profile.stations
    : String(profile.stations ?? "").split(",");
  const fromDetails = Array.isArray(profile.stationDetails) ? profile.stationDetails.map((s) => s?.name) : [];
  return [...new Set([...fromList, ...fromDetails].map((name) => str(name, 150)).filter(Boolean))];
}

async function stationOptions(db, departmentId) {
  const snap = await db.doc(`departments/${departmentId}/profile/main`).get();
  const profile = snap.exists ? snap.data() || {} : {};
  const details = new Map((Array.isArray(profile.stationDetails) ? profile.stationDetails : [])
    .map((s) => [str(s?.name, 150).toLowerCase(), s]));
  return stationNames(profile).map((name) => ({ id: name, label: name, detail: str(details.get(name.toLowerCase())?.address) }));
}

async function personnelOptions(db, departmentId) {
  const items = await loadPersonnelItems(db, departmentId);
  return items
    .filter((person) => person && !person.archived && String(person.status || "").toLowerCase() !== "inactive")
    .map((person) => {
      const id = str(person.id || person.agencyPersonnelId, 150);
      const name = str(person.name || [person.firstName, person.lastName].filter(Boolean).join(" "));
      return { id, label: name || id, detail: str(person.rank || person.title) };
    })
    .filter((option) => option.id);
}

const LOADERS = {
  apparatus: apparatusOptions,
  occupancy: occupancyOptions,
  station: stationOptions,
  personnel: personnelOptions,
};

/** Records of one type a member may link a submission to: [{ id, label, detail }]. */
async function listLinkOptions(db, departmentId, type) {
  if (!LINK_TYPES.includes(type)) return [];
  const seen = new Set();
  const options = (await LOADERS[type](db, departmentId)).filter((option) => {
    if (!option.id || seen.has(option.id)) return false;
    seen.add(option.id);
    return true;
  });
  return options.sort(byLabel).slice(0, MAX_OPTIONS);
}

/** The record for (type, id) in this department, or null if there is none. */
async function resolveLinkedRecord(db, departmentId, type, id) {
  const wanted = str(id, 200);
  if (!LINK_TYPES.includes(type) || !wanted) return null;
  const match = (await listLinkOptions(db, departmentId, type)).find((option) => option.id === wanted);
  return match ? { type, id: match.id, label: match.label, detail: match.detail || "" } : null;
}

module.exports = { listLinkOptions, resolveLinkedRecord };
