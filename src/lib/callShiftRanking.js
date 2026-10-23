import { parsePersonnelDate } from "./personnelDates.js";
import { getPersonDisplayName } from "./personnelSchema.js";

function normalizeShift(value = "") {
  return String(value || "").trim().toLowerCase();
}

function normalizeText(value = "") {
  return String(value || "").trim().toLowerCase();
}

export function resolvePersonPosition(person = {}) {
  return String(person.position || person.rank || "").trim();
}

export function resolveRankSortOrder(rank = "", rankOptions = []) {
  const options = Array.isArray(rankOptions) ? rankOptions : [];
  const match = options.find((option) => normalizeText(option.label) === normalizeText(rank));
  const parsed = Number.parseInt(String(match?.sortOrder ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : 999;
}

function resolveCandidatePosition(entry = {}, person = {}) {
  return String(
    entry.position
    || entry.rank
    || resolvePersonPosition(person)
  ).trim();
}

export function resolveSeniorityTimestamp(person = {}, field = "startDateRanking") {
  if (field === "hireDate") {
    const parsed = parsePersonnelDate(person.hireDate);
    return parsed ? parsed.getTime() : Number.MAX_SAFE_INTEGER;
  }

  if (field === "startDateRanking") {
    const parsed = parsePersonnelDate(person.startDateRanking);
    if (parsed) return parsed.getTime();
  }

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

export function rankCallShiftCandidates(candidates = [], rankOptions = [], rule = {}) {
  const tieBreaker = rule?.tieBreaker || "hireDate";

  return [...(Array.isArray(candidates) ? candidates : [])].sort((left, right) => {
    const leftPerson = left.person || left;
    const rightPerson = right.person || right;

    const leftPrimary = resolveSeniorityTimestamp(leftPerson, "startDateRanking");
    const rightPrimary = resolveSeniorityTimestamp(rightPerson, "startDateRanking");
    if (leftPrimary !== rightPrimary) return leftPrimary - rightPrimary;

    if (tieBreaker === "hireDate") {
      const leftHire = resolveSeniorityTimestamp(leftPerson, "hireDate");
      const rightHire = resolveSeniorityTimestamp(rightPerson, "hireDate");
      if (leftHire !== rightHire) return leftHire - rightHire;
    } else if (tieBreaker === "startDateRanking") {
      const leftRanking = resolveSeniorityTimestamp(leftPerson, "startDateRanking");
      const rightRanking = resolveSeniorityTimestamp(rightPerson, "startDateRanking");
      if (leftRanking !== rightRanking) return leftRanking - rightRanking;
    } else if (tieBreaker === "rank") {
      const leftRank = resolveRankSortOrder(resolveCandidatePosition(left, leftPerson), rankOptions);
      const rightRank = resolveRankSortOrder(resolveCandidatePosition(right, rightPerson), rankOptions);
      if (leftRank !== rightRank) return leftRank - rightRank;
    } else if (tieBreaker === "name") {
      const nameCompare = getPersonDisplayName(leftPerson).localeCompare(
        getPersonDisplayName(rightPerson),
        undefined,
        { sensitivity: "base" }
      );
      if (nameCompare !== 0) return nameCompare;
    }

    const leftRank = resolveRankSortOrder(resolveCandidatePosition(left, leftPerson), rankOptions);
    const rightRank = resolveRankSortOrder(resolveCandidatePosition(right, rightPerson), rankOptions);
    if (leftRank !== rightRank) return leftRank - rightRank;

    return getPersonDisplayName(leftPerson).localeCompare(
      getPersonDisplayName(rightPerson),
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

function coerceSelectionList(values = []) {
  const list = Array.isArray(values) ? values : [values];
  return list
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .filter((value) => !/^any$/i.test(value) && !/^all$/i.test(value));
}

export function matchesCallShiftQualifiers(person = {}, qualifiers = []) {
  const selected = coerceSelectionList(qualifiers);
  if (!selected.length) return true;
  return selected.some((qualifier) => matchesCallShiftPosition(person, qualifier));
}

export function matchesCallShiftGroup(person = {}, group = "") {
  const target = normalizeShift(group);
  if (!target || target === "all") return true;
  return normalizeShift(person.shift) === target;
}

export function matchesCallShiftGroups(person = {}, groups = []) {
  const selected = coerceSelectionList(groups).map(normalizeShift);
  if (!selected.length) return true;
  const personShift = normalizeShift(person.shift);
  return selected.some((group) => (
    personShift === group
    || personShift.includes(group)
    || group.includes(personShift)
  ));
}

/** Filters by personnel profile Position (falls back to legacy rank field). */
export function matchesCallShiftRanks(person = {}, ranks = []) {
  const selected = (Array.isArray(ranks) ? ranks : []).map(normalizeText).filter(Boolean);
  if (!selected.length) return true;
  const personPosition = normalizeText(resolvePersonPosition(person));
  return selected.some((rank) => personPosition.includes(rank) || rank.includes(personPosition));
}

export function resolveCallShiftPreviewPositions(positionOptions = [], selectedPositions = []) {
  const options = (Array.isArray(positionOptions) ? positionOptions : [])
    .map((option) => String(option.label || "").trim())
    .filter(Boolean);
  if (!options.length) {
    return ["Command", "Officer", "Driver", "Firefighter"];
  }

  const selected = (Array.isArray(selectedPositions) ? selectedPositions : [])
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  if (!selected.length) return options;

  return options.filter((label) => selected.some((value) => {
    const normalizedLabel = normalizeText(label);
    const normalizedValue = normalizeText(value);
    return normalizedLabel === normalizedValue
      || normalizedLabel.includes(normalizedValue)
      || normalizedValue.includes(normalizedLabel);
  }));
}

/** @deprecated Use resolveCallShiftPreviewPositions */
export const CALL_SHIFT_PREVIEW_RANKS = ["Command", "Officer", "Driver", "Firefighter"];

export function matchesCallShiftPreviewRank(personPosition = "", tabPosition = "") {
  const person = normalizeText(personPosition);
  const tab = normalizeText(tabPosition);
  if (!tab) return true;
  return person.includes(tab) || tab.includes(person);
}
