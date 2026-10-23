import { createRecord, listRecords, updateRecord } from "./firestoreService.js";

export async function resolveUserUidForPersonnel(departmentId, personnelId = "") {
  const normalizedPersonnelId = String(personnelId || "").trim();
  if (!departmentId || !normalizedPersonnelId) return "";

  const users = await listRecords(departmentId, "users");
  const match = users.find((user) => String(user.personnelId || "").trim() === normalizedPersonnelId);
  return String(match?.uid || "").trim();
}

export async function createNotification(departmentId, notification) {
  const id = `NTF-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  return createRecord(departmentId, "notifications", id, {
    id,
    userId: notification.userId,
    title: notification.title,
    message: notification.message,
    module: notification.module || "System",
    recordId: notification.recordId || "",
    personnelId: notification.personnelId || "",
    status: "unread",
    created_at: new Date().toISOString()
  });
}

export async function createPersonnelNotification(departmentId, personnelId, notification) {
  const uid = await resolveUserUidForPersonnel(departmentId, personnelId);
  return createNotification(departmentId, {
    ...notification,
    userId: uid || "all",
    personnelId: personnelId || "",
  });
}

export async function listUserNotifications(departmentId, userId) {
  const all = await listRecords(departmentId, "notifications");
  return all
    .filter((item) => !userId || item.userId === userId || item.userId === "all")
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
}

export async function markNotificationRead(departmentId, notificationId) {
  return updateRecord(departmentId, "notifications", notificationId, { status: "read" });
}
