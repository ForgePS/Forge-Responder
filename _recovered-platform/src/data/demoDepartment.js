import { ADMIN_MODULE_OPTIONS } from "./adminRegistry.js";
import { hornLakeLogo } from "../lib/brandAssets.js";
import { DEMO_DEPARTMENT_ID } from "../lib/tenantPaths.js";

export const demoDepartmentProfile = {
  id: DEMO_DEPARTMENT_ID,
  name: "Riverside Fire & EMS",
  shortName: "Riverside Demo",
  displayTitle: "Riverside Fire & EMS",
  productTitle: "FORGE RMS Demo",
  themeName: "Riverside Fire & EMS",
  branchLabel: "Training Demo Branch",
  logoUrl: hornLakeLogo,
  timezone: "America/Chicago",
  address: "1200 Riverfront Parkway, Riverside, MS",
  contactEmail: "demo@forge.demo",
  contactPhone: "(555) 555-0100",
  stations: ["Station 1", "Station 2", "Station 3"],
  shifts: ["A Shift", "B Shift", "C Shift", "Day Staff"],
  status: "active",
  isDemo: true
};

export const demoDepartmentSettings = {
  departmentId: DEMO_DEPARTMENT_ID,
  enabledModules: ADMIN_MODULE_OPTIONS.map((module) => module.key),
  platform: {
    name: "FORGE",
    tagline: "ONE PLATFORM. ONE MISSION.",
    logoUrl: "/forge-logo.png"
  },
  isDemo: true
};
