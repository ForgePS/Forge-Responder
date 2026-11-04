/**
 * The full personnel profile (My Profile, Personnel → Credentials / Issued
 * equipment). Pure helpers, unit tested: field groups, who edits what, issued
 * equipment, and what needs attention (expired / expiring soon).
 *
 * Private values (SSN, birth date, demographics, driver's license number) are
 * stored in personnelPrivate/{id}; see personnelPrivateFields.js.
 */
import { daysUntil, parseLooseDate } from "./liveDates.js";

export const ATTENTION_DAYS = 90;

/** Field types: text (default), date, select (dropdown you can type into), multi (list of values). */

export const LICENSE_TYPES = [
  "Class A", "Class B", "Class C", "Class D", "Commercial Class A", "Commercial Class B", "Commercial Class C",
  "Motorcycle (Class M)", "All-Terrain Vehicle (ATV)", "None",
];

export const LANGUAGE_OPTIONS = [
  "American Sign Language", "Arabic", "Chinese (Mandarin)", "Chinese (Cantonese)", "French", "German", "Haitian Creole",
  "Hindi", "Italian", "Japanese", "Korean", "Polish", "Portuguese", "Russian", "Spanish", "Tagalog", "Vietnamese",
];

export const RACE_OPTIONS = [
  "American Indian or Alaska Native", "Asian", "Black or African American", "Hispanic or Latino",
  "Native Hawaiian or Other Pacific Islander", "White", "Two or more races", "Prefer not to say",
];

export const EMS_LEVELS = [
  "Emergency Medical Responder", "EMT", "Advanced EMT", "Paramedic", "Critical Care Paramedic", "Registered Nurse",
];

export const EDUCATION_OPTIONS = [
  "High school / GED", "Some college", "Associate degree", "Bachelor's degree", "Master's degree", "Doctorate",
];

export const PHONE_TYPES = ["Mobile", "Home", "Work", "Other"];
export const EMAIL_TYPES = ["Personal", "Work", "Other"];

export const EQUIPMENT_CATEGORIES = [
  "Turnout coat", "Turnout pants", "Helmet", "Boots", "Gloves", "Hood", "SCBA facepiece", "SCBA pack", "SCBA cylinder",
  "PASS device", "Radio", "Pager", "Flashlight", "Wildland gear", "Uniform", "Key / access card", "Other",
];
export const EQUIPMENT_STATUSES = ["Issued", "Returned", "Out for repair", "Retired", "Lost"];

/** NFPA 1851: structural firefighting gear is retired 10 years after manufacture. */
export const NFPA_GEAR_YEARS = 10;
const NFPA_GEAR_CATEGORIES = new Set(["Turnout coat", "Turnout pants", "Helmet", "Boots", "Gloves", "Hood"]);

/**
 * Field groups shown on the profile. `private` values live in personnelPrivate.
 * `self` fields the person may change on their own profile.
 */
