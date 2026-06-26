import { doc, getDoc } from "firebase/firestore";
import { defaultDepartmentProfile } from "../data/defaultDepartment.js";
import { demoDepartmentProfile } from "../data/demoDepartment.js";
import { resolveDepartmentLogoUrl } from "./brandAssets.js";
import { getFirestoreDb } from "./firebaseClient.js";
import { DEFAULT_DEPARTMENT_ID, DEMO_DEPARTMENT_ID } from "./tenantPaths.js";
import { normalizeGatewayDepartmentId } from "./gatewayRouting.js";

const STATIC_GATEWAYS = {
  [DEFAULT_DEPARTMENT_ID]: {
    gatewayId: DEFAULT_DEPARTMENT_ID,
    departmentId: DEFAULT_DEPARTMENT_ID,
    label: defaultDepartmentProfile.name,
    departmentName: defaultDepartmentProfile.name,
    departmentShortName: defaultDepartmentProfile.shortName,
    logoUrl: defaultDepartmentProfile.logoUrl,
    status: "active"
  },
  [DEMO_DEPARTMENT_ID]: {
    gatewayId: DEMO_DEPARTMENT_ID,
    departmentId: DEMO_DEPARTMENT_ID,
    label: "FORGE RMS Demo",
    departmentName: demoDepartmentProfile.name,
    departmentShortName: demoDepartmentProfile.shortName,
    logoUrl: demoDepartmentProfile.logoUrl,
    status: "active"
  }
};

function mapGatewayRecord(gatewayDepartmentId, data = {}) {
  const gatewayId = normalizeGatewayDepartmentId(data.gatewayId || data.departmentId || gatewayDepartmentId);
  const departmentId = normalizeGatewayDepartmentId(data.departmentId || gatewayId);
  return {
    gatewayId,
    departmentId,
    label: data.label || data.departmentName || departmentId,
    departmentName: data.departmentName || "",
    departmentShortName: data.departmentShortName || data.departmentName || "",
    logoUrl: resolveDepartmentLogoUrl(data.logoUrl || ""),
    status: data.status || "active"
  };
}

export async function resolveGatewayDepartmentId(gatewayDepartmentId) {
  const gatewayId = normalizeGatewayDepartmentId(gatewayDepartmentId);
  if (!gatewayId) return null;

  if (STATIC_GATEWAYS[gatewayId]) {
    return mapGatewayRecord(gatewayId, STATIC_GATEWAYS[gatewayId]);
  }

  const db = getFirestoreDb();
  if (!db) return null;

  const snap = await getDoc(doc(db, "rmsGateways", gatewayId));
  if (snap.exists()) {
    const record = mapGatewayRecord(gatewayId, snap.data());
    if (record.status === "disabled") return null;
    return record;
  }

  const departmentSnap = await getDoc(doc(db, "platformDepartments", gatewayId));
  if (departmentSnap.exists() && departmentSnap.data()?.status !== "disabled") {
    const dept = departmentSnap.data();
    return mapGatewayRecord(gatewayId, {
      gatewayId,
      departmentId: gatewayId,
      departmentName: dept.name || gatewayId,
      departmentShortName: dept.shortName || dept.name || gatewayId,
      status: dept.status || "active"
    });
  }

  return null;
}
