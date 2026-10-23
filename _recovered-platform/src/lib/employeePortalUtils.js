function normalizeText(value = "") {
  return String(value).trim().toLowerCase();
}

function nameTokens(name = "") {
  return normalizeText(name).split(/\s+/).filter(Boolean);
}

function buildInitials(name = "") {
  const tokens = nameTokens(name);
  if (!tokens.length) return "";
  if (tokens.length === 1) return tokens[0].slice(0, 2);
  return `${tokens[0][0] || ""}${tokens[tokens.length - 1][0] || ""}`;
}

function buildInitialName(name = "") {
  const tokens = nameTokens(name);
  if (!tokens.length) return "";
  if (tokens.length === 1) return `${tokens[0][0] || ""}. ${tokens[0]}`;
  return `${tokens[0][0] || ""}. ${tokens[tokens.length - 1]}`;
}

export function resolveEmployeePerson(personnel = [], membership = {}) {
  if (!membership) return null;

  if (membership.personnelId) {
    const linked = personnel.find((person) => person.id === membership.personnelId);
    if (linked) return linked;
  }

  const email = normalizeText(membership.email);
  if (email) {
    const byEmail = personnel.find((person) => normalizeText(person.email) === email);
    if (byEmail) return byEmail;
  }

  const displayName = membership.displayName || "";
  if (displayName) {
    const byName = personnel.find((person) => person.name === displayName);
    if (byName) return byName;
  }

  return null;
}

function valuesMatchEmployee(value, membership = {}, myPerson = null) {
  const raw = String(value || "").trim();
  if (!raw) return false;

  const personName = myPerson?.name || membership?.displayName || "";
  const personId = myPerson?.id || membership?.personnelId || "";
  const normalized = normalizeText(raw);

  if (personId && normalizeText(personId) === normalized) return true;
  if (personName && normalizeText(personName) === normalized) return true;

  const variants = new Set(
    [
      personName,
      buildInitials(personName),
      buildInitialName(personName),
      membership?.email?.split("@")[0]
    ]
      .map(normalizeText)
      .filter(Boolean)
  );

  return variants.has(normalized);
}

export function recordBelongsToEmployee(record = {}, membership = {}, myPerson = null) {
  const fields = ["person", "requestedBy", "name", "employee", "member", "assignedTo", "operator"];
  for (const field of fields) {
    if (valuesMatchEmployee(record[field], membership, myPerson)) {
      return true;
    }
  }

  const personId = myPerson?.id || membership?.personnelId || "";
  if (personId && normalizeText(record.personnelId) === normalizeText(personId)) {
    return true;
  }

  return false;
}

export function trainingBelongsToEmployee(record = {}, membership = {}, myPerson = null) {
  if (recordBelongsToEmployee(record, membership, myPerson)) return true;

  const members = normalizeText(record.members || "");
  if (!members) return false;

  const shift = normalizeText(myPerson?.shift || membership?.assignedShift || "");
  const assignment = normalizeText(myPerson?.assignment || "");
  const station = normalizeText(myPerson?.station || "");
  const personName = normalizeText(myPerson?.name || membership?.displayName || "");

  if (shift && members.includes(shift)) return true;
  if (assignment && members.includes(assignment)) return true;
  if (station && members.includes(station)) return true;
  if (personName && members.includes(personName)) return true;

  return false;
}

export function resolveEmployeeShiftDay(scheduleDays = [], myPerson = null, membership = {}) {
  const shift = myPerson?.shift || membership?.assignedShift || "";
  if (!shift) return scheduleDays[0] || null;

  const today = new Date().toISOString().slice(0, 10);
  const sameDay = scheduleDays.find((day) => day.id === today);
  if (sameDay && normalizeText(sameDay.shift) === normalizeText(shift)) {
    return sameDay;
  }

  return scheduleDays.find((day) => normalizeText(day.shift) === normalizeText(shift)) || scheduleDays[0] || null;
}

export function resolveEmployeeApparatus(apparatus = [], myPerson = null, membership = {}) {
  if (!myPerson && !membership?.displayName) return null;

  const assignment = normalizeText(myPerson?.assignment || "");
  const personName = myPerson?.name || membership?.displayName || "";

  const byAssignment = apparatus.find((unit) => {
    const unitName = normalizeText(unit.unit || "");
    return assignment && (assignment.includes(unitName) || unitName.includes(assignment.split("/")[0]?.trim() || ""));
  });
  if (byAssignment) return byAssignment;

  return apparatus.find((unit) => valuesMatchEmployee(unit.operator, membership, myPerson)) || null;
}

export function filterEmployeeRoster(roster = [], membership = {}, myPerson = null, scheduleDay = null) {
  const shift = normalizeText(scheduleDay?.shift || myPerson?.shift || membership?.assignedShift || "");
  const filtered = roster.filter((member) => {
    if (recordBelongsToEmployee(member, membership, myPerson)) return true;
    if (!shift) return false;
    return normalizeText(member.shift) === shift;
  });

  return filtered.length ? filtered : roster;
}
