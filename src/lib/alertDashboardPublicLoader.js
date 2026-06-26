import { doc, getDoc, setDoc } from "firebase/firestore";
import { resolveGatewayDepartmentId } from "./gatewayService.js";
import { getFirestoreDb } from "./firebaseClient.js";
import { LIST_KEYS } from "./tenantListKeys.js";
import { sanitizeActive911Alert } from "./alertDashboard.js";

const PUBLIC_DOC_PATH = "alert-dashboard";

async function loadListItems(db, departmentId, listKey) {
  const snap = await getDoc(doc(db, "departments", departmentId, "lists", listKey));
  if (!snap.exists()) return [];
  const data = snap.data() || {};
  return Array.isArray(data.items) ? data.items : [];
}

export async function loadPublicAlertDashboardFromFirestore(gatewaySlug = "") {
  const db = getFirestoreDb();
  if (!db) throw new Error("Firebase is not configured.");

  const gateway = await resolveGatewayDepartmentId(gatewaySlug);
  if (!gateway?.departmentId) throw new Error("RMS portal not found.");

  const { departmentId } = gateway;
  const [alerts, configItems, businessDirectory, displays, publicSnap] = await Promise.all([
    loadListItems(db, departmentId, LIST_KEYS.active911Alerts),
    loadListItems(db, departmentId, LIST_KEYS.alertDashboardConfig),
    loadListItems(db, departmentId, LIST_KEYS.alertBusinessDirectory),
    loadListItems(db, departmentId, LIST_KEYS.digitalDashboardDisplays),
    getDoc(doc(db, "departments", departmentId, "public", PUBLIC_DOC_PATH)),
  ]);

  const publicData = publicSnap.exists() ? (publicSnap.data() || {}) : {};
  const stationDetails = Array.isArray(publicData.stationDetails) ? publicData.stationDetails : [];

  return {
    gatewayId: gateway.gatewayId,
    departmentId,
    departmentName: publicData.departmentName || gateway.departmentName || gateway.label || departmentId,
    logoUrl: publicData.logoUrl || gateway.logoUrl || "",
    alerts: alerts.map(sanitizeActive911Alert),
    configItems: configItems.length ? configItems : [{ id: "config" }],
    businessDirectory,
    displays: displays.map((display) => ({
      id: display.id || "",
      name: display.name || "",
      station: display.station || "",
    })),
    profile: { stationDetails },
    mapsJsApiKey: publicData.mapsJsApiKey || "",
  };
}

export async function savePublicAlertDashboardDoc(departmentId = "", patch = {}) {
  const db = getFirestoreDb();
  if (!db || !departmentId) return null;

  const ref = doc(db, "departments", departmentId, "public", PUBLIC_DOC_PATH);
  const payload = {
    ...patch,
    departmentId,
    updatedAt: new Date().toISOString(),
  };
  await setDoc(ref, payload, { merge: true });
  return payload;
}
