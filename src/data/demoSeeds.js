import {
  defaultDigitalDashboardDisplays,
  defaultDigitalDashboardMedia,
  defaultDigitalDashboardPlaylists,
  defaultDigitalDashboardSchedules,
} from "./digitalDashboardSeeds.js";
import { defaultShiftRotation } from "./defaultShiftRotation.js";
import { initialDocuments } from "./sprintModuleSeeds.js";
import { formatDayId, shiftForDate } from "../lib/shiftCalendar.js";
import { buildDemoNerisReports } from "./demoNerisReports.js";

/*
 * Sample data for the public demo department (forge-demo, "Riverside Fire & EMS").
 *
 * Every date is worked out from "today" when this module loads, so the demo never
 * goes stale: leave, trades, overtime, training, certifications, inspections and
 * maintenance always sit in the recent past / next few weeks.
 *
 * Staffing model (must match demoDepartmentSettings.schedulingSettings):
 *   24/48 A/B/C rotation, 14 members per shift, minimum staffing 13.
 *   Battalion 1 (BC) · Engine 1 (Captain, Driver, FF) · Engine 2 (Lt, Driver, FF)
 *   · Truck 3 (Lt, Driver, FF) · Medic 1 and Medic 2 (Paramedic, EMT/Driver).
 *   Rescue 1 is cross-staffed by the Engine 1 crew.
 */

// ---------------------------------------------------------------------------
// Date helpers (local time, noon, so DST never shifts a day)
// ---------------------------------------------------------------------------

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const LONG_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const TODAY = (() => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
})();

function dayAt(offset = 0) {
  const date = new Date(TODAY);
  date.setDate(date.getDate() + offset);
  return date;
}

/** "Dec 18, 2026" — certifications, training, apparatus PM, assets, inspections. */
const longDate = (offset) => {
  const d = dayAt(offset);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
};
/** "Dec 18" — leave, trades, overtime, work orders, schedule days. */
const shortDate = (offset) => {
  const d = dayAt(offset);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
};
/** "2026-12-18" — day ids and ISO date fields. */
const isoDate = (offset) => formatDayId(dayAt(offset));
const weekday = (offset) => dayAt(offset).toLocaleDateString("en-US", { weekday: "short" });
const yearsAgoLong = (years, month, day) => `${LONG_MONTHS[month]} ${day}, ${TODAY.getFullYear() - years}`;
const timestampAt = (offset, hour = 9) => {
  const d = dayAt(offset);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
};

const shiftOn = (offset) => shiftForDate(dayAt(offset), defaultShiftRotation);

/** Offset (days from today) of the first day >= `from` that `shift` works. */
function nextWorkDay(shift, from = 0) {
  for (let offset = from; offset < from + 30; offset += 1) {
    if (shiftOn(offset) === shift) return offset;
  }
  return from;
}

/** Same label the employee portal writes: "Nov 8", "Nov 11-Nov 13" or "Nov 15, Nov 18". */
function datesLabel(offsets = []) {
  const sorted = [...offsets].sort((a, b) => a - b);
  if (sorted.length === 1) return shortDate(sorted[0]);
  const consecutive = sorted.every((offset, index) => index === 0 || offset === sorted[index - 1] + 1);
  return consecutive
    ? `${shortDate(sorted[0])}-${shortDate(sorted[sorted.length - 1])}`
    : sorted.map(shortDate).join(", ");
}

// ---------------------------------------------------------------------------
// Personnel
// ---------------------------------------------------------------------------

const demoEmail = (role) => `${role}@demo.forge.demo`;
const DEMO_CITY = { city: "Riverside", state: "MS", zip: "38600" };

/**
 * [id, name, rank, shift, assignment, station, ems, driver, emailRole, supervisor, hire (years ago)]
 * DEMO-001..006 are the original demo identities (referenced by demo sign-in,
 * internal email seeds and the employee-portal walkthrough) — keep their ids/names.
 */
