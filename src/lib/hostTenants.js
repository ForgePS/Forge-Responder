/**
 * Department-branded hostnames.
 *
 * Some departments serve the app (e.g. their hydrant program) on their own
 * hostname. A request on a matching host is locked to that department.
 * This is customer configuration, not a platform default: add an entry here
 * for each branded host. (Longer term this belongs on the department's
 * rmsGateways record.)
 */
const HOST_TENANTS = [
  // Horn Lake Fire Department hydrant program, e.g. horn-lake-fire.web.app
  // hydrantReportPrefix: their hydrants are labeled "HL 123", so reports keep that prefix.
  { hostIncludes: "horn-lake-fire", departmentId: "horn-lake-fd", hydrantApp: true, hydrantReportPrefix: "HL" },
];

function normalizeHost(hostname) {
  return String(hostname || "").trim().toLowerCase();
}

/** The host-tenant entry for this hostname, or null. */
export function resolveHostTenant(
  hostname = typeof window !== "undefined" ? window.location.hostname : ""
) {
  const host = normalizeHost(hostname);
  if (!host) return null;
  return HOST_TENANTS.find((entry) => host.includes(entry.hostIncludes)) || null;
}

/** Prefix a department prints before hydrant IDs on reports ("HL" → "HL 123"), or "". */
export function hydrantReportPrefixFor(departmentId = "") {
  return HOST_TENANTS.find((entry) => entry.departmentId === departmentId)?.hydrantReportPrefix || "";
}

/** Department id locked by the current hostname, or "". */
export function hostLockedDepartmentId(hostname) {
  return resolveHostTenant(hostname)?.departmentId || "";
}
