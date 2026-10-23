import {
  Flame, Stethoscope, LifeBuoy, Biohazard, Trees, Users, Building2, Truck,
  ClipboardList, FileText, Paperclip, CheckCircle2, Send, MapPin, Radio,
  LayoutDashboard, DollarSign, Zap, Search, Link2, ClipboardCheck,
} from "lucide-react";

/** @typedef {{ id: string, label: string, icon: import('react').ComponentType, moduleId?: string, workspaceKey?: string, group?: string }} NerisSection */

export const NERIS_WORKSPACE_SECTIONS = [
  { id: "overview", label: "Overview", icon: LayoutDashboard, group: "core" },
  { id: "cad", label: "CAD Details", icon: Radio, workspaceKey: "cad", group: "core" },
  { id: "incident", label: "Incident Information", icon: FileText, moduleId: "core_mod_incident", group: "core" },
  { id: "location", label: "Location / Occupancy", icon: MapPin, workspaceKey: "location", group: "core" },
  { id: "units", label: "Units & Apparatus", icon: Truck, workspaceKey: "units", group: "response" },
  { id: "personnel", label: "Personnel / Staffing", icon: Users, workspaceKey: "personnel", group: "response" },
  { id: "fire", label: "Fire Details", icon: Flame, moduleId: "mod_fire", group: "discipline" },
  { id: "ems", label: "EMS Details", icon: Stethoscope, workspaceKey: "ems", group: "discipline" },
  { id: "rescue", label: "Rescue Details", icon: LifeBuoy, workspaceKey: "rescue", group: "discipline" },
  { id: "hazmat", label: "HazMat Details", icon: Biohazard, moduleId: "mod_hazard", group: "discipline" },
  { id: "wildland", label: "Wildland Details", icon: Trees, workspaceKey: "wildland", group: "discipline" },
  { id: "casualties", label: "Casualties", icon: Users, workspaceKey: "casualties", group: "outcomes" },
  { id: "property_loss", label: "Property Loss", icon: DollarSign, workspaceKey: "propertyLoss", group: "outcomes" },
  { id: "actions", label: "Actions Taken", icon: Zap, workspaceKey: "actions", group: "outcomes" },
  { id: "narrative", label: "Narrative", icon: ClipboardList, workspaceKey: "narrative", group: "documentation" },
  { id: "attachments", label: "Attachments", icon: Paperclip, workspaceKey: "attachments", group: "documentation" },
  { id: "review", label: "Review & Approval", icon: CheckCircle2, workspaceKey: "approvals", group: "workflow" },
  { id: "submission", label: "Submission", icon: Send, workspaceKey: "submission", group: "workflow" },
  { id: "associated", label: "Associated Records", icon: Link2, group: "workflow" },
];

/** Enterprise sidebar navigation — maps to reference mockup sections */
export const NERIS_SIDEBAR_NAV = [
  {
    id: "response",
    label: "Response",
    icon: Radio,
    sectionIds: ["overview", "cad", "incident"],
    tabs: [
      { id: "cad", label: "Dispatch" },
      { id: "overview", label: "Overview" },
      { id: "incident", label: "Incident Info" },
    ],
  },
  {
    id: "apparatus",
    label: "Apparatus",
    icon: Truck,
    sectionIds: ["units"],
    tabs: [{ id: "units", label: "Units & Apparatus" }],
  },
  {
    id: "sizeup",
    label: "Size-up",
    icon: Building2,
    sectionIds: ["location"],
    tabs: [{ id: "location", label: "Location / Occupancy" }],
  },
  {
    id: "people",
    label: "People Involved",
    icon: Users,
    sectionIds: ["personnel", "casualties"],
    tabs: [
      { id: "personnel", label: "Personnel" },
      { id: "casualties", label: "Casualties" },
    ],
  },
  {
    id: "operations",
    label: "Operations",
    icon: Flame,
    sectionIds: ["fire", "ems", "rescue", "hazmat", "wildland", "actions", "property_loss"],
    tabs: [
      { id: "fire", label: "Fire" },
      { id: "ems", label: "EMS" },
      { id: "rescue", label: "Rescue" },
      { id: "hazmat", label: "HazMat" },
      { id: "wildland", label: "Wildland" },
      { id: "actions", label: "Actions Taken" },
      { id: "property_loss", label: "Property Loss" },
    ],
  },
  {
    id: "information",
    label: "Information",
    icon: ClipboardList,
    sectionIds: ["narrative"],
    tabs: [{ id: "narrative", label: "Narrative" }],
  },
  {
    id: "wrapup",
    label: "Wrap-up",
    icon: ClipboardCheck,
    sectionIds: ["review", "submission"],
    tabs: [
      { id: "review", label: "Review & Approval" },
      { id: "submission", label: "Submission" },
    ],
  },
  {
    id: "attachments",
    label: "Attachments",
    icon: Paperclip,
    sectionIds: ["attachments"],
    tabs: [{ id: "attachments", label: "Attachments" }],
  },
  {
    id: "investigations",
    label: "Investigations",
    icon: Search,
    sectionIds: ["investigations"],
    tabs: [{ id: "investigations", label: "Investigations" }],
  },
  {
    id: "associated",
    label: "Associated Records",
    icon: Link2,
    sectionIds: ["associated"],
    tabs: [{ id: "associated", label: "Associated Records" }],
  },
];

