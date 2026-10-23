import {
  formatEmergencyContactSummary,
  formatUsPhone,
  normalizeEmergencyContactFields,
} from "./personnelContact.js";

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
  emergencyAddress: "",
  emergencyCity: "",
  emergencyState: "",
  emergencyZip: "",
  emergencySameAddress: false,
  emergency: "",
  badgeNumber: "",
  agencyPersonnelId: "",
  apiId: "",
  firefighterId: "",
  femaId: "",
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

  const emergency = normalizeEmergencyContactFields(next);
  const merged = {
    ...PERSONNEL_FIELD_DEFAULTS,
    ...next,
    ...emergency,
    phone: formatUsPhone(next.phone ?? ""),
    qualifiers: normalizeQualifiers(next.qualifiers),
    isTrainingInstructor: Boolean(next.isTrainingInstructor),
  };

  if (merged.emergencySameAddress) {
    Object.assign(merged, {
      emergencyAddress: merged.address ?? "",
      emergencyCity: merged.city ?? "",
      emergencyState: merged.state ?? "",
      emergencyZip: merged.zip ?? "",
    });
  }

  merged.name = buildPersonnelFullName(merged);
  merged.initials = personInitialsFromPerson(merged);
  merged.emergency = formatEmergencyContactSummary(merged);

  return merged;
}
