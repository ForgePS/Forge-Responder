import {
  initialAssets,
  initialDocuments,
  initialHoseTests,
  initialInspections,
  initialOccupancies,
  initialPreplans
} from "./sprintModuleSeeds.js";

const demoEmail = (role) => `${role}@demo.forge.demo`;

const demoPersonnel = [
  {
    id: "DEMO-001",
    name: "Chief A. Sample",
    initials: "AS",
    rank: "Fire Chief",
    shift: "Administration",
    assignment: "Administration",
    ems: "Paramedic",
    driver: "Approved",
    status: "Active",
    email: demoEmail("chief"),
    phone: "(555) 010-0001",
    station: "Station 1",
    hireDate: "January 15, 2010",
    supervisor: "City Administrator",
    address: "100 Training Way, Demo City, ST",
    emergency: "Emergency Contact · (555) 010-9001",
    documents: ["Sample Employment File.pdf"],
    certifications: [["Paramedic", "Dec 18, 2026", "Active"], ["Fire Officer IV", "Sep 10, 2027", "Active"]]
  },
  {
    id: "DEMO-002",
    name: "Deputy B. Example",
    initials: "BE",
    rank: "Deputy Chief",
    shift: "Administration",
    assignment: "Operations",
    ems: "Paramedic",
    driver: "Approved",
    status: "Active",
    email: demoEmail("deputy"),
    phone: "(555) 010-0002",
    station: "Station 1",
    hireDate: "March 4, 2012",
    supervisor: "Chief A. Sample",
    address: "Demo City, ST",
    emergency: "Emergency Contact · (555) 010-9002",
    documents: ["Sample Promotion File.pdf"],
    certifications: [["Paramedic", "Nov 14, 2026", "Active"]]
  },
  {
    id: "DEMO-003",
    name: "Battalion C. Demo",
    initials: "CD",
    rank: "Battalion Chief",
    shift: "A Shift",
    assignment: "Station 1 / Battalion 1",
    ems: "AEMT",
    driver: "Approved",
    status: "Active",
    email: demoEmail("battalion"),
    phone: "(555) 010-0003",
    station: "Station 1",
    hireDate: "June 20, 2014",
    supervisor: "Deputy B. Example",
    address: "Demo City, ST",
    emergency: "Emergency Contact · (555) 010-9003",
    documents: ["Sample Driver File.pdf"],
    certifications: [["AEMT", "May 31, 2026", "Expired"], ["Fire Officer II", "Feb 18, 2027", "Active"]]
  },
  {
    id: "DEMO-004",
    name: "Captain D. Trainee",
    initials: "DT",
    rank: "Captain",
    shift: "B Shift",
    assignment: "Engine 2",
    ems: "Paramedic",
    driver: "Approved",
    status: "Active",
    email: demoEmail("captain"),
    phone: "(555) 010-0004",
    station: "Station 2",
    hireDate: "August 11, 2016",
    supervisor: "Battalion C. Demo",
    address: "Demo City, ST",
    emergency: "Emergency Contact · (555) 010-9004",
    documents: ["Sample Instructor File.pdf"],
    certifications: [["Instructor I", "Aug 08, 2026", "Active"]]
  },
  {
    id: "DEMO-005",
    name: "Firefighter E. Member",
    initials: "EM",
    rank: "Firefighter",
    shift: "C Shift",
    assignment: "Rescue 1",
    ems: "EMT",
    driver: "Approved",
    status: "Active",
    email: demoEmail("ff-emt"),
    phone: "(555) 010-0005",
    station: "Station 3",
    hireDate: "February 2, 2019",
    supervisor: "Captain D. Trainee",
    address: "Demo City, ST",
    emergency: "Emergency Contact · (555) 010-9005",
    documents: ["Sample Training File.pdf"],
    certifications: [["Firefighter II", "Jul 12, 2026", "Due Soon"]]
  },
  {
    id: "DEMO-006",
    name: "Firefighter F. Roster",
    initials: "FR",
    rank: "Firefighter",
    shift: "A Shift",
    assignment: "Engine 1",
    ems: "Paramedic",
    driver: "Trainee",
    status: "Leave",
    email: demoEmail("ff-medic"),
    phone: "(555) 010-0006",
    station: "Station 1",
    hireDate: "September 9, 2021",
    supervisor: "Battalion C. Demo",
    address: "Demo City, ST",
    emergency: "Emergency Contact · (555) 010-9006",
    documents: ["Sample Leave File.pdf"],
    certifications: [["Paramedic", "Jun 24, 2026", "Due Soon"]]
  }
];

