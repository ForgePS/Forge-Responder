import { hornLakeLogo } from "../../lib/brandAssets.js";
import { defaultStationDetails } from "../../lib/stationProfile.js";
import { HORN_LAKE_DEPARTMENT_ID } from "../../lib/tenantPaths.js";
import {
  createDepartmentProfileTemplate,
  createDepartmentSettingsTemplate,
} from "../defaultDepartment.js";

export const hornLakeDepartmentProfile = createDepartmentProfileTemplate(HORN_LAKE_DEPARTMENT_ID, {
  name: "Horn Lake Fire Department",
  shortName: "Horn Lake FD",
  displayTitle: "Horn Lake Fire/EMS",
  themeName: "Horn Lake Fire Department",
  logoUrl: hornLakeLogo,
  timezone: "America/Chicago",
  address: "3101 Goodman Rd W, Horn Lake, MS",
  stateId: "MS",
  contactEmail: "admin@hornlake.org",
  contactPhone: "(662) 555-0100",
  stations: ["Station 1", "Station 2", "Station 3"],
  stationDetails: defaultStationDetails(["Station 1", "Station 2", "Station 3"]),
  shifts: ["A Shift", "B Shift", "C Shift", "Day Staff"],
});

export const hornLakeDepartmentSettings = createDepartmentSettingsTemplate(HORN_LAKE_DEPARTMENT_ID);
