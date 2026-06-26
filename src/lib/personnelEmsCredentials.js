import {
  formatPersonnelDateForDisplay,
  formatPersonnelDateForInput,
  parsePersonnelDate,
} from "./personnelDates.js";

const EMS_LEVEL_RANK = {
  paramedic: 3,
  aemt: 2,
  emt: 1,
};

const EMS_CREDENTIAL_PATTERN = /^(paramedic|aemt|advanced\s+emt|emt)$/i;

export function isEmsCredentialName(name = "") {
  const value = String(name || "").trim();
  if (!value) return false;
  return EMS_CREDENTIAL_PATTERN.test(value);
}

export function parseCredentialDate(value = "") {
  return parsePersonnelDate(value);
}

export function formatCredentialDateForInput(value = "") {
  return formatPersonnelDateForInput(value);
}

export function formatCredentialDateForDisplay(value = "") {
  return formatPersonnelDateForDisplay(value);
}

export function computeEmsCredentialStatus(expiration = "", referenceDate = new Date()) {
  const expiresAt = parseCredentialDate(expiration);
  if (!expiresAt) return "Active";

  const today = new Date(referenceDate);
  today.setHours(0, 0, 0, 0);
  expiresAt.setHours(0, 0, 0, 0);

  const diffDays = Math.round((expiresAt - today) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return "Expired";
  if (diffDays <= 90) return "Due Soon";
  return "Active";
}

function normalizeCredentialRow(row = {}, index = 0) {
  if (Array.isArray(row)) {
    const [credential = "", expiration = "", status = ""] = row;
    return normalizeCredentialRow({ credential, expiration, status }, index);
  }

  const credential = String(row.credential || row.type || row.name || "").trim();
  const expiration = String(row.expiration || row.expires || "").trim();
  const status = String(row.status || "").trim() || computeEmsCredentialStatus(expiration);

  return {
    id: row.id || `ems-cred-${index + 1}`,
    credential,
    expiration,
    status,
  };
}

export function normalizeEmsCredentialRows(rows = []) {
  if (!Array.isArray(rows)) return [];
  return rows
    .map(normalizeCredentialRow)
    .filter((row) => row.credential);
}

function emsLevelRank(credential = "") {
  const normalized = String(credential || "").trim().toLowerCase();
  if (/paramedic|\bmedic\b|\bals\b/.test(normalized)) return EMS_LEVEL_RANK.paramedic;
  if (/aemt|advanced/.test(normalized)) return EMS_LEVEL_RANK.aemt;
  if (/emt/.test(normalized)) return EMS_LEVEL_RANK.emt;
  return 0;
}

export function pickHighestEmsCredential(rows = []) {
  const normalized = normalizeEmsCredentialRows(rows);
  if (!normalized.length) return null;

  return [...normalized].sort((a, b) => {
    const rankDiff = emsLevelRank(b.credential) - emsLevelRank(a.credential);
    if (rankDiff !== 0) return rankDiff;
    const aDate = parseCredentialDate(a.expiration)?.getTime() || 0;
    const bDate = parseCredentialDate(b.expiration)?.getTime() || 0;
    return bDate - aDate;
  })[0];
}

export function resolveActiveEmsCredentials(rows = [], referenceDate = new Date()) {
  return normalizeEmsCredentialRows(rows).filter((row) => (
    computeEmsCredentialStatus(row.expiration, referenceDate) !== "Expired"
  ));
}

export function derivePersonEmsLevel(rows = [], fallback = "") {
  const active = resolveActiveEmsCredentials(rows);
  const source = active.length ? active : normalizeEmsCredentialRows(rows);
  const highest = pickHighestEmsCredential(source);
  if (highest?.credential) return highest.credential;

  const legacy = String(fallback || "").trim();
  if (legacy && !/^none$/i.test(legacy)) return legacy;
  return "";
}

export function resolvePersonEmsLevel(person = {}) {
  if (Array.isArray(person.emsCredentials)) {
    return derivePersonEmsLevel(person.emsCredentials, "");
  }
  const legacy = String(person.ems || "").trim();
  return /^none$/i.test(legacy) ? "" : legacy;
}

function certificationTupleToEmsCredential(row = []) {
  if (!Array.isArray(row) || !row.length) return null;
  const [credential = "", expiration = "", status = ""] = row;
  if (!isEmsCredentialName(credential)) return null;
  return normalizeCredentialRow({ credential, expiration, status });
}

export function splitPersonnelCertifications(certifications = []) {
  const emsCredentials = [];
  const fireCertifications = [];

  (Array.isArray(certifications) ? certifications : []).forEach((row, index) => {
    const emsRow = certificationTupleToEmsCredential(row);
    if (emsRow) {
      emsCredentials.push({ ...emsRow, id: `ems-cred-${index + 1}` });
      return;
    }
    fireCertifications.push(row);
  });

  return { emsCredentials, fireCertifications };
}

export function normalizePersonnelEmsCredentials(person = {}) {
  const hasExplicitEmsCredentials = Array.isArray(person.emsCredentials);
  let emsCredentials = hasExplicitEmsCredentials
    ? normalizeEmsCredentialRows(person.emsCredentials)
    : normalizeEmsCredentialRows(person.emsCredentials || []);
  let certifications = Array.isArray(person.certifications) ? [...person.certifications] : [];

  if (hasExplicitEmsCredentials) {
    const split = splitPersonnelCertifications(certifications);
    certifications = split.fireCertifications;
  } else if (!emsCredentials.length) {
    const split = splitPersonnelCertifications(certifications);
    emsCredentials = split.emsCredentials;
    certifications = split.fireCertifications;
  } else {
    const split = splitPersonnelCertifications(certifications);
    certifications = split.fireCertifications;
  }

  if (!emsCredentials.length && !hasExplicitEmsCredentials) {
    const legacyEms = String(person.ems || "").trim();
    if (legacyEms && !/^none$/i.test(legacyEms)) {
      emsCredentials = [{
        id: "ems-cred-legacy",
        credential: legacyEms,
        expiration: "",
        status: "Active",
      }];
    }
  }

  emsCredentials = normalizeEmsCredentialRows(emsCredentials).map((row, index) => ({
    ...row,
    status: computeEmsCredentialStatus(row.expiration),
    id: row.id || `ems-cred-${index + 1}`,
  }));

  return {
    emsCredentials,
    certifications,
    ems: derivePersonEmsLevel(emsCredentials, hasExplicitEmsCredentials ? "" : person.ems),
  };
}