const demoCertifications = [
  { id: "CERT-D101", person: "Firefighter F. Roster", type: "Paramedic", category: "EMS", issue: "Jun 24, 2024", expires: "Jun 24, 2026", days: 17, renewal: "Submitted", status: "Due Soon", document: "Sample Renewal.pdf" },
  { id: "CERT-D102", person: "Firefighter E. Member", type: "Firefighter II", category: "Fire", issue: "Jul 12, 2023", expires: "Jul 12, 2026", days: 35, renewal: "Not Started", status: "Due Soon", document: "" },
  { id: "CERT-D103", person: "Captain D. Trainee", type: "Instructor I", category: "Fire", issue: "Aug 08, 2023", expires: "Aug 08, 2026", days: 62, renewal: "In Progress", status: "Active", document: "Sample Instructor Card.pdf" },
  { id: "CERT-D104", person: "Battalion C. Demo", type: "AEMT", category: "EMS", issue: "May 31, 2024", expires: "May 31, 2026", days: -7, renewal: "Overdue", status: "Expired", document: "Sample AEMT Card.pdf" }
];

const demoTraining = [
  { id: "TRN-D101", course: "Live Fire Evolution", category: "Fire", date: "Jun 10, 2026", endDate: "Jun 10, 2026", instructor: "Training Officer", hours: 4, attendees: 18, capacity: 24, completion: 0, expirationDate: "", status: "Scheduled", members: "A Shift", notes: "Company-level live fire evolution." },
  { id: "TRN-D102", course: "Pediatric Airway Management", category: "EMS CE", date: "Jun 14, 2026", endDate: "Jun 14, 2026", instructor: "EMS Training Lead", hours: 2, attendees: 12, capacity: 18, completion: 0, expirationDate: "2028-06-14", status: "Scheduled", members: "EMS personnel", notes: "Pediatric advanced airway skills lab." },
  { id: "TRN-D103", course: "Driver Pump Operations", category: "Driver", date: "Jun 20, 2026", endDate: "Jun 20, 2026", instructor: "Training Officer", hours: 4, attendees: 9, capacity: 12, completion: 78, expirationDate: "2027-06-20", status: "In Progress", members: "Driver/operators", notes: "Pump operations and water supply." }
];

const demoApparatus = [
  { id: "APP-D01", unit: "Engine 1", type: "Pumper", station: "Station 1", year: "2021", mileage: "31,820", engineHours: "4,218", pumpHours: "386", fuel: "82%", pmDue: "Aug 14, 2026", status: "In Service", operator: "D. Trainee", checks: [["Daily cab check", "Complete"], ["Medical inventory", "Complete"], ["Pump test", "Complete"]] },
  { id: "APP-D02", unit: "Engine 2", type: "Pumper", station: "Station 2", year: "2018", mileage: "44,091", engineHours: "6,104", pumpHours: "591", fuel: "68%", pmDue: "Jun 7, 2026", status: "Out of Service", operator: "E. Member", checks: [["Daily cab check", "Complete"], ["Pump test", "Failed"]] },
  { id: "APP-D03", unit: "Truck 3", type: "Aerial", station: "Station 3", year: "2020", mileage: "26,445", engineHours: "3,870", pumpHours: "214", fuel: "74%", pmDue: "Jun 18, 2026", status: "PM Due", operator: "C. Demo", checks: [["Daily cab check", "Complete"], ["Aerial controls", "Complete"]] },
  { id: "APP-D04", unit: "Rescue 1", type: "Heavy Rescue", station: "Station 1", year: "2022", mileage: "19,230", engineHours: "2,991", pumpHours: "N/A", fuel: "91%", pmDue: "Sep 2, 2026", status: "In Service", operator: "F. Roster", checks: [["Daily cab check", "Complete"], ["Extrication tools", "Complete"]] }
];

