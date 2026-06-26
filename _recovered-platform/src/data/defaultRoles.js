export const defaultRoles = [
  {
    id: "fireChief",
    name: "Fire Chief",
    description: "Full administrative access",
    permissions: {
      manageUsers: true,
      manageRoles: true,
      managePermissions: true,
      manageDropdowns: true,
      manageSystemSettings: true,
      viewAuditLogs: true,
      viewPersonnel: true,
      editPersonnel: true,
      viewCertifications: true,
      editCertifications: true,
      viewTraining: true,
      editTraining: true,
      viewSchedule: true,
      editSchedule: true,
      viewApparatus: true,
      editApparatus: true,
      viewAssets: true,
      editAssets: true,
      viewDocuments: true,
      editDocuments: true,
      viewInspections: true,
      editInspections: true,
      accessAdminRms: true,
      accessEmployeePortal: true
    }
  },
  {
    id: "firefighter",
    name: "Firefighter",
    description: "Employee portal access",
    permissions: {
      viewPersonnel: false,
      viewCertifications: true,
      viewTraining: true,
      viewSchedule: true,
      viewDocuments: true,
      accessAdminRms: false,
      accessEmployeePortal: true,
      submitLeaveRequests: true,
      submitShiftTrades: true,
      submitMaintenanceIssues: true
    }
  },
  {
    id: "readOnly",
    name: "Read Only",
    description: "View-only administrative access",
    permissions: {
      viewPersonnel: true,
      viewCertifications: true,
      viewTraining: true,
      viewSchedule: true,
      viewApparatus: true,
      viewAssets: true,
      viewDocuments: true,
      viewInspections: true,
      accessAdminRms: true,
      accessEmployeePortal: false
    }
  },
  {
    id: "itAdmin",
    name: "IT Admin",
    description: "System and user administration",
    permissions: {
      manageUsers: true,
      manageRoles: true,
      managePermissions: true,
      manageDropdowns: true,
      manageSystemSettings: true,
      viewAuditLogs: true,
      accessAdminRms: true,
      accessEmployeePortal: true
    }
  }
];

export const legacyRoleMap = {
  department_admin: "fireChief",
  system_owner: "fireChief",
  fire_chief: "fireChief",
  read_only: "readOnly",
  firefighter: "firefighter"
};