export const PROFILE_GROUPS = {
  identity: {
    title: "Name",
    fields: [
      { key: "firstName", label: "First name" },
      { key: "middleName", label: "Middle name / initial" },
      { key: "lastName", label: "Last name" },
    ],
  },
  personal: {
    title: "Personal",
    fields: [
      { key: "birthDate", label: "Date of birth", type: "date", private: true },
      { key: "gender", label: "Gender", type: "select", options: ["Male", "Female", "Prefer not to say"], private: true },
      { key: "race", label: "Race", type: "select", options: RACE_OPTIONS, private: true },
      { key: "citizenship", label: "Citizenship", type: "select", options: ["United States"], private: true },
      { key: "maritalStatus", label: "Marital status", type: "select", options: ["Single", "Married", "Divorced", "Widowed"], private: true },
      { key: "socialSecurityNumber", label: "Social Security number", private: true, secret: true },
      { key: "languages", label: "Foreign languages", type: "multi", options: LANGUAGE_OPTIONS, self: true, wide: true },
    ],
  },
  license: {
    title: "Driver's license",
    fields: [
      { key: "driversLicenseNumber", label: "License number", private: true, secret: true },
      { key: "driversLicenseState", label: "State" },
      { key: "driversLicenseClass", label: "Class" },
      { key: "driversLicenseExpiration", label: "Expiration", type: "date", expires: true },
      { key: "vehicleLicenseTypes", label: "Vehicle license types", type: "multi", options: LICENSE_TYPES, wide: true },
    ],
  },
  address: {
    title: "Home address",
    fields: [
      { key: "address", label: "Address", self: true, wide: true },
      { key: "unitSuite", label: "Address 2", self: true },
      { key: "city", label: "City", self: true },
      { key: "state", label: "State", self: true },
      { key: "zip", label: "Postal code", self: true },
      { key: "country", label: "Country", type: "select", options: ["United States"], self: true },
    ],
  },
  nationalRegistry: {
    title: "National Registry",
    fields: [
      { key: "nrLevel", label: "Certification level", type: "select", options: EMS_LEVELS },
      { key: "nrNumber", label: "Certification number" },
      { key: "nrCertDate", label: "Certification date", type: "date" },
      { key: "nrExpiration", label: "Expiration", type: "date", expires: true },
      { key: "nationalEmsId", label: "National EMS ID" },
    ],
  },
  stateLicense: {
    title: "State licensure",
    fields: [
      { key: "stateLicenseState", label: "State of licensure" },
      { key: "stateLicenseId", label: "State license ID" },
      { key: "stateLicenseLevel", label: "License level", type: "select", options: EMS_LEVELS },
      { key: "stateLicenseCertDate", label: "Certification date", type: "date" },
      { key: "stateLicenseExpiration", label: "Expiration", type: "date", expires: true },
      { key: "stateLicenseInitialIssue", label: "Initial issue date", type: "date" },
    ],
  },
  agencyLicense: {
    title: "Agency licensure",
    fields: [
      { key: "agencyLicenseLevel", label: "Practice level", type: "select", options: EMS_LEVELS },
      { key: "agencyLicenseCertDate", label: "Certification date", type: "date" },
      { key: "agencyLicenseExpiration", label: "Expiration", type: "date", expires: true },
      { key: "crewResponseRole", label: "Crew response role", type: "select", options: ["Primary patient caregiver", "Secondary caregiver", "Driver", "Other"] },
    ],
  },
  education: {
    title: "Education",
    fields: [
      { key: "educationDegree", label: "Highest degree", type: "select", options: EDUCATION_OPTIONS },
      { key: "educationField", label: "Subject / field of study", wide: true },
    ],
  },
  ids: {
    title: "Identifiers",
    fields: [
      { key: "agencyPersonnelId", label: "Agency ID" },
      { key: "payrollId", label: "Payroll ID" },
      { key: "badgeNumber", label: "Badge #" },
      { key: "trainerId", label: "Trainer / instructor ID" },
    ],
  },
  assignment: {
    title: "Assignment",
    fields: [
      { key: "rank", label: "Rank", type: "select", dropdown: "ranks" },
      { key: "position", label: "Position", type: "select", dropdown: "personnelPositions" },
      { key: "employmentType", label: "Employment status", type: "select", options: ["Full Time Paid", "Part Time Paid", "Volunteer", "Paid on Call", "Reserve"] },
      { key: "status", label: "Agency status", type: "select", options: ["Active", "Inactive", "Leave", "Retired"] },
      { key: "shift", label: "Shift", type: "select", dropdown: "shifts" },
      { key: "station", label: "Station", type: "select", dropdown: "stations" },
      { key: "unit", label: "Unit" },
      { key: "supervisor", label: "Supervisor" },
      { key: "hireDate", label: "Hire date", type: "date" },
      { key: "serviceDocumentedDate", label: "Length of service documented", type: "date" },
      { key: "primaryJobRole", label: "Primary job role", type: "select", options: ["Fire Suppression", "EMS", "Fire & EMS", "Prevention", "Administration", "Communications", "Training"] },
      { key: "otherJobResponsibilities", label: "Other job responsibilities", wide: true },
    ],
  },
};