const PERSONNEL_SPEC = [
  // Administration
  ["DEMO-001", "Chief A. Sample", "Fire Chief", "Administration", "Administration", "Station 1", "Paramedic", "Approved", "chief", "City Administrator", 16],
  ["DEMO-002", "Deputy B. Example", "Deputy Chief", "Administration", "Operations", "Station 1", "Paramedic", "Approved", "deputy", "Chief A. Sample", 14],
  ["DEMO-007", "Marshal G. Inspector", "Fire Marshal", "Administration", "Fire Prevention", "Station 1", "EMT", "Approved", "marshal", "Chief A. Sample", 12],
  ["DEMO-008", "Captain H. Instructor", "Captain", "Administration", "Training Division", "Station 1", "Paramedic", "Approved", "training", "Deputy B. Example", 11],
  ["DEMO-009", "Captain K. Protocol", "Captain", "Administration", "EMS Division", "Station 1", "Paramedic", "Approved", "ems", "Deputy B. Example", 13],
  ["DEMO-033", "Inspector L. Checklist", "Fire Inspector", "Administration", "Fire Prevention", "Station 1", "EMT", "Approved", "inspector", "Marshal G. Inspector", 4],
  // A Shift
  ["DEMO-003", "Battalion C. Demo", "Battalion Chief", "A Shift", "Battalion 1", "Station 1", "AEMT", "Approved", "battalion", "Deputy B. Example", 12],
  ["DEMO-010", "Captain J. Pilot", "Captain", "A Shift", "Engine 1", "Station 1", "Paramedic", "Approved", "a-e1-captain", "Battalion C. Demo", 10],
  ["DEMO-011", "Engineer K. Preview", "Engineer", "A Shift", "Engine 1", "Station 1", "EMT", "Approved", "a-e1-engineer", "Captain J. Pilot", 7],
  ["DEMO-006", "Firefighter F. Roster", "Firefighter", "A Shift", "Engine 1", "Station 1", "Paramedic", "Trainee", "ff-medic", "Captain J. Pilot", 5],
  ["DEMO-012", "Lieutenant L. Model", "Lieutenant", "A Shift", "Engine 2", "Station 2", "EMT", "Approved", "a-e2-lieutenant", "Battalion C. Demo", 9],
  ["DEMO-013", "Engineer M. Draft", "Engineer", "A Shift", "Engine 2", "Station 2", "AEMT", "Approved", "a-e2-engineer", "Lieutenant L. Model", 6],
  ["DEMO-014", "Firefighter N. Proxy", "Firefighter", "A Shift", "Engine 2", "Station 2", "Paramedic", "Trainee", "a-e2-ff", "Lieutenant L. Model", 3],
  ["DEMO-015", "Lieutenant O. Template", "Lieutenant", "A Shift", "Truck 3", "Station 3", "EMT", "Approved", "a-t3-lieutenant", "Battalion C. Demo", 8],
  ["DEMO-016", "Engineer P. Fixture", "Engineer", "A Shift", "Truck 3", "Station 3", "EMT", "Approved", "a-t3-engineer", "Lieutenant O. Template", 6],
  ["DEMO-034", "Firefighter G. Baseline", "Firefighter", "A Shift", "Truck 3", "Station 3", "EMT", "Trainee", "a-t3-ff", "Lieutenant O. Template", 2],
  ["DEMO-035", "Firefighter H. Sandbox", "Firefighter", "A Shift", "Medic 1", "Station 1", "Paramedic", "Approved", "a-m1-medic", "Captain J. Pilot", 6],
  ["DEMO-036", "Firefighter I. Prototype", "Firefighter", "A Shift", "Medic 1", "Station 1", "EMT", "Approved", "a-m1-emt", "Captain J. Pilot", 3],
  ["DEMO-037", "Firefighter J. Placeholder", "Firefighter", "A Shift", "Medic 2", "Station 2", "Paramedic", "Approved", "a-m2-medic", "Lieutenant L. Model", 8],
  ["DEMO-038", "Firefighter K. Sketch", "Firefighter", "A Shift", "Medic 2", "Station 2", "AEMT", "Approved", "a-m2-emt", "Lieutenant L. Model", 4],
  // B Shift
  ["DEMO-017", "Battalion Q. Scenario", "Battalion Chief", "B Shift", "Battalion 1", "Station 1", "Paramedic", "Approved", "b-battalion", "Deputy B. Example", 15],
  ["DEMO-004", "Captain D. Trainee", "Captain", "B Shift", "Engine 1", "Station 1", "Paramedic", "Approved", "captain", "Battalion Q. Scenario", 10],
  ["DEMO-018", "Engineer R. Replica", "Engineer", "B Shift", "Engine 1", "Station 1", "EMT", "Approved", "b-e1-engineer", "Captain D. Trainee", 8],
  ["DEMO-019", "Firefighter S. Standby", "Firefighter", "B Shift", "Engine 1", "Station 1", "Paramedic", "Trainee", "b-e1-ff", "Captain D. Trainee", 4],
  ["DEMO-020", "Lieutenant T. Outline", "Lieutenant", "B Shift", "Engine 2", "Station 2", "Paramedic", "Approved", "b-e2-lieutenant", "Battalion Q. Scenario", 9],
  ["DEMO-021", "Engineer U. Exercise", "Engineer", "B Shift", "Engine 2", "Station 2", "EMT", "Approved", "b-e2-engineer", "Lieutenant T. Outline", 7],
  ["DEMO-022", "Firefighter V. Practice", "Firefighter", "B Shift", "Engine 2", "Station 2", "EMT", "Trainee", "b-e2-ff", "Lieutenant T. Outline", 2],
  ["DEMO-023", "Lieutenant W. Tabletop", "Lieutenant", "B Shift", "Truck 3", "Station 3", "EMT", "Approved", "b-t3-lieutenant", "Battalion Q. Scenario", 11],
  ["DEMO-024", "Engineer X. Walkthrough", "Engineer", "B Shift", "Truck 3", "Station 3", "AEMT", "Approved", "b-t3-engineer", "Lieutenant W. Tabletop", 6],
  ["DEMO-039", "Firefighter L. Storyboard", "Firefighter", "B Shift", "Truck 3", "Station 3", "EMT", "Trainee", "b-t3-ff", "Lieutenant W. Tabletop", 1],
  ["DEMO-040", "Firefighter M. Benchmark", "Firefighter", "B Shift", "Medic 1", "Station 1", "Paramedic", "Approved", "b-m1-medic", "Captain D. Trainee", 9],
  ["DEMO-041", "Firefighter N. Simulation", "Firefighter", "B Shift", "Medic 1", "Station 1", "EMT", "Approved", "b-m1-emt", "Captain D. Trainee", 2],
  ["DEMO-042", "Firefighter O. Wireframe", "Firefighter", "B Shift", "Medic 2", "Station 2", "Paramedic", "Approved", "b-m2-medic", "Lieutenant T. Outline", 5],
  ["DEMO-043", "Firefighter P. Exhibit", "Firefighter", "B Shift", "Medic 2", "Station 2", "EMT", "Approved", "b-m2-emt", "Lieutenant T. Outline", 3],
  // C Shift
  ["DEMO-025", "Battalion Y. Showcase", "Battalion Chief", "C Shift", "Battalion 1", "Station 1", "Paramedic", "Approved", "c-battalion", "Deputy B. Example", 17],
  ["DEMO-026", "Captain Z. Trial", "Captain", "C Shift", "Engine 1", "Station 1", "Paramedic", "Approved", "c-e1-captain", "Battalion Y. Showcase", 12],
  ["DEMO-027", "Engineer A. Prospect", "Engineer", "C Shift", "Engine 1", "Station 1", "EMT", "Approved", "c-e1-engineer", "Captain Z. Trial", 7],
  ["DEMO-028", "Firefighter B. Specimen", "Firefighter", "C Shift", "Engine 1", "Station 1", "Paramedic", "Trainee", "c-e1-ff", "Captain Z. Trial", 3],
  ["DEMO-029", "Lieutenant C. Rehearsal", "Lieutenant", "C Shift", "Engine 2", "Station 2", "EMT", "Approved", "c-e2-lieutenant", "Battalion Y. Showcase", 9],
  ["DEMO-030", "Engineer D. Mockup", "Engineer", "C Shift", "Engine 2", "Station 2", "EMT", "Approved", "c-e2-engineer", "Lieutenant C. Rehearsal", 5],
  ["DEMO-031", "Firefighter E. Instance", "Firefighter", "C Shift", "Engine 2", "Station 2", "Paramedic", "Trainee", "c-e2-ff", "Lieutenant C. Rehearsal", 1],
  ["DEMO-032", "Lieutenant F. Drill", "Lieutenant", "C Shift", "Truck 3", "Station 3", "Paramedic", "Approved", "c-t3-lieutenant", "Battalion Y. Showcase", 10],
  ["DEMO-005", "Firefighter E. Member", "Firefighter", "C Shift", "Truck 3", "Station 3", "EMT", "Approved", "ff-emt", "Lieutenant F. Drill", 6],
  ["DEMO-044", "Firefighter Q. Sampler", "Firefighter", "C Shift", "Medic 1", "Station 1", "Paramedic", "Approved", "c-m1-medic", "Captain Z. Trial", 7],
  ["DEMO-045", "Firefighter R. Scaffold", "Firefighter", "C Shift", "Medic 1", "Station 1", "EMT", "Approved", "c-m1-emt", "Captain Z. Trial", 2],
  ["DEMO-046", "Firefighter S. Blueprint", "Firefighter", "C Shift", "Medic 2", "Station 2", "Paramedic", "Approved", "c-m2-medic", "Lieutenant C. Rehearsal", 10],
  ["DEMO-047", "Firefighter T. Facsimile", "Firefighter", "C Shift", "Medic 2", "Station 2", "AEMT", "Approved", "c-m2-emt", "Lieutenant C. Rehearsal", 4],
  ["DEMO-048", "Firefighter U. Casefile", "Firefighter", "C Shift", "Truck 3", "Station 3", "EMT", "Trainee", "c-t3-ff", "Lieutenant F. Drill", 1],
];

