function normalizeGatewayDepartmentId(value = "") {
  return String(value || "").trim().toLowerCase();
}

async function resolveGatewayDepartmentId(db, gatewayDepartmentId) {
  const gatewayId = normalizeGatewayDepartmentId(gatewayDepartmentId);
  if (!gatewayId) return null;

  const gatewaySnap = await db.doc(`rmsGateways/${gatewayId}`).get();
  if (gatewaySnap.exists) {
    const data = gatewaySnap.data() || {};
    if (data.status === "disabled") return null;
    const departmentId = normalizeGatewayDepartmentId(data.departmentId || gatewayId);
    return { gatewayId, departmentId, label: data.departmentName || data.label || departmentId };
  }

  const departmentSnap = await db.doc(`platformDepartments/${gatewayId}`).get();
  if (departmentSnap.exists) {
    const data = departmentSnap.data() || {};
    if (data.status === "disabled") return null;
    return {
      gatewayId,
      departmentId: gatewayId,
      label: data.name || data.shortName || gatewayId,
    };
  }

  // Horn Lake production gateway matches department id directly.
  if (gatewayId === "horn-lake-fd") {
    return { gatewayId, departmentId: gatewayId, label: "Horn Lake Fire Department" };
  }

  return null;
}

module.exports = {
  normalizeGatewayDepartmentId,
  resolveGatewayDepartmentId,
};
