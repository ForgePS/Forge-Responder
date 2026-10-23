/**
 * Shared academy types for the RMS frontend (mirrors functions/lib/academy/types.js).
 */

export const PROVIDER_TYPES = [
  "forge_academy",
  "external_api",
  "csv_import",
  "sftp_import",
  "manual",
];

export const FORGE_ACADEMY_EVENT_TYPES = [
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
];

export const EMPTY_DEPARTMENT_ACADEMY_STATE = {
  enabled: false,
  status: "not_connected",
};
