export const SYSTEM_RECORD_EDITOR_CONFIG = {
  users: {
    selectorLabel: "User account",
    newRecordLabel: "New user",
    deleteLabel: "Delete user",
    emptyLabel: "No user accounts yet.",
    createFirstLabel: "Create first user",
    // Department memberships can only be created by accepting an invite
    // (Firestore rules refuse client-side creates), so "New user" is replaced
    // with a pointer to the invite form.
    inviteOnly: true,
    inviteNote: "To add someone, invite them by email from Admin → Permissions → Users. They get access as soon as they accept the invite.",
    inviteLabel: "Invite someone",
    helpText: "Choose a user account above, then edit their details below. Save when finished.",
    loadingText: "Loading user accounts...",
    groupBy: (row) => {
      const status = String(row.status || "unknown");
      return status.charAt(0).toUpperCase() + status.slice(1);
    },
    displayLabel: (row) => row.displayName || row.email || row.id || "Untitled user",
    summary: (row) => [row.email, row.status].filter(Boolean).join(" · "),
    compactFields: ["displayName", "email", "status"],
  },
  roles: {
    selectorLabel: "Role",
    newRecordLabel: "New role",
    deleteLabel: "Delete role",
    emptyLabel: "No roles yet.",
    createFirstLabel: "Create first role",
    helpText: "Choose a role above, then edit its name, description, and permissions link below. Save when finished.",
    loadingText: "Loading roles...",
    groupBy: null,
    displayLabel: (row) => row.name || row.id || "Untitled role",
    summary: (row) => row.description || "No description",
    compactFields: ["name", "description"],
    protectDelete: (row) => row.id === "creator",
  },
  dropdowns: {
    selectorLabel: "Dropdown category",
    newRecordLabel: "New category",
    deleteLabel: "Delete category",
    emptyLabel: "No dropdown categories yet.",
    createFirstLabel: "Create first category",
    helpText: "Choose a dropdown category above, then edit its label, module, and choices below. Save when finished.",
    loadingText: "Loading dropdown categories...",
    groupBy: (row) => row.module || "Other",
    displayLabel: (row) => row.label || row.id || "Untitled dropdown",
    summary: (row) => {
      const count = Array.isArray(row.options) ? row.options.length : 0;
      return `${row.module || "Unassigned module"} · ${count} option${count === 1 ? "" : "s"}`;
    },
    compactFields: ["label", "module", "id"],
  },
  notifications: {
    selectorLabel: "Notification",
    newRecordLabel: "New notification",
    deleteLabel: "Delete notification",
    emptyLabel: "No notifications yet.",
    createFirstLabel: "Create first notification",
    helpText: "Choose a notification above, then edit its details below. Save when finished.",
    loadingText: "Loading notifications...",
    groupBy: (row) => row.module || "Other",
    displayLabel: (row) => row.title || row.id || "Untitled notification",
    summary: (row) => {
      const preview = String(row.message || "").trim();
      return preview.length > 72 ? `${preview.slice(0, 72)}…` : preview;
    },
    compactFields: ["title", "module"],
  },
};

export function getSystemRecordConfig(collectionName = "") {
  return SYSTEM_RECORD_EDITOR_CONFIG[collectionName] || {
    selectorLabel: "Record",
    newRecordLabel: "New record",
    deleteLabel: "Delete record",
    emptyLabel: "No records yet.",
    createFirstLabel: "Create first record",
    helpText: "Choose a record above, edit fields below, then save.",
    loadingText: "Loading records...",
    groupBy: null,
    displayLabel: (row) => row.label || row.name || row.title || row.email || row.id || "Untitled record",
    summary: (row) => row.id || "",
    compactFields: [],
  };
}
