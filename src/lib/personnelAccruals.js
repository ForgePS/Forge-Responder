export const PERSONNEL_ACCRUAL_TYPES = [
  { id: "sick", label: "Sick" },
  { id: "vacation", label: "Vacation" },
];

const MS_PER_BIWEEK = 14 * 24 * 60 * 60 * 1000;

export function parseAccrualHours(value) {
  const parsed = parseFloat(String(value ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseAccrualDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function resolveAccrualTypeId(value = "") {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized.includes("sick")) return "sick";
  if (normalized.includes("vac")) return "vacation";
  return normalized === "sick" || normalized === "vacation" ? normalized : "";
}

export function defaultPersonnelAccruals(startDate = "") {
  return PERSONNEL_ACCRUAL_TYPES.map(({ id, label }) => ({
    type: id,
    label,
    startingBalance: 0,
    biweeklyAccrualRate: 0,
    accrualStartDate: startDate || "",
    used: 0,
    adminAdjustment: 0,
    adminAdjustmentNote: "",
  }));
}

export function countBiweeklyPeriods(startDate, asOf = new Date()) {
  const start = parseAccrualDate(startDate);
  if (!start) return 0;

  const end = asOf instanceof Date ? asOf : new Date(asOf);
  if (end < start) return 0;

  return Math.floor((end.getTime() - start.getTime()) / MS_PER_BIWEEK);
}

export function calculateAccruedHours(record = {}, asOf = new Date()) {
  const rate = parseAccrualHours(record.biweeklyAccrualRate);
  if (!rate) return 0;

  const periods = countBiweeklyPeriods(record.accrualStartDate, asOf);
  return periods * rate;
}

export function buildPersonnelAccrualRecord(record = {}) {
  const typeId = resolveAccrualTypeId(record.type || record.label);
  const label = PERSONNEL_ACCRUAL_TYPES.find((item) => item.id === typeId)?.label || record.label || "";

  return {
    type: typeId || record.type || "",
    label,
    startingBalance: parseAccrualHours(record.startingBalance),
    biweeklyAccrualRate: parseAccrualHours(record.biweeklyAccrualRate ?? record.rate),
    accrualStartDate: record.accrualStartDate || "",
    used: parseAccrualHours(record.used),
    adminAdjustment: parseAccrualHours(record.adminAdjustment),
    adminAdjustmentNote: String(record.adminAdjustmentNote || "").trim(),
  };
}

export function summarizePersonnelAccrual(record = {}, asOf = new Date()) {
  const stored = buildPersonnelAccrualRecord(record);
  const startingBalance = stored.startingBalance;
  const biweeklyAccrualRate = stored.biweeklyAccrualRate;
  const accrued = calculateAccruedHours(stored, asOf);
  const used = stored.used;
  const adminAdjustment = stored.adminAdjustment;
  const currentBalance = startingBalance + accrued - used + adminAdjustment;

  return {
    ...stored,
    accrued,
    used,
    adminAdjustment,
    currentBalance,
    biweeklyPeriods: countBiweeklyPeriods(stored.accrualStartDate, asOf),
  };
}

export function normalizePersonnelAccruals(accruals = [], person = {}) {
  const fallbackStartDate = person.hireDate || person.secondaryStartDate || "";
  const incoming = Array.isArray(accruals) ? accruals : [];
  const byType = new Map();

  for (const row of incoming) {
    const typeId = resolveAccrualTypeId(row.type || row.label);
    if (typeId) byType.set(typeId, row);
  }

  return PERSONNEL_ACCRUAL_TYPES.map(({ id, label }) => {
    const row = byType.get(id) || {};
    const legacyRemaining = parseAccrualHours(row.remaining);
    const legacyBalance = parseAccrualHours(row.balance);
    const hasLegacyFlatBalance = legacyRemaining || legacyBalance;
    const hasStructuredFields = row.startingBalance !== undefined
      || row.biweeklyAccrualRate !== undefined
      || row.adminAdjustment !== undefined;

    return buildPersonnelAccrualRecord({
      type: id,
      label,
      startingBalance: hasStructuredFields
        ? row.startingBalance
        : (hasLegacyFlatBalance ? legacyRemaining || legacyBalance : 0),
      biweeklyAccrualRate: row.biweeklyAccrualRate ?? row.rate,
      accrualStartDate: row.accrualStartDate || fallbackStartDate || "",
      used: row.used,
      adminAdjustment: row.adminAdjustment,
      adminAdjustmentNote: row.adminAdjustmentNote,
    });
  });
}

export function formatAccrualHours(hours = 0) {
  return `${parseAccrualHours(hours).toFixed(2)} hrs`;
}

export function updatePersonnelAccrual(accruals = [], typeId, patch = {}) {
  return normalizePersonnelAccruals(
    accruals.map((row) => (
      row.type === typeId
        ? { ...row, ...patch }
        : row
    )),
    {}
  );
}
