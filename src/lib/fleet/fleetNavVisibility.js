// Fleet pages that are still scaffolding (simulated integrations, automations that
// only log, staff checklists). Only FORGE staff (platform creators) see them in
// the menu and the Fleet tab bar; departments see the working pages.
export const FLEET_STAFF_ONLY_PAGES = new Set([
  "Fleet Dashboard",
  "Components & Warranty",
  "Fleet Operations",
  "Accident & Risk",
  "Fleet Procurement",
  "Cost & Replacement",
  "Reporting & Automation",
  "Vendor Portal",
  "Fleet Hardening",
]);

export function isFleetPageVisible(pageName = "", isCreator = false) {
  return isCreator || !FLEET_STAFF_ONLY_PAGES.has(pageName);
}
