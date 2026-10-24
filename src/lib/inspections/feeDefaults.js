/** Phase 9 — inspection fees & payments starter config. */

export const FEE_TYPE_OPTIONS = [
  { id: "inspection", label: "Inspection fee" },
  { id: "reinspection", label: "Reinspection fee" },
  { id: "permit", label: "Permit fee" },
  { id: "late", label: "Late fee" },
  { id: "daily_penalty", label: "Daily penalty" },
  { id: "citation", label: "Citation fine" },
  { id: "fire_watch", label: "Fire-watch fee" },
  { id: "contractor_submission", label: "Contractor submission fee" },
  { id: "certificate", label: "Certificate fee" },
  { id: "custom", label: "Custom fee" },
];

export const FEE_STATUSES = [
  "open",
  "invoiced",
  "partially_paid",
  "paid",
  "waived",
  "void",
];

export const FEE_STATUS_LABELS = {
  open: "Open",
  invoiced: "Invoiced",
  partially_paid: "Partially paid",
  paid: "Paid",
  waived: "Waived",
  void: "Void",
};

export const INVOICE_STATUSES = [
  "draft",
  "issued",
  "partially_paid",
  "paid",
  "void",
];

export const INVOICE_STATUS_LABELS = {
  draft: "Draft",
  issued: "Issued",
  partially_paid: "Partially paid",
  paid: "Paid",
  void: "Void",
};

export const PAYMENT_METHODS = [
  { id: "cash", label: "Cash" },
  { id: "check", label: "Check" },
  { id: "card", label: "Card" },
  { id: "ach", label: "ACH / e-check" },
  { id: "online_stub", label: "Online" },
  { id: "other", label: "Other" },
];

export const PAYMENT_STATUSES = [
  "recorded",
  "void",
  "refunded",
];

export const PAYMENT_STATUS_LABELS = {
  recorded: "Recorded",
  void: "Void",
  refunded: "Refunded",
};

export const ADJUSTMENT_TYPES = [
  { id: "waiver", label: "Waiver" },
  { id: "reduction", label: "Reduction" },
  { id: "increase", label: "Increase" },
  { id: "refund", label: "Refund" },
  { id: "write_off", label: "Write-off" },
];

export const STARTER_FEE_SCHEDULES = [
  {
    id: "fee-inspection-annual",
    feeTypeId: "inspection",
    name: "Annual inspection",
    amount: 75,
    unit: "flat",
    active: true,
    description: "Standard annual occupancy inspection fee.",
  },
  {
    id: "fee-reinspection",
    feeTypeId: "reinspection",
    name: "Reinspection",
    amount: 50,
    unit: "flat",
    active: true,
    description: "Fee applied when a reinspection visit is required.",
  },
  {
    id: "fee-late",
    feeTypeId: "late",
    name: "Late payment",
    amount: 25,
    unit: "flat",
    active: true,
    description: "Applied when an invoice remains unpaid past due date.",
  },
  {
    id: "fee-certificate",
    feeTypeId: "certificate",
    name: "Certificate of inspection",
    amount: 15,
    unit: "flat",
    active: true,
    description: "Certificate issuance fee.",
  },
  {
    id: "fee-contractor-submission",
    feeTypeId: "contractor_submission",
    name: "Contractor test report submission",
    amount: 40,
    unit: "flat",
    active: true,
    description: "Staff-mediated contractor submission fee.",
  },
  {
    id: "fee-fire-watch",
    feeTypeId: "fire_watch",
    name: "Fire watch (daily)",
    amount: 100,
    unit: "per_day",
    active: true,
    description: "Daily fire-watch fee when ordered.",
  },
];

export function getFeeTypeOptions() {
  return FEE_TYPE_OPTIONS.map((row) => ({ ...row }));
}

export function getPaymentMethodOptions() {
  return PAYMENT_METHODS.map((row) => ({ ...row }));
}

export function getAdjustmentTypeOptions() {
  return ADJUSTMENT_TYPES.map((row) => ({ ...row }));
}

export function labelForFeeType(feeTypeId) {
  return FEE_TYPE_OPTIONS.find((row) => row.id === feeTypeId)?.label || feeTypeId || "—";
}

export function labelForFeeStatus(status) {
  return FEE_STATUS_LABELS[status] || status || "—";
}

export function labelForInvoiceStatus(status) {
  return INVOICE_STATUS_LABELS[status] || status || "—";
}

export function labelForPaymentStatus(status) {
  return PAYMENT_STATUS_LABELS[status] || status || "—";
}

export function labelForPaymentMethod(methodId) {
  return PAYMENT_METHODS.find((row) => row.id === methodId)?.label || methodId || "—";
}

export function labelForAdjustmentType(typeId) {
  return ADJUSTMENT_TYPES.find((row) => row.id === typeId)?.label || typeId || "—";
}

export function formatCurrency(amount) {
  const value = Number(amount) || 0;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}
