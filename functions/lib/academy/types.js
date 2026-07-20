/** Academy Integration Hub — shared constants and defaults. */

const PROVIDER_TYPES = Object.freeze([
  "forge_academy",
  "external_api",
  "csv_import",
  "sftp_import",
  "manual",
]);

const CONNECTION_STATUSES = Object.freeze([
  "not_connected",
  "pending",
  "connected",
  "degraded",
  "authentication_error",
  "sync_error",
  "suspended",
  "disconnected",
]);

const SYNC_MODES = Object.freeze([
  "automatic",
  "scheduled",
  "file_based",
  "manual",
]);

const MATCH_STATUSES = Object.freeze([
  "matched",
  "possible_match",
  "not_found",
  "conflict",
  "manual_review_required",
]);

const CAPABILITY_KEYS = Object.freeze([
  "studentLookup",
  "studentLinking",
  "enrollmentSubmission",
  "enrollmentApproval",
  "transcriptAccess",
  "courseCompletionSync",
  "certificateSync",
  "paymentAuthorization",
  "rosterSync",
]);

const DEFAULT_CAPABILITIES = Object.freeze({
  forge_academy: {
    studentLookup: true,
    studentLinking: true,
    enrollmentSubmission: true,
    enrollmentApproval: true,
    transcriptAccess: true,
    courseCompletionSync: true,
    certificateSync: true,
    paymentAuthorization: true,
    rosterSync: true,
  },
  external_api: {
    studentLookup: true,
    studentLinking: true,
    enrollmentSubmission: false,
    enrollmentApproval: false,
    transcriptAccess: true,
    courseCompletionSync: true,
    certificateSync: true,
    paymentAuthorization: false,
    rosterSync: false,
  },
  csv_import: {
    studentLookup: false,
    studentLinking: true,
    enrollmentSubmission: false,
    enrollmentApproval: false,
    transcriptAccess: false,
    courseCompletionSync: true,
    certificateSync: true,
    paymentAuthorization: false,
    rosterSync: false,
  },
  sftp_import: {
    studentLookup: false,
    studentLinking: true,
    enrollmentSubmission: false,
    enrollmentApproval: false,
    transcriptAccess: false,
    courseCompletionSync: true,
    certificateSync: true,
    paymentAuthorization: false,
    rosterSync: false,
  },
  manual: {
    studentLookup: false,
    studentLinking: true,
    enrollmentSubmission: false,
    enrollmentApproval: false,
    transcriptAccess: false,
    courseCompletionSync: false,
    certificateSync: false,
    paymentAuthorization: false,
    rosterSync: false,
  },
});

const DEFAULT_MATCHING_POLICY = Object.freeze({
  primaryIdentifier: "femaSid",
  requireNameMatch: true,
  requireDateOfBirthMatch: false,
  manualReviewOnConflict: true,
});

const ACADEMY_PERMISSIONS = Object.freeze({
  view: "academyIntegrationsView",
  manage: "academyIntegrationsManage",
  test: "academyIntegrationsTest",
  personSearch: "academyPersonSearch",
  personLink: "academyPersonLink",
  personUnlink: "academyPersonUnlink",
  personResolveConflict: "academyPersonResolveConflict",
  transcriptView: "academyTranscriptView",
  enrollmentSubmit: "academyEnrollmentSubmit",
  enrollmentApprove: "academyEnrollmentApprove",
  paymentAuthorize: "academyPaymentAuthorize",
  syncRun: "academySyncRun",
  syncViewErrors: "academySyncViewErrors",
  auditView: "academyAuditView",
});

const FORGE_ACADEMY_EVENT_TYPES = Object.freeze([
  "academy.student.created",
  "academy.student.updated",
  "academy.enrollment.created",
  "academy.enrollment.updated",
  "academy.enrollment.cancelled",
  "academy.course.completed",
  "academy.certificate.issued",
  "academy.certificate.updated",
  "academy.certificate.revoked",
  "academy.transcript.updated",
  "academy.payment.status_changed",
]);

function defaultCapabilitiesFor(providerType) {
  return { ...(DEFAULT_CAPABILITIES[providerType] || DEFAULT_CAPABILITIES.manual) };
}

function normalizeFemaSid(value) {
  return String(value ?? "").replace(/\D/g, "");
}

function maskFemaSid(value) {
  const digits = normalizeFemaSid(value);
  if (!digits) return "";
  if (digits.length <= 4) return "****";
  return `${"*".repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;
}

function newConnectionId() {
  const rand = Math.random().toString(36).slice(2, 10).toUpperCase();
  return `aconn_${Date.now().toString(36)}${rand}`;
}

function newLinkId() {
  const rand = Math.random().toString(36).slice(2, 10).toUpperCase();
  return `alink_${Date.now().toString(36)}${rand}`;
}

function secretReferenceFor(departmentId, connectionId) {
  return `academy-integrations/${departmentId}/${connectionId}`;
}

module.exports = {
  PROVIDER_TYPES,
  CONNECTION_STATUSES,
  SYNC_MODES,
  MATCH_STATUSES,
  CAPABILITY_KEYS,
  DEFAULT_CAPABILITIES,
  DEFAULT_MATCHING_POLICY,
  ACADEMY_PERMISSIONS,
  FORGE_ACADEMY_EVENT_TYPES,
  defaultCapabilitiesFor,
  normalizeFemaSid,
  maskFemaSid,
  newConnectionId,
  newLinkId,
  secretReferenceFor,
};
