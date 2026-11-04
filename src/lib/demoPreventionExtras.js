/**
 * Demo sandbox only: Preplans, Fire Protection Systems and violation records for
 * the Riverside demo buildings. The Prevention pages read these collections (not
 * the classic lists), so without them those pages are empty in the demo.
 * All fictional. The demo reset deletes and rewrites them each time.
 */
import { createRecord, deleteRecord, listRecords } from "./firestoreService.js";
import {
  FIRE_PROTECTION_SYSTEMS_COLLECTION,
  PREPLANS_COLLECTION,
  PREPLAN_DIAGRAMS_COLLECTION,
  PREPLAN_REVISIONS_COLLECTION,
  VIOLATIONS_COLLECTION,
} from "./inspections/paths.js";
import { PREPLAN_RESTRICTED_COLLECTION } from "./inspections/preplanRestricted.js";
import { createPreplan, publishPreplanRevision, updatePreplan } from "./inspections/preplanService.js";
import { normalizeFireProtectionSystem } from "./inspections/fpsService.js";
import { normalizeViolationRecord } from "./inspections/violationService.js";
import { DEMO_DEPARTMENT_ID } from "./tenantPaths.js";

const daysAgo = (now, n) => new Date(now.getTime() - n * 86400000).toISOString();
const daysAhead = (now, n) => new Date(now.getTime() + n * 86400000).toISOString();

/** Preplans: [occupancy, status after create, plan data]. */
const PREPLANS = [
  ["OCC-101", "operational", {
    responsibleStation: "Station 1", firstDueCompany: "Engine 1", riskLevel: "Moderate",
    answers: {
      constructionType: "Type II-B", roofConstruction: "Steel Deck", stories: "2", squareFootage: "182,000", yearBuilt: "2004",
      primaryAccess: "Main entrance off Riverside Rd, Gate C for apparatus", secondaryAccess: "Bus loop on the north side",
      knoxBox: "Present", apparatusLimitations: "Gate C clearance 13 ft 6 in",
      waterSupplyType: "Municipal Hydrant", nearestHydrants: "RV 101, RV 109", fdcLocation: "Northeast corner by the gym",
      sprinkler: "Wet Pipe", standpipe: "Class I in both stairwells", alarm: "Addressable, monitored by Riverside Alarm Co.",
      panelLocation: "Main office vestibule", gas: "Meter at the south wall, behind the kitchen", electric: "Main switchgear, boiler room",
      water: "Riser room off the gym corridor", occupancyClassification: "Educational", hazardType: "Laboratory Chemicals",
      occupancyNotes: "1,200 students and staff during school hours; evening events in the gym.", exposures: "None within 100 ft",
      primaryContact: "Facilities Manager", primaryPhone: "(555) 030-0101", afterHours: "(555) 030-0199",
      initialActions: "Engine 1 to Gate C, lay in from RV 101; Truck 3 to the front circle.", staging: "Bus loop",
      evacuation: "Students assemble at the football field.",
    },
    hazards: "Sprinklered, Knox box at main office, AED locations marked; chemistry lab on the 2nd floor.",
  }],
  ["OCC-103", "operational", {
    responsibleStation: "Station 2", firstDueCompany: "Engine 2", riskLevel: "High",
    answers: {
      constructionType: "Type II-B", roofConstruction: "Metal Panel", stories: "1", squareFootage: "410,000", yearBuilt: "2019",
      primaryAccess: "Dock 4, east gate", secondaryAccess: "Truck court on the west side", knoxBox: "Present",
      waterSupplyType: "Private Hydrant", nearestHydrants: "Private loop + RV 112", fdcLocation: "East wall by Dock 4",
      sprinkler: "ESFR", alarm: "Addressable, monitored by Riverside Alarm Co.", panelLocation: "Security office at the east gate",
      gas: "No natural gas service", electric: "Switchgear room, northeast corner", hazmat: "Lithium-ion battery aisle (row 40–44)",
      occupancyClassification: "Storage", hazardType: "Lithium-Ion Batteries", occupancyNotes: "High-piled storage to 35 ft; up to 450 staff.",
      primaryContact: "Site Safety Lead", primaryPhone: "(555) 030-0103", afterHours: "(555) 030-0193",
      initialActions: "First engine to Dock 4 and the FDC; second engine establishes supply from RV 112.", staging: "Truck court, west side",
    },
    hazards: "High-piled storage, lithium battery aisle, loading docks.",
  }],
  ["OCC-104", "verification_due", {
    responsibleStation: "Station 1", firstDueCompany: "Engine 1", riskLevel: "Moderate",
    answers: {
      constructionType: "Type V-A", roofConstruction: "Wood Truss", stories: "3", yearBuilt: "1998",
      primaryAccess: "Front circle, south stairwell", knoxBox: "Present", waterSupplyType: "Municipal Hydrant",
      nearestHydrants: "RV-1307 private", sprinkler: "Residential", alarm: "Addressable with voice evacuation, monitored",
      gas: "Pool equipment room, rear", electric: "Electrical room, 1st floor north", occupancyClassification: "Residential",
      hazardType: "Corrosive", occupancyNotes: "86 guest rooms; pool chemical storage.",
    },
    hazards: "Three-story guest rooms, pool chemical storage",
  }],
  ["OCC-106", "operational", {
    responsibleStation: "Station 1", firstDueCompany: "Truck 3", riskLevel: "High",
    answers: {
      constructionType: "Type I-A", roofConstruction: "Concrete", stories: "5", squareFootage: "260,000", yearBuilt: "2011",
      primaryAccess: "ER ramp off Hospital Dr", secondaryAccess: "Loading dock, south side", knoxBox: "Present",
      waterSupplyType: "Municipal Hydrant", nearestHydrants: "RV-1450, RV-1451", fdcLocation: "North wall by the ER ramp",
      sprinkler: "Wet Pipe", standpipe: "Class I in all stairwells", alarm: "Addressable with voice evacuation, monitored on site",
      specialSuppression: "Clean agent in the data center", panelLocation: "Security desk, main lobby",
      gas: "Central plant, south", electric: "Central plant, south (generators x2)", hazmat: "Bulk oxygen tank, east lot",
      occupancyClassification: "Institutional", hazardType: "Oxidizer", occupancyNotes: "Defend-in-place occupants; helipad on the roof.",
      primaryContact: "Hospital Safety Officer", primaryPhone: "(555) 030-0106", afterHours: "(555) 030-0196",
      initialActions: "Report to the ER ramp command post; coordinate with the hospital incident command.", staging: "Visitor lot B",
      evacuation: "Horizontal evacuation; defend in place.",
    },
    hazards: "Oxygen storage, defend-in-place occupants, helipad",
  }],
  ["OCC-107", "ready_for_review", {
    responsibleStation: "Station 2", firstDueCompany: "Engine 2", riskLevel: "High",
    answers: {
      constructionType: "Type V-A", roofConstruction: "Pitched", stories: "1", yearBuilt: "1987",
      primaryAccess: "Main entrance, annunciator in the lobby", knoxBox: "Present", waterSupplyType: "Municipal Hydrant",
      nearestHydrants: "RV 115 (out of service), RV 107 (out of service)", sprinkler: "Wet Pipe", alarm: "Addressable, monitored",
      occupancyClassification: "Institutional", hazardType: "Oxidizer", occupancyNotes: "Non-ambulatory residents; oxygen in rooms.",
      supplyNotes: "Both nearby hydrants are out of service — plan a long lay or tender shuttle.",
    },
    hazards: "Non-ambulatory residents, oxygen in rooms",
  }],
  ["OCC-102", "draft", {
    responsibleStation: "Station 1", firstDueCompany: "Engine 1", riskLevel: "Moderate",
    answers: { constructionType: "Type V-B", stories: "1", primaryAccess: "Front door on Main St", knoxBox: "Not Present",
      sprinkler: "None", specialSuppression: "Kitchen hood wet chemical", occupancyClassification: "Assembly" },
    hazards: "Commercial kitchen with hood suppression",
  }],
];

