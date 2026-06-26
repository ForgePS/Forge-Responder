export function withTenantRecordFields(data = {}, options = {}) {
  const {
    departmentId,
    userId = "system",
    status = "active",
    source = "manual"
  } = options;
  const now = new Date().toISOString();

  return {
    ...data,
    departmentId,
    status: data.status || status,
    source: data.source || source,
    version: data.version || 1,
    createdAt: data.createdAt || now,
    createdBy: data.createdBy || userId,
    updatedAt: now,
    updatedBy: userId
  };
}

export function withTenantListPayload(items = [], options = {}) {
  const now = new Date().toISOString();
  return {
    items,
    departmentId: options.departmentId,
    updated_at: now,
    updatedAt: now,
    updatedBy: options.userId || "system",
    version: 1
  };
}