/** Certifications due within 90 days (feature showcase); everything else is comfortably current. */
const EXPIRING_SOON = {
  "DEMO-006:Paramedic": { offset: 18, renewal: "Submitted" },
  "DEMO-005:Firefighter II": { offset: 46, renewal: "Not Started" },
  "DEMO-004:Fire Instructor I": { offset: 73, renewal: "In Progress" },
};

const FIRE_OFFICER_BY_RANK = {
  "Fire Chief": "Fire Officer IV",
  "Deputy Chief": "Fire Officer III",
  "Battalion Chief": "Fire Officer III",
  Captain: "Fire Officer II",
  Lieutenant: "Fire Officer I",
};

function certTypesFor(spec) {
  const [id, , rank, , assignment, , ems] = spec;
  const types = [[ems === "Paramedic" ? "Paramedic" : ems === "AEMT" ? "AEMT" : "EMT", "EMS", 2]];
  types.push(["Firefighter II", "Fire", 3]);
  if (FIRE_OFFICER_BY_RANK[rank]) types.push([FIRE_OFFICER_BY_RANK[rank], "Fire", 3]);
  if (rank === "Engineer") types.push([assignment === "Truck 3" ? "Driver/Operator - Aerial" : "Driver/Operator - Pumper", "Driver", 3]);
  if (rank === "Fire Inspector") types.push(["Fire Inspector I", "Prevention", 3]);
  if (rank === "Fire Marshal") types.push(["Fire Inspector II", "Prevention", 3], ["Fire Investigator", "Prevention", 3]);
  if (id === "DEMO-008") types.push(["Fire Instructor II", "Fire", 3]);
  if (id === "DEMO-004") types.push(["Fire Instructor I", "Fire", 3]);
  if (ems === "Paramedic" || ems === "AEMT") types.push(["ACLS", "EMS", 2]);
  return types;
}

const demoCertifications = [];
const certificationsByPerson = {};
let certSeq = 100;

PERSONNEL_SPEC.forEach((spec, personIndex) => {
  const [id, name] = spec;
  certificationsByPerson[id] = [];
  certTypesFor(spec).forEach(([type, category, termYears], certIndex) => {
    const special = EXPIRING_SOON[`${id}:${type}`];
    // Deterministic spread, 120–790 days out: never inside the 90-day window by accident.
    const offset = special ? special.offset : 120 + ((personIndex * 67 + certIndex * 151) % 670);
    const status = offset < 0 ? "Expired" : offset <= 30 ? "Due Soon" : "Active";
    certSeq += 1;
    demoCertifications.push({
      id: `CERT-D${certSeq}`,
      person: name,
      personnelId: id,
      type,
      category,
      issue: longDate(offset - termYears * 365),
      expires: longDate(offset),
      days: offset,
      renewal: special ? special.renewal : "Not Started",
      status,
      document: `${type.replace(/[^A-Za-z0-9]+/g, " ").trim()} Card.pdf`,
    });
    certificationsByPerson[id].push([type, longDate(offset), status]);
  });
});

const demoPersonnel = PERSONNEL_SPEC.map((spec, index) => {
  const [id, name, rank, shift, assignment, station, ems, driver, emailRole, supervisor, hireYearsAgo] = spec;
  const initials = name.split(" ").slice(1).map((part) => part[0]).join("").replace(/[^A-Z]/g, "");
  const serial = String(index + 1).padStart(4, "0");
  return {
    id,
    name,
    initials,
    rank,
    shift,
    assignment,
    ems,
    driver,
    status: "Active",
    email: demoEmail(emailRole),
    phone: `(555) 010-${serial}`,
    station,
    hireDate: yearsAgoLong(hireYearsAgo, (index * 5) % 12, ((index * 7) % 27) + 1),
    supervisor,
    address: `${100 + index * 12} Riverfront Pkwy`,
    ...DEMO_CITY,
    emergencyFirstName: "Emergency",
    emergencyLastName: "Contact",
    emergencyRelationship: index % 3 === 0 ? "Parent" : "Spouse",
    emergencyPhone: `(555) 019-${serial}`,
    emergencySameAddress: index % 3 !== 0,
    documents: ["Sample Employment File.pdf"],
    certifications: certificationsByPerson[id],
  };
});

const personById = Object.fromEntries(demoPersonnel.map((person) => [person.id, person]));

// ---------------------------------------------------------------------------
// Leave, trades, overtime (relative to the rotation so they land on real work days)
// ---------------------------------------------------------------------------

