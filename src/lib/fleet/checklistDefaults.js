/** Starter checklist field types and templates (tenant-owned copies). */

export const FLEET_CHECK_FIELD_TYPES = [
  { id: "heading", label: "Heading" },
  { id: "instruction", label: "Instruction" },
  { id: "pass_fail", label: "Pass / Fail" },
  { id: "pass_fail_na", label: "Pass / Fail / N/A" },
  { id: "yes_no", label: "Yes / No" },
  { id: "short_text", label: "Short text" },
  { id: "long_text", label: "Long text" },
  { id: "number", label: "Number" },
  { id: "meter_reading", label: "Meter reading" },
  { id: "fuel_level", label: "Fuel level" },
];

export const DEFAULT_READINESS_STATES = [
  { id: "available", label: "Available", tone: "success" },
  { id: "available_restricted", label: "Available with restriction", tone: "warning" },
  { id: "reserve", label: "Reserve available", tone: "info" },
  { id: "in_shop", label: "In shop", tone: "warning" },
  { id: "out_of_service", label: "Out of service", tone: "critical" },
  { id: "maintenance_due", label: "Maintenance due", tone: "warning" },
  { id: "decommissioned", label: "Decommissioned", tone: "neutral" },
];

export const FAIL_RESPONSE_ACTIONS = [
  { id: "continue", label: "Continue in service" },
  { id: "restrict", label: "Continue with restriction" },
  { id: "oos", label: "Mark out of service" },
];

/**
 * @returns {object}
 */
export function buildStarterDailyCheckTemplate() {
  return {
    id: "tpl-daily-apparatus",
    name: "Daily apparatus check",
    checkType: "daily",
    description: "Starter daily readiness check. Edit sections and publish a version.",
    lifecycleStatus: "draft",
    currentVersion: 0,
    sections: [
      {
        id: "sec-cab",
        title: "Cab & safety",
        fields: [
          {
            id: "f-lights",
            key: "emergency_lights",
            label: "Emergency lights",
            type: "pass_fail",
            required: true,
            failAction: "restrict",
            noteRequiredOnFail: true,
          },
          {
            id: "f-siren",
            key: "siren",
            label: "Siren / air horn",
            type: "pass_fail",
            required: true,
            failAction: "continue",
          },
          {
            id: "f-brakes",
            key: "brakes",
            label: "Brakes",
            type: "pass_fail",
            required: true,
            failAction: "oos",
            noteRequiredOnFail: true,
          },
        ],
      },
      {
        id: "sec-meters",
        title: "Meters & fuel",
        fields: [
          {
            id: "f-mileage",
            key: "mileage",
            label: "Odometer (miles)",
            type: "meter_reading",
            meterType: "mileage",
            required: true,
          },
          {
            id: "f-engine-hours",
            key: "engine_hours",
            label: "Engine hours",
            type: "meter_reading",
            meterType: "engine_hours",
            required: false,
          },
          {
            id: "f-fuel",
            key: "fuel_level",
            label: "Fuel level (%)",
            type: "fuel_level",
            required: true,
          },
        ],
      },
      {
        id: "sec-notes",
        title: "Notes",
        fields: [
          {
            id: "f-notes",
            key: "operator_notes",
            label: "Operator notes",
            type: "long_text",
            required: false,
          },
        ],
      },
    ],
  };
}
