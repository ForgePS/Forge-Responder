/**
 * Demo sandbox only: the hydrant damage workflow (Prevention → Hydrants → Damage
 * Reports) needs a water company and some reports in different stages to be worth
 * showing. The demo refresh writes them, removes leftover reports and hydrant test
 * edits, and leaves the 16 demo hydrants as the static file describes them.
 *
 * Email addresses use the demo domain (demo.forge.demo), which doesn't deliver,
 * so a visitor sending a report never emails anyone real.
 */
import { createRecord, deleteRecord, listRecords } from "./firestoreService.js";
import {
  HYDRANT_DAMAGE_REPORTS_COLLECTION,
  WATER_COMPANIES_COLLECTION,
  WATER_COMPANY_CONTACTS_COLLECTION,
} from "./hydrantDamage/paths.js";
import { normalizeDamageReport } from "./hydrantDamage/damageReportService.js";
import { normalizeWaterCompany, normalizeWaterCompanyContact } from "./hydrantDamage/waterCompanyService.js";
import { DEMO_DEPARTMENT_ID } from "./tenantPaths.js";

const COMPANY_ID = "WC-RIVERSIDE";
const COMPANY_NAME = "Riverside Water Utility";

const hoursAgo = (now, h) => new Date(now.getTime() - h * 3600000).toISOString();
const hoursAhead = (now, h) => new Date(now.getTime() + h * 3600000).toISOString();

export function buildDemoHydrantDamageRecords(now = new Date()) {
  const departmentId = DEMO_DEPARTMENT_ID;
  const year = now.getFullYear();
  const company = normalizeWaterCompany({
    id: COMPANY_ID,
    legalName: COMPANY_NAME,
    utilityType: "municipal",
    mainAddress: "900 Levee Rd, Riverside, MS 38600",
    mainPhone: "(555) 020-0100",
    emergencyPhone: "(555) 020-0199",
    afterHoursPhone: "(555) 020-0199",
    generalEmail: "info@riversidewater.demo.forge.demo",
    damageReportEmail: "hydrants@riversidewater.demo.forge.demo",
    emergencyEmail: "dispatch@riversidewater.demo.forge.demo",
    businessHours: "Mon–Fri 7:00–16:00",
    acknowledgmentSlaMinutes: 240,
    emergencyResponseSlaMinutes: 60,
    normalRepairSlaHours: 72,
    active: true,
    lastVerifiedAt: hoursAgo(now, 24 * 30),
    createdAt: hoursAgo(now, 24 * 200),
  }, departmentId);
  const contact = normalizeWaterCompanyContact({
    id: "WCC-RIVERSIDE-1",
    waterCompanyId: COMPANY_ID,
    name: "Distribution Operations Desk",
    title: "Distribution Supervisor",
    department: "Distribution",
    email: "hydrants@riversidewater.demo.forge.demo",
    phone: "(555) 020-0110",
    afterHoursPhone: "(555) 020-0199",
    contactType: "primary",
    receivesRoutineReports: true,
    receivesUrgentReports: true,
    receivesOutOfServiceReports: true,
    receivesEscalation: true,
    receivesRepairVerification: true,
  }, departmentId);

  const base = {
    waterCompanyId: COMPANY_ID,
    waterCompanyName: COMPANY_NAME,
    assignmentSource: "hydrant_record",
    assignmentConfidence: 1,
    sourceType: "manual",
    recipientSnapshot: [{ email: contact.email, name: contact.name, role: "primary", required: true }],
    createdBy: "demo",
    updatedBy: "demo",
  };
  const report = (n, fields) => normalizeDamageReport({
    ...base,
    id: `HDR-DEMO-${n}`,
    reportNumber: `HDR-${year}-${String(n).padStart(4, "0")}`,
    ...fields,
  }, departmentId);

  const reports = [
    report(1, {
      hydrantId: "RV-1007", hydrantLabel: "RV 107", hydrantAddress: "322 Pecan Ct",
      status: "repair_scheduled", emailStatus: "delivered", repairStatus: "scheduled",
      severity: "major", operationalStatus: "out_of_service",
      description: "Hydrant struck by a vehicle. Barrel cracked at the flange and leaking at the base; will not hold pressure.",
      suspectedCause: "Vehicle strike", immediateActions: "Tagged out of service, valve closed, area coned off.",
      leaking: true, roadwayHazard: false, publicSafetyHazard: true,
      discoveredAt: hoursAgo(now, 96), discoveredBy: "Engineer A. Prospect",
      sentAt: hoursAgo(now, 95), sentBy: "Captain Z. Trial", acknowledgedAt: hoursAgo(now, 93),
      acknowledgmentDueAt: hoursAgo(now, 91), utilityWorkOrderNumber: "RWU-WO-48812",
      repairTargetAt: hoursAhead(now, 30), createdAt: hoursAgo(now, 96), updatedAt: hoursAgo(now, 20),
    }),
    report(2, {
      hydrantId: "RV-1015", hydrantLabel: "RV 115", hydrantAddress: "618 Pecan Ct",
      status: "awaiting_acknowledgment", emailStatus: "delivered", repairStatus: "not_reviewed",
      severity: "critical", operationalStatus: "out_of_service",
      description: "Operating nut stripped; hydrant cannot be opened. Found during annual testing.",
      suspectedCause: "Wear", immediateActions: "Marked out of service and noted on the preplan for 600 block Pecan Ct.",
      alternativeWaterSupplyRequired: true,
      discoveredAt: hoursAgo(now, 27), discoveredBy: "Firefighter B. Specimen",
      sentAt: hoursAgo(now, 26), sentBy: "Captain Z. Trial",
      acknowledgmentDueAt: hoursAgo(now, 22), repairTargetAt: hoursAhead(now, 46),
      createdAt: hoursAgo(now, 27), updatedAt: hoursAgo(now, 26),
    }),
    report(3, {
      hydrantId: "RV-1005", hydrantLabel: "RV 105", hydrantAddress: "248 Oak Bend Rd",
      status: "ready_for_verification", emailStatus: "delivered", repairStatus: "completed",
      verificationStatus: "pending", severity: "moderate", operationalStatus: "in_service_limited",
      description: "Steamer cap seized and chain missing. Side outlets work.",
      discoveredAt: hoursAgo(now, 24 * 9), discoveredBy: "Lieutenant F. Drill",
      sentAt: hoursAgo(now, 24 * 9 - 1), sentBy: "Lieutenant F. Drill", acknowledgedAt: hoursAgo(now, 24 * 8),
      acknowledgmentDueAt: hoursAgo(now, 24 * 9 - 5), utilityWorkOrderNumber: "RWU-WO-48690",
      repairTargetAt: hoursAgo(now, 24 * 6), repairCompletedAt: hoursAgo(now, 18),
      verificationDueAt: hoursAhead(now, 54), createdAt: hoursAgo(now, 24 * 9), updatedAt: hoursAgo(now, 18),
    }),
    report(4, {
      hydrantId: "RV-1013", hydrantLabel: "RV 113", hydrantAddress: "544 Oak Bend Rd",
      status: "draft", emailStatus: "not_sent", repairStatus: "not_reviewed",
      severity: "minor", operationalStatus: "difficult_access",
      description: "Overgrown shrubs within 3 ft of the hydrant; reflective marker missing.",
      discoveredAt: hoursAgo(now, 5), discoveredBy: "Firefighter U. Casefile",
      createdAt: hoursAgo(now, 5), updatedAt: hoursAgo(now, 5),
    }),
    report(5, {
      hydrantId: "RV-1002", hydrantLabel: "RV 102", hydrantAddress: "137 Magnolia Dr",
      status: "verified", emailStatus: "delivered", repairStatus: "completed", verificationStatus: "passed",
      severity: "moderate", operationalStatus: "in_service",
      description: "Slow leak at the main valve when closed. Repaired by the utility; flow test passed.",
      discoveredAt: hoursAgo(now, 24 * 26), discoveredBy: "Engineer D. Mockup",
      sentAt: hoursAgo(now, 24 * 26 - 1), sentBy: "Lieutenant C. Rehearsal", acknowledgedAt: hoursAgo(now, 24 * 26 - 3),
      utilityWorkOrderNumber: "RWU-WO-48311", repairCompletedAt: hoursAgo(now, 24 * 21),
      verifiedAt: hoursAgo(now, 24 * 20), verifiedBy: "Captain Z. Trial", closedAt: hoursAgo(now, 24 * 20),
      createdAt: hoursAgo(now, 24 * 26), updatedAt: hoursAgo(now, 24 * 20),
    }),
  ];
  return { company, contact, reports };
}

