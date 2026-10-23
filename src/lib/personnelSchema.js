import {
  copyEmployeeAddressToEmergency,
  formatEmergencyContactSummaryAll,
  formatUsPhone,
  normalizeAllEmergencyContactFields,
} from "./personnelContact.js";
import { normalizePersonnelAccruals } from "./personnelAccruals.js";
import { normalizeActivityLog } from "./personnelActivityLog.js";
import { normalizePersonnelEmsCredentials } from "./personnelEmsCredentials.js";

export const PERSONNEL_FIELD_DEFAULTS = {
  firstName: "",
  middleName: "",
  lastName: "",
  name: "",
  initials: "",
  email: "",
  phone: "",
  address: "",
  unitSuite: "",
  city: "",
  state: "",
  zip: "",
  emergencyFirstName: "",
  emergencyLastName: "",
  emergencyPhone: "",
  emergencyRelationship: "",
  emergencyAddress: "",
  emergencyCity: "",
  emergencyState: "",
  emergencyZip: "",
  emergencySameAddress: false,
  emergency2FirstName: "",
  emergency2LastName: "",
  emergency2Phone: "",
  emergency2Relationship: "",
  emergency2Address: "",
  emergency2City: "",
  emergency2State: "",
  emergency2Zip: "",
  emergency2SameAddress: false,
  emergency: "",
  badgeNumber: "",
  agencyPersonnelId: "",
  apiId: "",
  firefighterId: "",
  femaId: "",
  /** Permanent Forge-wide person id from Integration Hub — never Auth UID, never manually edited. */
  forgePersonId: "",
  payrollId: "",
  ems: "",
  driversLicenseNumber: "",
  driversLicenseState: "",
  driversLicenseClass: "",
  driversLicenseExpiration: "",
  driver: "",
  qualifiers: [],
  isTrainingInstructor: false,
  unit: "",
  division: "",
  district: "",
  station: "",
  shift: "",
  position: "",
  rank: "",
  assignment: "",
  group: "",
  employmentType: "",
  status: "",
  supervisor: "",
  iaffLocalNumber: "",
  birthDate: "",
  citizenship: "",
  hireDate: "",
  secondaryStartDate: "",
  startDateRanking: "",
  endOfServiceDate: "",
  race: "",
  ethnicity: "",
  gender: "",
  maritalStatus: "",
  socialSecurityNumber: "",
  photoUrl: "",
  documents: [],
  certifications: [],
  emsCredentials: [],
  promotions: [],
  employmentHistory: [],
  payRates: [],
  accruals: [],
  immunizations: [],
  consultations: [],
  activityLog: [],
  isSystemUser: false,
  hourlyPayRate: "",
  payRateEffectiveDate: "",
};

export function parseLegacyName(name = "") {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { firstName: "", middleName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], middleName: "", lastName: "" };
  if (parts.length === 2) return { firstName: parts[0], middleName: "", lastName: parts[1] };
  return {
    firstName: parts[0],
    middleName: parts.slice(1, -1).join(" "),
    lastName: parts[parts.length - 1],
  };
}

export function buildPersonnelFullName(person = {}) {
  const parts = [person.firstName, person.middleName, person.lastName]
    .map((part) => String(part || "").trim())
    .filter(Boolean);
  if (parts.length) return parts.join(" ");
  return String(person.name || "").trim();
}

export function personInitialsFromPerson(person = {}) {
  const fullName = buildPersonnelFullName(person);
  return fullName
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("") || "?";
}

export function getPersonDisplayName(person = {}) {
  return buildPersonnelFullName(person) || person.name || person.id || "Unknown";
}

export function nextPersonnelRecordId(records = [], { prefix = "P" } = {}) {
  let max = 0;
  const pattern = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}-(\\d+)$`, "i");
  (Array.isArray(records) ? records : []).forEach((person) => {
    const match = String(person?.id || "").match(pattern);
    if (match) {
      max = Math.max(max, Number.parseInt(match[1], 10));
    }
  });
  return `${prefix}-${String(max + 1).padStart(3, "0")}`;
}

function normalizeQualifiers(value) {
  if (Array.isArray(value)) return value.filter(Boolean).map(String);
  if (typeof value === "string" && value.trim()) {
    return value.split(",").map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

export function createEmptyPersonnelRecord(overrides = {}) {
  return normalizePersonnelRecord({
    ...PERSONNEL_FIELD_DEFAULTS,
    ...overrides,
  });
}

export function normalizePersonnelRecord(person = {}) {
  const next = { ...person };

  if (Array.isArray(next.certifications)) {
    next.certifications = next.certifications.map((row) => row);
  }

  const emsCredentialFields = normalizePersonnelEmsCredentials(next);
  next.emsCredentials = emsCredentialFields.emsCredentials;
  next.certifications = emsCredentialFields.certifications;
  next.ems = emsCredentialFields.ems;

  const legacyName = parseLegacyName(next.name);
  if (!String(next.firstName || "").trim() && legacyName.firstName) {
    next.firstName = legacyName.firstName;
    next.middleName = next.middleName || legacyName.middleName;
    next.lastName = next.lastName || legacyName.lastName;
  }

  if (!String(next.unit || "").trim() && String(next.assignment || "").trim()) {
    next.unit = next.assignment;
  }

  if (!String(next.agencyPersonnelId || "").trim() && next.id) {
    next.agencyPersonnelId = next.id;
  }

  next.forgePersonId = String(next.forgePersonId || "").trim();

  const emergency = normalizeAllEmergencyContactFields(next);
  const merged = {
    ...PERSONNEL_FIELD_DEFAULTS,
    ...next,
    ...emergency,
    phone: formatUsPhone(next.phone ?? ""),
    qualifiers: normalizeQualifiers(next.qualifiers),
    isTrainingInstructor: Boolean(next.isTrainingInstructor),
    isSystemUser: Boolean(next.isSystemUser),
    employmentHistory: Array.isArray(next.employmentHistory) ? next.employmentHistory : [],
    promotions: Array.isArray(next.promotions) ? next.promotions : [],
    payRates: Array.isArray(next.payRates) ? next.payRates : [],
    accruals: normalizePersonnelAccruals(next.accruals, next),
    immunizations: Array.isArray(next.immunizations) ? next.immunizations : [],
    consultations: Array.isArray(next.consultations) ? next.consultations : [],
    emsCredentials: Array.isArray(next.emsCredentials) ? next.emsCredentials : [],
    activityLog: normalizeActivityLog(next.activityLog),
  };

  if (merged.emergencySameAddress) {
    Object.assign(merged, copyEmployeeAddressToEmergency(merged, "emergency"));
  }

  if (merged.emergency2SameAddress) {
    Object.assign(merged, copyEmployeeAddressToEmergency(merged, "emergency2"));
  }

  merged.name = buildPersonnelFullName(merged);
  merged.initials = personInitialsFromPerson(merged);
  merged.emergency = formatEmergencyContactSummaryAll(merged);

  return merged;
}
