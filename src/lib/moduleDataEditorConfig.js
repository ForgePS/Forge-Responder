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
    autoSelectFirst: false,
    selectPlaceholder: "Select personnel...",
    selectPromptLabel: "Select a personnel record from the dropdown above to view and edit their profile.",
  },
  "hlfd-rms-apparatus": {
    selectorLabel: "Apparatus unit",
    newRecordLabel: "New apparatus",
    deleteLabel: "Delete apparatus",
    emptyLabel: "No apparatus records yet.",
    createFirstLabel: "Create first apparatus record",
    helpText: "Choose an apparatus unit above, edit its details below, then save.",
    loadingText: "Loading apparatus records...",
    groupBy: (row) => row.station || "Unassigned station",
    displayLabel: (row) => row.unit || row.id || "Untitled apparatus",
    summary: (row) => [row.type, row.station, row.status].filter(Boolean).join(" · "),
    compactFields: ["unit", "type", "station", "status"],
    autoSelectFirst: false,
    selectPlaceholder: "Select apparatus...",
    selectPromptLabel: "Select an apparatus unit from the dropdown above to view and edit it.",
  },
  "hlfd-rms-assets": {
    selectorLabel: "Asset",
    newRecordLabel: "New asset",
    deleteLabel: "Delete asset",
    emptyLabel: "No assets yet.",
    createFirstLabel: "Create first asset",
    helpText: "Choose an asset above, edit its details below, then save.",
    loadingText: "Loading assets...",
    groupBy: (row) => row.category || "Uncategorized",
    displayLabel: (row) => row.name || row.id || "Untitled asset",
    summary: (row) => [row.category, row.location, row.status].filter(Boolean).join(" · "),
    compactFields: ["name", "category", "location", "status"],
    autoSelectFirst: false,
    selectPlaceholder: "Select asset...",
    selectPromptLabel: "Select an asset from the dropdown above to view and edit it.",
  },
};

export function usesRecordPanelEditor(collectionName = "") {
  return Boolean(MODULE_DATA_EDITOR_CONFIG[collectionName]);
}

export function getRecordEditorConfig(collectionName = "") {
  return MODULE_DATA_EDITOR_CONFIG[collectionName] || getSystemRecordConfig(collectionName);
}
