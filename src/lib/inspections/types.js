/**
 * @typedef {"draft"|"scheduled"|"in_progress"|"awaiting_approval"|"completed"|"cancelled"|"archived"|"overdue"} InspectionStatus
 */

/**
 * @typedef {"open"|"corrective_action_submitted"|"reinspection_scheduled"|"closed"|"dismissed"|"escalated"} ViolationStatus
 */

/**
 * @typedef {object} VersionedLabelSnapshot
 * @property {string} id
 * @property {string} [label]
 * @property {string|number} [version]
 * @property {string} [publishedAt]
 */

/**
 * @typedef {object} InspectionRecord
 * @property {string} id
 * @property {string} departmentId
 * @property {string} [jurisdictionId]
 * @property {string} [divisionId]
 * @property {string} inspectionNumber
 * @property {string} [inspectionTypeId]
 * @property {VersionedLabelSnapshot} [inspectionTypeSnapshot]
 * @property {string} [templateId]
 * @property {string} [templateVersionId]
 * @property {string} [workflowVersionId]
 * @property {string} [propertyId]
 * @property {string} [buildingId]
 * @property {string} [unitId]
 * @property {string} [occupancyId]
 * @property {string} [occupancyName]
 * @property {string} [address]
 * @property {InspectionStatus|string} status
 * @property {string} [workflowStage]
 * @property {string} [priority]
 * @property {string} [riskLevel]
 * @property {string[]} [assignedInspectorIds]
 * @property {string} [supervisorId]
 * @property {string} [scheduledStart]
 * @property {string} [scheduledEnd]
 * @property {string} [dueAt]
 * @property {string} [startedAt]
 * @property {string} [completedAt]
 * @property {string} [approvedAt]
 * @property {string} [result]
 * @property {string} [summary]
 * @property {string} [internalNotes]
 * @property {number} [openViolationCount]
 * @property {number} [totalViolationCount]
 * @property {boolean} [reinspectionRequired]
 * @property {string} [nextReinspectionAt]
 * @property {number} [feeTotal]
 * @property {number} [balanceDue]
 * @property {number} [recordVersion]
 * @property {string} [lockedAt]
 * @property {object} [historicalSnapshot]
 * @property {string} [createdAt]
 * @property {string} [updatedAt]
 * @property {string} [createdBy]
 * @property {string} [updatedBy]
 */

/**
 * @typedef {object} OccupancyRecord
 * @property {string} id
 * @property {string} departmentId
 * @property {string} [propertyId]
 * @property {string} [buildingId]
 * @property {string} [unitId]
 * @property {string} name
 * @property {string} [address]
 * @property {string} [city]
 * @property {string} [state]
 * @property {string} [zip]
 * @property {number} [latitude]
 * @property {number} [longitude]
 * @property {string} [occupancyType]
 * @property {string} [riskLevel]
 * @property {string} [hazard]
 * @property {string|number} [occupancyLoad]
 * @property {string} [status]
 * @property {string} [lastInspectionAt]
 * @property {string} [nextInspectionDueAt]
 * @property {string} [primaryContactName]
 * @property {string} [primaryContactPhone]
 * @property {string} [primaryContactEmail]
 * @property {Array<{id?: string, name?: string, role?: string, phone?: string, email?: string, isPrimary?: boolean}>} [contacts]
 * @property {Array<{id?: string, at?: string, type?: string, summary?: string, actorName?: string}>} [timeline]
 * @property {string} [createdAt]
 * @property {string} [updatedAt]
 */

/**
 * @typedef {object} ViolationRecord
 * @property {string} id
 * @property {string} departmentId
 * @property {string} [inspectionId]
 * @property {string} [occupancyId]
 * @property {string} [catalogItemId]
 * @property {string} [codeSetId]
 * @property {string} [codeSection]
 * @property {string} [title]
 * @property {string} [description]
 * @property {string} [severity]
 * @property {ViolationStatus|string} status
 * @property {string} [correctionDueAt]
 * @property {string} [closedAt]
 * @property {string} [createdAt]
 * @property {string} [updatedAt]
 */

/**
 * @typedef {object} InspectionNavLabels
 * @property {string} [dashboard]
 * @property {string} [workQueue]
 * @property {string} [allInspections]
 * @property {string} [myInspections]
 * @property {string} [occupanciesClassic]
 * @property {string} [inspectionQueueClassic]
 * @property {string} [preplans]
 */

/**
 * @typedef {object} InspectionNumberingFormat
 * @property {string} [prefix]
 * @property {string} [separator]
 * @property {string} [dateFormat]
 * @property {number} [sequencePadding]
 */

/**
 * @typedef {object} InspectionSettings
 * @property {string} departmentId
 * @property {InspectionNavLabels} [navLabels]
 * @property {string[]} [enabledNavKeys]
 * @property {InspectionNumberingFormat} [numbering]
 * @property {string[]} [inspectionStatuses]
 * @property {string[]} [violationStatuses]
 * @property {string[]} [severityLevels]
 * @property {string[]} [priorityLevels]
 * @property {object} [terminology]
 * @property {string} [createdAt]
 * @property {string} [updatedAt]
 */

export const INSPECTION_STATUS_VALUES = [
  "draft",
  "scheduled",
  "in_progress",
  "awaiting_approval",
  "completed",
  "cancelled",
  "archived",
  "overdue",
];

export const VIOLATION_STATUS_VALUES = [
  "open",
  "corrective_action_submitted",
  "reinspection_scheduled",
  "closed",
  "dismissed",
  "escalated",
];

export const DEFAULT_INSPECTION_NAV_KEYS = [
  "dashboard",
  "workQueue",
  "allInspections",
  "myInspections",
  "occupanciesClassic",
  "inspectionQueueClassic",
  "preplans",
  "hydrants",
];

/** @returns {InspectionSettings} */
export function createEmptyInspectionSettings(departmentId = "") {
  return {
    departmentId,
    navLabels: {
      dashboard: "Inspections Dashboard",
      workQueue: "Work Queue",
      allInspections: "All Inspections",
      myInspections: "My Inspections",
      occupanciesClassic: "Occupancies",
      inspectionQueueClassic: "Inspection Queue",
      preplans: "Preplans",
    },
    enabledNavKeys: [...DEFAULT_INSPECTION_NAV_KEYS],
    numbering: {
      prefix: "INS",
      separator: "-",
      dateFormat: "yyyy",
      sequencePadding: 4,
    },
    inspectionStatuses: [...INSPECTION_STATUS_VALUES],
    violationStatuses: [...VIOLATION_STATUS_VALUES],
    severityLevels: ["low", "moderate", "high", "immediate"],
    priorityLevels: ["low", "normal", "high", "urgent"],
    terminology: {
      moduleName: "Inspections",
      occupancySingular: "Occupancy",
      occupancyPlural: "Occupancies",
      inspectionSingular: "Inspection",
      inspectionPlural: "Inspections",
      violationSingular: "Violation",
      violationPlural: "Violations",
    },
  };
}
