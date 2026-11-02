import { ADMIN_MODULE_OPTIONS } from "./adminRegistry.js";
import { DEFAULT_DEMO_DEPARTMENT_LOGO_PATH, resolveDepartmentLogoUrl } from "../lib/brandAssets.js";
import { defaultStationDetails } from "../lib/stationProfile.js";
import { DEMO_DEPARTMENT_ID } from "../lib/tenantPaths.js";

export function mapDemoDepartmentProfile(remoteProfile = {}) {
  return {
    ...demoDepartmentProfile,
    ...remoteProfile,
    id: DEMO_DEPARTMENT_ID,
    logoUrl: resolveDepartmentLogoUrl(DEFAULT_DEMO_DEPARTMENT_LOGO_PATH)
  };
}

export const demoDepartmentProfile = {
  id: DEMO_DEPARTMENT_ID,
  name: "Riverside Fire & EMS",
  shortName: "Riverside Demo",
  displayTitle: "Riverside Fire & EMS",
  productTitle: "FORGE RMS Demo",
  themeName: "Riverside Fire & EMS",
  branchLabel: "Training Demo Branch",
  logoUrl: DEFAULT_DEMO_DEPARTMENT_LOGO_PATH,
  timezone: "America/Chicago",
  address: "1200 Riverfront Parkway, Riverside, MS",
  stateId: "MS",
  contactEmail: "demo@forge.demo",
  contactPhone: "(555) 555-0100",
  stations: ["Station 1", "Station 2", "Station 3"],
  stationDetails: defaultStationDetails(["Station 1", "Station 2", "Station 3"]),
  shifts: ["A Shift", "B Shift", "C Shift", "Day Staff"],
  status: "active",
  isDemo: true
};

import { defaultSubscriptionDates } from "../lib/subscriptionUtils.js";

export const demoDepartmentSettings = {
  departmentId: DEMO_DEPARTMENT_ID,
  enabledModules: ADMIN_MODULE_OPTIONS.map((module) => module.key),
  platform: {
    name: "FORGE",
    tagline: "ONE PLATFORM. ONE MISSION.",
    logoUrl: "/forge-logo.png"
  },
  subscription: defaultSubscriptionDates(),
  // Matches the demo roster in demoSeeds.js: 14 members per shift, 13 required on duty.
  schedulingSettings: {
    displayApparatus: ["Battalion 1", "Engine 1", "Engine 2", "Truck 3", "Medic 1", "Medic 2"],
    crewSlotsByUnit: {
      "Battalion 1": ["Battalion Chief"],
      "Engine 1": ["Captain", "Driver", "Firefighter"],
      "Engine 2": ["Lieutenant", "Driver", "Firefighter"],
      "Truck 3": ["Lieutenant", "Driver", "Firefighter"],
      "Medic 1": ["Paramedic", "EMT/Driver"],
      "Medic 2": ["Paramedic", "EMT/Driver"]
    },
    minimumStaffing: 13
  },
  isDemo: true
};
