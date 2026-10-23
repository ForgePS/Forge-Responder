export const DEFAULT_DEPARTMENT_ID = "horn-lake-fd";

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
  "auditLogs"
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