// One future B-shift day is short (two approved leaves → 12 of 13) to show deficit + overtime.
const DEFICIT_DAY = nextWorkDay("B Shift", 5);
const ROSTER_A_VACATION = nextWorkDay("A Shift", 7);
const MEMBER_VACATION_1 = nextWorkDay("C Shift", 12);
const MEMBER_VACATION_2 = nextWorkDay("C Shift", MEMBER_VACATION_1 + 1);
const TRIAL_VACATION = nextWorkDay("C Shift", 18);
const MODEL_SICK_PAST = nextWorkDay("A Shift", -6);

function leaveRequest(id, personnelId, type, offsets, status, extra = {}) {
  const person = personById[personnelId];
  const sorted = [...offsets].sort((a, b) => a - b);
  const totalHours = person.shift === "Administration" ? 8 * offsets.length : 24 * offsets.length;
  return {
    id,
    person: person.name,
    personnelId,
    type,
    dates: datesLabel(sorted),
    selectedDates: sorted.map(isoDate),
    startTime: "07:00",
    totalHours: String(totalHours),
    hours: `${totalHours} hrs`,
    status,
    submittedAt: timestampAt(Math.min(sorted[0] - 9, -1)),
    ...extra,
  };
}

const demoLeaveRequests = [
  leaveRequest("L-D100", "DEMO-001", "Training", [10, 11, 12], "Approved", { notes: "State fire chiefs' conference" }),
  leaveRequest("L-D101", "DEMO-006", "Vacation", [ROSTER_A_VACATION], "Approved"),
  leaveRequest("L-D102", "DEMO-005", "Vacation", [MEMBER_VACATION_1, MEMBER_VACATION_2], "Pending", {
    approvalStage: "battalionChief",
    assignedOfficer: "Lieutenant F. Drill",
    assignedOfficerId: "DEMO-032",
    assignedBattalionChief: "Battalion Y. Showcase",
    assignedBattalionChiefId: "DEMO-025",
  }),
  leaveRequest("L-D103", "DEMO-018", "Vacation", [DEFICIT_DAY], "Approved"),
  leaveRequest("L-D104", "DEMO-022", "Military Leave", [DEFICIT_DAY], "Approved", { notes: "Annual training — orders on file" }),
  leaveRequest("L-D105", "DEMO-026", "Vacation", [TRIAL_VACATION], "Pending", {
    approvalStage: "battalionChief",
    assignedBattalionChief: "Battalion Y. Showcase",
    assignedBattalionChiefId: "DEMO-025",
  }),
  leaveRequest("L-D106", "DEMO-012", "Sick", [MODEL_SICK_PAST], "Approved"),
];

function tradeRecord(id, requesterId, coverageId, giveOffset, receiveOffset, status, submittedOffset) {
  const requester = personById[requesterId];
  const coverage = personById[coverageId];
  const chiefs = [requester.shift, coverage.shift].map((shift) => {
    const chief = demoPersonnel.find((p) => p.rank === "Battalion Chief" && p.shift === shift);
    return { personnelId: chief.id, name: chief.name, shift };
  });
  const approved = /approved/i.test(status);
  return {
    id,
    requestedBy: requester.name,
    personnelId: requester.id,
    give: `${shortDate(giveOffset)} - ${requester.shift}`,
    receive: `${shortDate(receiveOffset)} - ${coverage.shift}`,
    giveDayId: isoDate(giveOffset),
    receiveDayId: isoDate(receiveOffset),
    giveShift: requester.shift,
    receiveShift: coverage.shift,
    coverage: coverage.name,
    assignedCoverageMember: coverage.name,
    coveragePersonnelId: coverage.id,
    assignedBattalionChiefs: chiefs,
    assignedBattalionChiefIds: chiefs.map((chief) => chief.personnelId),
    battalionApprovals: approved ? chiefs.map((chief) => ({ ...chief, decision: "Approved", at: timestampAt(submittedOffset + 1) })) : [],
    approvalStage: approved ? "complete" : /awaiting/i.test(status) ? "coverageMember" : "battalionChief",
    submitted: shortDate(submittedOffset),
    submittedAt: timestampAt(submittedOffset),
    status,
  };
}

const TRADE_1_GIVE = nextWorkDay("C Shift", 8);
const TRADE_1_RECEIVE = nextWorkDay("B Shift", TRADE_1_GIVE + 1) === DEFICIT_DAY
  ? nextWorkDay("B Shift", DEFICIT_DAY + 1)
  : nextWorkDay("B Shift", TRADE_1_GIVE + 1);
const TRADE_2_GIVE = nextWorkDay("A Shift", 13);
const TRADE_2_RECEIVE = nextWorkDay("C Shift", TRADE_2_GIVE + 1);
const TRADE_3_GIVE = nextWorkDay("A Shift", 2);
const TRADE_3_RECEIVE = (() => {
  const candidate = nextWorkDay("B Shift", TRADE_3_GIVE + 1);
  return candidate === DEFICIT_DAY ? nextWorkDay("B Shift", DEFICIT_DAY + 1) : candidate;
})();

const demoShiftTrades = [
  // Engineer for engineer and FF for FF, so approved trades never change shift totals.
  tradeRecord("TR-D301", "DEMO-005", "DEMO-022", TRADE_1_GIVE, TRADE_1_RECEIVE, "Awaiting Member", -1),
  tradeRecord("TR-D302", "DEMO-006", "DEMO-028", TRADE_2_GIVE, TRADE_2_RECEIVE, "Pending Review", -2),
  tradeRecord("TR-D303", "DEMO-013", "DEMO-021", TRADE_3_GIVE, TRADE_3_RECEIVE, "Approved", -6),
];

