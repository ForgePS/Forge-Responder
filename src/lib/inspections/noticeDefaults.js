/** Starter notice / certificate document templates and delivery enums. */

export const NOTICE_DOCUMENT_TYPES = [
  { id: "inspection_report", label: "Inspection report", category: "report" },
  { id: "notice_of_violation", label: "Notice of violation", category: "notice" },
  { id: "correction_notice", label: "Correction notice", category: "notice" },
  { id: "certificate_of_inspection", label: "Certificate of inspection", category: "certificate" },
  { id: "certificate_of_compliance", label: "Certificate of compliance", category: "certificate" },
];

export const NOTICE_STATUSES = [
  "draft",
  "ready",
  "issued",
  "delivered",
  "void",
  "superseded",
];

export const NOTICE_STATUS_LABELS = {
  draft: "Draft",
  ready: "Ready",
  issued: "Issued",
  delivered: "Delivered",
  void: "Void",
  superseded: "Superseded",
};

export const DELIVERY_CHANNELS = [
  { id: "print", label: "Print / PDF" },
  { id: "email", label: "Email" },
  { id: "sms", label: "SMS" },
  { id: "in_person", label: "In person" },
  { id: "mail", label: "Mail" },
  { id: "portal", label: "Portal" },
  { id: "other", label: "Other" },
];

export const DELIVERY_STATUSES = [
  "draft",
  "queued",
  "sent_stub",
  "failed",
  "printed",
  "in_person",
];

export const DELIVERY_STATUS_LABELS = {
  draft: "Draft",
  queued: "Queued",
  sent_stub: "Sent (stub)",
  failed: "Failed",
  printed: "Printed",
  in_person: "In person",
};

export const NOTICE_MERGE_FIELDS = [
  { key: "departmentName", label: "Department name" },
  { key: "noticeNumber", label: "Notice number" },
  { key: "documentTitle", label: "Document title" },
  { key: "issuedAt", label: "Issued date" },
  { key: "occupancyName", label: "Occupancy name" },
  { key: "address", label: "Address" },
  { key: "inspectionNumber", label: "Inspection number" },
  { key: "inspectorName", label: "Inspector name" },
  { key: "summary", label: "Summary" },
  { key: "correctiveAction", label: "Corrective action" },
  { key: "dueAt", label: "Correction due date" },
  { key: "recipientName", label: "Recipient name" },
];

export const STARTER_DOCUMENT_TEMPLATES = [
  {
    id: "tpl-inspection-report",
    documentTypeId: "inspection_report",
    name: "Inspection report",
    letterheadTitle: "Fire Prevention Bureau",
    letterheadSubtitle: "Inspection Report",
    introText: "This report summarizes the fire inspection conducted at the property listed below.",
    bodySections: [
      { id: "property", title: "Property", includeFields: ["occupancyName", "address"] },
      { id: "inspection", title: "Inspection", includeFields: ["inspectionNumber", "inspectorName", "issuedAt"] },
      { id: "findings", title: "Findings", includeFields: ["summary"] },
      { id: "violations", title: "Violations", includeViolations: true },
    ],
    closingText: "Contact the Fire Prevention Bureau with questions regarding this report.",
    footerText: "Official inspection document — retain for your records.",
    active: true,
  },
  {
    id: "tpl-nov",
    documentTypeId: "notice_of_violation",
    name: "Notice of violation",
    letterheadTitle: "Fire Prevention Bureau",
    letterheadSubtitle: "Notice of Violation",
    introText: "A fire code violation has been identified. Corrective action is required by the due date below.",
    bodySections: [
      { id: "property", title: "Property", includeFields: ["occupancyName", "address", "recipientName"] },
      { id: "violation", title: "Violation", includeFields: ["summary", "correctiveAction", "dueAt"] },
      { id: "violations", title: "Cited items", includeViolations: true },
    ],
    closingText: "Failure to correct may result in additional enforcement action.",
    footerText: "Official notice of violation.",
    active: true,
  },
  {
    id: "tpl-correction",
    documentTypeId: "correction_notice",
    name: "Correction notice",
    letterheadTitle: "Fire Prevention Bureau",
    letterheadSubtitle: "Correction Notice",
    introText: "Please complete the corrective actions listed below and schedule reinspection as required.",
    bodySections: [
      { id: "property", title: "Property", includeFields: ["occupancyName", "address"] },
      { id: "actions", title: "Required corrections", includeFields: ["correctiveAction", "dueAt", "summary"] },
      { id: "violations", title: "Open items", includeViolations: true },
    ],
    closingText: "Notify the assigned inspector when corrections are complete.",
    footerText: "Correction notice — Fire Prevention.",
    active: true,
  },
  {
    id: "tpl-cert-inspection",
    documentTypeId: "certificate_of_inspection",
    name: "Certificate of inspection",
    letterheadTitle: "Fire Prevention Bureau",
    letterheadSubtitle: "Certificate of Inspection",
    introText: "This certificate confirms that a fire inspection was completed for the property below.",
    bodySections: [
      { id: "property", title: "Property", includeFields: ["occupancyName", "address"] },
      { id: "inspection", title: "Inspection", includeFields: ["inspectionNumber", "inspectorName", "issuedAt", "summary"] },
    ],
    closingText: "This certificate does not waive future inspection or code requirements.",
    footerText: "Certificate of inspection.",
    active: true,
    isCertificate: true,
  },
  {
    id: "tpl-cert-compliance",
    documentTypeId: "certificate_of_compliance",
    name: "Certificate of compliance",
    letterheadTitle: "Fire Prevention Bureau",
    letterheadSubtitle: "Certificate of Compliance",
    introText: "This certificate confirms that previously cited conditions have been found in compliance.",
    bodySections: [
      { id: "property", title: "Property", includeFields: ["occupancyName", "address"] },
      { id: "compliance", title: "Compliance", includeFields: ["inspectionNumber", "issuedAt", "summary"] },
    ],
    closingText: "Retain this certificate as documentation of compliance on the date of issue.",
    footerText: "Certificate of compliance.",
    active: true,
    isCertificate: true,
  },
];

export function getNoticeDocumentTypeOptions() {
  return NOTICE_DOCUMENT_TYPES.map((row) => ({ ...row }));
}

export function getDeliveryChannelOptions() {
  return DELIVERY_CHANNELS.map((row) => ({ ...row }));
}

export function labelForNoticeStatus(status) {
  return NOTICE_STATUS_LABELS[status] || status || "—";
}

export function labelForDeliveryStatus(status) {
  return DELIVERY_STATUS_LABELS[status] || status || "—";
}
