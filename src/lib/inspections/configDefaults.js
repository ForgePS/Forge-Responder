/** Starter inspection types and template field catalogs for Configuration Studio. */

export const TEMPLATE_FIELD_TYPES = [
  { id: "heading", label: "Heading" },
  { id: "instruction", label: "Instruction" },
  { id: "yes_no", label: "Yes / No" },
  { id: "pass_fail", label: "Pass / Fail" },
  { id: "pass_fail_na", label: "Pass / Fail / N/A" },
  { id: "compliant", label: "Compliant / Noncompliant / Not observed" },
  { id: "single_select", label: "Single select" },
  { id: "multi_select", label: "Multi-select" },
  { id: "dropdown", label: "Dropdown" },
  { id: "checkbox", label: "Checkbox" },
  { id: "short_text", label: "Short text" },
  { id: "long_text", label: "Long text" },
  { id: "number", label: "Number" },
  { id: "date", label: "Date" },
  { id: "photo", label: "Photo" },
  { id: "signature", label: "Signature" },
  { id: "code_citation", label: "Code citation" },
  { id: "violation", label: "Violation" },
];

export const CONFIG_LIFECYCLE_STATUSES = ["draft", "published", "archived"];

/**
 * Editable starter types — installed as tenant-owned drafts/published copies.
 * Keep the list practical for Phase 3 (not the full 50+ catalog).
 */
export const STARTER_INSPECTION_TYPES = [
  {
    id: "annual-fire",
    name: "Annual fire inspection",
    category: "Periodic",
    description: "Scheduled annual occupancy fire inspection.",
    color: "#2563eb",
    frequency: "Annual",
    durationMinutes: 90,
    publicRequestEligible: false,
  },
  {
    id: "complaint",
    name: "Complaint inspection",
    category: "Reactive",
    description: "Inspection triggered by a complaint or referral.",
    color: "#dc2626",
    frequency: "As needed",
    durationMinutes: 60,
    publicRequestEligible: true,
  },
  {
    id: "reinspection",
    name: "Reinspection",
    category: "Follow-up",
    description: "Follow-up inspection after violations or corrective actions.",
    color: "#d97706",
    frequency: "As needed",
    durationMinutes: 45,
    publicRequestEligible: false,
  },
  {
    id: "new-business",
    name: "New business inspection",
    category: "Occupancy",
    description: "Initial inspection for a new business occupancy.",
    color: "#059669",
    frequency: "One-time",
    durationMinutes: 120,
    publicRequestEligible: true,
  },
  {
    id: "coo",
    name: "Certificate of occupancy inspection",
    category: "Occupancy",
    description: "Inspection supporting certificate of occupancy issuance.",
    color: "#7c3aed",
    frequency: "One-time",
    durationMinutes: 120,
    publicRequestEligible: false,
  },
  {
    id: "special-event",
    name: "Special-event inspection",
    category: "Event",
    description: "Temporary event, tent, or special assembly inspection.",
    color: "#0891b2",
    frequency: "As needed",
    durationMinutes: 60,
    publicRequestEligible: true,
  },
  {
    id: "commercial-cooking",
    name: "Commercial cooking inspection",
    category: "Systems",
    description: "Kitchen hood and commercial cooking system inspection.",
    color: "#ea580c",
    frequency: "Periodic",
    durationMinutes: 75,
    publicRequestEligible: false,
  },
  {
    id: "fire-alarm",
    name: "Fire alarm system inspection",
    category: "Systems",
    description: "Fire alarm acceptance or periodic inspection.",
    color: "#be123c",
    frequency: "Periodic",
    durationMinutes: 90,
    publicRequestEligible: false,
  },
];

/**
 * @param {string} typeId
 * @param {string} typeName
 */
export function buildStarterTemplateDraft(typeId, typeName) {
  const now = new Date().toISOString();
  return {
    name: `${typeName} form`,
    inspectionTypeId: typeId,
    description: `Default form for ${typeName}.`,
    lifecycleStatus: "draft",
    currentVersion: 0,
    publishedVersionId: "",
    draftVersionId: "",
    sections: [
      {
        id: "sec-general",
        title: "General",
        sortOrder: 0,
        fields: [
          {
            id: "fld-occupancy-notes",
            key: "occupancy_notes",
            type: "long_text",
            label: "Occupancy notes",
            required: false,
            helpText: "Site conditions and access notes.",
            sortOrder: 0,
          },
          {
            id: "fld-overall-result",
            key: "overall_result",
            type: "pass_fail",
            label: "Overall result",
            required: true,
            helpText: "",
            sortOrder: 1,
          },
        ],
      },
      {
        id: "sec-life-safety",
        title: "Life safety",
        sortOrder: 1,
        fields: [
          {
            id: "fld-exits",
            key: "exits_clear",
            type: "pass_fail_na",
            label: "Exits clear and unobstructed",
            required: true,
            helpText: "",
            sortOrder: 0,
            autoCreateViolation: true,
            severity: "high",
          },
          {
            id: "fld-extinguishers",
            key: "extinguishers",
            type: "pass_fail_na",
            label: "Fire extinguishers present and current",
            required: true,
            helpText: "",
            sortOrder: 1,
            autoCreateViolation: true,
            severity: "moderate",
          },
          {
            id: "fld-photos",
            key: "evidence_photos",
            type: "photo",
            label: "Evidence photos",
            required: false,
            helpText: "Attach photos of deficiencies.",
            sortOrder: 2,
          },
        ],
      },
    ],
    createdAt: now,
    updatedAt: now,
  };
}