const demoOvertimeOffers = [
  {
    id: "OT-D201",
    vacancyId: `${isoDate(DEFICIT_DAY)}-VAC-SHIFT-0`,
    dayId: isoDate(DEFICIT_DAY),
    date: shortDate(DEFICIT_DAY),
    shift: "B Shift",
    apparatus: "Engine 1",
    position: "Driver",
    status: "Open",
    applicants: 4,
    createdAt: timestampAt(-1, 14),
  },
  {
    id: "OT-D200",
    vacancyId: `${isoDate(MODEL_SICK_PAST)}-VAC-Engine 2-0`,
    dayId: isoDate(MODEL_SICK_PAST),
    date: shortDate(MODEL_SICK_PAST),
    shift: "A Shift",
    apparatus: "Engine 2",
    position: "Lieutenant",
    status: "Assigned",
    applicants: 5,
    assignedPersonnelId: "DEMO-029",
    assignedName: "Lieutenant C. Rehearsal",
    createdAt: timestampAt(MODEL_SICK_PAST - 1, 18),
    assignedAt: timestampAt(MODEL_SICK_PAST - 1, 19),
  },
];

// Saved schedule-day records (live roster math overrides staffed/minimum; these are the fallback).
const SHIFT_SIZE = 14;
const MINIMUM_STAFFING = 13;
const demoScheduleDays = Array.from({ length: 35 }, (_, index) => {
  const offset = index - 7;
  const id = isoDate(offset);
  const shift = shiftOn(offset);
  const leave = demoLeaveRequests.filter((request) => (
    request.status === "Approved"
    && request.selectedDates.includes(id)
    && personById[request.personnelId]?.shift === shift
  )).length;
  const staffed = SHIFT_SIZE - leave;
  return {
    id,
    weekday: weekday(offset),
    date: shortDate(offset),
    shift,
    staffed,
    minimum: MINIMUM_STAFFING,
    leave,
    status: staffed >= MINIMUM_STAFFING ? "Complete" : "Deficit",
  };
});

// ---------------------------------------------------------------------------
// Training (dashboard compliance = average completion across records)
// ---------------------------------------------------------------------------

function training(id, course, category, offset, hours, attendees, capacity, completion, status, members, notes, { instructor = "Captain H. Instructor", expiresYears = 0, endOffset = offset } = {}) {
  return {
    id,
    course,
    category,
    date: longDate(offset),
    endDate: longDate(endOffset),
    instructor,
    hours,
    attendees,
    capacity,
    completion,
    expirationDate: expiresYears ? isoDate(offset + expiresYears * 365) : "",
    status,
    members,
    notes,
  };
}

const demoTraining = [
  training("TRN-D090", "Live Fire Evolution — A Shift", "Fire", -40, 4, 9, 12, 100, "Complete", "A Shift", "Company-level live fire at the county burn building."),
  training("TRN-D091", "Live Fire Evolution — B Shift", "Fire", -39, 4, 9, 12, 100, "Complete", "B Shift", "Company-level live fire at the county burn building."),
  training("TRN-D092", "Live Fire Evolution — C Shift", "Fire", -38, 4, 9, 12, 100, "Complete", "C Shift", "Company-level live fire at the county burn building."),
  training("TRN-D093", "SCBA Confidence & Mayday Drills", "Fire", -33, 3, 27, 30, 100, "Complete", "All line personnel", "Annual air-management and Mayday procedures."),
  training("TRN-D094", "Pediatric Airway Management", "EMS CE", -28, 2, 14, 18, 100, "Complete", "EMS personnel", "Pediatric advanced airway skills lab.", { instructor: "Battalion Q. Scenario", expiresYears: 2 }),
  training("TRN-D095", "Hazmat Operations Refresher", "Fire", -25, 4, 26, 30, 100, "Complete", "All line personnel", "Annual Ops-level refresher with tabletop.", { expiresYears: 1 }),
  training("TRN-D096", "Vehicle Extrication", "Fire", -21, 4, 18, 18, 100, "Complete", "Engine 1 / Rescue 1 crews", "New-vehicle construction and hydraulic tool ops."),
  training("TRN-D097", "Driver Pump Operations", "Driver", -18, 4, 9, 12, 100, "Complete", "Driver/operators", "Pump operations and water supply.", { expiresYears: 1 }),
  training("TRN-D098", "Aerial Operations", "Driver", -16, 4, 6, 8, 100, "Complete", "Truck 3 crews", "Aerial set-up, scrub area and stabilization."),
  training("TRN-D099", "Stroke & STEMI Protocol Update", "EMS CE", -14, 2, 28, 30, 100, "Complete", "EMS personnel", "2026 protocol changes with medical director.", { instructor: "Deputy B. Example", expiresYears: 2 }),
  training("TRN-D100", "Command Staff Briefing", "Officer", -12, 2, 8, 10, 100, "Complete", "Administration", "Monthly command staff readiness briefing.", { instructor: "Chief A. Sample" }),
  training("TRN-D101", "Bloodborne Pathogens Annual", "EMS CE", -10, 1, 31, 31, 100, "Complete", "All personnel", "OSHA annual exposure-control training.", { expiresYears: 1 }),
  training("TRN-D102", "Search & Rescue Fundamentals", "Fire", -8, 3, 17, 18, 100, "Complete", "Probationary & line FFs", "Primary/secondary search and VES."),
  training("TRN-D103", "Hose Testing Procedures", "Fire", -5, 2, 12, 15, 100, "Complete", "Driver/operators", "NFPA 1962 annual hose test procedure."),
  training("TRN-D104", "Fire Inspection Basics for Crews", "Officer", -3, 2, 11, 12, 100, "Complete", "Company officers", "Company-level inspections and pre-plan updates.", { instructor: "Marshal G. Inspector" }),
  training("TRN-D105", "Rapid Intervention Team Ops", "Fire", -2, 4, 9, 12, 100, "Complete", "A Shift", "RIT deployment and accountability."),
  training("TRN-D106", "Company Officer Leadership Series", "Officer", -1, 16, 9, 10, 75, "In Progress", "Captains & lieutenants", "Four-session leadership course.", { instructor: "Deputy B. Example", endOffset: 13 }),
  training("TRN-D107", "Ice & Water Rescue Awareness", "Fire", 6, 3, 14, 24, 0, "Scheduled", "All line personnel", "Seasonal awareness and shore-based rescue."),
  training("TRN-D108", "Command Staff Briefing", "Officer", 18, 2, 7, 10, 0, "Scheduled", "Administration", "Monthly command staff readiness briefing.", { instructor: "Chief A. Sample" }),
];

