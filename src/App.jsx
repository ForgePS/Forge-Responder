import { useMemo, useState } from "react";
import {
  Activity, AlertTriangle, Ambulance, Archive, BarChart3, Bell, BookOpen, CalendarDays, Check,
  ChevronLeft, ChevronRight, ClipboardCheck, Clock3, Edit3, FileCheck2, FileText, Gauge,
  GraduationCap, HardHat, Home, Mail, MapPin, Menu, PackageSearch, Phone, Save, Search,
  Settings, ShieldCheck, Truck, Upload, UploadCloud, UserRound, Users, Wrench, X, CirclePlus
} from "lucide-react";
import departmentLogo from "./assets/horn-lake-fire-dept-logo.png";

const navGroups = [
  { label: "", items: [["Dashboard", Home]] },
  { label: "RMS", items: [["Personnel", Users], ["Certifications", FileCheck2], ["Training", BookOpen], ["Scheduling", CalendarDays], ["Shift Trades", Activity]] },
  { label: "Fleet", items: [["Apparatus", Truck], ["Assets", PackageSearch], ["Maintenance", Wrench], ["Hose Testing", Gauge]] },
  { label: "Prevention", items: [["Occupancies", Archive], ["Inspections", ClipboardCheck], ["Preplans", ShieldCheck], ["Hydrants", Activity]] },
  { label: "Documents", items: [["SOGs / Policies", FileText], ["EMS Protocols", Ambulance], ["Forms", FileText], ["Uploads", Upload]] },
  { label: "", items: [["Analytics", BarChart3], ["Administration", Settings]] },
  { label: "Future / Later", items: [["Incidents", AlertTriangle], ["EMS Reports", Ambulance], ["Fire Reports", FileText], ["Compliance Export", Upload]] }
];

const kpis = [
  ["Personnel On Duty", "42", "of 56 Assigned", "info", Users, "Scheduling"],
  ["Staffing Deficit", "14", "25% Below Target", "critical", Users, "Scheduling"],
  ["Certifications Expiring", "18", "Next 30 Days", "warning", FileCheck2, "Certifications"],
  ["Training Compliance", "87%", "↑ 6% vs Last Month", "success", GraduationCap, "Training"],
  ["Units Available", "12", "of 18 Total", "info", Truck, "Apparatus"],
  ["Units Out of Service", "6", "33% of Fleet", "critical", Wrench, "Maintenance"],
  ["Inspections Due", "27", "Next 30 Days", "warning", ClipboardCheck, "Inspections"],
  ["Open Tasks", "64", "Across All Areas", "info", FileCheck2, "Dashboard"]
];

const moduleData = {
  Personnel: { icon: Users, description: "Roster, assignments, contact information, documents, and employment status.", columns: ["Name", "Rank", "Assignment", "EMS Level", "Status"], rows: [["Jeremy Powell", "Fire Chief", "Administration", "Paramedic", "Active"], ["Stephen White", "Deputy Chief", "Administration", "Paramedic", "Active"], ["Gregory Scruggs", "Battalion Chief", "A Shift", "AEMT", "Active"], ["Mike Mallett", "Battalion Chief", "B Shift", "Paramedic", "Active"], ["Adam Tutor", "Captain", "C Shift", "EMT", "Active"], ["Cole Casey", "Firefighter", "A Shift", "Paramedic", "Leave"]] },
  Certifications: { icon: FileCheck2, description: "Renewal tracking and 30/60/90-day expiration alerts.", columns: ["Personnel", "Certification", "Expires", "Renewal", "Status"], rows: [["Cole Casey", "Paramedic", "Jun 24, 2026", "Submitted", "Due Soon"], ["Adam Tutor", "Firefighter II", "Jul 12, 2026", "Not Started", "Due Soon"], ["Mike Mallett", "Instructor I", "Aug 08, 2026", "In Progress", "Active"], ["Gregory Scruggs", "AEMT", "May 31, 2026", "Overdue", "Expired"]] },
  Training: { icon: BookOpen, description: "Events, attendance, hours, categories, and compliance tracking.", columns: ["Training Event", "Category", "Date", "Attendees", "Status"], rows: [["Live Fire Evolution", "Fire", "Jun 10", "18 / 24", "Scheduled"], ["Pediatric Airway", "EMS CE", "Jun 14", "12 / 18", "Scheduled"], ["Driver Operations", "Driver", "Jun 20", "9 / 12", "Scheduled"], ["HazMat Refresher", "Fire", "May 28", "21 / 24", "Complete"]] },
  Scheduling: { icon: CalendarDays, description: "A/B/C shift calendar, daily roster, apparatus assignments, leave, and overtime.", columns: ["Date", "Shift", "Staffed", "Minimum", "Coverage"], rows: [["Jun 7", "A Shift", "21", "21", "Complete"], ["Jun 8", "B Shift", "20", "21", "Deficit"], ["Jun 9", "C Shift", "22", "21", "Complete"], ["Jun 10", "A Shift", "21", "21", "Complete"]] },
  Apparatus: { icon: Truck, description: "Unit readiness, mileage, engine hours, pump hours, and repair history.", columns: ["Unit", "Type", "Mileage", "PM Due", "Status"], rows: [["Engine 1", "Pumper", "31,820", "Aug 2026", "In Service"], ["Engine 2", "Pumper", "44,091", "Jul 2026", "In Service"], ["Truck 3", "Ladder", "26,445", "Jun 2026", "PM Due"], ["Rescue 1", "Rescue", "19,230", "Sep 2026", "In Service"]] },
  Inspections: { icon: ClipboardCheck, description: "Inspection queue, violations, reinspection dates, and occupancy history.", columns: ["Occupancy", "Inspection", "Due", "Inspector", "Status"], rows: [["Horn Lake High School", "Annual", "Jun 12", "J. Mitchell", "Scheduled"], ["Logan's Roadhouse", "Reinspection", "Jun 8", "J. Mitchell", "Overdue"], ["Amazon Distribution", "Annual", "Jun 21", "J. Wade", "Scheduled"], ["Comfort Inn", "Reinspection", "Jun 15", "J. Wade", "Pending Review"]] },
  Hydrants: { icon: Activity, description: "Hydrant records, flow tests, inspections, district assignments, and readiness.", columns: ["Hydrant", "District", "Last Tested", "Flow Class", "Status"], rows: [["HL-1042", "1", "May 14, 2026", "Class AA", "Complete"], ["HL-1178", "2", "Apr 30, 2026", "Class A", "Complete"], ["HL-1281", "3", "Not tested", "Unknown", "Due Soon"], ["HL-1307P", "2", "Private", "Private", "Active"]] }
};