const FIRE_TYPES = /STRUCTURE_FIRE|OUTSIDE_FIRE|VEHICLE_FIRE|CONFINED_COOKING|CHIMNEY/i;
const EMS_TYPES = /MEDICAL|EMS|CARDIAC|OVERDOSE|SEIZURE|TRAUMA/i;
const HAZMAT_TYPES = /HAZMAT|HAZSIT|CHEMICAL|SPILL/i;
const WILDLAND_TYPES = /WILDLAND|BRUSH|VEGETATION|OUTSIDE_FIRE/i;
const RESCUE_TYPES = /RESCUE|EXTRICATION|MVA|ENTRAPMENT|WATER_RESCUE/i;

/**
 * Resolve which workspace sections apply to a report.
 * @param {Record<string, unknown>} report
 */
export function resolveApplicableSections(report = {}) {
  const modules = report.modules || {};
  const core = modules.core_mod_incident || {};
  const workspace = report.workspace || {};
  const typeRaw = core.incident_final_type || report.incidentTypeSummary || "";
  const types = Array.isArray(typeRaw) ? typeRaw : [typeRaw];
  const typeStr = types.join(" ").toUpperCase();
  const disciplines = report.disciplines || workspace.disciplines || [];

  const fireInvolved = core.fire === "True" || core.fire === true || FIRE_TYPES.test(typeStr)
    || disciplines.includes("fire");
  const emsInvolved = core.medical === "True" || core.medical === true || EMS_TYPES.test(typeStr)
    || disciplines.includes("ems");
  const hazmatInvolved = core.hazsit === "True" || core.hazsit === true || HAZMAT_TYPES.test(typeStr)
    || disciplines.includes("hazmat");
  const wildlandInvolved = WILDLAND_TYPES.test(typeStr) || disciplines.includes("wildland")
    || Boolean(workspace.wildland?.acresBurned);
  const rescueInvolved = RESCUE_TYPES.test(typeStr) || disciplines.includes("rescue");
  const hasCasualties = core.incident_people_present === "True" || Boolean(workspace.casualties?.count);

  const hidden = new Set();
  if (!fireInvolved) hidden.add("fire");
  if (!emsInvolved) hidden.add("ems");
  if (!hazmatInvolved) hidden.add("hazmat");
  if (!wildlandInvolved) hidden.add("wildland");
  if (!rescueInvolved) hidden.add("rescue");
  if (!hasCasualties && !fireInvolved && !emsInvolved) hidden.add("casualties");

  return NERIS_WORKSPACE_SECTIONS.filter((section) => !hidden.has(section.id));
}

/**
 * Resolve sidebar items with filtered tabs based on applicable sections.
 * @param {Record<string, unknown>} report
 */
export function resolveApplicableSidebar(report = {}) {
  const applicable = new Set(resolveApplicableSections(report).map((s) => s.id));
  applicable.add("associated");
  applicable.add("investigations");

  return NERIS_SIDEBAR_NAV.map((item) => {
    const tabs = item.tabs.filter((tab) => applicable.has(tab.id));
    if (!tabs.length) return null;
    return { ...item, tabs };
  }).filter(Boolean);
}

/**
 * Find sidebar item containing a section id.
 * @param {string} sectionId
 */
export function findSidebarForSection(sectionId) {
  return NERIS_SIDEBAR_NAV.find((item) => item.sectionIds.includes(sectionId));
}

/**
 * @param {string} sectionId
 * @param {Record<string, unknown>} report
 */
export function isSectionRequired(sectionId, report = {}) {
  const applicable = resolveApplicableSections(report);
  if (!applicable.some((s) => s.id === sectionId)) return false;

  const modules = report.modules || {};
  const core = modules.core_mod_incident || {};

  const requiredMap = {
    overview: false,
    cad: false,
    incident: true,
    location: true,
    units: true,
    personnel: false,
    fire: Boolean(core.fire === "True" || FIRE_TYPES.test(String(core.incident_final_type || ""))),
    ems: Boolean(core.medical === "True" || EMS_TYPES.test(String(core.incident_final_type || ""))),
    rescue: RESCUE_TYPES.test(String(core.incident_final_type || "")),
    hazmat: Boolean(core.hazsit === "True"),
    wildland: WILDLAND_TYPES.test(String(core.incident_final_type || "")),
    casualties: core.incident_people_present === "True",
    property_loss: false,
    actions: true,
    narrative: true,
    attachments: false,
    review: false,
    submission: report.status === "Ready for Submission" || report.status === "Approved",
    investigations: false,
    associated: false,
  };
  return Boolean(requiredMap[sectionId]);
}

/**
 * Aggregate section status for a sidebar item.
 * @param {Record<string, string>} sectionStatus
 * @param {string[]} sectionIds
 */
export function aggregateSidebarStatus(sectionStatus, sectionIds) {
  if (sectionIds.some((id) => sectionStatus[id] === "error")) return "error";
  if (sectionIds.some((id) => sectionStatus[id] === "warning")) return "warning";
  if (sectionIds.every((id) => sectionStatus[id] === "complete" || sectionStatus[id] === "na")) return "complete";
  return "pending";
}

export { Building2 };