/** Preplan type per building (the template default would label every plan multifamily). */
const PREPLAN_TYPE_BY_OCCUPANCY = {
  "OCC-101": "educational",
  "OCC-102": "assembly",
  "OCC-103": "warehouse",
  "OCC-104": "multifamily",
  "OCC-106": "healthcare",
  "OCC-107": "healthcare",
};

/** Fire protection systems: [id, occupancyId, occupancyName, type, name, extra]. */
const SYSTEMS = [
  ["FPS-DEMO-1", "OCC-101", "Riverside High School", "sprinkler", "Wet pipe sprinkler (full coverage)", { coverageArea: "Entire building", installDate: "2004-07-15" }],
  ["FPS-DEMO-2", "OCC-101", "Riverside High School", "fire_alarm", "Addressable fire alarm", { monitoringProvider: "Riverside Alarm Co." }],
  ["FPS-DEMO-3", "OCC-103", "Riverside Distribution Center", "sprinkler", "ESFR sprinkler, 4 risers", { coverageArea: "Warehouse" }],
  ["FPS-DEMO-4", "OCC-103", "Riverside Distribution Center", "fire_pump", "Diesel fire pump", { coverageArea: "Pump house" }],
  ["FPS-DEMO-5", "OCC-104", "Riverside Inn", "sprinkler", "NFPA 13R residential sprinkler", { coverageArea: "Guest floors" }],
  ["FPS-DEMO-6", "OCC-104", "Riverside Inn", "fire_alarm", "Voice evacuation alarm", { monitoringProvider: "Riverside Alarm Co." }],
  ["FPS-DEMO-7", "OCC-106", "Riverside Regional Medical Center", "sprinkler", "Wet pipe sprinkler with standpipes", { coverageArea: "All floors" }],
  ["FPS-DEMO-8", "OCC-106", "Riverside Regional Medical Center", "clean_agent", "Clean agent, data center", { coverageArea: "Data center, 2nd floor" }],
  ["FPS-DEMO-9", "OCC-107", "Willow Creek Nursing Home", "sprinkler", "Wet pipe sprinkler", { coverageArea: "Entire building" }],
  ["FPS-DEMO-10", "OCC-102", "Main Street Diner", "cooking_suppression", "Kitchen hood wet chemical", { coverageArea: "Cook line", status: "impaired", notes: "Semi-annual service overdue; nozzle caps missing." }],
];

