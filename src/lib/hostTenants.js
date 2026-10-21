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
  { hostIncludes: "horn-lake-fire", departmentId: "horn-lake-fd", hydrantApp: true },
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

/** Department id locked by the current hostname, or "". */
export function hostLockedDepartmentId(hostname) {
  return resolveHostTenant(hostname)?.departmentId || "";
}
