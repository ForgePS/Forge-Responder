export const CALL_SHIFT_TIE_BREAKERS = [
  { value: "hireDate", label: "Date of hire" },
  { value: "startDateRanking", label: "Start date ranking" },
  { value: "rank", label: "Rank order" },
  { value: "name", label: "Name (A–Z)" },
];

function normalizeText(value = "") {
  return String(value || "").trim().toLowerCase();
}

function buildRuleId(existing = []) {
  const count = Array.isArray(existing) ? existing.length : 0;
  return `CSR-${1001 + count}`;
}

export function createDefaultCallShiftRule(overrides = {}) {
  const now = new Date().toISOString();
  return {
    id: overrides.id || "CSR-default",
    name: overrides.name || "Default Rule",
    isDefault: overrides.isDefault ?? true,
    useGlobalRanking: overrides.useGlobalRanking ?? false,
    qualifiers: Array.isArray(overrides.qualifiers) ? overrides.qualifiers : [],
    tieBreaker: overrides.tieBreaker || "hireDate",
    updatedAt: overrides.updatedAt || now,
  };
}

export function normalizeCallShiftRule(rule = {}, index = 0) {
  const tieBreaker = CALL_SHIFT_TIE_BREAKERS.some((option) => option.value === rule.tieBreaker)
    ? rule.tieBreaker
    : "hireDate";

  return {
    id: String(rule.id || buildRuleId(Array.from({ length: index }))).trim() || buildRuleId([]),
    name: String(rule.name || "Untitled Rule").trim() || "Untitled Rule",
    isDefault: Boolean(rule.isDefault),
    useGlobalRanking: Boolean(rule.useGlobalRanking),
    qualifiers: (Array.isArray(rule.qualifiers) ? rule.qualifiers : [])
      .map((value) => String(value || "").trim())
      .filter(Boolean),
    tieBreaker,
    updatedAt: rule.updatedAt || new Date().toISOString(),
  };
}

export function normalizeCallShiftRules(rules) {
  const list = Array.isArray(rules) ? rules.map(normalizeCallShiftRule) : [];
  if (!list.length) {
    return [createDefaultCallShiftRule()];
  }

  const hasDefault = list.some((rule) => rule.isDefault);
  if (!hasDefault) {
    return [
      { ...list[0], isDefault: true },
      ...list.slice(1).map((rule) => ({ ...rule, isDefault: false })),
    ];
  }

  let defaultAssigned = false;
  return list.map((rule) => {
    if (!rule.isDefault) return rule;
    if (defaultAssigned) return { ...rule, isDefault: false };
    defaultAssigned = true;
    return rule;
  });
}

export function resolveCallShiftRule(rules = [], { qualifier = "", position = "" } = {}) {
  const normalized = normalizeCallShiftRules(rules);
  const targets = [qualifier, position]
    .map(normalizeText)
    .filter(Boolean);

  if (targets.length) {
    const matched = normalized.find((rule) => (
      !rule.isDefault
      && rule.qualifiers.some((entry) => {
        const normalizedEntry = normalizeText(entry);
        return targets.some((target) => (
          normalizedEntry === target
          || normalizedEntry.includes(target)
          || target.includes(normalizedEntry)
        ));
      })
    ));
    if (matched) return matched;
  }

  return normalized.find((rule) => rule.isDefault) || normalized[0] || createDefaultCallShiftRule();
}

export function formatCallShiftRuleUpdatedAt(value = "") {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function upsertCallShiftRule(rules = [], draft = {}) {
  const normalized = normalizeCallShiftRules(rules);
  const nextRule = normalizeCallShiftRule({
    ...draft,
    updatedAt: new Date().toISOString(),
  }, normalized.length);

  const existingIndex = normalized.findIndex((rule) => rule.id === nextRule.id);
  let next = existingIndex >= 0
    ? normalized.map((rule, index) => (index === existingIndex ? nextRule : rule))
    : [...normalized, nextRule];

  if (nextRule.isDefault) {
    next = next.map((rule) => (
      rule.id === nextRule.id ? nextRule : { ...rule, isDefault: false }
    ));
  }

  return normalizeCallShiftRules(next);
}

export function removeCallShiftRule(rules = [], ruleId = "") {
  const normalized = normalizeCallShiftRules(rules);
  const next = normalized.filter((rule) => rule.id !== ruleId);
  return normalizeCallShiftRules(next.length ? next : [createDefaultCallShiftRule()]);
}

export const defaultCallShiftRules = [createDefaultCallShiftRule()];
