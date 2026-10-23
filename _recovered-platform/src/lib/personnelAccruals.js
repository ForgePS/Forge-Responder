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

export function summarizePersonnelAccrual(record = {}, asOf = new Date()) {
  const startingBalance = parseAccrualHours(record.startingBalance);
  const biweeklyAccrualRate = parseAccrualHours(record.biweeklyAccrualRate);
  const accrued = calculateAccruedHours(record, asOf);
  const used = parseAccrualHours(record.used);
  const adminAdjustment = parseAccrualHours(record.adminAdjustment);
  const currentBalance = startingBalance + accrued - used + adminAdjustment;

  return {
    ...record,
    startingBalance,
    biweeklyAccrualRate,
    accrued,
    used,
    adminAdjustment,
    currentBalance,
    biweeklyPeriods: countBiweeklyPeriods(record.accrualStartDate, asOf),
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

    return summarizePersonnelAccrual({
      type: id,
      label,
      startingBalance: hasStructuredFields
        ? parseAccrualHours(row.startingBalance)
        : (hasLegacyFlatBalance ? legacyRemaining || legacyBalance : 0),
      biweeklyAccrualRate: parseAccrualHours(row.biweeklyAccrualRate ?? row.rate),
      accrualStartDate: row.accrualStartDate || fallbackStartDate || "",
      used: parseAccrualHours(row.used),
      adminAdjustment: parseAccrualHours(row.adminAdjustment),
      adminAdjustmentNote: String(row.adminAdjustmentNote || "").trim(),
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
