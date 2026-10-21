/** Component, recall, and warranty defaults for Phase 9. */

export const TIRE_POSITIONS = [
  { id: "LF", label: "Left front" },
  { id: "RF", label: "Right front" },
  { id: "LR", label: "Left rear" },
  { id: "RR", label: "Right rear" },
  { id: "LO", label: "Left outer dual" },
  { id: "LI", label: "Left inner dual" },
  { id: "RO", label: "Right outer dual" },
  { id: "RI", label: "Right inner dual" },
  { id: "SPARE", label: "Spare" },
  { id: "INVENTORY", label: "Inventory / stock" },
];

export const TIRE_CONDITIONS = [
  { id: "new", label: "New" },
  { id: "good", label: "Good" },
  { id: "fair", label: "Fair" },
  { id: "worn", label: "Worn" },
  { id: "condemned", label: "Condemned" },
];

export const BATTERY_POSITIONS = [
  { id: "primary", label: "Primary" },
  { id: "secondary", label: "Secondary" },
  { id: "auxiliary", label: "Auxiliary / house" },
  { id: "inventory", label: "Inventory" },
];

export const FLUID_TYPES = [
  { id: "engine_oil", label: "Engine oil" },
  { id: "transmission", label: "Transmission fluid" },
  { id: "coolant", label: "Coolant" },
  { id: "hydraulic", label: "Hydraulic fluid" },
  { id: "def", label: "DEF" },
  { id: "brake", label: "Brake fluid" },
  { id: "power_steering", label: "Power steering" },
  { id: "pump_gear", label: "Pump gear oil" },
  { id: "other", label: "Other" },
];

export const RECALL_STATUSES = [
  { id: "open", label: "Open" },
  { id: "scheduled", label: "Scheduled" },
  { id: "in_progress", label: "In progress" },
  { id: "completed", label: "Completed" },
  { id: "not_applicable", label: "Not applicable" },
  { id: "deferred", label: "Deferred" },
];

export const RECALL_CAMPAIGN_TYPES = [
  { id: "recall", label: "Safety recall" },
  { id: "service_bulletin", label: "Service bulletin" },
  { id: "campaign", label: "Manufacturer campaign" },
  { id: "tenant", label: "Department campaign" },
];

export const WARRANTY_CLAIM_STATUSES = [
  { id: "draft", label: "Draft" },
  { id: "submitted", label: "Submitted" },
  { id: "approved", label: "Approved" },
  { id: "partial", label: "Partially approved" },
  { id: "rejected", label: "Rejected" },
  { id: "paid", label: "Paid / recovered" },
  { id: "appealed", label: "Appealed" },
];

export const STARTER_RECALLS = [
  {
    id: "recall-demo-brake",
    campaignNumber: "DEMO-2026-001",
    campaignType: "service_bulletin",
    source: "tenant",
    manufacturer: "Department Fleet",
    component: "Brakes",
    description: "Inspect brake wear indicators at next service.",
    safetyRisk: "moderate",
    remedy: "Inspect and replace pads if below threshold.",
    status: "open",
    oosRequired: false,
    active: true,
  },
];