const personnelRecords = [
  { id: "HL-001", name: "Jeremy Powell", initials: "JP", rank: "Fire Chief", shift: "Administration", assignment: "Administration", ems: "Paramedic", driver: "Approved", status: "Active", email: "jpowell@hornlake.org", phone: "(662) 555-0101", station: "Fire Administration", hireDate: "March 14, 2005", supervisor: "Mayor / Board of Aldermen", address: "3101 Goodman Road W, Horn Lake, MS", emergency: "Jennifer Powell · (662) 555-0181", documents: ["Employment Agreement.pdf", "Annual Evaluation 2026.pdf"], certifications: [["Paramedic", "Dec 18, 2026", "Active"], ["Fire Officer IV", "Sep 10, 2027", "Active"], ["NIMS ICS-400", "No expiration", "Complete"]] },
  { id: "HL-002", name: "Stephen White", initials: "SW", rank: "Deputy Chief", shift: "Administration", assignment: "Operations", ems: "Paramedic", driver: "Approved", status: "Active", email: "swhite@hornlake.org", phone: "(662) 555-0102", station: "Fire Administration", hireDate: "August 9, 2007", supervisor: "Jeremy Powell", address: "Horn Lake, MS", emergency: "Ashley White · (662) 555-0182", documents: ["Promotion Letter.pdf", "Annual Evaluation 2026.pdf"], certifications: [["Paramedic", "Nov 14, 2026", "Active"], ["Fire Officer III", "May 4, 2028", "Active"]] },
  { id: "HL-014", name: "Gregory Scruggs", initials: "GS", rank: "Battalion Chief", shift: "A Shift", assignment: "Station 1 / Battalion 1", ems: "AEMT", driver: "Approved", status: "Active", email: "gscruggs@hornlake.org", phone: "(662) 555-0114", station: "Station 1", hireDate: "January 18, 2011", supervisor: "Stephen White", address: "Horn Lake, MS", emergency: "Morgan Scruggs · (662) 555-0194", documents: ["Driver Clearance.pdf"], certifications: [["AEMT", "May 31, 2026", "Expired"], ["Fire Officer II", "Feb 18, 2027", "Active"]] },
  { id: "HL-021", name: "Mike Mallett", initials: "MM", rank: "Battalion Chief", shift: "B Shift", assignment: "Station 2 / Battalion 1", ems: "Paramedic", driver: "Approved", status: "Active", email: "mmallett@hornlake.org", phone: "(662) 555-0121", station: "Station 2", hireDate: "June 2, 2012", supervisor: "Stephen White", address: "Horn Lake, MS", emergency: "Taylor Mallett · (662) 555-0191", documents: ["Instructor Credentials.pdf"], certifications: [["Instructor I", "Aug 08, 2026", "Active"], ["Paramedic", "Jan 12, 2027", "Active"]] },
  { id: "HL-033", name: "Adam Tutor", initials: "AT", rank: "Captain", shift: "C Shift", assignment: "Engine 3", ems: "EMT", driver: "Approved", status: "Active", email: "atutor@hornlake.org", phone: "(662) 555-0133", station: "Station 3", hireDate: "October 21, 2016", supervisor: "C Shift Battalion Chief", address: "Horn Lake, MS", emergency: "Casey Tutor · (662) 555-0193", documents: ["Driver Clearance.pdf"], certifications: [["Firefighter II", "Jul 12, 2026", "Due Soon"], ["EMT", "Oct 2, 2027", "Active"]] },
  { id: "HL-041", name: "Cole Casey", initials: "CC", rank: "Firefighter", shift: "A Shift", assignment: "Engine 1", ems: "Paramedic", driver: "Trainee", status: "Leave", email: "ccasey@hornlake.org", phone: "(662) 555-0141", station: "Station 1", hireDate: "April 12, 2021", supervisor: "A Shift Captain", address: "Horn Lake, MS", emergency: "Jordan Casey · (662) 555-0192", documents: ["Leave Request.pdf"], certifications: [["Paramedic", "Jun 24, 2026", "Due Soon"], ["Firefighter I/II", "Apr 12, 2028", "Active"]] }
];

const initialCertificationRecords = [
  { id: "CERT-101", person: "Cole Casey", type: "Paramedic", category: "EMS", issue: "Jun 24, 2024", expires: "Jun 24, 2026", days: 17, renewal: "Submitted", status: "Due Soon", document: "Paramedic Renewal.pdf" },
  { id: "CERT-102", person: "Adam Tutor", type: "Firefighter II", category: "Fire", issue: "Jul 12, 2023", expires: "Jul 12, 2026", days: 35, renewal: "Not Started", status: "Due Soon", document: "" },
  { id: "CERT-103", person: "Mike Mallett", type: "Instructor I", category: "Fire", issue: "Aug 08, 2023", expires: "Aug 08, 2026", days: 62, renewal: "In Progress", status: "Active", document: "Instructor I.pdf" },
  { id: "CERT-104", person: "Gregory Scruggs", type: "AEMT", category: "EMS", issue: "May 31, 2024", expires: "May 31, 2026", days: -7, renewal: "Overdue", status: "Expired", document: "AEMT Card.pdf" },
  { id: "CERT-105", person: "Jeremy Powell", type: "Paramedic", category: "EMS", issue: "Dec 18, 2024", expires: "Dec 18, 2026", days: 194, renewal: "Not Started", status: "Active", document: "Paramedic Card.pdf" },
  { id: "CERT-106", person: "Stephen White", type: "Fire Officer III", category: "Fire", issue: "May 04, 2025", expires: "May 04, 2028", days: 697, renewal: "Not Started", status: "Active", document: "Fire Officer III.pdf" }
];

const initialScheduleDays = [
  { id: "2026-06-07", weekday: "Sun", date: "Jun 7", shift: "A Shift", staffed: 21, minimum: 21, leave: 1, status: "Complete" },
  { id: "2026-06-08", weekday: "Mon", date: "Jun 8", shift: "B Shift", staffed: 20, minimum: 21, leave: 2, status: "Deficit" },
  { id: "2026-06-09", weekday: "Tue", date: "Jun 9", shift: "C Shift", staffed: 22, minimum: 21, leave: 0, status: "Complete" },
  { id: "2026-06-10", weekday: "Wed", date: "Jun 10", shift: "A Shift", staffed: 21, minimum: 21, leave: 1, status: "Complete" },
  { id: "2026-06-11", weekday: "Thu", date: "Jun 11", shift: "B Shift", staffed: 19, minimum: 21, leave: 3, status: "Deficit" },
  { id: "2026-06-12", weekday: "Fri", date: "Jun 12", shift: "C Shift", staffed: 21, minimum: 21, leave: 1, status: "Complete" },
  { id: "2026-06-13", weekday: "Sat", date: "Jun 13", shift: "A Shift", staffed: 20, minimum: 21, leave: 2, status: "Deficit" }
];

const initialRoster = [
  { id: "R-01", name: "Gregory Scruggs", rank: "Battalion Chief", shift: "A Shift", apparatus: "Battalion 1", position: "Command", status: "On Duty" },
  { id: "R-02", name: "Devin Lee", rank: "Captain", shift: "A Shift", apparatus: "Engine 1", position: "Officer", status: "On Duty" },
  { id: "R-03", name: "Cole Casey", rank: "Firefighter", shift: "A Shift", apparatus: "Engine 1", position: "Medic / Driver", status: "Leave" },
  { id: "R-04", name: "Marcus Reed", rank: "Firefighter", shift: "B Shift", apparatus: "Engine 2", position: "Driver", status: "On Duty" },
  { id: "R-05", name: "Taylor Brooks", rank: "Lieutenant", shift: "B Shift", apparatus: "Truck 3", position: "Officer", status: "On Duty" },
  { id: "R-06", name: "Adam Tutor", rank: "Captain", shift: "C Shift", apparatus: "Rescue 1", position: "Officer", status: "On Duty" },
  { id: "R-07", name: "Jordan Wade", rank: "Firefighter", shift: "C Shift", apparatus: "Engine 3", position: "Medic", status: "On Duty" }
];

const initialLeaveRequests = [
  { id: "L-101", person: "Cole Casey", type: "Vacation", dates: "Jun 7-8", hours: "24 hrs", status: "Approved" },
  { id: "L-102", person: "Morgan Johnson", type: "Vacation", dates: "Jun 19-23", hours: "48 hrs", status: "Pending" },
  { id: "L-103", person: "Alex Davis", type: "Personal", dates: "Jun 11", hours: "12 hrs", status: "Pending" }
];

const initialOvertimeOffers = [
  { id: "OT-201", date: "Jun 8", shift: "B Shift", position: "Firefighter / Paramedic", applicants: 3, status: "Open" },
  { id: "OT-202", date: "Jun 11", shift: "B Shift", position: "Driver / Operator", applicants: 2, status: "Open" },
  { id: "OT-203", date: "Jun 13", shift: "A Shift", position: "Firefighter", applicants: 4, status: "Open" }
];

const initialTrades = [
  { id: "TR-301", requestedBy: "R. Williams", give: "Jun 12 - A Shift", receive: "Jun 15 - A Shift", coverage: "D. Lee", submitted: "Jun 7", status: "Pending Review" },
  { id: "TR-302", requestedBy: "M. Johnson", give: "Jun 11 - B Shift", receive: "Jun 14 - B Shift", coverage: "T. Brooks", submitted: "Jun 6", status: "Awaiting Member" },
  { id: "TR-303", requestedBy: "A. Davis", give: "Jun 9 - C Shift", receive: "Jun 18 - C Shift", coverage: "J. Wade", submitted: "Jun 5", status: "Approved" },
  { id: "TR-304", requestedBy: "C. Casey", give: "Jun 16 - A Shift", receive: "Jun 22 - A Shift", coverage: "M. Reed", submitted: "Jun 4", status: "Denied" }
];

