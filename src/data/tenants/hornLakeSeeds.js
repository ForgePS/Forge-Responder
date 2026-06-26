import {
  initialAssets,
  initialDocuments,
  initialHoseTests,
  initialInspections,
  initialOccupancies,
  initialPreplans
} from "../sprintModuleSeeds.js";
import { LIST_KEYS } from "../../lib/tenantListKeys.js";
import {
  defaultDigitalDashboardDisplays,
  defaultDigitalDashboardMedia,
  defaultDigitalDashboardPlaylists,
  defaultDigitalDashboardSchedules,
} from "../digitalDashboardSeeds.js";
import { NERIS_FIRE_REPORT_SEEDS } from "../nerisFireReportSeeds.js";

export const hornLakePersonnel = [
  { id: "HL-001", name: "Jeremy Powell", initials: "JP", rank: "Fire Chief", shift: "Administration", assignment: "Administration", unit: "Administration", division: "Administration", employmentType: "Full Time", ems: "Paramedic", driver: "Approved", status: "Active", email: "jpowell@hornlake.org", phone: "(662) 555-0101", station: "Fire Administration", hireDate: "March 14, 2005", supervisor: "Mayor / Board of Aldermen", address: "3101 Goodman Road W", city: "Horn Lake", state: "MS", zip: "38637", badgeNumber: "1001", agencyPersonnelId: "HL-001", iaffLocalNumber: "1533", qualifiers: ["Administration"], isSystemUser: true, isTrainingInstructor: true, emergencyFirstName: "Jennifer", emergencyLastName: "Powell", emergencyRelationship: "Spouse", emergencyPhone: "(662) 555-0181", emergencySameAddress: true, documents: ["Employment Agreement.pdf", "Annual Evaluation 2026.pdf"], certifications: [["Paramedic", "Dec 18, 2026", "Active"], ["Fire Officer IV", "Sep 10, 2027", "Active"], ["NIMS ICS-400", "No expiration", "Complete"]] },
  { id: "HL-002", name: "Stephen White", initials: "SW", rank: "Deputy Chief", shift: "Administration", assignment: "Operations", ems: "Paramedic", driver: "Approved", status: "Active", email: "swhite@hornlake.org", phone: "(662) 555-0102", station: "Fire Administration", hireDate: "August 9, 2007", supervisor: "Jeremy Powell", address: "", city: "Horn Lake", state: "MS", zip: "", iaffLocalNumber: "1533", emergencyFirstName: "Ashley", emergencyLastName: "White", emergencyRelationship: "Spouse", emergencyPhone: "(662) 555-0182", emergencySameAddress: true, documents: ["Promotion Letter.pdf", "Annual Evaluation 2026.pdf"], certifications: [["Paramedic", "Nov 14, 2026", "Active"], ["Fire Officer III", "May 4, 2028", "Active"]] },
  { id: "HL-014", name: "Gregory Scruggs", initials: "GS", rank: "Battalion Chief", shift: "A Shift", assignment: "Station 1 / Battalion 1", ems: "AEMT", driver: "Approved", status: "Active", email: "gscruggs@hornlake.org", phone: "(662) 555-0114", station: "Station 1", hireDate: "January 18, 2011", supervisor: "Stephen White", address: "", city: "Horn Lake", state: "MS", zip: "", emergencyFirstName: "Morgan", emergencyLastName: "Scruggs", emergencyRelationship: "Spouse", emergencyPhone: "(662) 555-0194", emergencySameAddress: true, documents: ["Driver Clearance.pdf"], certifications: [["AEMT", "May 31, 2026", "Expired"], ["Fire Officer II", "Feb 18, 2027", "Active"]] },
  { id: "HL-021", name: "Mike Mallett", initials: "MM", rank: "Battalion Chief", shift: "B Shift", assignment: "Station 2 / Battalion 1", ems: "Paramedic", driver: "Approved", status: "Active", email: "mmallett@hornlake.org", phone: "(662) 555-0121", station: "Station 2", hireDate: "June 2, 2012", supervisor: "Stephen White", address: "", city: "Horn Lake", state: "MS", zip: "", emergencyFirstName: "Taylor", emergencyLastName: "Mallett", emergencyRelationship: "Spouse", emergencyPhone: "(662) 555-0191", emergencySameAddress: true, documents: ["Instructor Credentials.pdf"], certifications: [["Instructor I", "Aug 08, 2026", "Active"], ["Paramedic", "Jan 12, 2027", "Active"]] },
  { id: "HL-033", name: "Adam Tutor", initials: "AT", rank: "Captain", shift: "C Shift", assignment: "Engine 3", unit: "Engine 3", division: "Emergency Operations", position: "Officer", employmentType: "Full Time", ems: "EMT", driver: "Approved", status: "Active", email: "atutor@hornlake.org", phone: "(662) 555-0133", station: "Station 3", hireDate: "October 21, 2016", supervisor: "C Shift Battalion Chief", address: "", city: "Horn Lake", state: "MS", zip: "", badgeNumber: "1033", qualifiers: ["Firefighter", "Apparatus Operator"], emergencyFirstName: "Casey", emergencyLastName: "Tutor", emergencyRelationship: "Spouse", emergencyPhone: "(662) 555-0193", emergencySameAddress: true, documents: ["Driver Clearance.pdf"], certifications: [["Firefighter II", "Jul 12, 2026", "Due Soon"], ["EMT", "Oct 2, 2027", "Active"]] },
  { id: "HL-041", name: "Cole Casey", initials: "CC", rank: "Firefighter", shift: "A Shift", assignment: "Engine 1", ems: "Paramedic", driver: "Trainee", status: "Leave", email: "ccasey@hornlake.org", phone: "(662) 555-0141", station: "Station 1", hireDate: "April 12, 2021", supervisor: "A Shift Captain", address: "", city: "Horn Lake", state: "MS", zip: "", emergencyFirstName: "Jordan", emergencyLastName: "Casey", emergencyRelationship: "Spouse", emergencyPhone: "(662) 555-0192", emergencySameAddress: true, documents: ["Leave Request.pdf"], certifications: [["Paramedic", "Jun 24, 2026", "Due Soon"], ["Firefighter I/II", "Apr 12, 2028", "Active"]] }
];

