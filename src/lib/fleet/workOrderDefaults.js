/** Editable work-order defaults for Phase 6. */

export const DEFAULT_WORK_ORDER_STATUSES = [
  { id: "requested", label: "Requested", boardColumn: true },
  { id: "approved", label: "Approved", boardColumn: true },
  { id: "scheduled", label: "Scheduled", boardColumn: true },
  { id: "in_progress", label: "In progress", boardColumn: true },
  { id: "awaiting_parts", label: "Awaiting parts", boardColumn: true },
  { id: "awaiting_vendor", label: "Awaiting vendor", boardColumn: true },
  { id: "ready_for_qc", label: "Ready for QC", boardColumn: true },
  { id: "completed", label: "Completed", boardColumn: true },
  { id: "closed", label: "Closed", boardColumn: false },
  { id: "cancelled", label: "Cancelled", boardColumn: false },
];

export const DEFAULT_WORK_ORDER_PRIORITIES = [
  { id: "low", label: "Low", rank: 1 },
  { id: "medium", label: "Medium", rank: 2 },
  { id: "high", label: "High", rank: 3 },
  { id: "critical", label: "Critical", rank: 4 },
];

export const DEFAULT_WORK_ORDER_TYPES = [
  { id: "corrective", label: "Corrective" },
  { id: "preventive", label: "Preventive" },
  { id: "inspection_fail", label: "Inspection / check failure" },
  { id: "defect", label: "Defect repair" },
  { id: "vendor", label: "Vendor / outside service" },
  { id: "manual", label: "Manual / other" },
];

export const STARTER_SHOPS = [
  {
    id: "shop-internal",
    name: "Internal fleet shop",
    shopType: "internal",
    location: "Headquarters",
    active: true,
  },
];

export const STARTER_VENDORS = [
  {
    id: "vendor-midsouth",
    name: "Mid-South Apparatus",
    category: "Apparatus repair",
    phone: "",
    active: true,
  },
  {
    id: "vendor-internal",
    name: "Internal Fleet",
    category: "Internal",
    phone: "",
    active: true,
  },
];

/** Allowed status transitions (from → to[]). */
export const WORK_ORDER_TRANSITIONS = {
  requested: ["approved", "cancelled"],
  approved: ["scheduled", "in_progress", "cancelled"],
  scheduled: ["in_progress", "awaiting_parts", "awaiting_vendor", "cancelled"],
  in_progress: ["awaiting_parts", "awaiting_vendor", "ready_for_qc", "completed", "cancelled"],
  awaiting_parts: ["in_progress", "awaiting_vendor", "cancelled"],
  awaiting_vendor: ["in_progress", "ready_for_qc", "completed", "cancelled"],
  ready_for_qc: ["in_progress", "completed", "cancelled"],
  completed: ["closed", "in_progress"],
  closed: [],
  cancelled: [],
};