const initialApparatus = [
  { id: "APP-01", unit: "Engine 1", type: "Pumper", station: "Station 1", year: "2021", mileage: "31,820", engineHours: "4,218", pumpHours: "386", fuel: "82%", pmDue: "Aug 14, 2026", status: "In Service", operator: "D. Lee", checks: [["Daily cab check", "Complete"], ["Medical inventory", "Complete"], ["Pump test", "Complete"], ["SCBA inventory", "Complete"]] },
  { id: "APP-02", unit: "Engine 2", type: "Pumper", station: "Station 2", year: "2018", mileage: "44,091", engineHours: "6,104", pumpHours: "591", fuel: "68%", pmDue: "Jun 7, 2026", status: "Out of Service", operator: "M. Reed", checks: [["Daily cab check", "Complete"], ["Medical inventory", "Complete"], ["Pump test", "Failed"], ["SCBA inventory", "Complete"]] },
  { id: "APP-03", unit: "Truck 3", type: "Aerial", station: "Station 3", year: "2020", mileage: "26,445", engineHours: "3,870", pumpHours: "214", fuel: "74%", pmDue: "Jun 18, 2026", status: "PM Due", operator: "T. Brooks", checks: [["Daily cab check", "Complete"], ["Aerial controls", "Complete"], ["Ground ladders", "Complete"], ["Hydraulic inspection", "Due"]] },
  { id: "APP-04", unit: "Rescue 1", type: "Heavy Rescue", station: "Station 1", year: "2022", mileage: "19,230", engineHours: "2,991", pumpHours: "N/A", fuel: "91%", pmDue: "Sep 2, 2026", status: "In Service", operator: "A. Tutor", checks: [["Daily cab check", "Complete"], ["Extrication tools", "Complete"], ["Medical inventory", "Complete"], ["Generator", "Complete"]] },
  { id: "APP-05", unit: "Brush 2", type: "Brush", station: "Station 2", year: "2017", mileage: "38,604", engineHours: "4,832", pumpHours: "301", fuel: "56%", pmDue: "Jun 21, 2026", status: "Reserve", operator: "Unassigned", checks: [["Weekly cab check", "Complete"], ["Pump test", "Complete"], ["Wildland equipment", "Due"], ["Radio check", "Complete"]] }
];

const initialWorkOrders = [
  { id: "WO-26041", unit: "Engine 2", issue: "Pump relief valve failed annual test", category: "Pump", priority: "High", opened: "Jun 7", vendor: "Mid-South Apparatus", cost: "$2,450", status: "In Progress" },
  { id: "WO-26042", unit: "Truck 3", issue: "Preventive maintenance and aerial inspection", category: "PM", priority: "Medium", opened: "Jun 6", vendor: "Internal Fleet", cost: "$780", status: "Scheduled" },
  { id: "WO-26039", unit: "Rescue 1", issue: "Compartment light replacement", category: "Electrical", priority: "Low", opened: "Jun 3", vendor: "Internal Fleet", cost: "$95", status: "Awaiting Parts" },
  { id: "WO-26035", unit: "Engine 1", issue: "Replace rear tire pair", category: "Tires", priority: "Medium", opened: "May 28", vendor: "Gateway Tire", cost: "$1,340", status: "Complete" }
];

const initialAssets = [
  { id: "AST-1042", name: "Thermal Imaging Camera", category: "Electronics", serial: "TIC-88431", location: "Engine 1", assigned: "D. Lee", inspection: "Jul 12, 2026", value: "$9,800", status: "In Service" },
  { id: "AST-1178", name: "Cardiac Monitor", category: "Medical", serial: "LP15-22018", location: "Rescue 1", assigned: "A. Tutor", inspection: "Jun 30, 2026", value: "$28,500", status: "In Service" },
  { id: "AST-1204", name: "Hydraulic Spreader", category: "Extrication", serial: "HUR-77291", location: "Rescue 1", assigned: "A. Tutor", inspection: "Aug 8, 2026", value: "$14,200", status: "In Service" },
  { id: "AST-1281", name: "Four-Gas Meter", category: "HazMat", serial: "MSA-31904", location: "Station 2", assigned: "M. Reed", inspection: "Jun 10, 2026", value: "$2,100", status: "Inspection Due" },
  { id: "AST-1307", name: "Portable Radio", category: "Communications", serial: "APX-55210", location: "Repair Vendor", assigned: "Unassigned", inspection: "Sep 14, 2026", value: "$4,600", status: "Out for Repair" },
  { id: "AST-1350", name: "SCBA Pack", category: "PPE", serial: "MSA-44012", location: "Station 1", assigned: "Unassigned", inspection: "Jun 24, 2026", value: "$7,400", status: "Available" }
];

function toneFromStatus(value, fallback = "neutral") {
  const text = String(value).toLowerCase();
  if (/active|complete|approved|in service|scheduled|compliant|upcoming/.test(text)) return "success";
  if (/overdue|expired|deficit|out of service|high/.test(text)) return "critical";
  if (/due|pending|leave|pm|medium/.test(text)) return "warning";
  if (/review|submitted|progress/.test(text)) return "info";
  return fallback;
}

function Badge({ children, tone = "neutral" }) {
  return <span className={`badge badge-${toneFromStatus(children, tone)}`}>{children}</span>;
}

function SideNav({ current, collapsed, setCollapsed, onNavigate }) {
  return <aside className={`side-nav ${collapsed ? "collapsed" : ""}`}>
    <nav>{navGroups.map((group, index) => <section key={`${group.label}-${index}`}>{!collapsed && group.label && <span className="nav-label">{group.label}</span>}{group.items.map(([name, Icon]) => <button key={name} className={current === name ? "nav-item active" : "nav-item"} onClick={() => onNavigate(name)} title={name}><Icon size={15} /><span>{name}</span></button>)}</section>)}</nav>
    <button className="nav-collapse" onClick={() => setCollapsed(!collapsed)}>{collapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}</button>
  </aside>;
}

function TopBar({ query, setQuery, toggleMobileNav }) {
  return <header className="top-bar">
    <button className="icon-button mobile-menu" onClick={toggleMobileNav}><Menu size={19} /></button>
    <div className="top-brand"><img src={departmentLogo} alt="Horn Lake Fire Department" /><div><strong>Horn Lake Fire/EMS Dashboard</strong><span>Horn Lake Command</span></div></div>
    <div className="command-time"><span><CalendarDays size={15} /> Jun 7, 2026</span><span><Clock3 size={15} /> 11:32 AM</span></div>
    <label className="global-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search personnel, apparatus, occupancies, training, inspections..." /></label>
    <button className="icon-button notification-button"><Bell size={17} /><i>6</i></button>
    <button className="profile-button"><span>JS</span><div><strong>Chief J. Smith</strong><small>Fire Chief</small></div><ChevronRight size={13} /></button>
  </header>;
}

function Panel({ title, icon: Icon, action, children, className = "" }) {
  return <section className={`panel ${className}`}><header><div><Icon size={15} /><strong>{title}</strong></div>{action}</header><div className="panel-body">{children}</div></section>;
}

function MiniTable({ columns, rows }) {
  return <div className="mini-table"><div className="mini-row mini-head" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}>{columns.map((column) => <span key={column}>{column}</span>)}</div>{rows.map((row) => <div className="mini-row" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }} key={row.join("-")}>{row.map((cell, index) => <span key={`${cell}-${index}`} className={index === row.length - 1 ? `cell-${toneFromStatus(cell)}` : ""}>{cell}</span>)}</div>)}</div>;
}