export const hornLakeCertifications = [
  { id: "CERT-101", person: "Cole Casey", type: "Paramedic", category: "EMS", issue: "Jun 24, 2024", expires: "Jun 24, 2026", days: 17, renewal: "Submitted", status: "Due Soon", document: "Paramedic Renewal.pdf" },
  { id: "CERT-102", person: "Adam Tutor", type: "Firefighter II", category: "Fire", issue: "Jul 12, 2023", expires: "Jul 12, 2026", days: 35, renewal: "Not Started", status: "Due Soon", document: "" },
  { id: "CERT-103", person: "Mike Mallett", type: "Instructor I", category: "Fire", issue: "Aug 08, 2023", expires: "Aug 08, 2026", days: 62, renewal: "In Progress", status: "Active", document: "Instructor I.pdf" },
  { id: "CERT-104", person: "Gregory Scruggs", type: "AEMT", category: "EMS", issue: "May 31, 2024", expires: "May 31, 2026", days: -7, renewal: "Overdue", status: "Expired", document: "AEMT Card.pdf" },
  { id: "CERT-105", person: "Jeremy Powell", type: "Paramedic", category: "EMS", issue: "Dec 18, 2024", expires: "Dec 18, 2026", days: 194, renewal: "Not Started", status: "Active", document: "Paramedic Card.pdf" },
  { id: "CERT-106", person: "Stephen White", type: "Fire Officer III", category: "Fire", issue: "May 04, 2025", expires: "May 04, 2028", days: 697, renewal: "Not Started", status: "Active", document: "Fire Officer III.pdf" }
];

