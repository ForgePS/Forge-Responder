function clampInt(value, min, max, fallback) {
  const parsed = parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export const defaultEmployeePortalRules = {
  vacationMaxAdvanceDays: 60,
  shiftTradeMaxAdvanceMonths: 3,
};

export function normalizeEmployeePortalRules(input = {}) {
  return {
    vacationMaxAdvanceDays: clampInt(
      input.vacationMaxAdvanceDays,
      1,
      365,
      defaultEmployeePortalRules.vacationMaxAdvanceDays
    ),
    shiftTradeMaxAdvanceMonths: clampInt(
      input.shiftTradeMaxAdvanceMonths,
      1,
      24,
      defaultEmployeePortalRules.shiftTradeMaxAdvanceMonths
    ),
  };
}

export function vacationRulesHint(rules = {}) {
  const normalized = normalizeEmployeePortalRules(rules);
  return `Vacation requests can be submitted up to ${normalized.vacationMaxAdvanceDays} days out`;
}

export function shiftTradeRulesHint(rules = {}) {
  const normalized = normalizeEmployeePortalRules(rules);
  return `Shift trades can be scheduled up to ${normalized.shiftTradeMaxAdvanceMonths} months from your earliest work date`;
}