/** Keys a member may change on their own personnel record (firestore.rules matches this list). */
export const SELF_EDIT_KEYS = Object.freeze([
  "address", "unitSuite", "city", "state", "zip", "country", "phones", "emails", "phone", "email", "languages",
  "emergency", "emergencyFirstName", "emergencyLastName", "emergencyPhone", "emergencyRelationship",
  "emergencyAddress", "emergencyCity", "emergencyState", "emergencyZip", "emergencySameAddress",
  "emergency2FirstName", "emergency2LastName", "emergency2Phone", "emergency2Relationship",
  "emergency2Address", "emergency2City", "emergency2State", "emergency2Zip", "emergency2SameAddress",
  "updatedAt",
]);

const text = (value) => String(value ?? "").trim();
const newId = (prefix) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

/** "•••-••-1234" for display; the full number only when revealed. */
export function maskSecret(value, { keep = 4, ssn = false } = {}) {
  const raw = text(value);
  if (!raw) return "";
  const digits = raw.replace(/\W/g, "");
  const last = digits.slice(-keep);
  if (ssn) return `•••-••-${last}`;
  return `${"•".repeat(Math.max(3, digits.length - keep))}${last}`;
}

/** Whole years and months between two dates ("7 yrs 3 mos"); "" when no start. */
export function lengthOfService(hireDate, now = new Date()) {
  const start = parseLooseDate(hireDate);
  if (!start || start > now) return "";
  let months = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
  if (now.getDate() < start.getDate()) months -= 1;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  const parts = [];
  if (years) parts.push(`${years} yr${years === 1 ? "" : "s"}`);
  if (rest || !years) parts.push(`${rest} mo${rest === 1 ? "" : "s"}`);
  return parts.join(" ");
}

/** "expired" | "soon" | "ok" | "" (no date) for an expiration date. */
export function expiryState(value, now = new Date(), soonDays = ATTENTION_DAYS) {
  const days = daysUntil(value, now);
  if (days === null || days === undefined) return "";
  if (days < 0) return "expired";
  if (days <= soonDays) return "soon";
  return "ok";
}

/* ------------------------------ phones & emails ----------------------------- */

/** Phone list, starting from the single legacy `phone` when there's no list yet. */
export function profilePhones(person = {}) {
  if (Array.isArray(person.phones) && person.phones.length) {
    return person.phones.map((row) => ({ id: row.id || newId("phone"), number: text(row.number), type: text(row.type) || "Mobile", primary: Boolean(row.primary), notes: text(row.notes) }));
  }
  return text(person.phone) ? [{ id: "phone-primary", number: text(person.phone), type: "Mobile", primary: true, notes: "" }] : [];
}

export function profileEmails(person = {}) {
  if (Array.isArray(person.emails) && person.emails.length) {
    return person.emails.map((row) => ({ id: row.id || newId("email"), address: text(row.address), type: text(row.type) || "Work", primary: Boolean(row.primary), notifications: row.notifications !== false }));
  }
  return text(person.email) ? [{ id: "email-primary", address: text(person.email), type: "Work", primary: true, notifications: true }] : [];
}

/**
 * Clean phone/email rows for saving: drop blanks, exactly one primary, and the
 * primary copied to the legacy `phone` / `email` the rest of the app reads.
 */
export function contactPatch(phones = [], emails = []) {
  const cleanPhones = phones.filter((row) => text(row.number)).map((row) => ({ ...row, number: text(row.number), notes: text(row.notes) }));
  const cleanEmails = emails.filter((row) => text(row.address)).map((row) => ({ ...row, address: text(row.address).toLowerCase() }));
  const onePrimary = (rows) => {
    const index = Math.max(0, rows.findIndex((row) => row.primary));
    return rows.map((row, i) => ({ ...row, primary: i === index }));
  };
  const nextPhones = onePrimary(cleanPhones);
  const nextEmails = onePrimary(cleanEmails);
  return {
    phones: nextPhones,
    emails: nextEmails,
    phone: nextPhones[0] ? nextPhones.find((row) => row.primary).number : "",
    email: nextEmails[0] ? nextEmails.find((row) => row.primary).address : "",
  };
}