export const hornLakeScheduleDays = [
  { id: "2026-06-07", weekday: "Sun", date: "Jun 7", shift: "A Shift", staffed: 21, minimum: 21, leave: 1, status: "Complete" },
  { id: "2026-06-08", weekday: "Mon", date: "Jun 8", shift: "B Shift", staffed: 20, minimum: 21, leave: 2, status: "Deficit" },
  { id: "2026-06-09", weekday: "Tue", date: "Jun 9", shift: "C Shift", staffed: 22, minimum: 21, leave: 0, status: "Complete" },
  { id: "2026-06-10", weekday: "Wed", date: "Jun 10", shift: "A Shift", staffed: 21, minimum: 21, leave: 1, status: "Complete" },
  { id: "2026-06-11", weekday: "Thu", date: "Jun 11", shift: "B Shift", staffed: 19, minimum: 21, leave: 3, status: "Deficit" },
  { id: "2026-06-12", weekday: "Fri", date: "Jun 12", shift: "C Shift", staffed: 21, minimum: 21, leave: 1, status: "Complete" },
  { id: "2026-06-13", weekday: "Sat", date: "Jun 13", shift: "A Shift", staffed: 20, minimum: 21, leave: 2, status: "Deficit" }
];

export const hornLakeRoster = [];

export const hornLakeLeaveRequests = [
  { id: "L-101", person: "Cole Casey", type: "Vacation", dates: "Jun 7-8", hours: "24 hrs", status: "Approved" },
  { id: "L-102", person: "Morgan Johnson", type: "Vacation", dates: "Jun 19-23", hours: "48 hrs", status: "Pending" },
  { id: "L-103", person: "Alex Davis", type: "Personal", dates: "Jun 11", hours: "12 hrs", status: "Pending" }
];

export const hornLakeOvertimeOffers = [
  { id: "OT-201", date: "Jun 8", shift: "B Shift", position: "Firefighter / Paramedic", applicants: 3, status: "Open" },
  { id: "OT-202", date: "Jun 11", shift: "B Shift", position: "Driver / Operator", applicants: 2, status: "Open" },
  { id: "OT-203", date: "Jun 13", shift: "A Shift", position: "Firefighter", applicants: 4, status: "Open" }
];

export const hornLakeVacancyPickups = [];

export const hornLakeShiftTrades = [
  {
    id: "TR-301",
    requestedBy: "Adam Tutor",
    personnelId: "HL-033",
    give: "Jun 12 - C Shift",
    receive: "Jun 15 - A Shift",
    giveShift: "C Shift",
    receiveShift: "A Shift",
    coverage: "Sam Rivera",
    submitted: "Jun 7",
    status: "Pending Battalion Chief",
    approvalStage: "battalionChief",
    assignedCoverageMember: "Sam Rivera",
    assignedBattalionChiefs: [
      { personnelId: "HL-014", name: "Gregory Scruggs", shift: "A Shift" },
      { personnelId: "HL-021", name: "Mike Mallett", shift: "B Shift" },
    ],
    battalionApprovals: [],
    coverageApprovedAt: "2026-06-07T14:00:00.000Z",
    coverageApprovedBy: "Sam Rivera",
  },
  {
    id: "TR-302",
    requestedBy: "Morgan Johnson",
    give: "Jun 11 - A Shift",
    receive: "Jun 14 - B Shift",
    giveShift: "A Shift",
    receiveShift: "B Shift",
    coverage: "Taylor Brooks",
    submitted: "Jun 6",
    status: "Awaiting Member",
    approvalStage: "coverageMember",
    assignedCoverageMember: "Taylor Brooks",
    assignedBattalionChiefs: [
      { personnelId: "HL-014", name: "Gregory Scruggs", shift: "A Shift" },
      { personnelId: "HL-021", name: "Mike Mallett", shift: "B Shift" },
    ],
    battalionApprovals: [],
  },
  { id: "TR-303", requestedBy: "Alex Davis", give: "Jun 9 - C Shift", receive: "Jun 18 - C Shift", coverage: "Jordan Wade", submitted: "Jun 5", status: "Approved", approvalStage: "complete" },
  { id: "TR-304", requestedBy: "Cole Casey", give: "Jun 16 - A Shift", receive: "Jun 22 - A Shift", coverage: "Marcus Reed", submitted: "Jun 4", status: "Denied", approvalStage: "complete" }
];

