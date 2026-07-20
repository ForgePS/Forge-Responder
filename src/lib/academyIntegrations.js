/**
 * Client wrappers for Academy Integration Hub callables.
 * Frontend never selects Firebase project IDs or academy database locations.
 */

import { httpsCallable } from "firebase/functions";
import { getFirebaseFunctions } from "./firebaseClient.js";

async function call(name, data = {}) {
  const functions = getFirebaseFunctions();
  if (!functions) {
    throw new Error("Firebase Functions are not configured.");
  }
  const fn = httpsCallable(functions, name);
  const result = await fn(data);
  return result.data || {};
}

export const PROVIDER_TYPE_OPTIONS = [
  { value: "forge_academy", label: "Forge Academy" },
  { value: "external_api", label: "External API" },
  { value: "csv_import", label: "CSV import" },
  { value: "sftp_import", label: "SFTP import" },
  { value: "manual", label: "Manual records" },
];

export const CONNECTION_STATUS_LABELS = {
  not_connected: "Not connected",
  pending: "Pending",
  connected: "Connected",
  degraded: "Degraded",
  authentication_error: "Authentication error",
  sync_error: "Sync error",
  suspended: "Suspended",
  disconnected: "Disconnected",
};

export function maskFemaSid(value) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length <= 4) return "****";
  return `${"*".repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;
}

export function listAcademyConnections(departmentId) {
  return call("listAcademyConnections", { departmentId });
}

export function upsertAcademyConnection(departmentId, connection, secrets = {}) {
  return call("upsertAcademyConnection", { departmentId, connection, secrets });
}

export function testAcademyConnection(departmentId, connectionId) {
  return call("testAcademyConnection", { departmentId, connectionId });
}

export function setPrimaryAcademyConnection(departmentId, connectionId) {
  return call("setPrimaryAcademyConnection", { departmentId, connectionId });
}

export function disableAcademyConnection(departmentId, connectionId) {
  return call("disableAcademyConnection", { departmentId, connectionId });
}

export function disconnectAcademyConnection(departmentId, connectionId) {
  return call("disconnectAcademyConnection", { departmentId, connectionId });
}

export function listAcademyAuditLogs(departmentId, opts = {}) {
  return call("listAcademyAuditLogs", { departmentId, ...opts });
}

export function migrateLegacyForgeAcademySettings(departmentId) {
  return call("migrateLegacyForgeAcademySettings", { departmentId });
}

export function academyFindStudent(departmentId, connectionId, person) {
  return call("academyFindStudent", { departmentId, connectionId, person });
}

export function academyGetTranscript(departmentId, connectionId, personId) {
  return call("academyGetTranscript", { departmentId, connectionId, personId });
}

export function academyGetCompletions(departmentId, connectionId, personId) {
  return call("academyGetCompletions", { departmentId, connectionId, personId });
}

export function academyGetCertificates(departmentId, connectionId, personId) {
  return call("academyGetCertificates", { departmentId, connectionId, personId });
}

export function academyGetEnrollments(departmentId, connectionId, personId) {
  return call("academyGetEnrollments", { departmentId, connectionId, personId });
}

export function academySubmitEnrollment(departmentId, connectionId, payload) {
  return call("academySubmitEnrollment", { departmentId, connectionId, ...payload });
}

export function academySyncPerson(departmentId, connectionId, payload) {
  return call("academySyncPerson", { departmentId, connectionId, ...payload });
}

export function listAcademyLinks(departmentId, personId) {
  return call("listAcademyLinks", { departmentId, personId });
}

export function linkAcademyPerson(departmentId, payload) {
  return call("linkAcademyPerson", { departmentId, ...payload });
}

export function unlinkAcademyPerson(departmentId, personId, linkId) {
  return call("unlinkAcademyPerson", { departmentId, personId, linkId });
}

export function resolveAcademyMatchConflict(departmentId, payload) {
  return call("resolveAcademyMatchConflict", { departmentId, ...payload });
}