// ---------------------------------------------------------------------------
// Apparatus & work orders
// ---------------------------------------------------------------------------

const demoApparatus = [
  { id: "APP-D00", unit: "Battalion 1", type: "Command", station: "Station 1", year: "2023", mileage: "22,410", engineHours: "1,904", pumpHours: "N/A", fuel: "88%", pmDue: longDate(41), status: "In Service", operator: "C. Demo", checks: [["Daily cab check", "Complete"], ["Radio / MDT check", "Complete"]] },
  { id: "APP-D01", unit: "Engine 1", type: "Pumper", station: "Station 1", year: "2021", mileage: "31,820", engineHours: "4,218", pumpHours: "386", fuel: "82%", pmDue: longDate(54), status: "In Service", operator: "K. Preview", checks: [["Daily cab check", "Complete"], ["Medical inventory", "Complete"], ["Pump test", "Complete"]] },
  { id: "APP-D02", unit: "Engine 2", type: "Pumper", station: "Station 2", year: "2018", mileage: "44,091", engineHours: "6,104", pumpHours: "591", fuel: "76%", pmDue: longDate(23), status: "In Service", operator: "M. Draft", checks: [["Daily cab check", "Complete"], ["Pump test", "Complete"]] },
  { id: "APP-D03", unit: "Truck 3", type: "Aerial", station: "Station 3", year: "2020", mileage: "26,445", engineHours: "3,870", pumpHours: "214", fuel: "74%", pmDue: longDate(9), status: "In Service", operator: "P. Fixture", checks: [["Daily cab check", "Complete"], ["Aerial controls", "Complete"]] },
  { id: "APP-D04", unit: "Rescue 1", type: "Heavy Rescue", station: "Station 1", year: "2022", mileage: "19,230", engineHours: "2,991", pumpHours: "N/A", fuel: "91%", pmDue: longDate(72), status: "In Service", operator: "Engine 1 crew (cross-staffed)", checks: [["Daily cab check", "Complete"], ["Extrication tools", "Complete"]] },
  { id: "APP-D06", unit: "Medic 1", type: "Ambulance (ALS)", station: "Station 1", year: "2024", mileage: "38,904", engineHours: "3,412", pumpHours: "N/A", fuel: "86%", pmDue: longDate(28), status: "In Service", operator: "H. Sandbox", checks: [["Daily cab check", "Complete"], ["Medical inventory", "Complete"], ["Cardiac monitor check", "Complete"]] },
  { id: "APP-D07", unit: "Medic 2", type: "Ambulance (ALS)", station: "Station 2", year: "2021", mileage: "71,226", engineHours: "6,880", pumpHours: "N/A", fuel: "79%", pmDue: longDate(15), status: "In Service", operator: "J. Placeholder", checks: [["Daily cab check", "Complete"], ["Medical inventory", "Complete"], ["Stretcher inspection", "Complete"]] },
  { id: "APP-D05", unit: "Engine 4", type: "Pumper (Reserve)", station: "Station 2", year: "2009", mileage: "88,312", engineHours: "11,460", pumpHours: "1,204", fuel: "64%", pmDue: longDate(-4), status: "Out of Service", operator: "Reserve", checks: [["Daily cab check", "Complete"], ["Pump test", "Failed"]] },
];

const demoWorkOrders = [
  { id: "WO-D41", unit: "Engine 4", issue: "Pump relief valve failed annual pump test", category: "Pump", priority: "High", opened: longDate(-6), vendor: "Riverside Fleet Services", cost: "$2,450", status: "In Progress" },
  { id: "WO-D42", unit: "Truck 3", issue: "Preventive maintenance and annual aerial inspection", category: "PM", priority: "Medium", opened: longDate(-2), vendor: "Internal Fleet", cost: "$780", status: "Scheduled" },
  { id: "WO-D39", unit: "Rescue 1", issue: "Compartment light replacement", category: "Electrical", priority: "Low", opened: longDate(-9), vendor: "Internal Fleet", cost: "$95", status: "Awaiting Parts" },
  { id: "WO-D37", unit: "Engine 2", issue: "Front brake pads and rotors", category: "Brakes", priority: "Medium", opened: longDate(-17), vendor: "Riverside Fleet Services", cost: "$1,120", status: "Complete" },
];

// ---------------------------------------------------------------------------
// Equipment, hose testing, prevention (demo-only, fictional Riverside places)
// ---------------------------------------------------------------------------

const demoAssets = [
  { id: "AST-1042", name: "Thermal Imaging Camera", category: "Electronics", serial: "TIC-88431", location: "Engine 1", assigned: "J. Pilot", inspection: longDate(64), value: "$9,800", status: "In Service" },
  { id: "AST-1178", name: "Cardiac Monitor", category: "Medical", serial: "CM-22018", location: "Engine 1", assigned: "F. Roster", inspection: longDate(38), value: "$28,500", status: "In Service" },
  { id: "AST-1204", name: "Hydraulic Spreader", category: "Extrication", serial: "HYD-77291", location: "Rescue 1", assigned: "Engine 1 crew", inspection: longDate(97), value: "$14,200", status: "In Service" },
  { id: "AST-1281", name: "Four-Gas Meter", category: "HazMat", serial: "GAS-31904", location: "Station 2", assigned: "L. Model", inspection: longDate(5), value: "$2,100", status: "Inspection Due" },
  { id: "AST-1307", name: "Portable Radio", category: "Communications", serial: "RAD-55210", location: "Repair Vendor", assigned: "Unassigned", inspection: longDate(120), value: "$4,600", status: "Out for Repair" },
  { id: "AST-1350", name: "SCBA Pack", category: "PPE", serial: "SCBA-44012", location: "Station 1", assigned: "Unassigned", inspection: longDate(46), value: "$7,400", status: "Available" },
  { id: "AST-1362", name: "AED", category: "Medical", serial: "AED-90117", location: "Truck 3", assigned: "O. Template", inspection: longDate(152), value: "$1,900", status: "In Service" },
  { id: "AST-1375", name: "Positive Pressure Fan", category: "Ventilation", serial: "PPV-12088", location: "Truck 3", assigned: "Truck 3 crew", inspection: longDate(201), value: "$3,300", status: "In Service" },
];

