import { MODULE_DATASETS } from "./moduleDatasets.js";
import { CREATOR_PERMISSIONS } from "./creatorPermissions.js";

export const NAV_MODULE_MAP = {
  Dashboard: "dashboard",
  Personnel: "personnel",
  Certifications: "certifications",
  Training: "training",
  Scheduling: "scheduling",
  "Time Sheets": "timeSheets",
  "Daily Log": "dailyLog",
  Apparatus: "apparatus",
  Assets: "assets",
  Maintenance: "maintenance",
  "Hose Testing": "hoseTesting",
  Occupancies: "occupancies",
  Inspections: "inspections",
  Preplans: "preplans",
  Hydrants: "hydrants",
  "NERIS Fire Reports": "nerisFireReports",
  "NERIS Analytics": "nerisFireReports",
  "SOGs / Policies": "documents",
  "EMS Protocols": "documents",
  Forms: "documents",
  Uploads: "documents",
  Analytics: "analytics",
  "NERIS Fire Reports": "nerisFireReports",
  "NERIS Analytics": "nerisFireReports",
  "Messages": "internalEmail",
  "Digital Dashboard": "digitalDashboard",
  "System Admin": "administration"
};

export const ADMIN_MODULE_OPTIONS = [
  { key: "dashboard", label: "Dashboard" },
  { key: "personnel", label: "Personnel" },
  { key: "certifications", label: "Certifications" },
  { key: "training", label: "Training" },
  { key: "scheduling", label: "Scheduling" },
  { key: "timeSheets", label: "Time Sheets" },
  { key: "dailyLog", label: "Daily Log" },
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
  { key: "nerisFireReports", label: "NERIS Fire Reports" },
  { key: "internalEmail", label: "Messages (department inbox)" },
  { key: "digitalDashboard", label: "Digital Dashboard (signage)" },
  { key: "administration", label: "System Admin" }
];

export const ADMIN_COLLECTIONS = [
  { key: "users", label: "Users", description: "Login accounts, roles, and personnel links" },
  { key: "roles", label: "Roles", description: "Role names, descriptions, and permission sets" },
  { key: "dropdowns", label: "Dropdowns", description: "Managed dropdown definitions and options" },
  { key: "notifications", label: "Notifications", description: "In-app notification records" }
];

export const ADMIN_PERMISSION_KEYS = Object.keys(CREATOR_PERMISSIONS);

export const ADMIN_PERMISSION_LABELS = {
  isPlatformCreator: "Platform creator",
  accessAllDepartments: "Access all departments",
  manageDepartments: "Manage departments",
  switchDepartments: "Switch departments",
  manageUsers: "Manage users",
  manageRoles: "Manage roles",
  managePermissions: "Manage permissions",
  manageDropdowns: "Manage dropdowns",
  manageSystemSettings: "Manage system settings",
  viewAuditLogs: "View audit logs",
  viewPersonnel: "View personnel",
  editPersonnel: "Edit personnel",
  viewCertifications: "View certifications",
  editCertifications: "Edit certifications",
  viewTraining: "View training",
  editTraining: "Edit training",
  viewSchedule: "View schedule",
  editSchedule: "Edit schedule",
  viewDailyLog: "View daily log",
  editDailyLog: "Edit daily log",
  viewApparatus: "View apparatus",
  editApparatus: "Edit apparatus",
  viewAssets: "View assets",
  editAssets: "Edit assets",
  viewDocuments: "View documents",
  editDocuments: "Edit documents",
  viewInspections: "View inspections",
  editInspections: "Edit inspections",
  viewNerisReports: "View NERIS fire reports",
  editNerisReports: "Edit NERIS fire reports",
  accessAdminRms: "Access Admin RMS",
  accessEmployeePortal: "Access employee portal",
  submitLeaveRequests: "Submit leave requests",
  submitShiftTrades: "Submit shift trades",
  submitVacancyPickups: "Submit vacancy pickup requests",
  submitMaintenanceIssues: "Submit maintenance issues",
  viewInternalEmail: "View messages",
  sendInternalEmail: "Send messages",
  manageInternalEmail: "Manage messages",
  viewDigitalDashboard: "View digital dashboard",
  editDigitalDashboard: "Edit digital dashboard",
  manageDigitalDashboard: "Manage digital dashboard",
};

export const ADMIN_PERMISSION_GROUPS = [
  {
    label: "Platform",
    keys: ["isPlatformCreator", "accessAllDepartments", "manageDepartments", "switchDepartments"]
  },
  {
    label: "System administration",
    keys: ["manageUsers", "manageRoles", "managePermissions", "manageDropdowns", "manageSystemSettings", "viewAuditLogs"]
  },
  {
    label: "Personnel & training",
    keys: ["viewPersonnel", "editPersonnel", "viewCertifications", "editCertifications", "viewTraining", "editTraining"]
  },
  {
    label: "Scheduling",
    keys: ["viewSchedule", "editSchedule", "viewDailyLog", "editDailyLog"]
  },
  {
    label: "Fleet & assets",
    keys: ["viewApparatus", "editApparatus", "viewAssets", "editAssets"]
  },
  {
    label: "Documents & prevention",
    keys: ["viewDocuments", "editDocuments", "viewInspections", "editInspections", "viewNerisReports", "editNerisReports"]
  },
  {
    label: "Portal access",
    keys: ["accessAdminRms", "accessEmployeePortal", "submitLeaveRequests", "submitShiftTrades", "submitVacancyPickups", "submitMaintenanceIssues"]
  },
  {
    label: "Messages",
    keys: ["viewInternalEmail", "sendInternalEmail", "manageInternalEmail"]
  },
  {
    label: "Digital Dashboard",
    keys: ["viewDigitalDashboard", "editDigitalDashboard", "manageDigitalDashboard"]
  }
];

export function formatPermissionLabel(key) {
  return ADMIN_PERMISSION_LABELS[key] || key;
}

export const ADMIN_OVERVIEW_SECTIONS = [
  {
    id: "department",
    title: "Department & Branding",
    description: "Display title, logo path, contact info, station details, shifts, and enabled modules"
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
