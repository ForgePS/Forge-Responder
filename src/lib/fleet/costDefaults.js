/** Cost accounting, replacement, and disposal defaults for Phase 13. */

export const COST_CATEGORIES = [
  { id: "acquisition", label: "Acquisition" },
  { id: "financing", label: "Financing" },
  { id: "upfit", label: "Upfit" },
  { id: "equipment", label: "Equipment" },
  { id: "registration", label: "Registration" },
  { id: "insurance", label: "Insurance" },
  { id: "fuel", label: "Fuel" },
  { id: "electricity", label: "Electricity" },
  { id: "def", label: "DEF" },
  { id: "preventive_maintenance", label: "Preventive maintenance" },
  { id: "corrective_maintenance", label: "Corrective maintenance" },
  { id: "parts", label: "Parts" },
  { id: "labor", label: "Labor" },
  { id: "vendor", label: "Vendor" },
  { id: "tires", label: "Tires" },
  { id: "batteries", label: "Batteries" },
  { id: "tests", label: "Tests" },
  { id: "towing", label: "Towing" },
  { id: "accident", label: "Accident" },
  { id: "warranty_credit", label: "Warranty credit" },
  { id: "grant_credit", label: "Grant credit" },
  { id: "disposal", label: "Disposal" },
  { id: "other", label: "Other" },
];

export const DOWNTIME_REASONS = [
  { id: "pm", label: "Preventive maintenance" },
  { id: "corrective", label: "Corrective repair" },
  { id: "accident", label: "Accident damage" },
  { id: "recall", label: "Recall / bulletin" },
  { id: "parts_wait", label: "Waiting on parts" },
  { id: "vendor_wait", label: "Waiting on vendor" },
  { id: "test", label: "Testing / certification" },
  { id: "decon", label: "Decontamination" },
  { id: "other", label: "Other" },
];

export const DEFAULT_REPLACEMENT_FACTORS = [
  { id: "age", label: "Age", weight: 15, maxPoints: 100 },
  { id: "mileage", label: "Mileage", weight: 15, maxPoints: 100 },
  { id: "engine_hours", label: "Engine hours", weight: 10, maxPoints: 100 },
  { id: "condition", label: "Condition", weight: 10, maxPoints: 100 },
  { id: "reliability", label: "Reliability / downtime", weight: 15, maxPoints: 100 },
  { id: "maintenance_cost", label: "Maintenance cost", weight: 15, maxPoints: 100 },
  { id: "safety_risk", label: "Safety risk", weight: 10, maxPoints: 100 },
  { id: "obsolescence", label: "Technology / support", weight: 5, maxPoints: 100 },
  { id: "mission_fit", label: "Mission suitability", weight: 5, maxPoints: 100 },
];

export const REPLACEMENT_CASE_STATUSES = [
  { id: "draft", label: "Draft" },
  { id: "scored", label: "Scored" },
  { id: "recommended", label: "Recommended" },
  { id: "funded", label: "Funded" },
  { id: "in_procurement", label: "In procurement" },
  { id: "replaced", label: "Replaced" },
  { id: "deferred", label: "Deferred" },
  { id: "cancelled", label: "Cancelled" },
];

export const REPLACEMENT_PRIORITIES = [
  { id: "monitor", label: "Monitor" },
  { id: "plan", label: "Plan (3–5 yr)" },
  { id: "near_term", label: "Near-term (1–2 yr)" },
  { id: "urgent", label: "Urgent / replace now" },
];

export const DEPRECIATION_METHODS = [
  { id: "straight_line", label: "Straight line" },
  { id: "declining_balance", label: "Declining balance" },
  { id: "manual", label: "Manual" },
  { id: "market", label: "Market value" },
  { id: "appraisal", label: "Appraisal" },
  { id: "none", label: "No depreciation" },
];

export const DECOMMISSION_CHECKLIST = [
  { id: "replacement_decision", label: "Replacement decision recorded" },
  { id: "remove_frontline", label: "Remove from frontline" },
  { id: "move_reserve", label: "Move to reserve (if applicable)" },
  { id: "remove_radios", label: "Remove radios / data systems" },
  { id: "remove_controlled", label: "Remove controlled items" },
  { id: "remove_markings", label: "Remove department markings" },
  { id: "equipment_reconcile", label: "Equipment reconciliation" },
  { id: "final_inspection", label: "Final inspection" },
  { id: "final_meter", label: "Final meter reading" },
  { id: "title_review", label: "Title review" },
  { id: "records_export", label: "Records export" },
  { id: "environmental", label: "Environmental checks" },
  { id: "approval", label: "Decommission approval" },
];

export const DISPOSAL_METHODS = [
  { id: "auction", label: "Auction" },
  { id: "sealed_bid", label: "Sealed bid" },
  { id: "trade_in", label: "Trade-in" },
  { id: "sale", label: "Sale" },
  { id: "transfer", label: "Transfer" },
  { id: "donation", label: "Donation" },
  { id: "scrap", label: "Scrap" },
  { id: "return_lessor", label: "Return to lessor" },
  { id: "insurance_total_loss", label: "Insurance total loss" },
  { id: "other", label: "Other" },
];

export const DISPOSAL_STATUSES = [
  { id: "planned", label: "Planned" },
  { id: "in_progress", label: "In progress" },
  { id: "complete", label: "Complete" },
  { id: "cancelled", label: "Cancelled" },
];

/** Standard service life (years) by rough class keyword. */
export const STANDARD_LIFE_YEARS = {
  engine: 15,
  ladder: 20,
  aerial: 20,
  ambulance: 7,
  rescue: 12,
  tanker: 20,
  brush: 12,
  utility: 10,
  staff: 8,
  default: 15,
};