const demoHoseTests = [
  { id: "HT-101", apparatus: "Engine 1", section: "Bed 1 - 1.75\" Attack", lastTest: longDate(-40), nextDue: longDate(325), result: "Pass", testedBy: "K. Preview", status: "Current" },
  { id: "HT-102", apparatus: "Engine 2", section: "Bed 2 - 2.5\" Supply", lastTest: longDate(-38), nextDue: longDate(327), result: "Pass", testedBy: "M. Draft", status: "Current" },
  { id: "HT-103", apparatus: "Truck 3", section: "Crosslay - 1.75\"", lastTest: longDate(-345), nextDue: longDate(20), result: "Pass", testedBy: "P. Fixture", status: "Due Soon" },
  { id: "HT-104", apparatus: "Rescue 1", section: "Supply - 3\"", lastTest: longDate(-5), nextDue: longDate(360), result: "Fail - Coupling (replaced)", testedBy: "R. Replica", status: "Current" },
  { id: "HT-105", apparatus: "Engine 4", section: "Bed 1 - 5\" LDH", lastTest: longDate(-200), nextDue: longDate(165), result: "Pass", testedBy: "U. Exercise", status: "Current" },
];

const demoOccupancies = [
  { id: "OCC-101", name: "Riverside High School", address: "4710 Riverside Rd", type: "Educational", hazard: "Moderate", occupancyLoad: "1,200", lastInspection: longDate(-350), inspectionDue: longDate(15), inspector: "G. Inspector", status: "Active", constructionType: "Type II-B · Steel Deck roof · 2 stories", sprinkler: "Wet Pipe — full coverage, riser in boiler room", alarm: "Addressable, monitored by Riverside Alarm Co.", knoxBox: "Present — main office entrance" },
  { id: "OCC-102", name: "Main Street Diner", address: "214 Main St", type: "Assembly", hazard: "Moderate", occupancyLoad: "85", lastInspection: longDate(-45), inspectionDue: longDate(-4), inspector: "G. Inspector", status: "Reinspection Due", constructionType: "Type V-B · Wood Truss roof · 1 story", sprinkler: "None — kitchen hood (wet chemical) only", alarm: "Local smoke detectors, not monitored", knoxBox: "Not Present" },
  { id: "OCC-103", name: "Riverside Distribution Center", address: "2600 Commerce Dr", type: "Storage", hazard: "High", occupancyLoad: "450", lastInspection: longDate(-340), inspectionDue: longDate(25), inspector: "G. Inspector", status: "Active", constructionType: "Type II-B · Metal Panel roof · 1 story (42 ft)", sprinkler: "ESFR — full coverage, 4 risers at east wall", alarm: "Addressable, monitored by Riverside Alarm Co.", knoxBox: "Present — Dock 4 east gate" },
  { id: "OCC-104", name: "Riverside Inn", address: "880 Riverfront Pkwy", type: "Residential (Hotel)", hazard: "Moderate", occupancyLoad: "160", lastInspection: longDate(-20), inspectionDue: longDate(8), inspector: "Captain H. Instructor", status: "Pending Review", constructionType: "Type V-A · Wood Truss roof · 3 stories", sprinkler: "Wet Pipe (NFPA 13R)", alarm: "Addressable with voice evacuation, monitored", knoxBox: "Present — front lobby, south of entrance" },
  { id: "OCC-105", name: "Riverside City Hall", address: "3101 Main St", type: "Business", hazard: "Low", occupancyLoad: "75", lastInspection: longDate(-60), inspectionDue: longDate(305), inspector: "G. Inspector", status: "Active", constructionType: "Type II-A · Flat roof · 2 stories", sprinkler: "Wet Pipe — full coverage", alarm: "Addressable, monitored by Riverside Alarm Co.", knoxBox: "Present — Main St entrance" },
  { id: "OCC-106", name: "Riverside Regional Medical Center", address: "1500 Hospital Dr", type: "Institutional", hazard: "High", occupancyLoad: "640", lastInspection: longDate(-330), inspectionDue: longDate(35), inspector: "G. Inspector", status: "Active", constructionType: "Type I-A · Concrete roof · 5 stories", sprinkler: "Wet Pipe with standpipes in all stairwells", alarm: "Addressable with voice evacuation, monitored on site", knoxBox: "Present — ER ramp, north wall by FDC" },
  { id: "OCC-107", name: "Willow Creek Nursing Home", address: "455 Willow Creek Ln", type: "Institutional", hazard: "High", occupancyLoad: "120", lastInspection: longDate(-12), inspectionDue: longDate(353), inspector: "G. Inspector", status: "Active", constructionType: "Type V-A · Pitched roof · 1 story", sprinkler: "Wet Pipe (NFPA 13)", alarm: "Addressable, monitored by Riverside Alarm Co.", knoxBox: "Present — main entrance by annunciator" },
  { id: "OCC-108", name: "Riverside Plaza Shopping Center", address: "7100 Riverside Plaza", type: "Mercantile", hazard: "Moderate", occupancyLoad: "900", lastInspection: longDate(-355), inspectionDue: longDate(10), inspector: "G. Inspector", status: "Active", constructionType: "Type II-B · Bar Joist roof · 1 story", sprinkler: "Wet Pipe — full coverage, riser in each tenant space", alarm: "Monitored, panel in management office", knoxBox: "Present — management office, north entrance" },
];

