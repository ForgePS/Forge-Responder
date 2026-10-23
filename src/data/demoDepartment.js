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
  isDemo: true
};