export const hornLakeApparatus = [
  { id: "APP-01", unit: "Engine 1", type: "Pumper", station: "Station 1", year: "2021", mileage: "31,820", engineHours: "4,218", pumpHours: "386", fuel: "82%", pmDue: "Aug 14, 2026", status: "In Service", operator: "D. Lee", checks: [["Daily cab check", "Complete"], ["Medical inventory", "Complete"], ["Pump test", "Complete"], ["SCBA inventory", "Complete"]] },
  { id: "APP-02", unit: "Engine 2", type: "Pumper", station: "Station 2", year: "2018", mileage: "44,091", engineHours: "6,104", pumpHours: "591", fuel: "68%", pmDue: "Jun 7, 2026", status: "Out of Service", operator: "M. Reed", checks: [["Daily cab check", "Complete"], ["Medical inventory", "Complete"], ["Pump test", "Failed"], ["SCBA inventory", "Complete"]] },
  { id: "APP-03", unit: "Truck 3", type: "Aerial", station: "Station 3", year: "2020", mileage: "26,445", engineHours: "3,870", pumpHours: "214", fuel: "74%", pmDue: "Jun 18, 2026", status: "PM Due", operator: "T. Brooks", checks: [["Daily cab check", "Complete"], ["Aerial controls", "Complete"], ["Ground ladders", "Complete"], ["Hydraulic inspection", "Due"]] },
  { id: "APP-04", unit: "Rescue 1", type: "Heavy Rescue", station: "Station 1", year: "2022", mileage: "19,230", engineHours: "2,991", pumpHours: "N/A", fuel: "91%", pmDue: "Sep 2, 2026", status: "In Service", operator: "A. Tutor", checks: [["Daily cab check", "Complete"], ["Extrication tools", "Complete"], ["Medical inventory", "Complete"], ["Generator", "Complete"]] },
  { id: "APP-05", unit: "FD-2", type: "Brush", station: "Station 2", year: "2017", mileage: "38,604", engineHours: "4,832", pumpHours: "301", fuel: "56%", pmDue: "Jun 21, 2026", status: "Reserve", operator: "Unassigned", checks: [["Weekly cab check", "Complete"], ["Pump test", "Complete"], ["Wildland equipment", "Due"], ["Radio check", "Complete"]] }
];

export const hornLakeWorkOrders = [
  { id: "WO-26041", unit: "Engine 2", issue: "Pump relief valve failed annual test", category: "Pump", priority: "High", opened: "Jun 7", vendor: "Mid-South Apparatus", cost: "$2,450", status: "In Progress" },
  { id: "WO-26042", unit: "Truck 3", issue: "Preventive maintenance and aerial inspection", category: "PM", priority: "Medium", opened: "Jun 6", vendor: "Internal Fleet", cost: "$780", status: "Scheduled" },
  { id: "WO-26039", unit: "Rescue 1", issue: "Compartment light replacement", category: "Electrical", priority: "Low", opened: "Jun 3", vendor: "Internal Fleet", cost: "$95", status: "Awaiting Parts" },
  { id: "WO-26035", unit: "Engine 1", issue: "Replace rear tire pair", category: "Tires", priority: "Medium", opened: "May 28", vendor: "Gateway Tire", cost: "$1,340", status: "Complete" }
];

