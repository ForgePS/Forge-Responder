import { buildPersonnelFullName } from "./personnelSchema.js";
import { PERSONNEL_ADMIN_SECTION_BREAKS } from "./personnelAdminFields.js";
import { getSystemRecordConfig } from "./systemRecordEditorConfig.js";

export const MODULE_DATA_EDITOR_CONFIG = {
  "hlfd-rms-personnel": {
    selectorLabel: "Personnel record",
    newRecordLabel: "New personnel",
    deleteLabel: "Delete personnel",
    emptyLabel: "No personnel records yet.",
    createFirstLabel: "Create first personnel record",
    helpText: "Choose a personnel record above, then edit their profile fields below. Save when finished.",
    loadingText: "Loading personnel records...",
    groupBy: (row) => {
      const status = String(row.status || "Unknown");
      return status.charAt(0).toUpperCase() + status.slice(1);
    },
    displayLabel: (row) => buildPersonnelFullName(row) || row.name || row.id || "Untitled personnel",
    summary: (row) => [row.rank, row.shift, row.status].filter(Boolean).join(" · "),
    compactFields: ["firstName", "lastName", "email", "rank", "status"],
    sectionBreaks: PERSONNEL_ADMIN_SECTION_BREAKS,
  },
};

export function usesRecordPanelEditor(collectionName = "") {
  return Boolean(MODULE_DATA_EDITOR_CONFIG[collectionName]);
}

export function getRecordEditorConfig(collectionName = "") {
  return MODULE_DATA_EDITOR_CONFIG[collectionName] || getSystemRecordConfig(collectionName);
}
