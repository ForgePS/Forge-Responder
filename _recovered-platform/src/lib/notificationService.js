import { createRecord, listRecords, updateRecord } from "./firestoreService.js";

export async function createNotification(departmentId, notification) {
  const id = `NTF-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  return createRecord(departmentId, "notifications", id, {
    id,
    userId: notification.userId,
    title: notification.title,
    message: notification.message,
    module: notification.module || "System",
    recordId: notification.recordId || "",
    status: "unread",
    created_at: new Date().toISOString()
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
