import { DEFAULT_PLATFORM_LOGO_PATH } from "../lib/brandAssets.js";
import { defaultSubscriptionDates } from "../lib/subscriptionUtils.js";
import { defaultStationDetails } from "../lib/stationProfile.js";
import { defaultShiftRotation } from "./defaultShiftRotation.js";
import { defaultPayPeriod } from "../lib/payPeriods.js";
import { defaultEmployeePortalRules } from "../lib/employeePortalRules.js";
import { defaultPayRules } from "../lib/payRules.js";
import { defaultSchedulingSettings } from "../lib/schedulingSettings.js";
import { defaultDailyLogSettings } from "../lib/dailyLogSettings.js";
import { defaultCallShiftRules } from "../lib/callShiftRules.js";

export function createDepartmentProfileTemplate(departmentId = "", overrides = {}) {
  const name = overrides.name || "Fire Department";
  return {
    id: departmentId,
    name,
    shortName: overrides.shortName || name,
    displayTitle: overrides.displayTitle || name,
    productTitle: "FORGE RMS",
    themeName: overrides.themeName || name,
    branchLabel: "Department Branch",
    logoUrl: overrides.logoUrl || DEFAULT_PLATFORM_LOGO_PATH,
    timezone: overrides.timezone || "America/Chicago",
    address: overrides.address || "",
    stateId: overrides.stateId || "",
    contactEmail: overrides.contactEmail || "",
    contactPhone: overrides.contactPhone || "",
    stations: overrides.stations || ["Station 1"],
    stationDetails: overrides.stationDetails || defaultStationDetails(overrides.stations || ["Station 1"]),
    shifts: overrides.shifts || ["A Shift", "B Shift", "C Shift"],
    status: overrides.status || "active",
    ...overrides,
    id: departmentId,
  };
}

export function createDepartmentSettingsTemplate(departmentId = "", overrides = {}) {
  return {
    departmentId,
    enabledModules: overrides.enabledModules || [
      "dashboard",
      "personnel",
      "certifications",
      "training",
      "scheduling",
      "timeSheets",
      "dailyLog",
      "apparatus",
      "assets",
      "maintenance",
      "hoseTesting",
      "occupancies",
      "inspections",
      "preplans",
      "hydrants",
      "nerisFireReports",
      "documents",
      "analytics",
      "internalEmail",
      "digitalDashboard",
      "administration",
    ],
    platform: overrides.platform || {
      name: "FORGE",
      tagline: "ONE PLATFORM. ONE MISSION.",
      logoUrl: "/forge-logo.png",
    },
    shiftRotation: overrides.shiftRotation || defaultShiftRotation,
    payPeriod: overrides.payPeriod || defaultPayPeriod,
    employeePortalRules: overrides.employeePortalRules || defaultEmployeePortalRules,
    payRules: overrides.payRules || defaultPayRules,
    schedulingSettings: overrides.schedulingSettings || defaultSchedulingSettings,
    dailyLogSettings: overrides.dailyLogSettings || defaultDailyLogSettings,
    callShiftRules: overrides.callShiftRules || defaultCallShiftRules,
    nerisFeatures: overrides.nerisFeatures || {
      nerisAdvancedValidation: true,
      incidentAutoPopulation: true,
      aiNarrativeBuilder: true,
      offlineIncidentReports: true,
      officerApprovalWorkflow: true,
      enhancedEmsModule: true,
      irwinWildlandIntegration: false,
      nfpa1710Analytics: true,
      nfpaAnnualSurvey: true,
      incidentHeatMapping: true,
      adHocIncidentReporting: true,
    },
    internalEmailGroups: overrides.internalEmailGroups || [],
    subscription: overrides.subscription || defaultSubscriptionDates(),
    ...overrides,
    departmentId,
  };
}

/** Generic platform defaults for new departments (not Horn Lake). */
export const defaultDepartmentProfile = createDepartmentProfileTemplate();
export const defaultDepartmentSettings = createDepartmentSettingsTemplate();

export const defaultSystemRoles = [
  "system_owner",
  "department_admin",
  "fire_chief",
  "deputy_chief",
  "battalion_chief",
  "company_officer",
  "firefighter",
  "inspector",
  "read_only",
];