export const hornLakeTraining = [
  { id: "TRN-101", course: "Live Fire Evolution", category: "Fire", date: "Jun 10, 2026", endDate: "Jun 10, 2026", instructor: "Training Officer", hours: 4, attendees: 18, capacity: 24, completion: 0, expirationDate: "", status: "Scheduled", members: "A Shift", notes: "Company-level live fire evolution." },
  { id: "TRN-102", course: "Pediatric Airway Management", category: "EMS CE", date: "Jun 14, 2026", endDate: "Jun 14, 2026", instructor: "EMS Chief", hours: 2, attendees: 12, capacity: 18, completion: 0, expirationDate: "2028-06-14", status: "Scheduled", members: "EMS personnel", notes: "Pediatric advanced airway skills lab." },
  { id: "TRN-103", course: "Driver Pump Operations", category: "Driver", date: "Jun 20, 2026", endDate: "Jun 20, 2026", instructor: "Training Officer", hours: 4, attendees: 9, capacity: 12, completion: 78, expirationDate: "2027-06-20", status: "In Progress", members: "Driver/operators", notes: "Pump operations and water supply." },
  { id: "TRN-104", course: "HazMat Refresher", category: "Fire", date: "May 28, 2026", endDate: "May 28, 2026", instructor: "HazMat Coordinator", hours: 3, attendees: 21, capacity: 24, completion: 100, expirationDate: "2028-05-28", status: "Complete", members: "Operations", notes: "Annual hazardous materials refresher." },
  { id: "TRN-105", course: "Fire Officer Development", category: "Officer", date: "Jul 01, 2026", endDate: "Jul 01, 2026", instructor: "Command Staff", hours: 3, attendees: 6, capacity: 12, completion: 45, expirationDate: "2028-07-01", status: "In Progress", members: "Company officers", notes: "Officer leadership module." },
  { id: "TRN-106", course: "EMT Continuing Education", category: "EMS CE", date: "May 15, 2026", endDate: "Jun 30, 2026", instructor: "EMS Chief", hours: 8, attendees: 14, capacity: 18, completion: 86, expirationDate: "2028-06-30", status: "In Progress", members: "EMS providers", notes: "Department EMS CE block." },
  { id: "TRN-107", course: "Rope Rescue Refresher", category: "Fire", date: "Apr 18, 2026", endDate: "Apr 18, 2026", instructor: "Technical Rescue Lead", hours: 6, attendees: 16, capacity: 16, completion: 100, expirationDate: "2028-04-18", status: "Complete", members: "Technical rescue team", notes: "Annual rope rescue competency." },
  { id: "TRN-108", course: "ACLS Provider Update", category: "EMS CE", date: "Mar 02, 2026", endDate: "Mar 02, 2026", instructor: "EMS Chief", hours: 4, attendees: 10, capacity: 12, completion: 55, expirationDate: "2026-03-02", status: "Overdue", members: "Paramedics", notes: "Needs documentation completion." }
];

export const HORN_LAKE_LIST_SEEDS = {
  [LIST_KEYS.personnel]: hornLakePersonnel,
  [LIST_KEYS.certifications]: hornLakeCertifications,
  [LIST_KEYS.training]: hornLakeTraining,
  [LIST_KEYS.apparatus]: hornLakeApparatus,
  [LIST_KEYS.workOrders]: hornLakeWorkOrders,
  [LIST_KEYS.assets]: initialAssets,
  [LIST_KEYS.documents]: initialDocuments,
  [LIST_KEYS.occupancies]: initialOccupancies,
  [LIST_KEYS.inspections]: initialInspections,
  [LIST_KEYS.preplans]: initialPreplans,
  [LIST_KEYS.hoseTests]: initialHoseTests,
  [LIST_KEYS.scheduleDays]: hornLakeScheduleDays,
  [LIST_KEYS.roster]: hornLakeRoster,
  [LIST_KEYS.leaveRequests]: hornLakeLeaveRequests,
  [LIST_KEYS.overtimeOffers]: hornLakeOvertimeOffers,
  [LIST_KEYS.vacancyPickups]: hornLakeVacancyPickups,
  [LIST_KEYS.shiftTrades]: hornLakeShiftTrades,
  [LIST_KEYS.callShifts]: [],
  [LIST_KEYS.dailyLogs]: [],
  [LIST_KEYS.timeCards]: [],
  [LIST_KEYS.digitalDashboardDisplays]: defaultDigitalDashboardDisplays,
  [LIST_KEYS.digitalDashboardMedia]: defaultDigitalDashboardMedia,
  [LIST_KEYS.digitalDashboardPlaylists]: defaultDigitalDashboardPlaylists,
  [LIST_KEYS.digitalDashboardSchedules]: defaultDigitalDashboardSchedules,
  [LIST_KEYS.nerisFireReports]: NERIS_FIRE_REPORT_SEEDS,
};

