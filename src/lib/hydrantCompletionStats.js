export function isPrivateHydrant(hydrant = {}) {
  return /P$/i.test(String(hydrant.hydrant_id || hydrant.official_hydrant_id || "").trim());
}

export function isOutOfServiceHydrant(hydrant = {}) {
  const status = String(hydrant.status || "").toLowerCase();
  const flow = String(hydrant.flow_result || "").trim().toUpperCase();
  return status.includes("out") || flow === "OOS";
}

export function currentHydrantYear(referenceDate = new Date()) {
  return String(referenceDate.getFullYear());
}

export function isHydrantCheckedThisYear(hydrant = {}, year = currentHydrantYear()) {
  if (isPrivateHydrant(hydrant) || isOutOfServiceHydrant(hydrant)) return false;
  return String(hydrant.checked_year || "") === year
    || String(hydrant.last_checked || "").startsWith(year);
}

export function isHydrantDueThisYear(hydrant = {}, year = currentHydrantYear()) {
  return !isPrivateHydrant(hydrant)
    && !isOutOfServiceHydrant(hydrant)
    && !isHydrantCheckedThisYear(hydrant, year);
}

function emptyBucket(district) {
  return {
    district,
    total: 0,
    testable: 0,
    completed: 0,
    due: 0,
    private: 0,
    outOfService: 0,
  };
}

function addHydrantToBucket(bucket, hydrant, year) {
  bucket.total += 1;
  if (isPrivateHydrant(hydrant)) {
    bucket.private += 1;
    return;
  }
  if (isOutOfServiceHydrant(hydrant)) {
    bucket.outOfService += 1;
    return;
  }
  bucket.testable += 1;
  if (isHydrantCheckedThisYear(hydrant, year)) {
    bucket.completed += 1;
  } else {
    bucket.due += 1;
  }
}

function finalizeBucket(bucket) {
  const percentComplete = bucket.testable
    ? Math.round((bucket.completed / bucket.testable) * 100)
    : 100;
  const completedWidth = bucket.testable
    ? Math.round((bucket.completed / bucket.testable) * 100)
    : 0;
  const dueWidth = bucket.testable
    ? Math.max(0, 100 - completedWidth)
    : 0;
  return {
    ...bucket,
    percentComplete,
    completedWidth,
    dueWidth,
  };
}

function districtSortKey(label = "") {
  if (label === "City Total") return [99, ""];
  if (label === "Unassigned") return [98, ""];
  const numeric = Number(label);
  if (Number.isFinite(numeric)) return [numeric, label];
  return [50, label];
}

export function buildHydrantCompletionByDistrict(hydrants = [], year = currentHydrantYear()) {
  const districtBuckets = new Map();
  const cityTotal = emptyBucket("City Total");

  (Array.isArray(hydrants) ? hydrants : []).forEach((hydrant) => {
    const district = String(hydrant?.district || "").trim() || "Unassigned";
    if (!districtBuckets.has(district)) districtBuckets.set(district, emptyBucket(district));
    addHydrantToBucket(districtBuckets.get(district), hydrant, year);
    addHydrantToBucket(cityTotal, hydrant, year);
  });

  const districts = [...districtBuckets.values()]
    .map(finalizeBucket)
    .sort((a, b) => {
      const [aRank, aLabel] = districtSortKey(a.district);
      const [bRank, bLabel] = districtSortKey(b.district);
      return aRank - bRank || aLabel.localeCompare(bLabel, undefined, { numeric: true });
    });

  return {
    year,
    districts,
    cityTotal: finalizeBucket(cityTotal),
  };
}
