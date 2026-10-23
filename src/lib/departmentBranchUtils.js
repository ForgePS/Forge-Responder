const STATE_CODE_PATTERN = /^[A-Z]{2}$/;

export function composeDepartmentAddressLine({ address = "", city = "", stateId = "", zip = "" } = {}) {
  const street = String(address || "").trim();
  const cityPart = String(city || "").trim();
  const state = String(stateId || "").trim().toUpperCase();
  const zipPart = String(zip || "").trim();
  const cityStateZip = [cityPart, [state, zipPart].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return [street, cityStateZip].filter(Boolean).join(", ");
}

export function isValidUsZipCode(zip = "") {
  return /^\d{5}(-\d{4})?$/.test(String(zip || "").trim());
}

export function inferStateIdFromAddress(address = "") {
  const text = String(address || "").trim();
  if (!text) return "";

  const trailingState = text.match(/,\s*([A-Za-z]{2})(?:\s+\d{5}(?:-\d{4})?)?\s*$/);
  if (trailingState) return trailingState[1].toUpperCase();

  const zipState = text.match(/\b([A-Za-z]{2})\b\s+\d{5}(?:-\d{4})?\b/);
  if (zipState) return zipState[1].toUpperCase();

  return "";
}

export function normalizeDepartmentStateId(stateId = "", address = "") {
  const trimmed = String(stateId || "").trim().toUpperCase();
  if (STATE_CODE_PATTERN.test(trimmed)) return trimmed;
  return inferStateIdFromAddress(address);
}

function stateSortKey(stateId = "") {
  return stateId || "ZZ";
}

export function sortDepartmentsByState(departments = []) {
  return [...departments].sort((left, right) => {
    const leftState = normalizeDepartmentStateId(left.stateId, left.address);
    const rightState = normalizeDepartmentStateId(right.stateId, right.address);
    const stateCompare = stateSortKey(leftState).localeCompare(stateSortKey(rightState));
    if (stateCompare !== 0) return stateCompare;

    const nameCompare = String(left.name || left.id || "").localeCompare(
      String(right.name || right.id || ""),
      undefined,
      { sensitivity: "base" }
    );
    if (nameCompare !== 0) return nameCompare;

    return String(left.id || "").localeCompare(String(right.id || ""), undefined, { sensitivity: "base" });
  });
}

export function filterDepartmentsBySearch(departments = [], query = "") {
  const normalizedQuery = String(query || "").trim().toLowerCase();
  if (!normalizedQuery) return departments;

  return departments.filter((department) => {
    const stateId = normalizeDepartmentStateId(department.stateId, department.address);
    const haystack = [
      department.name,
      department.shortName,
      department.id,
      stateId,
      department.address,
      department.status,
      department.subscription?.expirationDate,
      department.subscription?.startDate,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return haystack.includes(normalizedQuery);
  });
}

export function resolveDepartmentBranchState(department = {}, profile = {}) {
  const address = profile.address || department.address || "";
  return normalizeDepartmentStateId(
    department.stateId || profile.stateId,
    address
  );
}