function Dashboard({ onNavigate, personnel, certifications, apparatus, workOrders }) {
  const activePersonnel = personnel.filter((p) => p.status === "Active").length;
  const onLeave = personnel.filter((p) => p.status === "Leave").length;
  const paramedics = personnel.filter((p) => p.ems === "Paramedic").length;
  const driverApproved = personnel.filter((p) => p.driver === "Approved").length;

  const certsExpiring30 = certifications.filter((c) => Number(c.days) <= 30).length;

  const unitsAvailable = apparatus.filter((u) => u.status === "In Service").length;
  const unitsOos = apparatus.filter((u) => u.status !== "In Service").length;

  const workOrdersDue = workOrders.filter((w) =>
    ["Overdue", "Due Soon", "Open"].includes(w.status)
  ).length;

  const liveKpis = [
    ["Active Personnel", activePersonnel, `${personnel.length} Total`, "info", Users, "Personnel"],
    ["Personnel On Leave", onLeave, "Current Leave Status", "warning", Users, "Personnel"],
    ["Paramedics", paramedics, "EMS Qualified", "success", Ambulance, "Personnel"],
    ["Driver Approved", driverApproved, "Cleared Operators", "info", Truck, "Personnel"],
    ["Certs Expiring", certsExpiring30, "Next 30 Days", "warning", FileCheck2, "Certifications"],
    ["Units Available", unitsAvailable, `${apparatus.length} Total Fleet`, "success", Truck, "Apparatus"],
    ["Units OOS", unitsOos, "Not In Service", unitsOos > 0 ? "critical" : "success", Wrench, "Maintenance"],
    ["Work Orders Due", workOrdersDue, "Open / Due Soon", "warning", Wrench, "Maintenance"]
  ];

  return (
    <div className="dashboard">
      <section className="kpi-grid">
        {liveKpis.map(([label, value, note, tone, Icon, target]) => (
          <button key={label} className={`kpi-card tone-${tone}`} onClick={() => onNavigate(target)}>
            <Icon size={27} />
            <span>{label}</span>
            <strong>{value}</strong>
            <small>{note}</small>
          </button>
        ))}
      </section>
    </div>
  );
}

function DataTable({ columns, rows, query }) {
  const filtered = useMemo(() => rows.filter((row) => row.join(" ").toLowerCase().includes(query.toLowerCase())), [rows, query]);
  return <div className="data-table-wrap"><table><thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}<th /></tr></thead><tbody>{filtered.map((row) => <tr key={row.join("-")}>{row.map((cell, index) => <td key={`${cell}-${index}`}>{index === row.length - 1 ? <Badge>{cell}</Badge> : cell}</td>)}<td><button className="row-action">Open</button></td></tr>)}</tbody></table>{!filtered.length && <div className="empty-table">No records match the current search.</div>}</div>;
}

