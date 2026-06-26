import { MODULE_DATASETS } from "./moduleDatasets.js";
import { CREATOR_PERMISSIONS } from "./creatorPermissions.js";

export const ADMIN_MODULE_OPTIONS = [
  { key: "dashboard", label: "Dashboard" },
  { key: "personnel", label: "Personnel" },
  { key: "certifications", label: "Certifications" },
  { key: "training", label: "Training" },
  { key: "scheduling", label: "Scheduling" },
  { key: "shiftTrades", label: "Shift Trades" },
  { key: "apparatus", label: "Apparatus" },
  { key: "assets", label: "Assets" },
  { key: "maintenance", label: "Maintenance" },
  { key: "hoseTesting", label: "Hose Testing" },
  { key: "occupancies", label: "Occupancies" },
  { key: "inspections", label: "Inspections" },
  { key: "preplans", label: "Preplans" },
  { key: "hydrants", label: "Hydrants" },
  { key: "documents", label: "Documents" },
  { key: "analytics", label: "Analytics" },
  { key: "administration", label: "System Admin" }
];

export const ADMIN_COLLECTIONS = [
  { key: "users", label: "Users", description: "Login accounts, roles, and personnel links" },
  { key: "roles", label: "Roles", description: "Role names, descriptions, and permission sets" },
  { key: "dropdowns", label: "Dropdowns", description: "Managed dropdown definitions and options" },
  { key: "notifications", label: "Notifications", description: "In-app notification records" }
];

export const ADMIN_PERMISSION_KEYS = Object.keys(CREATOR_PERMISSIONS);

export const ADMIN_OVERVIEW_SECTIONS = [
  {
    id: "department",
    title: "Department & Branding",
    description: "Display title, logo path, contact info, stations, shifts, and enabled modules"
  },
  {
    id: "modules",
    title: "Module Data",
    description: `${MODULE_DATASETS.length} operational datasets — personnel, fleet, prevention, documents, scheduling`
  },
  {
    id: "records",
    title: "System Records",
    description: "Users, roles, dropdowns, and notifications — every field editable"
  },
  {
    id: "permissions",
    title: "Permissions",
    description: "Role permission matrix across the platform"
  },
  {
    id: "audit",
    title: "Audit Logs",
    description: "Change history across all modules"
  }
];

export { MODULE_DATASETS };
