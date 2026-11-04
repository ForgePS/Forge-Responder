/**
 * Demo only: view the Riverside demo as a different member and role.
 *
 * Every visitor shares one demo sign-in, so the choice is kept in this browser
 * tab (sessionStorage) and applied on top of the demo membership — never written
 * to the shared account. The app then shows exactly what that role can open.
 */

export const DEMO_PERSONAS = [
  {
    id: "chief", label: "Fire Chief", roleId: "fireChief", personnelId: "DEMO-001",
    name: "Chief A. Sample", shift: "Administration", station: "Station 1",
    description: "Everything: admin, approvals, setup.",
  },
  {
    id: "battalion", label: "Battalion Chief", roleId: "battalionChief", personnelId: "DEMO-025",
    name: "Battalion Y. Showcase", shift: "C Shift", station: "Station 1",
    description: "Shift command: schedule, approvals, fleet status.",
  },
  {
    id: "captain", label: "Captain", roleId: "companyOfficer", personnelId: "DEMO-026",
    name: "Captain Z. Trial", shift: "C Shift", station: "Station 1",
    description: "Company officer: crew, reports, preplans.",
  },
  {
    id: "firefighter", label: "Firefighter", roleId: "firefighter", personnelId: "DEMO-028",
    name: "Firefighter B. Specimen", shift: "C Shift", station: "Station 1",
    description: "Employee portal: schedule, leave, checks.",
  },
];

const KEY = "forge-demo-persona";

export function getDemoPersona() {
  let id = "chief";
  try {
    id = window.sessionStorage.getItem(KEY) || "chief";
  } catch {
    // Storage blocked: stay on the Fire Chief view.
  }
  return DEMO_PERSONAS.find((persona) => persona.id === id) || DEMO_PERSONAS[0];
}

export function setDemoPersona(id = "chief") {
  try {
    window.sessionStorage.setItem(KEY, id);
  } catch {
    // Storage blocked: the switch won't stick, but nothing breaks.
  }
}

/**
 * The shared demo account. The app's loaded membership keeps only some fields
 * (isDemoUser is dropped), so also match on the demo department and its email.
 * Platform creators viewing the demo are never switched.
 */
function isDemoMembership(membership) {
  if (!membership || membership.isPlatformCreator) return false;
  if (membership.isDemoUser) return true;
  return membership.departmentId === "forge-demo"
    && String(membership.email || "").trim().toLowerCase() === "demo@forge.demo";
}

/** The demo membership as the chosen persona (unchanged outside the demo or for the Fire Chief). */
export function applyDemoPersona(membership) {
  if (!isDemoMembership(membership)) return membership;
  const persona = getDemoPersona();
  if (persona.id === "chief") return membership;
  return {
    ...membership,
    role: persona.roleId,
    roleIds: [persona.roleId],
    personnelId: persona.personnelId,
    displayName: persona.name,
    assignedShift: persona.shift,
    assignedStation: persona.station,
    // Show the role exactly: no per-member overrides carried over from the demo account.
    permissions: {},
    demoPersona: persona.id,
  };
}
