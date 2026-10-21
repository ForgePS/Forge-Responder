/** Testing & certification program defaults for Phase 7. */

export const TEST_RESULT_OPTIONS = [
  { id: "pass", label: "Pass" },
  { id: "fail", label: "Fail" },
  { id: "conditional", label: "Conditional" },
  { id: "pending", label: "Pending" },
];

export const TEST_COMPLIANCE_STATUSES = [
  { id: "current", label: "Current", tone: "success" },
  { id: "due_soon", label: "Due soon", tone: "warning" },
  { id: "overdue", label: "Overdue", tone: "critical" },
  { id: "failed", label: "Failed", tone: "critical" },
  { id: "never_tested", label: "Never tested", tone: "neutral" },
];

export const STARTER_TEST_PROGRAMS = [
  {
    id: "test-hose",
    name: "Hose annual test",
    programType: "hose",
    standardReference: "NFPA 1962",
    intervalMonths: 12,
    dueSoonDays: 30,
    createDefectOnFail: true,
    blockReturnToServiceOnFail: false,
    certificateRequired: true,
    active: true,
  },
  {
    id: "test-pump",
    name: "Pump performance test",
    programType: "pump_performance",
    standardReference: "NFPA 1911",
    intervalMonths: 12,
    dueSoonDays: 45,
    createDefectOnFail: true,
    blockReturnToServiceOnFail: true,
    certificateRequired: true,
    active: true,
  },
  {
    id: "test-ladder",
    name: "Ground ladder test",
    programType: "ground_ladder",
    standardReference: "NFPA 1932",
    intervalMonths: 12,
    dueSoonDays: 30,
    createDefectOnFail: true,
    blockReturnToServiceOnFail: false,
    certificateRequired: true,
    active: true,
  },
  {
    id: "test-aerial",
    name: "Aerial device test",
    programType: "aerial_device",
    standardReference: "NFPA 1911",
    intervalMonths: 12,
    dueSoonDays: 45,
    createDefectOnFail: true,
    blockReturnToServiceOnFail: true,
    certificateRequired: true,
    active: true,
  },
  {
    id: "test-generator",
    name: "Generator load test",
    programType: "generator",
    standardReference: "Department SOP",
    intervalMonths: 12,
    dueSoonDays: 30,
    createDefectOnFail: false,
    blockReturnToServiceOnFail: false,
    certificateRequired: false,
    active: true,
  },
];