function PersonnelPage({ query, records, setRecords }) {
  const visiblePeople = records.filter((person) =>
    Object.values(person).join(" ").toLowerCase().includes(query.toLowerCase())
  );

  const [selectedId, setSelectedId] = useState(records[0]?.id);
  const [editing, setEditing] = useState(false);
  const [savedMessage, setSavedMessage] = useState("");

  const selected = records.find((person) => person.id === selectedId) || records[0];
  const [draft, setDraft] = useState(selected);

  useEffect(() => {
    setDraft(selected);
  }, [selected]);

  function selectPerson(person) {
    setSelectedId(person.id);
    setDraft(person);
    setEditing(false);
    setSavedMessage("");
  }

  function saveProfile() {
    const updatedPerson = {
      ...draft,
      updated_at: new Date().toISOString()
    };

    setRecords((current) =>
      current.map((person) =>
        person.id === updatedPerson.id ? updatedPerson : person
      )
    );

    setEditing(false);
    setSavedMessage("Personnel profile saved");

    console.log("Updated personnel:", updatedPerson);
  }
  return <div className="module-page personnel-page">
    <section className="module-heading"><div><span className="module-icon"><Users size={22} /></span><div><h1>Personnel</h1><p>Roster, assignments, contact information, certifications, documents, and employment status.</p></div></div><div className="heading-actions"><button className="secondary-button">Export Roster</button><button className="primary-button">Add Personnel</button></div></section>
    <section className="personnel-summary">{[
    ["Active Personnel", records.filter((p) => p.status === "Active").length],
  ["On Leave", records.filter((p) => p.status === "Leave").length],
  ["Paramedics", records.filter((p) => p.ems === "Paramedic").length],
  ["Driver Approved", records.filter((p) => p.driver === "Approved").length]
]
    <section className="personnel-workspace">
      <Panel title="Personnel Roster" icon={Users} action={<span className="panel-count">{visiblePeople.length} records</span>}>
        <div className="personnel-list">{visiblePeople.map((person) => <button key={person.id} className={person.id === selected.id ? "person-row selected" : "person-row"} onClick={() => selectPerson(person)}><span className="avatar">{person.initials}</span><span><strong>{person.name}</strong><small>{person.rank} · {person.shift}</small></span><Badge>{person.status}</Badge></button>)}</div>
      </Panel>
      <section className="profile-workspace">
        <header className="profile-header"><div className="profile-identity"><span className="avatar large">{selected.initials}</span><div><h2>{selected.name}</h2><p>{selected.rank} · {selected.id}</p><div><Badge>{selected.status}</Badge><Badge tone="info">{selected.shift}</Badge><Badge tone="neutral">{selected.ems}</Badge></div></div></div><div className="heading-actions">{editing ? <><button className="secondary-button" onClick={() => { setEditing(false); setDraft(selected); }}>Cancel</button><button className="primary-button" onClick={saveProfile}><Save size={14} /> Save Profile</button></> : <button className="primary-button" onClick={() => setEditing(true)}><Edit3 size={14} /> Edit Profile</button>}</div></header>
        {savedMessage && <div className="success-banner">{savedMessage}</div>}
        <div className="profile-grid">
          <Panel title="Assignment & Employment" icon={UserRound}><div className="profile-fields">{[["Rank", "rank"], ["Shift", "shift"], ["Assignment", "assignment"], ["Station", "station"], ["Supervisor", "supervisor"], ["Hire Date", "hireDate"]].map(([label, key]) => <ProfileField key={key} label={label} value={draft[key]} editing={editing} onChange={(value) => setDraft((current) => ({ ...current, [key]: value }))} />)}</div></Panel>
          <Panel title="Contact Information" icon={Phone}><div className="profile-fields">{[["Email", "email"], ["Phone", "phone"], ["Address", "address"], ["Emergency Contact", "emergency"]].map(([label, key]) => <ProfileField key={key} label={label} value={draft[key]} editing={editing} onChange={(value) => setDraft((current) => ({ ...current, [key]: value }))} />)}</div></Panel>
          <Panel title="Operational Qualifications" icon={ShieldCheck}><div className="qualification-grid"><div><span>EMS Level</span><strong>{selected.ems}</strong></div><div><span>Driver Status</span><strong>{selected.driver}</strong></div><div><span>Current Shift</span><strong>{selected.shift}</strong></div><div><span>Employment</span><Badge>{selected.status}</Badge></div></div></Panel>
          <Panel title="Certifications" icon={FileCheck2} action={<button className="text-button">View all</button>}><MiniTable columns={["Certification", "Expires", "Status"]} rows={selected.certifications} /></Panel>
          <Panel title="Personnel Documents" icon={FileText} action={<button className="text-button"><Upload size={11} /> Upload</button>}><div className="document-list">{selected.documents.map((document) => <button key={document}><FileText size={14} /><span>{document}</span><small>Open</small></button>)}</div></Panel>
          <Panel title="Contact Actions" icon={Mail}><div className="contact-actions"><button><Mail size={15} /> Email</button><button><Phone size={15} /> Call</button><button><MapPin size={15} /> Station</button></div></Panel>
        </div>
      </section>
    </section>
  </div>;
}

function ProfileField({ label, value, editing, onChange }) {
  return <label><span>{label}</span>{editing ? <input value={value} onChange={(event) => onChange(event.target.value)} /> : <strong>{value}</strong>}</label>;
}

function CertificationsPage({ query }) {
  const [records, setRecords] = useState(initialCertificationRecords);
  const [filter, setFilter] = useState("All");
  const [selected, setSelected] = useState(null);
  const [uploading, setUploading] = useState(null);
  const [message, setMessage] = useState("");
  const filtered = records.filter((record) => (filter === "All" || record.status === filter || record.category === filter) && Object.values(record).join(" ").toLowerCase().includes(query.toLowerCase()));
  function updateRenewal(id, renewal) {
    setRecords((current) => current.map((record) => record.id === id ? { ...record, renewal, status: renewal === "Approved" ? "Active" : record.status } : record));
    setMessage(`Renewal status updated to ${renewal}`);
  }
  function completeUpload() {
    setRecords((current) => current.map((record) => record.id === uploading.id ? { ...record, document: `${record.type} Renewal.pdf`, renewal: "Submitted" } : record));
    setMessage("Certification document uploaded and renewal submitted");
    setUploading(null);
  }
  return <div className="module-page certifications-page">
    <section className="module-heading"><div><span className="module-icon"><FileCheck2 size={22} /></span><div><h1>Certifications</h1><p>Expiration alerts, renewal status, uploaded credentials, and compliance review.</p></div></div><div className="heading-actions"><button className="secondary-button">Export Compliance</button><button className="primary-button" onClick={() => setUploading(records[0])}><UploadCloud size={14} /> Upload Certification</button></div></section>
    <section className="cert-summary">{[["Expired", records.filter((r) => r.status === "Expired").length, "critical"], ["Due in 30 Days", records.filter((r) => r.days >= 0 && r.days <= 30).length, "critical"], ["Due in 60 Days", records.filter((r) => r.days > 30 && r.days <= 60).length, "warning"], ["Due in 90 Days", records.filter((r) => r.days > 60 && r.days <= 90).length, "info"], ["Active", records.filter((r) => r.status === "Active").length, "success"]].map(([label, value, tone]) => <button key={label} className={`cert-stat stat-${tone}`} onClick={() => setFilter(label === "Expired" ? "Expired" : label === "Active" ? "Active" : "All")}><strong>{value}</strong><span>{label}</span></button>)}</section>
    {message && <div className="success-banner">{message}<button onClick={() => setMessage("")}><X size={13} /></button></div>}
    <section className="cert-toolbar"><div className="segmented-control">{["All", "EMS", "Fire", "Due Soon", "Expired"].map((item) => <button key={item} className={filter === item ? "active" : ""} onClick={() => setFilter(item)}>{item}</button>)}</div><span>{filtered.length} certifications shown</span></section>
    <Panel title="Certification Compliance Records" icon={FileCheck2} action={<button className="text-button">Configure columns</button>}><div className="cert-table"><div className="cert-row cert-head"><span>Personnel</span><span>Certification</span><span>Category</span><span>Issue Date</span><span>Expiration</span><span>Days</span><span>Renewal</span><span>Status</span><span /></div>{filtered.map((record) => <div className="cert-row" key={record.id}><button className="link-button" onClick={() => setSelected(record)}>{record.person}</button><span>{record.type}</span><span>{record.category}</span><span>{record.issue}</span><span>{record.expires}</span><strong className={`days-${record.days < 0 ? "critical" : record.days <= 30 ? "critical" : record.days <= 90 ? "warning" : "neutral"}`}>{record.days < 0 ? `${Math.abs(record.days)} overdue` : record.days}</strong><select value={record.renewal} onChange={(event) => updateRenewal(record.id, event.target.value)}>{["Not Started", "In Progress", "Submitted", "Approved", "Overdue"].map((value) => <option key={value}>{value}</option>)}</select><Badge>{record.status}</Badge><button className="row-action" onClick={() => setUploading(record)}>{record.document ? "Replace" : "Upload"}</button></div>)}</div></Panel>
    {selected && <Modal title={`${selected.person} · ${selected.type}`} onClose={() => setSelected(null)}><div className="cert-detail-grid">{[["Certification ID", selected.id], ["Category", selected.category], ["Issue Date", selected.issue], ["Expiration Date", selected.expires], ["Renewal Status", selected.renewal], ["Document", selected.document || "No document uploaded"]].map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div><div className="modal-actions"><button className="secondary-button" onClick={() => setSelected(null)}>Close</button><button className="primary-button" onClick={() => { setUploading(selected); setSelected(null); }}><UploadCloud size={14} /> Upload Renewal</button></div></Modal>}
    {uploading && <Modal title="Upload Certification Document" onClose={() => setUploading(null)}><div className="upload-zone"><UploadCloud size={28} /><strong>{uploading.person} · {uploading.type}</strong><span>Drop a PDF or image credential here, or select a file.</span><input type="file" /></div><div className="upload-form"><label><span>Issue Date</span><input type="date" defaultValue="2026-06-07" /></label><label><span>Expiration Date</span><input type="date" defaultValue="2028-06-07" /></label></div><div className="modal-actions"><button className="secondary-button" onClick={() => setUploading(null)}>Cancel</button><button className="primary-button" onClick={completeUpload}><UploadCloud size={14} /> Upload & Submit</button></div></Modal>}
  </div>;
}

function SchedulingPage() {
  const [days, setDays] = useState(initialScheduleDays);
  const [selectedId, setSelectedId] = useState(initialScheduleDays[1].id);
  const [roster, setRoster] = useState(initialRoster);
  const [leaveRequests, setLeaveRequests] = useState(initialLeaveRequests);
  const [overtimeOffers, setOvertimeOffers] = useState(initialOvertimeOffers);
  const [message, setMessage] = useState("");
  const selectedDay = days.find((day) => day.id === selectedId) || days[0];
  const vacancies = Math.max(selectedDay.minimum - selectedDay.staffed, 0);
  const dayRoster = roster.filter((member) => member.shift === selectedDay.shift);
  function updateApparatus(id, apparatus) {
    setRoster((current) => current.map((member) => member.id === id ? { ...member, apparatus } : member));
    setMessage("Apparatus assignment updated");
  }
  function decideLeave(id, status) {
    setLeaveRequests((current) => current.map((request) => request.id === id ? { ...request, status } : request));
    setMessage(`Leave request ${status.toLowerCase()}`);
  }
  function assignOvertime(id) {
    const offer = overtimeOffers.find((item) => item.id === id);
    if (!offer) return;
    setOvertimeOffers((current) => current.map((item) => item.id === id ? { ...item, status: "Assigned" } : item));
    setDays((current) => current.map((day) => day.date === offer.date && day.shift === offer.shift ? { ...day, staffed: day.staffed + 1, status: day.staffed + 1 >= day.minimum ? "Complete" : "Deficit" } : day));
    setMessage(`${offer.position} overtime assigned for ${offer.date}`);
  }
  return <div className="module-page scheduling-page">
    <section className="module-heading"><div><span className="module-icon"><CalendarDays size={22} /></span><div><h1>Scheduling</h1><p>A/B/C shift calendar, daily roster, apparatus assignments, leave, overtime, and minimum staffing.</p></div></div><div className="heading-actions"><button className="secondary-button">Print Roster</button><button className="primary-button"><CirclePlus size={14} /> Add Shift Note</button></div></section>
    <section className="schedule-summary">{[["Selected Shift", selectedDay.shift], ["Staffed Today", selectedDay.staffed], ["Minimum Staffing", selectedDay.minimum], ["Open Vacancies", vacancies], ["Leave Today", selectedDay.leave]].map(([label, value]) => <div key={label} className={label === "Open Vacancies" && value > 0 ? "attention" : ""}><strong>{value}</strong><span>{label}</span></div>)}</section>
    {message && <div className="success-banner">{message}<button onClick={() => setMessage("")}><X size={13} /></button></div>}
    <section className="schedule-calendar">{days.map((day) => <button key={day.id} className={day.id === selectedId ? "schedule-day selected" : "schedule-day"} onClick={() => setSelectedId(day.id)}><span>{day.weekday}</span><strong>{day.date}</strong><small>{day.shift}</small><Badge>{day.status}</Badge></button>)}</section>
    <section className="schedule-workspace">
      <Panel title={`${selectedDay.shift} Daily Roster`} icon={Users} action={<span className="panel-count">{dayRoster.length} assigned</span>}>
        <div className="roster-table"><div className="roster-row roster-head"><span>Name</span><span>Rank</span><span>Apparatus</span><span>Position</span><span>Status</span></div>{dayRoster.map((member) => <div className="roster-row" key={member.id}><strong>{member.name}</strong><span>{member.rank}</span><select value={member.apparatus} onChange={(event) => updateApparatus(member.id, event.target.value)}>{["Battalion 1", "Engine 1", "Engine 2", "Engine 3", "Truck 3", "Rescue 1", "Leave"].map((unit) => <option key={unit}>{unit}</option>)}</select><span>{member.position}</span><Badge>{member.status}</Badge></div>)}</div>
      </Panel>
      <div className="schedule-side">
        <Panel title="Minimum Staffing" icon={ShieldCheck}>
          <div className="staffing-card"><div><strong>{selectedDay.staffed} / {selectedDay.minimum}</strong><span>{vacancies ? `${vacancies} position needs coverage` : "Minimum staffing met"}</span></div><div className="staffing-meter"><i style={{ width: `${Math.min(100, (selectedDay.staffed / selectedDay.minimum) * 100)}%` }} /></div><div className="staffing-requirements"><span>Command</span><b>1 / 1</b><span>Company Officers</span><b>4 / 4</b><span>Drivers</span><b>{vacancies ? "4 / 5" : "5 / 5"}</b><span>ALS Providers</span><b>{vacancies ? "5 / 6" : "6 / 6"}</b></div></div>
        </Panel>
        <Panel title="Leave Requests" icon={CalendarDays} action={<span className="panel-count">{leaveRequests.filter((item) => item.status === "Pending").length} pending</span>}>
          <div className="request-list">{leaveRequests.map((request) => <div className="request-row" key={request.id}><div><strong>{request.person}</strong><span>{request.type} - {request.dates} - {request.hours}</span></div><Badge>{request.status}</Badge>{request.status === "Pending" && <div className="inline-actions"><button onClick={() => decideLeave(request.id, "Approved")}><Check size={13} /> Approve</button><button onClick={() => decideLeave(request.id, "Denied")}><X size={13} /> Deny</button></div>}</div>)}</div>
        </Panel>
      </div>
      <Panel title="Overtime Coverage" icon={Clock3} action={<button className="text-button">Create vacancy</button>} className="full-span">
        <div className="overtime-grid">{overtimeOffers.map((offer) => <div key={offer.id} className="overtime-card"><div><strong>{offer.date} - {offer.shift}</strong><span>{offer.position}</span></div><Badge>{offer.status}</Badge><small>{offer.applicants} available members</small><button className="row-action" disabled={offer.status === "Assigned"} onClick={() => assignOvertime(offer.id)}>{offer.status === "Assigned" ? "Assigned" : "Assign"}</button></div>)}</div>
      </Panel>
    </section>
  </div>;
}

function ShiftTradesPage() {
  const [trades, setTrades] = useState(initialTrades);
  const [filter, setFilter] = useState("All");
  const [showNew, setShowNew] = useState(false);
  const [message, setMessage] = useState("");
  const visibleTrades = trades.filter((trade) => filter === "All" || trade.status === filter);
  function decideTrade(id, status) {
    setTrades((current) => current.map((trade) => trade.id === id ? { ...trade, status } : trade));
    setMessage(`Shift trade ${status.toLowerCase()}`);
  }
  function submitTrade() {
    const next = { id: `TR-${400 + trades.length}`, requestedBy: "Chief J. Smith", give: "Jun 24 - B Shift", receive: "Jun 27 - B Shift", coverage: "M. Reed", submitted: "Jun 7", status: "Pending Review" };
    setTrades((current) => [next, ...current]);
    setShowNew(false);
    setFilter("All");
    setMessage("New shift trade request submitted for review");
  }
  return <div className="module-page trades-page">
    <section className="module-heading"><div><span className="module-icon"><Activity size={22} /></span><div><h1>Shift Trades</h1><p>Member swap requests, coverage verification, officer review, and approval history.</p></div></div><div className="heading-actions"><button className="secondary-button">Export Trades</button><button className="primary-button" onClick={() => setShowNew(true)}><CirclePlus size={14} /> New Trade Request</button></div></section>
    <section className="trade-summary">{["Pending Review", "Awaiting Member", "Approved", "Denied"].map((status) => <button key={status} className={`cert-stat stat-${toneFromStatus(status)}`} onClick={() => setFilter(status)}><strong>{trades.filter((trade) => trade.status === status).length}</strong><span>{status}</span></button>)}</section>
    {message && <div className="success-banner">{message}<button onClick={() => setMessage("")}><X size={13} /></button></div>}
    <section className="cert-toolbar"><div className="segmented-control">{["All", "Pending Review", "Awaiting Member", "Approved", "Denied"].map((item) => <button key={item} className={filter === item ? "active" : ""} onClick={() => setFilter(item)}>{item}</button>)}</div><span>{visibleTrades.length} trade requests shown</span></section>
    <Panel title="Shift Trade Review Queue" icon={Activity} action={<button className="text-button">Review policy</button>}>
      <div className="trade-table"><div className="trade-row trade-head"><span>Requested By</span><span>Give</span><span>Receive</span><span>Coverage</span><span>Submitted</span><span>Status</span><span /></div>{visibleTrades.map((trade) => <div className="trade-row" key={trade.id}><strong>{trade.requestedBy}</strong><span>{trade.give}</span><span>{trade.receive}</span><span>{trade.coverage}</span><span>{trade.submitted}</span><Badge>{trade.status}</Badge><div className="inline-actions">{trade.status === "Pending Review" ? <><button onClick={() => decideTrade(trade.id, "Approved")}><Check size={13} /> Approve</button><button onClick={() => decideTrade(trade.id, "Denied")}><X size={13} /> Deny</button></> : <button onClick={() => setMessage(`${trade.id} opened for audit review`)}>Open</button>}</div></div>)}</div>
    </Panel>
    {showNew && <Modal title="New Shift Trade Request" onClose={() => setShowNew(false)}><div className="workflow-form"><label><span>Requesting Member</span><select><option>Chief J. Smith</option><option>R. Williams</option><option>M. Johnson</option></select></label><label><span>Shift to Give</span><select><option>Jun 24 - B Shift</option><option>Jun 16 - A Shift</option><option>Jun 19 - C Shift</option></select></label><label><span>Shift to Receive</span><select><option>Jun 27 - B Shift</option><option>Jun 22 - A Shift</option><option>Jun 29 - C Shift</option></select></label><label><span>Coverage Member</span><select><option>M. Reed</option><option>T. Brooks</option><option>J. Wade</option></select></label></div><div className="modal-actions"><button className="secondary-button" onClick={() => setShowNew(false)}>Cancel</button><button className="primary-button" onClick={submitTrade}><Check size={14} /> Submit for Review</button></div></Modal>}
  </div>;
}

function FleetSummary({ items }) {
  return <section className="fleet-summary">{items.map(([label, value, tone]) => <div key={label} className={`fleet-stat stat-${tone}`}><strong>{value}</strong><span>{label}</span></div>)}</section>;
}

function ApparatusPage() {
  const [units, setUnits] = useState(initialApparatus);
  const [selectedId, setSelectedId] = useState(initialApparatus[0].id);
  const [workOrders, setWorkOrders] = useState(initialWorkOrders);
  const [showWorkOrder, setShowWorkOrder] = useState(false);
  const [message, setMessage] = useState("");
  const selected = units.find((unit) => unit.id === selectedId) || units[0];
  const unitOrders = workOrders.filter((order) => order.unit === selected.unit);
  function updateStatus(status) {
    setUnits((current) => current.map((unit) => unit.id === selected.id ? { ...unit, status } : unit));
    setMessage(`${selected.unit} status updated to ${status}`);
  }
  function completeCheck(checkName) {
    setUnits((current) => current.map((unit) => unit.id === selected.id ? { ...unit, checks: unit.checks.map(([name, status]) => name === checkName ? [name, "Complete"] : [name, status]) } : unit));
    setMessage(`${checkName} marked complete`);
  }
  function createWorkOrder() {
    setWorkOrders((current) => [{ id: `WO-${26050 + current.length}`, unit: selected.unit, issue: "New apparatus service request", category: "General", priority: "Medium", opened: "Jun 7", vendor: "Internal Fleet", cost: "Pending", status: "Open" }, ...current]);
    setShowWorkOrder(false);
    setMessage(`Work order created for ${selected.unit}`);
  }
  return <div className="module-page apparatus-page">
    <section className="module-heading"><div><span className="module-icon"><Truck size={22} /></span><div><h1>Apparatus</h1><p>Unit readiness, daily checks, operating metrics, service history, and repair requests.</p></div></div><div className="heading-actions"><button className="secondary-button">Fleet Report</button><button className="primary-button" onClick={() => setShowWorkOrder(true)}><CirclePlus size={14} /> New Work Order</button></div></section>
    <FleetSummary items={[["Total Units", units.length, "info"], ["In Service", units.filter((unit) => unit.status === "In Service").length, "success"], ["Out of Service", units.filter((unit) => unit.status === "Out of Service").length, "critical"], ["PM / Inspection Due", units.filter((unit) => /Due/.test(unit.status)).length, "warning"], ["Reserve", units.filter((unit) => unit.status === "Reserve").length, "neutral"]]} />
    {message && <div className="success-banner">{message}<button onClick={() => setMessage("")}><X size={13} /></button></div>}
    <section className="fleet-workspace">
      <Panel title="Fleet Units" icon={Truck} action={<span className="panel-count">{units.length} units</span>}><div className="unit-list">{units.map((unit) => <button key={unit.id} className={unit.id === selected.id ? "unit-row selected" : "unit-row"} onClick={() => setSelectedId(unit.id)}><span className="unit-icon"><Truck size={17} /></span><span><strong>{unit.unit}</strong><small>{unit.type} - {unit.station}</small></span><Badge>{unit.status}</Badge></button>)}</div></Panel>
      <section className="fleet-detail">
        <header className="profile-header"><div className="profile-identity"><span className="unit-icon large"><Truck size={24} /></span><div><h2>{selected.unit}</h2><p>{selected.year} {selected.type} - {selected.station}</p><div><Badge>{selected.status}</Badge><Badge tone="info">Operator: {selected.operator}</Badge></div></div></div><select className="status-select" value={selected.status} onChange={(event) => updateStatus(event.target.value)}>{["In Service", "Out of Service", "PM Due", "Reserve"].map((status) => <option key={status}>{status}</option>)}</select></header>
        <section className="metric-strip">{[["Mileage", selected.mileage], ["Engine Hours", selected.engineHours], ["Pump Hours", selected.pumpHours], ["Fuel", selected.fuel], ["PM Due", selected.pmDue]].map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</section>
        <div className="fleet-detail-grid">
          <Panel title="Readiness Checks" icon={ClipboardCheck}><div className="check-list">{selected.checks.map(([name, status]) => <div key={name}><span>{name}</span><Badge>{status}</Badge>{status !== "Complete" && <button className="row-action" onClick={() => completeCheck(name)}>Complete</button>}</div>)}</div></Panel>
          <Panel title="Open & Recent Work Orders" icon={Wrench} action={<button className="text-button" onClick={() => setShowWorkOrder(true)}>Add</button>}><div className="compact-orders">{unitOrders.length ? unitOrders.map((order) => <div key={order.id}><div><strong>{order.id} - {order.issue}</strong><span>{order.vendor} - {order.cost}</span></div><Badge>{order.status}</Badge></div>) : <p>No work orders for this unit.</p>}</div></Panel>
          <Panel title="Operational Details" icon={Gauge}><div className="detail-pairs"><span>Assigned station</span><strong>{selected.station}</strong><span>Primary operator</span><strong>{selected.operator}</strong><span>Apparatus type</span><strong>{selected.type}</strong><span>Model year</span><strong>{selected.year}</strong></div></Panel>
          <Panel title="Service Timeline" icon={Clock3}><div className="service-timeline"><div><i /><span><strong>Jun 7</strong> Daily readiness check submitted</span></div><div><i /><span><strong>May 28</strong> Preventive maintenance completed</span></div><div><i /><span><strong>Apr 14</strong> Annual hose inventory verified</span></div></div></Panel>
        </div>
      </section>
    </section>
    {showWorkOrder && <Modal title={`New Work Order - ${selected.unit}`} onClose={() => setShowWorkOrder(false)}><div className="workflow-form"><label><span>Unit</span><select><option>{selected.unit}</option></select></label><label><span>Priority</span><select><option>Medium</option><option>High</option><option>Low</option></select></label><label className="wide-field"><span>Issue Description</span><input defaultValue="New apparatus service request" /></label><label><span>Category</span><select><option>General</option><option>Pump</option><option>Electrical</option><option>PM</option></select></label><label><span>Assigned Vendor</span><select><option>Internal Fleet</option><option>Mid-South Apparatus</option></select></label></div><div className="modal-actions"><button className="secondary-button" onClick={() => setShowWorkOrder(false)}>Cancel</button><button className="primary-button" onClick={createWorkOrder}><Check size={14} /> Create Work Order</button></div></Modal>}
  </div>;
}

function MaintenancePage() {
  const [orders, setOrders] = useState(initialWorkOrders);
  const [filter, setFilter] = useState("All");
  const [showNew, setShowNew] = useState(false);
  const [message, setMessage] = useState("");
  const visibleOrders = orders.filter((order) => filter === "All" || order.status === filter);
  function updateOrder(id, status) {
    setOrders((current) => current.map((order) => order.id === id ? { ...order, status } : order));
    setMessage(`Work order ${id} updated to ${status}`);
  }
  function addOrder() {
    setOrders((current) => [{ id: `WO-${26050 + current.length}`, unit: "Brush 2", issue: "Scheduled preventive maintenance", category: "PM", priority: "Medium", opened: "Jun 7", vendor: "Internal Fleet", cost: "Pending", status: "Open" }, ...current]);
    setShowNew(false);
    setMessage("New maintenance work order created");
  }
  return <div className="module-page maintenance-page">
    <section className="module-heading"><div><span className="module-icon"><Wrench size={22} /></span><div><h1>Maintenance</h1><p>Work-order queue, vendor coordination, repair costs, preventive maintenance, and completion tracking.</p></div></div><div className="heading-actions"><button className="secondary-button">Cost Report</button><button className="primary-button" onClick={() => setShowNew(true)}><CirclePlus size={14} /> New Work Order</button></div></section>
    <FleetSummary items={[["Open Orders", orders.filter((order) => !/Complete/.test(order.status)).length, "info"], ["High Priority", orders.filter((order) => order.priority === "High").length, "critical"], ["Awaiting Parts", orders.filter((order) => order.status === "Awaiting Parts").length, "warning"], ["Scheduled", orders.filter((order) => order.status === "Scheduled").length, "info"], ["Completed", orders.filter((order) => order.status === "Complete").length, "success"]]} />
    {message && <div className="success-banner">{message}<button onClick={() => setMessage("")}><X size={13} /></button></div>}
    <section className="cert-toolbar"><div className="segmented-control">{["All", "Open", "In Progress", "Awaiting Parts", "Scheduled", "Complete"].map((item) => <button key={item} className={filter === item ? "active" : ""} onClick={() => setFilter(item)}>{item}</button>)}</div><span>{visibleOrders.length} work orders shown</span></section>
    <Panel title="Maintenance Work Orders" icon={Wrench} action={<button className="text-button">Configure columns</button>}><div className="work-order-table"><div className="work-order-row work-order-head"><span>Work Order</span><span>Unit</span><span>Issue</span><span>Category</span><span>Priority</span><span>Vendor</span><span>Cost</span><span>Status</span></div>{visibleOrders.map((order) => <div className="work-order-row" key={order.id}><strong>{order.id}</strong><strong>{order.unit}</strong><span>{order.issue}</span><span>{order.category}</span><Badge>{order.priority}</Badge><span>{order.vendor}</span><span>{order.cost}</span><select value={order.status} onChange={(event) => updateOrder(order.id, event.target.value)}>{["Open", "In Progress", "Awaiting Parts", "Scheduled", "Complete"].map((status) => <option key={status}>{status}</option>)}</select></div>)}</div></Panel>
    <section className="maintenance-bottom"><Panel title="Upcoming Preventive Maintenance" icon={CalendarDays}><MiniTable columns={["Unit", "Service", "Due", "Status"]} rows={[["Truck 3", "Aerial inspection", "Jun 18", "Due Soon"], ["Brush 2", "Annual service", "Jun 21", "Upcoming"], ["Engine 1", "Oil and filters", "Aug 14", "Upcoming"]]} /></Panel><Panel title="Maintenance Spend" icon={BarChart3}><div className="spend-bars">{[["Repairs", "$12,840", "72%"], ["Preventive", "$6,420", "48%"], ["Tires", "$3,180", "31%"]].map(([label, value, width]) => <div key={label}><span>{label}</span><strong>{value}</strong><i><b style={{ width }} /></i></div>)}</div></Panel></section>
    {showNew && <Modal title="New Maintenance Work Order" onClose={() => setShowNew(false)}><div className="workflow-form"><label><span>Unit</span><select><option>Brush 2</option><option>Engine 1</option><option>Truck 3</option></select></label><label><span>Priority</span><select><option>Medium</option><option>High</option><option>Low</option></select></label><label className="wide-field"><span>Issue Description</span><input defaultValue="Scheduled preventive maintenance" /></label><label><span>Category</span><select><option>PM</option><option>General</option><option>Electrical</option></select></label><label><span>Vendor</span><select><option>Internal Fleet</option><option>Mid-South Apparatus</option></select></label></div><div className="modal-actions"><button className="secondary-button" onClick={() => setShowNew(false)}>Cancel</button><button className="primary-button" onClick={addOrder}><Check size={14} /> Create Work Order</button></div></Modal>}
  </div>;
}

function AssetsPage({ query }) {
  const [assets, setAssets] = useState(initialAssets);
  const [filter, setFilter] = useState("All");
  const [showNew, setShowNew] = useState(false);
  const [message, setMessage] = useState("");
  const visibleAssets = assets.filter((asset) => (filter === "All" || asset.status === filter || asset.category === filter) && Object.values(asset).join(" ").toLowerCase().includes(query.toLowerCase()));
  function toggleCustody(id) {
    setAssets((current) => current.map((asset) => asset.id === id ? asset.assigned === "Unassigned" ? { ...asset, assigned: "Chief J. Smith", location: "Administration", status: "In Service" } : { ...asset, assigned: "Unassigned", location: "Station 1", status: "Available" } : asset));
    const asset = assets.find((item) => item.id === id);
    setMessage(asset.assigned === "Unassigned" ? `${asset.name} checked out` : `${asset.name} returned`);
  }
  function addAsset() {
    setAssets((current) => [{ id: `AST-${1400 + current.length}`, name: "New Department Asset", category: "Equipment", serial: "Pending", location: "Station 1", assigned: "Unassigned", inspection: "Jun 7, 2027", value: "Pending", status: "Available" }, ...current]);
    setShowNew(false);
    setMessage("New asset added to inventory");
  }
  return <div className="module-page assets-page">
    <section className="module-heading"><div><span className="module-icon"><PackageSearch size={22} /></span><div><h1>Assets</h1><p>Department equipment inventory, assignment custody, inspection dates, value, and repair status.</p></div></div><div className="heading-actions"><button className="secondary-button">Inventory Report</button><button className="primary-button" onClick={() => setShowNew(true)}><CirclePlus size={14} /> Add Asset</button></div></section>
    <FleetSummary items={[["Total Assets", assets.length, "info"], ["In Service", assets.filter((asset) => asset.status === "In Service").length, "success"], ["Available", assets.filter((asset) => asset.status === "Available").length, "info"], ["Inspection Due", assets.filter((asset) => asset.status === "Inspection Due").length, "warning"], ["Out for Repair", assets.filter((asset) => asset.status === "Out for Repair").length, "critical"]]} />
    {message && <div className="success-banner">{message}<button onClick={() => setMessage("")}><X size={13} /></button></div>}
    <section className="cert-toolbar"><div className="segmented-control">{["All", "Medical", "PPE", "In Service", "Available", "Inspection Due", "Out for Repair"].map((item) => <button key={item} className={filter === item ? "active" : ""} onClick={() => setFilter(item)}>{item}</button>)}</div><span>{visibleAssets.length} assets shown</span></section>
    <Panel title="Asset Inventory & Custody" icon={PackageSearch} action={<button className="text-button">Scan barcode</button>}><div className="asset-table"><div className="asset-row asset-head"><span>Asset</span><span>Category</span><span>Serial</span><span>Location</span><span>Assigned To</span><span>Inspection</span><span>Value</span><span>Status</span><span /></div>{visibleAssets.map((asset) => <div className="asset-row" key={asset.id}><div><strong>{asset.name}</strong><small>{asset.id}</small></div><span>{asset.category}</span><span>{asset.serial}</span><span>{asset.location}</span><span>{asset.assigned}</span><span>{asset.inspection}</span><span>{asset.value}</span><Badge>{asset.status}</Badge><button className="row-action" onClick={() => toggleCustody(asset.id)}>{asset.assigned === "Unassigned" ? "Check Out" : "Return"}</button></div>)}</div></Panel>
    {showNew && <Modal title="Add Department Asset" onClose={() => setShowNew(false)}><div className="workflow-form"><label><span>Asset Name</span><input defaultValue="New Department Asset" /></label><label><span>Category</span><select><option>Equipment</option><option>Medical</option><option>PPE</option><option>Electronics</option></select></label><label><span>Serial Number</span><input placeholder="Enter serial number" /></label><label><span>Initial Location</span><select><option>Station 1</option><option>Station 2</option><option>Station 3</option></select></label><label><span>Inspection Due</span><input type="date" defaultValue="2027-06-07" /></label><label><span>Purchase Value</span><input placeholder="$0.00" /></label></div><div className="modal-actions"><button className="secondary-button" onClick={() => setShowNew(false)}>Cancel</button><button className="primary-button" onClick={addAsset}><Check size={14} /> Add Asset</button></div></Modal>}
  </div>;
}

function Modal({ title, onClose, children }) {
  return <div className="modal-backdrop"><section className="workflow-modal"><header><strong>{title}</strong><button onClick={onClose}><X size={16} /></button></header><div className="modal-content">{children}</div></section></div>;
}

function ModulePage({ name, query }) {
  const data = moduleData[name];
  const Icon = data?.icon || FileText;
  if (!data) return <PlaceholderPage name={name} />;
  return <div className="module-page"><section className="module-heading"><div><span className="module-icon"><Icon size={22} /></span><div><h1>{name}</h1><p>{data.description}</p></div></div><div className="heading-actions"><button className="secondary-button">Export</button><button className="primary-button">Add record</button></div></section><section className="module-toolbar"><div className="toolbar-stat"><strong>{data.rows.length}</strong><span>Records shown</span></div><div className="toolbar-stat"><strong>{data.rows.filter((row) => /due|overdue|deficit|expired/i.test(row.join(" "))).length}</strong><span>Need attention</span></div><button className="filter-button">All statuses</button><button className="filter-button">All assignments</button></section><Panel title={`${name} Records`} icon={Icon} action={<button className="text-button">Configure columns</button>}><DataTable columns={data.columns} rows={data.rows} query={query} /></Panel></div>;
}

function PlaceholderPage({ name }) {
  return <div className="module-page"><section className="placeholder-page"><span><HardHat size={30} /></span><h1>{name}</h1><p>This module is included in the RMS architecture and ready for its dedicated workflow in the next sprint.</p><button className="primary-button">Create module brief</button></section></div>;
}

export default function App() {
  const [current, setCurrent] = useState("Dashboard");
  const [collapsed, setCollapsed] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [query, setQuery] = useState("");
  const [personnel, setPersonnel] = usePersistentState("hlfd-rms-personnel", personnelRecords);
const [certifications] = usePersistentState("hlfd-rms-certifications", initialCertificationRecords);
const [apparatus] = usePersistentState("hlfd-rms-apparatus", initialApparatus);
const [workOrders] = usePersistentState("hlfd-rms-work-orders", initialWorkOrders);
  function navigate(name) { setCurrent(name); setQuery(""); setMobileNav(false); }
  return <main className={`app-shell ${collapsed ? "nav-collapsed" : ""} ${mobileNav ? "mobile-nav-open" : ""}`}>
    <TopBar query={query} setQuery={setQuery} toggleMobileNav={() => setMobileNav(!mobileNav)} />
    <SideNav current={current} collapsed={collapsed} setCollapsed={setCollapsed} onNavigate={navigate} />
    {mobileNav && <button className="mobile-scrim" onClick={() => setMobileNav(false)}><X size={20} /></button>}
    <section className="workspace">{current === "Dashboard" ? (
  <Dashboard
    onNavigate={navigate}
    personnel={personnel}
    certifications={certifications}
    apparatus={apparatus}
    workOrders={workOrders}
  />
) : current === "Personnel" ? (
  <PersonnelPage
    query={query}
    records={personnel}
    setRecords={setPersonnel}
  />
) : current === "Certifications" ? <CertificationsPage query={query} /> : current === "Scheduling" ? <SchedulingPage /> : current === "Shift Trades" ? <ShiftTradesPage /> : current === "Apparatus" ? <ApparatusPage /> : current === "Maintenance" ? <MaintenancePage /> : current === "Assets" ? <AssetsPage query={query} /> : <ModulePage name={current} query={query} />}</section>
    <footer><span>System Status <i /> All Systems Operational</span><span>Last Data Sync: 11:32 AM</span><span>v2.4.1 <img src={departmentLogo} alt="" /> Horn Lake Fire Department</span></footer>
  </main>;
}