/* ------------------------------ issued equipment ---------------------------- */

export function emptyEquipment() {
  return { id: newId("equip"), item: "", category: "", manufacturer: "", model: "", serial: "", size: "", mfgDate: "", issuedDate: "", expirationDate: "", status: "Issued", notes: "" };
}

export function normalizeEquipment(rows = []) {
  return (Array.isArray(rows) ? rows : []).map((row) => ({
    ...emptyEquipment(),
    ...Object.fromEntries(Object.entries(row || {}).map(([key, value]) => [key, typeof value === "string" ? value : value ?? ""])),
    id: text(row?.id) || newId("equip"),
    status: text(row?.status) || "Issued",
  }));
}

/** Rows worth saving (anything besides id/status filled in). */
export function usableEquipment(rows = []) {
  return normalizeEquipment(rows)
    .map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, typeof value === "string" ? value.trim() : value])))
    .filter((row) => ["item", "category", "manufacturer", "model", "serial", "size", "mfgDate", "issuedDate", "expirationDate", "notes"].some((key) => row[key]));
}

/** The NFPA 1851 retirement date (10 years from manufacture) for structural gear, else "". */
export function suggestedRetirement(row = {}) {
  if (!NFPA_GEAR_CATEGORIES.has(row.category)) return "";
  const made = parseLooseDate(row.mfgDate);
  if (!made) return "";
  const retire = new Date(made.getFullYear() + NFPA_GEAR_YEARS, made.getMonth(), made.getDate());
  const pad = (n) => String(n).padStart(2, "0");
  return `${retire.getFullYear()}-${pad(retire.getMonth() + 1)}-${pad(retire.getDate())}`;
}

/** The date an item expires: its own, else the NFPA retirement date. */
export function equipmentExpiration(row = {}) {
  return text(row.expirationDate) || suggestedRetirement(row);
}

/** Only items still with the person count for warnings. */
export function isEquipmentInHand(row = {}) {
  return ["Issued", "Out for repair", ""].includes(text(row.status));
}

/* -------------------------------- attention -------------------------------- */

/**
 * Everything expired or expiring within ATTENTION_DAYS, soonest first:
 * licensure, driver's license, immunizations, issued equipment, certifications.
 * certifications: department certification records for this person.
 */
export function profileAttention(person = {}, certifications = [], now = new Date()) {
  const items = [];
  const add = (label, area, date) => {
    const state = expiryState(date, now);
    if (state === "expired" || state === "soon") items.push({ label, area, date, state, days: daysUntil(date, now) });
  };
  Object.values(PROFILE_GROUPS).forEach((group) => {
    group.fields.filter((field) => field.expires).forEach((field) => {
      if (text(person[field.key])) add(`${group.title} ${field.label.toLowerCase()}`.replace(" expiration", ""), group === PROFILE_GROUPS.license ? "personal" : "credentials", person[field.key]);
    });
  });
  (person.immunizations || []).forEach((row) => { if (text(row?.expiration)) add(row.vaccine || "Immunization", "health", row.expiration); });
  normalizeEquipment(person.issuedEquipment).filter(isEquipmentInHand).forEach((row) => {
    const date = equipmentExpiration(row);
    if (date) add([row.item || row.category, row.serial ? `#${row.serial}` : ""].filter(Boolean).join(" "), "equipment", date);
  });
  (certifications || []).forEach((cert) => { if (text(cert?.expires)) add(cert.type || "Certification", "credentials", cert.expires); });
  return items.sort((a, b) => a.days - b.days);
}
