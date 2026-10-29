/** Accident, risk, tow, and safety-review defaults for Phase 11. */

export const ACCIDENT_EVENT_TYPES = [
  { id: "collision", label: "Collision" },
  { id: "backing", label: "Backing incident" },
  { id: "struck_object", label: "Struck object" },
  { id: "road_debris", label: "Road debris" },
  { id: "weather", label: "Weather damage" },
  { id: "vandalism", label: "Vandalism" },
  { id: "theft", label: "Theft" },
  { id: "fire", label: "Fire" },
  { id: "flood", label: "Flood" },
  { id: "mechanical", label: "Mechanical failure" },
  { id: "equipment", label: "Equipment damage" },
  { id: "patient_compartment", label: "Patient-compartment damage" },
  { id: "training", label: "Training damage" },
  { id: "other", label: "Other" },
];

export const ACCIDENT_STATUSES = [
  { id: "reported", label: "Reported" },
  { id: "under_review", label: "Under review" },
  { id: "safety_review", label: "Safety review" },
  { id: "claim_open", label: "Claim open" },
  { id: "repairing", label: "Repairing" },
  { id: "closed", label: "Closed" },
];

export const INSURANCE_CLAIM_STATUSES = [
  { id: "draft", label: "Draft" },
  { id: "filed", label: "Filed" },
  { id: "adjusting", label: "Adjusting" },
  { id: "approved", label: "Approved" },
  { id: "paid", label: "Paid" },
  { id: "denied", label: "Denied" },
  { id: "closed", label: "Closed" },
];

export const ROADSIDE_STATUSES = [
  { id: "dispatched", label: "Dispatched" },
  { id: "en_route", label: "En route" },
  { id: "on_scene", label: "On scene" },
  { id: "towing", label: "Towing" },
  { id: "repaired", label: "Roadside repaired" },
  { id: "completed", label: "Completed" },
  { id: "cancelled", label: "Cancelled" },
];

export const SAFETY_REVIEW_OUTCOMES = [
  { id: "pending", label: "Pending" },
  { id: "preventable", label: "Preventable" },
  { id: "non_preventable", label: "Non-preventable" },
  { id: "undetermined", label: "Undetermined" },
];

/** No starter tow providers: the department enters its own (no made-up vendors). */
export const STARTER_TOW_PROVIDERS = [];