const demoWorkOrders = [
  { id: "WO-D41", unit: "Engine 2", issue: "Pump relief valve failed annual test", category: "Pump", priority: "High", opened: "Jun 7", vendor: "Demo Fleet Services", cost: "$2,450", status: "In Progress" },
  { id: "WO-D42", unit: "Truck 3", issue: "Preventive maintenance and aerial inspection", category: "PM", priority: "Medium", opened: "Jun 6", vendor: "Internal Fleet", cost: "$780", status: "Scheduled" },
  { id: "WO-D39", unit: "Rescue 1", issue: "Compartment light replacement", category: "Electrical", priority: "Low", opened: "Jun 3", vendor: "Internal Fleet", cost: "$95", status: "Awaiting Parts" }
];

const demoScheduleDays = [
  { id: "2026-06-07", weekday: "Sun", date: "Jun 7", shift: "A Shift", staffed: 21, minimum: 21, leave: 1, status: "Complete" },
  { id: "2026-06-08", weekday: "Mon", date: "Jun 8", shift: "B Shift", staffed: 20, minimum: 21, leave: 2, status: "Deficit" },
  { id: "2026-06-10", weekday: "Wed", date: "Jun 10", shift: "A Shift", staffed: 21, minimum: 21, leave: 1, status: "Complete" }
];

const demoRoster = [
  { id: "R-D01", name: "Battalion C. Demo", rank: "Battalion Chief", shift: "A Shift", apparatus: "Battalion 1", position: "Command", status: "On Duty" },
  { id: "R-D02", name: "Captain D. Trainee", rank: "Captain", shift: "A Shift", apparatus: "Engine 1", position: "Officer", status: "On Duty" },
  { id: "R-D03", name: "Firefighter F. Roster", rank: "Firefighter", shift: "A Shift", apparatus: "Engine 1", position: "Medic / Driver", status: "Leave" }
];

/** Demo lists that should refresh whenever demo access boots (generic training data). */
export const DEMO_FORCE_RESEED_KEYS = [
  "hlfd-rms-personnel",
  "hlfd-rms-certifications",
  "hlfd-rms-roster",
  "hlfd-rms-leave-requests",
  "hlfd-rms-shift-trades",
  "hlfd-rms-apparatus"
];

export const DEMO_LIST_SEEDS = {
  "hlfd-rms-personnel": demoPersonnel,
  "hlfd-rms-certifications": demoCertifications,
  "hlfd-rms-training": demoTraining,
  "hlfd-rms-schedule-days": demoScheduleDays,
  "hlfd-rms-roster": demoRoster,
  "hlfd-rms-leave-requests": [
    { id: "L-D101", person: "Firefighter F. Roster", type: "Vacation", dates: "Jun 7-8", hours: "24 hrs", status: "Approved" },
    { id: "L-D102", person: "Firefighter E. Member", type: "Vacation", dates: "Jun 19-23", hours: "48 hrs", status: "Pending" }
  ],
  "hlfd-rms-overtime-offers": [
    { id: "OT-D201", date: "Jun 8", shift: "B Shift", position: "Firefighter / Paramedic", applicants: 3, status: "Open" },
    { id: "OT-D202", date: "Jun 11", shift: "B Shift", position: "Driver / Operator", applicants: 2, status: "Open" }
  ],
  "hlfd-rms-shift-trades": [
    { id: "TR-D301", requestedBy: "Firefighter E. Member", give: "Jun 12 - A Shift", receive: "Jun 15 - A Shift", coverage: "Captain D. Trainee", submitted: "Jun 7", status: "Pending Review" },
    { id: "TR-D302", requestedBy: "Firefighter F. Roster", give: "Jun 11 - B Shift", receive: "Jun 14 - B Shift", coverage: "Battalion C. Demo", submitted: "Jun 6", status: "Awaiting Member" }
  ],
  "hlfd-rms-apparatus": demoApparatus,
  "hlfd-rms-work-orders": demoWorkOrders,
  "hlfd-rms-assets": initialAssets,
  "hlfd-rms-hose-tests": initialHoseTests,
  "hlfd-rms-occupancies": initialOccupancies,
  "hlfd-rms-inspections": initialInspections,
  "hlfd-rms-preplans": initialPreplans,
  "hlfd-rms-documents": initialDocuments
};

export const DEMO_LIST_KEYS = Object.keys(DEMO_LIST_SEEDS);