const demoInspections = [
  { id: "INS-201", occupancy: "Riverside High School", occupancyId: "OCC-101", type: "Annual", due: longDate(15), inspector: "G. Inspector", violations: 0, priority: "Normal", status: "Scheduled" },
  { id: "INS-202", occupancy: "Main Street Diner", occupancyId: "OCC-102", type: "Reinspection", due: longDate(-4), inspector: "G. Inspector", violations: 2, priority: "High", status: "Overdue" },
  { id: "INS-203", occupancy: "Riverside Distribution Center", occupancyId: "OCC-103", type: "Annual", due: longDate(25), inspector: "G. Inspector", violations: 0, priority: "Normal", status: "Scheduled" },
  { id: "INS-204", occupancy: "Riverside Inn", occupancyId: "OCC-104", type: "Annual", due: longDate(-20), inspector: "Captain H. Instructor", violations: 1, priority: "Normal", status: "Pending Review" },
  { id: "INS-205", occupancy: "Riverside City Hall", occupancyId: "OCC-105", type: "Annual", due: longDate(-60), inspector: "G. Inspector", violations: 0, priority: "Low", status: "Complete" },
  { id: "INS-206", occupancy: "Riverside Regional Medical Center", occupancyId: "OCC-106", type: "Annual", due: longDate(35), inspector: "G. Inspector", violations: 0, priority: "High", status: "Scheduled" },
  { id: "INS-207", occupancy: "Willow Creek Nursing Home", occupancyId: "OCC-107", type: "Annual", due: longDate(-12), inspector: "G. Inspector", violations: 0, priority: "High", status: "Complete" },
  { id: "INS-208", occupancy: "Riverside Plaza Shopping Center", occupancyId: "OCC-108", type: "Annual", due: longDate(10), inspector: "G. Inspector", violations: 0, priority: "Normal", status: "Scheduled" },
  { id: "INS-209", occupancy: "Main Street Diner", occupancyId: "OCC-102", type: "Complaint", due: longDate(-45), inspector: "G. Inspector", violations: 2, priority: "Normal", status: "Complete" },
];

const demoPreplans = [
  { id: "PP-301", occupancy: "Riverside High School", occupancyId: "OCC-101", hazards: "Sprinklered, Knox box at main office, AED locations marked", access: "Main entrance - Gate C for apparatus", waterSupply: "Hydrants RV-1042, RV-1178", lastUpdated: longDate(-70), status: "Current" },
  { id: "PP-302", occupancy: "Riverside Distribution Center", occupancyId: "OCC-103", hazards: "High-piled storage, lithium battery aisle, loading docks", access: "Dock 4 - east gate", waterSupply: "Private loop + RV-1281", lastUpdated: longDate(-40), status: "Current" },
  { id: "PP-303", occupancy: "Riverside Inn", occupancyId: "OCC-104", hazards: "Three-story guest rooms, pool chemical storage", access: "Front circle - south stairwell", waterSupply: "RV-1307 private", lastUpdated: longDate(-300), status: "Review Due" },
  { id: "PP-304", occupancy: "Riverside Regional Medical Center", occupancyId: "OCC-106", hazards: "Oxygen storage, defend-in-place occupants, helipad", access: "ER ramp off Hospital Dr - FDC north wall", waterSupply: "RV-1450, RV-1451", lastUpdated: longDate(-25), status: "Current" },
  { id: "PP-305", occupancy: "Willow Creek Nursing Home", occupancyId: "OCC-107", hazards: "Non-ambulatory residents, oxygen in rooms", access: "Main entrance - annunciator in lobby", waterSupply: "RV-1502", lastUpdated: longDate(-12), status: "Current" },
];

// Classic documents with demo authors (the shared seeds name real people).
const DOCUMENT_AUTHORS = {
  "Stephen White": "Chief A. Sample",
  "Jeremy Powell": "Deputy B. Example",
  "EMS Chief": "Deputy B. Example",
  "Training Officer": "Captain H. Instructor",
  "Safety Officer": "Captain H. Instructor",
  "Fleet Captain": "Captain D. Trainee",
  "Prevention Bureau": "Marshal G. Inspector",
};
const demoDocuments = initialDocuments.map((doc) => ({
  ...doc,
  title: doc.title.replace(/^\d{4} Annual Training Plan$/, "Annual Training Plan"),
  uploadedBy: DOCUMENT_AUTHORS[doc.uploadedBy] || doc.uploadedBy,
}));

// ---------------------------------------------------------------------------

/** Demo lists rewritten on every demo boot (generic sample data with live dates). */
export const DEMO_FORCE_RESEED_KEYS = [
  "hlfd-rms-personnel",
  "hlfd-rms-certifications",
  "hlfd-rms-training",
  "hlfd-rms-roster",
  "hlfd-rms-schedule-days",
  "hlfd-rms-leave-requests",
  "hlfd-rms-shift-trades",
  "hlfd-rms-overtime-offers",
  "hlfd-rms-apparatus",
  "hlfd-rms-work-orders",
  "hlfd-rms-assets",
  "hlfd-rms-hose-tests",
  "hlfd-rms-occupancies",
  "hlfd-rms-inspections",
  "hlfd-rms-preplans",
  "hlfd-rms-neris-fire-reports",
];

export const DEMO_LIST_SEEDS = {
  "hlfd-rms-personnel": demoPersonnel,
  "hlfd-rms-certifications": demoCertifications,
  "hlfd-rms-training": demoTraining,
  "hlfd-rms-schedule-days": demoScheduleDays,
  // Day assignments come from each member's shift/assignment; no overrides needed.
  "hlfd-rms-roster": [],
  "hlfd-rms-leave-requests": demoLeaveRequests,
  "hlfd-rms-overtime-offers": demoOvertimeOffers,
  "hlfd-rms-shift-trades": demoShiftTrades,
  "hlfd-rms-apparatus": demoApparatus,
  "hlfd-rms-work-orders": demoWorkOrders,
  "hlfd-rms-assets": demoAssets,
  "hlfd-rms-hose-tests": demoHoseTests,
  "hlfd-rms-occupancies": demoOccupancies,
  "hlfd-rms-inspections": demoInspections,
  "hlfd-rms-preplans": demoPreplans,
  "hlfd-rms-documents": demoDocuments,
  "hlfd-rms-dd-displays": defaultDigitalDashboardDisplays,
  "hlfd-rms-dd-media": defaultDigitalDashboardMedia,
  "hlfd-rms-dd-playlists": defaultDigitalDashboardPlaylists,
  "hlfd-rms-dd-schedules": defaultDigitalDashboardSchedules,
  "hlfd-rms-neris-fire-reports": buildDemoNerisReports(),
};

export const DEMO_LIST_KEYS = Object.keys(DEMO_LIST_SEEDS);

/**
 * Bump whenever the demo seed data above changes: demo sign-ins reseed the
 * sandbox when this differs from the version last written (see demoService.js).
 */
export const DEMO_SEED_VERSION = 9;
