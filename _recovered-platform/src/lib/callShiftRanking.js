import { parsePersonnelDate } from "./personnelDates.js";
import { getPersonDisplayName } from "./personnelSchema.js";

function normalizeShift(value = "") {
  return String(value || "").trim().toLowerCase();
}

function normalizeText(value = "") {
  return String(value || "").trim().toLowerCase();
}

export function resolveRankSortOrder(rank = "", rankOptions = []) {
  const options = Array.isArray(rankOptions) ? rankOptions : [];
  const match = options.find((option) => normalizeText(option.label) === normalizeText(rank));
  const parsed = Number.parseInt(String(match?.sortOrder ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : 999;
}

export function resolveSeniorityTimestamp(person = {}) {
  const candidates = [
    person.startDateRanking,
    person.hireDate,
    person.secondaryStartDate,
  ];

  for (const value of candidates) {
    const parsed = parsePersonnelDate(value);
    if (parsed) return parsed.getTime();
  }

  return Number.MAX_SAFE_INTEGER;
}

export function rankCallShiftCandidates(candidates = [], rankOptions = []) {
  return [...(Array.isArray(candidates) ? candidates : [])].sort((left, right) => {
    const leftSeniority = resolveSeniorityTimestamp(left.person || left);
    const rightSeniority = resolveSeniorityTimestamp(right.person || right);
    if (leftSeniority !== rightSeniority) return leftSeniority - rightSeniority;

    const leftRank = resolveRankSortOrder(left.rank || left.person?.rank, rankOptions);
    const rightRank = resolveRankSortOrder(right.rank || right.person?.rank, rankOptions);
    if (leftRank !== rightRank) return leftRank - rightRank;

    return getPersonDisplayName(left.person || left).localeCompare(
      getPersonDisplayName(right.person || right),
      undefined,
      { sensitivity: "base" }
    );
  });
}

export function matchesCallShiftPosition(person = {}, position = "") {
  const target = normalizeText(position);
  if (!target || target === "any") return true;

  const haystack = [
    person.rank,
    person.position,
    person.ems,
    person.driver === "Approved" ? "driver" : "",
    ...(Array.isArray(person.qualifiers) ? person.qualifiers : []),
  ].map(normalizeText).filter(Boolean);

  return haystack.some((value) => value.includes(target) || target.includes(value));
}

export function matchesCallShiftGroup(person = {}, group = "") {
  const target = normalizeShift(group);
  if (!target || target === "all") return true;
  return normalizeShift(person.shift) === target;
}