export async function refreshDemoPreventionExtras(now = new Date()) {
  const departmentId = DEMO_DEPARTMENT_ID;
  const audit = { actorUid: "demo", actorName: "Marshal G. Inspector" };
  const year = now.getFullYear();

  // Clear what's there (visitors' edits, earlier runs).
  const collections = [PREPLANS_COLLECTION, PREPLAN_REVISIONS_COLLECTION, PREPLAN_DIAGRAMS_COLLECTION,
    PREPLAN_RESTRICTED_COLLECTION, FIRE_PROTECTION_SYSTEMS_COLLECTION, VIOLATIONS_COLLECTION];
  const existing = await Promise.all(collections.map((name) => listRecords(departmentId, name).catch(() => [])));
  await Promise.all(collections.flatMap((name, i) => existing[i].map((row) => deleteRecord(departmentId, name, row.id))));

  // Fire protection systems.
  await Promise.all(SYSTEMS.map(([id, occupancyId, occupancyName, systemTypeId, name, extra]) => createRecord(
    departmentId, FIRE_PROTECTION_SYSTEMS_COLLECTION, id,
    normalizeFireProtectionSystem({
      id, systemNumber: id.replace("FPS-DEMO-", `FPS-${year}-00`), systemTypeId, name, occupancyId, occupancyName,
      status: "active", lastInspectionAt: daysAgo(now, 120), nextInspectionAt: daysAhead(now, 245),
      lastTestAt: daysAgo(now, 120), nextTestAt: daysAhead(now, 245), serviceContractorName: "Delta Fire Protection",
      createdAt: daysAgo(now, 400), updatedAt: daysAgo(now, 120), ...extra,
    }, departmentId),
  )));

  // Violations behind the demo inspections' open violation counts.
  const violations = [
    ["VIO-DEMO-1", "INS-202", "OCC-102", "Main Street Diner", "214 Main St", "Kitchen hood suppression not serviced", "major", "IFC 904.12.5.2", "Have the hood system serviced by a licensed contractor and post the tag.", 10],
    ["VIO-DEMO-2", "INS-202", "OCC-102", "Main Street Diner", "214 Main St", "Fire extinguisher missing from the cook line", "moderate", "IFC 906.1", "Mount a Class K extinguisher within 30 ft of the cook line.", 10],
    ["VIO-DEMO-3", "INS-204", "OCC-104", "Riverside Inn", "880 Riverfront Pkwy", "Exit sign not illuminated, 3rd floor east", "minor", "IFC 1013.3", "Repair or replace the exit sign.", 14],
  ];
  await Promise.all(violations.map(([id, inspectionId, occupancyId, occupancyName, address, name, severity, codeCitation, correctiveAction, days]) => createRecord(
    departmentId, VIOLATIONS_COLLECTION, id,
    normalizeViolationRecord({
      id, inspectionId, inspectionNumber: `INS-${year}-0${inspectionId.replace("INS-", "")}`, occupancyId, occupancyName, address,
      name, description: name, severity, codeCitation, correctiveAction, status: "open",
      observedAt: daysAgo(now, 6), dueAt: daysAhead(now, days - 6), inspectorName: "Marshal G. Inspector",
      createdAt: daysAgo(now, 6), updatedAt: daysAgo(now, 6),
    }, departmentId),
  )));

  // Preplans. The first one also sets up the preplan templates, so it goes alone;
  // the rest are created side by side (each makes a revision, diagram and restricted answers).
  async function buildPreplan([occupancyId, status, plan], n) {
    const id = `PP-DEMO-${n}`;
    await createPreplan(departmentId, {
      id,
      preplanNumber: `PP-${year}-${String(n).padStart(4, "0")}`,
      occupancyId,
      preplanTypeId: PREPLAN_TYPE_BY_OCCUPANCY[occupancyId] || "commercial",
      responsibleStation: plan.responsibleStation,
      firstDueCompany: plan.firstDueCompany,
      riskLevel: plan.riskLevel,
      priority: plan.riskLevel === "High" ? "high" : "normal",
      assignedPlannerName: "Marshal G. Inspector",
      sectionAnswers: plan.answers,
      hazards: plan.hazards,
    }, audit);
    if (status === "operational" || status === "verification_due") {
      await publishPreplanRevision(departmentId, id, audit);
      if (status === "verification_due") {
        await updatePreplan(departmentId, id, { operationalValidity: "verification_due", status: "verification_due", verificationDueAt: daysAhead(now, 9) }, audit);
      }
    } else if (status !== "draft") {
      await updatePreplan(departmentId, id, { status }, audit);
    }
  }
  await buildPreplan(PREPLANS[0], 1);
  await Promise.all(PREPLANS.slice(1).map((entry, index) => buildPreplan(entry, index + 2)));
}
