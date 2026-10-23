/** Fleet operations defaults for Phase 10. */

export const ASSIGNMENT_STATUSES = [
  { id: "active", label: "Active" },
  { id: "scheduled", label: "Scheduled" },
  { id: "ended", label: "Ended" },
];

export const TRANSFER_STATUSES = [
  { id: "requested", label: "Requested" },
  { id: "approved", label: "Approved" },
  { id: "in_progress", label: "In progress" },
  { id: "completed", label: "Completed" },
  { id: "cancelled", label: "Cancelled" },
];

export const CHECKOUT_STATUSES = [
  { id: "open", label: "Checked out" },
  { id: "overdue", label: "Overdue" },
  { id: "returned", label: "Returned" },
  { id: "cancelled", label: "Cancelled" },
];

export const RESERVATION_STATUSES = [
  { id: "requested", label: "Requested" },
  { id: "approved", label: "Approved" },
  { id: "active", label: "Active / in use" },
  { id: "completed", label: "Completed" },
  { id: "no_show", label: "No-show" },
  { id: "cancelled", label: "Cancelled" },
];

export const DECON_TYPES = [
  { id: "routine", label: "Routine cleaning" },
  { id: "post_fire", label: "Post-fire decontamination" },
  { id: "post_ems", label: "Post-EMS decontamination" },
  { id: "bbp", label: "Bloodborne pathogen" },
  { id: "hazmat", label: "Hazardous materials" },
  { id: "cancer_reduction", label: "Cancer-reduction cleaning" },
  { id: "cab", label: "Cab cleaning" },
  { id: "patient_compartment", label: "Patient compartment" },
  { id: "equipment", label: "Equipment decontamination" },
  { id: "hvac", label: "HVAC cleaning" },
];

export const STARTER_LOAD_PLAN_ITEMS = [
  { id: "item-scba", name: "SCBA", compartment: "Cab", quantity: 4, minimumQuantity: 4, required: true },
  { id: "item-irons", name: "Irons set", compartment: "Driver side compartment", quantity: 1, minimumQuantity: 1, required: true },
  { id: "item-extinguisher", name: "ABC extinguisher", compartment: "Cab", quantity: 1, minimumQuantity: 1, required: true },
  { id: "item-medical", name: "Medical bag", compartment: "EMS compartment", quantity: 1, minimumQuantity: 1, required: false },
];
