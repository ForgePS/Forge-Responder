import { Activity, BookOpen, CalendarDays, ClipboardCheck, FileCheck2, FileText, HardHat, Truck, Users } from "lucide-react";

import { Panel, DataTable } from "../components/shell/ui.jsx";

const moduleData = {
  Personnel: { icon: Users, description: "Roster, assignments, contact information, documents, and employment status.", columns: ["Name", "Rank", "Assignment", "EMS Level", "Status"], rows: [["Jeremy Powell", "Fire Chief", "Administration", "Paramedic", "Active"], ["Stephen White", "Deputy Chief", "Administration", "Paramedic", "Active"], ["Gregory Scruggs", "Battalion Chief", "A Shift", "AEMT", "Active"], ["Mike Mallett", "Battalion Chief", "B Shift", "Paramedic", "Active"], ["Adam Tutor", "Captain", "C Shift", "EMT", "Active"], ["Cole Casey", "Firefighter", "A Shift", "Paramedic", "Leave"]] },
  Certifications: { icon: FileCheck2, description: "Renewal tracking and 30/60/90-day expiration alerts.", columns: ["Personnel", "Certification", "Expires", "Renewal", "Status"], rows: [["Cole Casey", "Paramedic", "Jun 24, 2026", "Submitted", "Due Soon"], ["Adam Tutor", "Firefighter II", "Jul 12, 2026", "Not Started", "Due Soon"], ["Mike Mallett", "Instructor I", "Aug 08, 2026", "In Progress", "Active"], ["Gregory Scruggs", "AEMT", "May 31, 2026", "Overdue", "Expired"]] },
  Training: { icon: BookOpen, description: "Events, attendance, hours, categories, and compliance tracking.", columns: ["Training Event", "Category", "Date", "Attendees", "Status"], rows: [["Live Fire Evolution", "Fire", "Jun 10", "18 / 24", "Scheduled"], ["Pediatric Airway", "EMS CE", "Jun 14", "12 / 18", "Scheduled"], ["Driver Operations", "Driver", "Jun 20", "9 / 12", "Scheduled"], ["HazMat Refresher", "Fire", "May 28", "21 / 24", "Complete"]] },
  Scheduling: { icon: CalendarDays, description: "A/B/C shift calendar, daily roster, apparatus assignments, leave, and overtime.", columns: ["Date", "Shift", "Staffed", "Minimum", "Coverage"], rows: [["Jun 7", "A Shift", "21", "21", "Complete"], ["Jun 8", "B Shift", "20", "21", "Deficit"], ["Jun 9", "C Shift", "22", "21", "Complete"], ["Jun 10", "A Shift", "21", "21", "Complete"]] },
  Apparatus: { icon: Truck, description: "Unit readiness, mileage, engine hours, pump hours, and repair history.", columns: ["Unit", "Type", "Mileage", "PM Due", "Status"], rows: [["Engine 1", "Pumper", "31,820", "Aug 2026", "In Service"], ["Engine 2", "Pumper", "44,091", "Jul 2026", "In Service"], ["Truck 3", "Ladder", "26,445", "Jun 2026", "PM Due"], ["Rescue 1", "Rescue", "19,230", "Sep 2026", "In Service"]] },
  Inspections: { icon: ClipboardCheck, description: "Inspection queue, violations, reinspection dates, and occupancy history.", columns: ["Occupancy", "Inspection", "Due", "Inspector", "Status"], rows: [["Central High School", "Annual", "Jun 12", "J. Mitchell", "Scheduled"], ["Logan's Roadhouse", "Reinspection", "Jun 8", "J. Mitchell", "Overdue"], ["Amazon Distribution", "Annual", "Jun 21", "J. Wade", "Scheduled"], ["Comfort Inn", "Reinspection", "Jun 15", "J. Wade", "Pending Review"]] },
  Hydrants: { icon: Activity, description: "Hydrant records, flow tests, inspections, district assignments, and readiness.", columns: ["Hydrant", "District", "Last Tested", "Flow Class", "Status"], rows: [["HL-1042", "1", "May 14, 2026", "Class AA", "Complete"], ["HL-1178", "2", "Apr 30, 2026", "Class A", "Complete"], ["HL-1281", "3", "Not tested", "Unknown", "Due Soon"], ["HL-1307P", "2", "Private", "Private", "Active"]] }
};

export function ModulePage({ name, query }) {
  const data = moduleData[name];
  const Icon = data?.icon || FileText;
  if (!data) return <PlaceholderPage name={name} />;
  return <div className="module-page"><section className="module-heading"><div><span className="module-icon"><Icon size={22} /></span><div><h1>{name}</h1><p>{data.description}</p></div></div><div className="heading-actions"><button className="secondary-button">Export</button><button className="primary-button">Add record</button></div></section><section className="module-toolbar"><div className="toolbar-stat"><strong>{data.rows.length}</strong><span>Records shown</span></div><div className="toolbar-stat"><strong>{data.rows.filter((row) => /due|overdue|deficit|expired/i.test(row.join(" "))).length}</strong><span>Need attention</span></div><button className="filter-button">All statuses</button><button className="filter-button">All assignments</button></section><Panel title={`${name} Records`} icon={Icon} action={<button className="text-button">Configure columns</button>}><DataTable columns={data.columns} rows={data.rows} query={query} /></Panel></div>;
}

export function PlaceholderPage({ name }) {
  return <div className="module-page"><section className="placeholder-page"><span><HardHat size={30} /></span><h1>{name}</h1><p>This module is included in the RMS architecture and ready for its dedicated workflow in the next sprint.</p><button className="primary-button">Create module brief</button></section></div>;
}

export function AccessDeniedModule({ name }) {
  return <div className="module-page"><section className="placeholder-page"><h1>{name}</h1><p>Your role does not include permission to access this module.</p></section></div>;
}
