export const HORN_LAKE_DEPARTMENT_ID = "horn-lake-fd";
/** Default tenant when no gateway or membership is resolved (Horn Lake production branch). */
export const DEFAULT_DEPARTMENT_ID = HORN_LAKE_DEPARTMENT_ID;
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
  "preplans",
  "documents",
  "dashboardConfig",
  "auditLogs",
  "internalEmails"
];

export function departmentRoot(departmentId = DEFAULT_DEPARTMENT_ID) {
  return ["departments", departmentId];
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

/** Legacy prototype path used before multi-tenant conversion. */
export function legacyRmsDataPath(listKey) {
  return `rmsData/${listKey}`;
}
