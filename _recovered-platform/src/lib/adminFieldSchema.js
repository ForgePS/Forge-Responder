import { ADMIN_MODULE_OPTIONS } from "../data/adminRegistry.js";
import { legacyRoleMap } from "../data/defaultRoles.js";

const READONLY_COLUMNS = new Set(["createdat", "updatedat", "created_at", "updated_at"]);

const STATUS_OPTIONS = ["active", "inactive", "disabled", "pending"];
const PRIORITY_OPTIONS = ["Low", "Medium", "High", "Critical"];
const ACK_OPTIONS = ["Pending", "Acknowledged", "Overdue"];
const ACTION_OPTIONS = ["create", "update", "delete", "approve", "reject"];
const NOTIFICATION_USER_OPTIONS = ["all", "admins", "self"];

const COLUMN_ORDER = {
  users: ["id", "uid", "displayName", "email", "status", "role", "roleIds", "personnelId", "departmentId", "isPlatformCreator", "permissions"],
  roles: ["id", "name", "description", "permissions"],
  dropdowns: ["id", "label", "module", "options"],
  notifications: ["id", "title", "message", "module", "userId", "read", "recordId"]
};

export function formatColumnLabel(column = "") {
  return String(column)
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function orderColumns(columns = [], collectionName = "") {
  const order = COLUMN_ORDER[collectionName] || [];
  const unique = Array.from(new Set(columns.filter((col) => col !== "__rowKey")));
  return [
    ...order.filter((col) => unique.includes(col)),
    ...unique.filter((col) => !order.includes(col))
  ];
}

export function splitRecordColumns(columns = [], collectionName = "") {
  const ordered = orderColumns(columns, collectionName);
  const fields = ordered.filter((col) => !READONLY_COLUMNS.has(col.toLowerCase()));
  const meta = ordered.filter((col) => READONLY_COLUMNS.has(col.toLowerCase()));
  return { fields, meta };
}

export function getFieldType(column, value, context = {}) {
  const key = String(column).toLowerCase();
  const { collectionName } = context;

  if (READONLY_COLUMNS.has(key)) return "readonly-datetime";
  if (key === "permissions") return "permissions-link";
  if (key === "options") return "dropdown-options";
  if (key === "roleids") return "role-multi";
  if (key === "status") return "status-select";
  if (key === "role") return "role-select";
  if (key === "module") return "module-select";
  if (key === "priority") return "priority-select";
  if (key === "acknowledgementstatus") return "ack-select";
  if (key === "action") return "action-select";
  if (key === "userid") return "notification-user-select";
  if (key === "active" || key === "read" || key === "isplatformcreator") return "boolean";
  if (typeof value === "boolean") return "boolean";
  if (key === "description" || key === "message" || key === "summary" || key === "notes" || key === "address") {
    return "textarea";
  }
  if (key === "email") return "email";
  if (key === "id" || key === "uid") return "identifier";

  return "text";
}

export function getSelectOptions(fieldType) {
  if (fieldType === "status-select") return STATUS_OPTIONS;
  if (fieldType === "priority-select") return PRIORITY_OPTIONS;
  if (fieldType === "ack-select") return ACK_OPTIONS;
  if (fieldType === "action-select") return ACTION_OPTIONS;
  if (fieldType === "notification-user-select") return NOTIFICATION_USER_OPTIONS;
  if (fieldType === "module-select") {
    return ADMIN_MODULE_OPTIONS.map((item) => item.label);
  }
  if (fieldType === "role-select") {
    return Object.entries(legacyRoleMap).map(([legacy, roleId]) => legacy);
  }
  return [];
}

export function formatReadonlyDate(value) {
  if (!value) return "—";
  const text = String(value);
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return text;
  return date.toLocaleString();
}
