// There is deliberately no "default department": when no tenant is resolved the
// app is in platform scope (tenant picker for users, platform workspace for creators).
export const DEMO_DEPARTMENT_ID = "forge-demo";
export const PLATFORM_SCOPE_ID = "__forge-platform__";

export function isPlatformScope(departmentId) {
  return departmentId === PLATFORM_SCOPE_ID;
}

export function isDemoDepartment(departmentId) {
  return departmentId === DEMO_DEPARTMENT_ID;
}

export const DEPARTMENT_COLLECTIONS = [
  "profile",
  "settings",
  "users",
  "lists",
  "personnel",
  "incidents",
  "training",
  "certifications",
  "apparatus",
  "assets",
  "hydrants",
  "occupancies",
  "inspections",
  "inspectionSettings",
  "inspectionAuditEvents",
  "inspectionTypes",
  "inspectionTemplates",
  "inspectionTemplateVersions",
  "preplans",
  "documents",
  "dashboardConfig",
  "auditLogs",
  "internalEmails"
];

export function departmentRoot(departmentId) {
  return ["departments", departmentId || ""];
}

export function departmentDocPath(departmentId, ...segments) {
  return [...departmentRoot(departmentId), ...segments].join("/");
}

export function departmentListPath(departmentId, listKey) {
  return departmentDocPath(departmentId, "lists", listKey);
}

/** Firestore doc() path segments for departments/{id}/lists/{listKey}. */
export function departmentListSegments(departmentId, listKey) {
  return ["departments", departmentId, "lists", listKey];
}

export function departmentRecordPath(departmentId, collectionName, recordId) {
  return departmentDocPath(departmentId, collectionName, recordId);
}

export function departmentStoragePath(departmentId, ...segments) {
  return ["departments", departmentId, ...segments].join("/");
}
