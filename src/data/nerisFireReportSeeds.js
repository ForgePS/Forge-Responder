import { LIST_KEYS } from "../lib/tenantListKeys.js";

export const NERIS_FIRE_REPORT_SEEDS = [
  {
    id: "NERIS-2026-001",
    reportNumber: "HL-2026-001",
    incidentDate: "2026-06-10",
    incidentAddress: "3101 Goodman Rd W, Horn Lake, MS 38637",
    incidentTypeSummary: "STRUCTURE_FIRE",
    status: "In Progress",
    disciplines: ["fire"],
    reviewStage: "author",
    locked: false,
    createdAt: "2026-06-10T14:22:00.000Z",
    updatedAt: "2026-06-10T14:22:00.000Z",
    workspace: {
      cad: {
        cadCallNumber: "CAD-2026-1042",
        dispatchTime: "2026-06-10T14:05",
        arrivalTime: "2026-06-10T14:12",
        priority: "High",
        alarmLevel: "1",
        initialComments: "Caller reports smoke from kitchen.",
      },
      location: {
        occupancyId: "OCC-105",
        occupancyName: "Horn Lake City Hall",
        propertyUse: "Business",
        sprinklerStatus: "Partial",
        alarmStatus: "Active",
      },
      units: [
        { unitId: "Engine 1", apparatusType: "Pumper", station: "Station 1", dispatchTime: "2026-06-10T14:05", arrivalTime: "2026-06-10T14:12", source: "apparatus" },
        { unitId: "Truck 3", apparatusType: "Ladder", station: "Station 1", dispatchTime: "2026-06-10T14:06", arrivalTime: "2026-06-10T14:14", source: "apparatus" },
      ],
      personnel: [
        { personnelId: "P-001", name: "Gregory Scruggs", rank: "Battalion Chief", certification: "AEMT", unitId: "Engine 1", role: "Incident Commander", source: "scheduling" },
      ],
      weather: {
        dispatchWeather: { temperature: "82°F", windSpeed: "8 mph", windDirection: "SW", condition: "Clear", humidity: "55%" },
        source: "weather-api-simulated",
      },
      actions: ["SUPPRESSION", "VENTILATION", "SEARCH"],
      narrative: {
        body: "Engine 1 and Truck 3 responded to a structure fire at Horn Lake City Hall. Kitchen fire extinguished prior to full room involvement. No injuries.",
        aiGenerated: false,
      },
      approvals: [],
      auditLog: [],
    },
    autoPopulateSources: {
      "workspace.location": "occupancy",
      "workspace.units": "apparatus",
      "workspace.personnel": "scheduling",
      "workspace.weather": "weather",
    },
    modules: {
      core_mod_incident: {
        incident_internal_id: "HL-2026-001",
        incident_final_type: ["STRUCTURE_FIRE"],
        incident_people_present: "True",
        fire: "True",
        incident_narrative_outcome: "Kitchen fire extinguished prior to full room involvement. No injuries.",
      },
      mod_fire: {
        fire_investigation_need: "NOT_NEEDED",
        structure_arrival_conditions: "SMOKE_SHOWING",
        structure_damage: "MINOR",
      },
      mod_hazard: {},
    },
  },
  {
    id: "NERIS-2026-002",
    reportNumber: "HL-2026-002",
    incidentDate: "2026-06-12",
    incidentAddress: "120 Commerce Dr, Horn Lake, MS 38637",
    incidentTypeSummary: "OUTSIDE_FIRE",
    status: "Needs Review",
    disciplines: ["fire", "wildland"],
    reviewStage: "company_officer",
    locked: false,
    createdAt: "2026-06-12T09:05:00.000Z",
    updatedAt: "2026-06-12T11:40:00.000Z",
    workspace: {
      cad: { cadCallNumber: "CAD-2026-1088", dispatchTime: "2026-06-12T09:00", priority: "Routine" },
      wildland: { acresBurned: "0.25", fuelType: "GRASS", percentContained: "100" },
      actions: ["SUPPRESSION"],
      narrative: { body: "Brush fire contained to median. Mopping up hot spots." },
      approvals: [{ id: "APR-1", action: "submit", reviewerName: "Adam Tutor", timestamp: "2026-06-12T11:40:00.000Z", comments: "" }],
    },
    modules: {
      core_mod_incident: {
        incident_internal_id: "HL-2026-002",
        incident_final_type: ["OUTSIDE_FIRE"],
        incident_aid_direction: "NONE",
        incident_narrative_outcome: "Brush fire contained to median. Mopping up hot spots.",
      },
      mod_fire: {
        outside_fire_cause: "UNINTENTIONAL",
        outside_fire_acres_burned: "0.25",
      },
      mod_hazard: {},
    },
  },
];

export const NERIS_FIRE_REPORT_LIST_KEY = LIST_KEYS.nerisFireReports;
