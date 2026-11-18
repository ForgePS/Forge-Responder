/**
 * Adapters that turn the department's existing data into compliance evidence,
 * so the Training module reads (never copies) Personnel, Certifications and the
 * Forge Academy completions already synced into the classic training list.
 */
import { parseLooseDate } from "../liveDates.js";

function isoOf(value) {
  if (!value) return "";
  const s = String(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = parseLooseDate ? parseLooseDate(s) : new Date(s);
  if (!d || Number.isNaN(d.getTime?.())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Member facts the requirement engine matches on. */
export function memberFromPersonnel(p = {}, emsLevelOf = () => "") {
  return {
    id: String(p.id),
    name: p.name || "",
    rank: p.rank || "",
    position: p.position || "",
    station: String(p.station || ""),
    shift: String(p.shift || ""),
    division: p.division || "",
    unit: p.unit || p.assignment || "",
    emsLevel: emsLevelOf(p) || p.ems || p.nrLevel || "",
    specialtyTeams: Array.isArray(p.qualifiers) ? p.qualifiers : [],
    hireDate: isoOf(p.hireDate),
    status: p.status || "Active",
  };
}

/**
 * Certifications list rows -> credentials. Rows without a personnelId are matched
 * by exact name (how the Certifications page links them today).
 */
export function credentialsFromCertifications(certs = [], personnel = []) {
  const byName = new Map(personnel.map((p) => [String(p.name || "").trim().toLowerCase(), String(p.id)]));
  return certs.map((c) => ({
    id: c.id,
    personId: String(c.personnelId || byName.get(String(c.person || "").trim().toLowerCase()) || ""),
    name: c.type || c.name || "",
    category: c.category || "",
    issueDate: isoOf(c.issue),
    expirationDate: isoOf(c.expires || c.expiration || c.expirationDate),
    status: c.status || "",
    documentUrl: c.documentUrl || "",
  })).filter((c) => c.personId && c.name);
}

/** Forge Academy completions synced into the classic training list. */
export function completionsFromLegacy(items = []) {
  return items
    .filter((i) => i && (i.source === "forge_academy" || i.registrationId) && /complete/i.test(String(i.status || "")) && i.personnelId)
    .map((i) => ({
      id: i.id,
      personId: String(i.personnelId),
      courseId: i.courseNumber || i.classId || "",
      courseTitle: i.course || "",
      completedAt: isoOf(i.endDate || i.date || i.updatedAt),
      status: "completed",
      source: "forge_academy",
      certificateSerial: i.certificateSerial || "",
    }));
}

export function buildEvidence({ records = [], evaluations = [], certifications = [], personnel = [], legacyTraining = [], exemptions = [] } = {}) {
  return {
    records,
    evaluations,
    completions: completionsFromLegacy(legacyTraining),
    credentials: credentialsFromCertifications(certifications, personnel),
    exemptions,
  };
}
