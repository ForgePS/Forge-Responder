/**
 * Fill an inspection's form fields from the occupancy it is for.
 *
 * Templates (built-in or made from an uploaded digital form) often start with an
 * "Inspection Information" block: business name, address, contact, phone numbers,
 * emergency contact. Those are already on the occupancy, so they are filled in by
 * matching each field's label. Only blank answers are filled; anything an
 * inspector typed is left alone. Fields that don't match stay empty.
 */
import { getChecklistFieldOptions } from "./checklistFields.js";

const TEXT_TYPES = new Set(["short_text", "long_text", "text", ""]);
const SELECT_TYPES = new Set(["dropdown", "single_select"]);
const EMERGENCY_ROLE = /emergency|after ?hours|24 ?h|key ?holder/i;

function norm(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Which occupancy value a field label asks for, or "". */
export function occupancyFieldFor(label) {
  const t = norm(label);
  if (!t) return "";
  const has = (re) => re.test(t);
  const isPhone = has(/\b(phone|phones|telephone|tel|cell|mobile)\b/);
  if (has(/\b(emergency|after hours|key ?holder)\b/)) {
    if (isPhone) return "emergencyPhone";
    if (has(/\bemail\b/)) return "emergencyEmail";
    return "emergencyName";
  }
  if (has(/\binspection type\b|\btype of inspection\b/)) return "inspectionType";
  if (has(/\be ?mail\b/)) return "email";
  if (isPhone) return "phone";
  if (has(/\b(zip|postal)\b/)) return "zip";
  if (t === "city" || has(/^city\b/)) return "city";
  if (t === "state") return "state";
  if (has(/\boccupancy (type|class|classification)\b|\buse group\b/)) return "occupancyType";
  if (has(/\b(hazard|risk level)\b/)) return "hazard";
  if (has(/\baddress\b|^location$|^site location$/)) return "address";
  if (has(/\bcontact\b|\bresponsible party\b|\bperson in charge\b/)) return "contactName";
  if (has(/\b(business|occupancy|facility|establishment|property|building|company|tenant|store) name\b/)
    || has(/^name of (the )?(business|occupancy|facility|establishment|property)\b/)
    || has(/^(dba|business|occupancy|facility|establishment)$/)) return "name";
  return "";
}

function emergencyContact(occupancy) {
  const contacts = Array.isArray(occupancy?.contacts) ? occupancy.contacts : [];
  return contacts.find((c) => EMERGENCY_ROLE.test(String(c?.role || ""))) || null;
}

const STATE_ZIP = /^([A-Za-z]{2})(?:\s+(\d{5}(?:-\d{4})?))?$/;
const ZIP_ONLY = /^(\d{5}(?:-\d{4})?)$/;
const US_STATES = new Set(("AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK "
  + "OR PA RI SC SD TN TX UT VT VA WA WV WI WY PR GU VI AS MP").split(" "));
const isState = (value) => US_STATES.has(String(value || "").toUpperCase());

/**
 * Split a one-line US address ("2214 Goodman Rd W, Horn Lake, MS 38637") into
 * street, city, state and ZIP. Occupancies imported or typed with the whole
 * address in Address leave City/State/ZIP blank. Returns null when the line
 * doesn't end in a state and/or ZIP, so other text is never guessed at.
 * @param {string} line
 * @returns {{ street: string, city: string, state: string, zip: string }|null}
 */
export function splitOneLineAddress(line) {
  const parts = String(line || "").split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  let tail = parts[parts.length - 1];
  let state = "";
  let zip = "";
  let cityFromTail = "";
  const zipOnly = tail.match(ZIP_ONLY);
  if (zipOnly) {
    // "..., Horn Lake, MS, 38637"
    zip = zipOnly[1];
    parts.pop();
    tail = parts[parts.length - 1] || "";
  }
  let stateZip = tail.match(STATE_ZIP);
  if (stateZip && !isState(stateZip[1])) stateZip = null;
  if (!stateZip) {
    // "..., Horn Lake MS 38637" (no comma before the state)
    const loose = tail.match(/^(.*\S)\s+([A-Za-z]{2})(?:\s+(\d{5}(?:-\d{4})?))?$/);
    if (loose && isState(loose[2]) && (loose[3] || zip)) {
      cityFromTail = loose[1];
      stateZip = [tail, loose[2], loose[3]];
    }
  }
  if (stateZip) {
    state = stateZip[1].toUpperCase();
    zip = stateZip[2] || zip;
    parts.pop();
  } else if (!zip) {
    return null;
  }
  if (cityFromTail) parts.push(cityFromTail);
  if (!parts.length) return null;
  const city = parts.length > 1 ? parts.pop() : "";
  return { street: parts.join(", "), city, state, zip };
}

/** The occupancy with City/State/ZIP taken from a one-line Address when they are blank. */
export function occupancyAddressParts(occupancy) {
  const base = {
    address: String(occupancy?.address || "").trim(),
    city: String(occupancy?.city || "").trim(),
    state: String(occupancy?.state || "").trim(),
    zip: String(occupancy?.zip || "").trim(),
  };
  if (base.city || base.state || base.zip) return base;
  const split = splitOneLineAddress(base.address);
  return split ? { address: split.street, city: split.city, state: split.state, zip: split.zip } : base;
}

function joinAddress(occupancy, streetOnly) {
  const street = String(occupancy?.address || "").trim();
  if (streetOnly) return street;
  const stateZip = [occupancy?.state, occupancy?.zip].map((v) => String(v || "").trim()).filter(Boolean).join(" ");
  const parts = [street, String(occupancy?.city || "").trim(), stateZip].filter(Boolean);
  // Some addresses already include the city; don't repeat it.
  if (street && occupancy?.city && street.toLowerCase().includes(String(occupancy.city).toLowerCase())) return street;
  return parts.join(", ");
}

function pickOption(field, wanted) {
  const options = getChecklistFieldOptions(field);
  const candidates = wanted.map(norm).filter(Boolean);
  for (const candidate of candidates) {
    const exact = options.find((option) => norm(option) === candidate);
    if (exact) return exact;
  }
  for (const candidate of candidates) {
    const loose = options.find((option) => {
      const o = norm(option);
      return o && (candidate.includes(o) || o.includes(candidate));
    });
    if (loose) return loose;
  }
  return "";
}

/**
 * @param {object|null} templateSnapshot  the inspection's template snapshot
 * @param {object|null} occupancy         occupancy record or the inspection's occupancySnapshot
 * @param {object} [answers]              current answers; only blank ones are filled
 * @param {{ inspectionType?: object }} [context]
 * @returns {{ answers: object, filled: string[] }} new answers and the keys that were filled
 */
export function prefillAnswersFromOccupancy(templateSnapshot, occupancy, answers = {}, context = {}) {
  const next = { ...(answers || {}) };
  const filled = [];
  if (!occupancy) return { answers: next, filled };

  const fields = (templateSnapshot?.sections || []).flatMap((section) => section?.fields || []).filter((f) => f?.key);
  const kinds = new Map(fields.map((field) => [field.key, occupancyFieldFor(field.label)]));
  const hasCityField = [...kinds.values()].includes("city");
  const emergency = emergencyContact(occupancy);
  const type = context.inspectionType || {};
  const place = occupancyAddressParts(occupancy);

  const values = {
    name: occupancy.name,
    address: joinAddress({ ...occupancy, ...place }, hasCityField),
    city: place.city,
    state: place.state,
    zip: place.zip,
    contactName: occupancy.primaryContactName,
    phone: occupancy.primaryContactPhone,
    email: occupancy.primaryContactEmail,
    emergencyName: emergency?.name,
    emergencyPhone: emergency?.phone,
    emergencyEmail: emergency?.email,
    occupancyType: occupancy.occupancyType || occupancy.type,
    hazard: occupancy.hazard || occupancy.riskLevel,
  };

  for (const field of fields) {
    const kind = kinds.get(field.key);
    if (!kind) continue;
    const current = next[field.key];
    // An earlier prefill put the whole one-line address here; the street goes here now
    // and City/State/ZIP go in their own items.
    const staleOneLine = kind === "address" && hasCityField && place.address !== String(occupancy.address || "").trim()
      && String(current || "").trim() === String(occupancy.address || "").trim();
    if (current != null && String(current).trim() !== "" && !staleOneLine) continue;
    const fieldType = String(field.type || "");

    let value = "";
    if (SELECT_TYPES.has(fieldType)) {
      const wanted = kind === "inspectionType"
        ? [type.name, type.label, type.category]
        : [values[kind]];
      value = pickOption(field, wanted.filter(Boolean));
    } else if (TEXT_TYPES.has(fieldType)) {
      value = kind === "inspectionType" ? String(type.name || type.label || "") : String(values[kind] || "").trim();
    }
    if (!value) continue;
    next[field.key] = value;
    filled.push(field.key);
  }
  return { answers: next, filled };
}

/** The occupancy details kept on an inspection (what prefill needs later). */
export function occupancySnapshotFor(occupancy) {
  return {
    id: occupancy.id,
    name: occupancy.name,
    address: occupancy.address,
    city: occupancy.city || "",
    state: occupancy.state || "",
    zip: occupancy.zip || "",
    occupancyType: occupancy.occupancyType || occupancy.type,
    hazard: occupancy.hazard || occupancy.riskLevel,
    primaryContactName: occupancy.primaryContactName,
    primaryContactPhone: occupancy.primaryContactPhone,
    primaryContactEmail: occupancy.primaryContactEmail || "",
    contacts: (Array.isArray(occupancy.contacts) ? occupancy.contacts : []).map((c) => ({
      name: c?.name || "",
      role: c?.role || "",
      phone: c?.phone || "",
      email: c?.email || "",
      isPrimary: Boolean(c?.isPrimary),
    })),
  };
}

/**
 * An inspection's answers with blank occupancy details filled in, while it is still
 * open (inspections created before prefill existed, or after the occupancy changed).
 * liveOccupancy, when the page has it, is used instead of the snapshot on the record.
 */
export function answersWithOccupancy(record, liveOccupancy = null) {
  const answers = record?.answers || {};
  if (!record || record.lockedAt || record.completedAt || ["completed", "awaiting_approval", "archived"].includes(record.status)) return answers;
  return prefillAnswersFromOccupancy(record.templateSnapshot, liveOccupancy || record.occupancySnapshot, answers, {
    inspectionType: { name: record.inspectionTypeSnapshot?.label || record.inspectionTypeSnapshot?.name, category: record.inspectionTypeSnapshot?.category },
  }).answers;
}