export async function refreshDemoHydrantRecords(now = new Date()) {
  const departmentId = DEMO_DEPARTMENT_ID;
  const { company, contact, reports } = buildDemoHydrantDamageRecords(now);
  const keepReports = new Set(reports.map((row) => row.id));
  const [existingReports, existingCompanies, existingContacts, hydrantEdits] = await Promise.all([
    listRecords(departmentId, HYDRANT_DAMAGE_REPORTS_COLLECTION),
    listRecords(departmentId, WATER_COMPANIES_COLLECTION),
    listRecords(departmentId, WATER_COMPANY_CONTACTS_COLLECTION),
    listRecords(departmentId, "hydrants"),
  ]);
  await Promise.all([
    createRecord(departmentId, WATER_COMPANIES_COLLECTION, company.id, company),
    createRecord(departmentId, WATER_COMPANY_CONTACTS_COLLECTION, contact.id, contact),
    ...reports.map((row) => createRecord(departmentId, HYDRANT_DAMAGE_REPORTS_COLLECTION, row.id, row)),
    ...existingReports.filter((row) => !keepReports.has(row.id))
      .map((row) => deleteRecord(departmentId, HYDRANT_DAMAGE_REPORTS_COLLECTION, row.id)),
    ...existingCompanies.filter((row) => row.id !== company.id)
      .map((row) => deleteRecord(departmentId, WATER_COMPANIES_COLLECTION, row.id)),
    ...existingContacts.filter((row) => row.id !== contact.id)
      .map((row) => deleteRecord(departmentId, WATER_COMPANY_CONTACTS_COLLECTION, row.id)),
    // Edits made by tests or visitors (status changes, flow tests) go back to the demo file.
    ...hydrantEdits.map((row) => deleteRecord(departmentId, "hydrants", row.id)),
  ]);
}
