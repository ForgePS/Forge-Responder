/*
 * NERIS incident reports for the demo department only (forge-demo, "Riverside Fire & EMS").
 *
 * About one call every 2–3 days from January 1 of this year through yesterday, so the
 * NERIS list and NERIS Analytics (NFPA 1710 times, annual survey, incident map, ad-hoc
 * reports) have a realistic year of data. All fictional. Generated from a fixed seed,
 * so the same reports come back on every reseed; only the dates move with "today".
 *
 * Older reports are Submitted; the last couple of weeks include reports still being
 * written or waiting for review, so the workflow has something in every stage.
 */

// Small deterministic PRNG (mulberry32).
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pad = (n, w = 2) => String(n).padStart(w, "0");
const dayId = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const stamp = (d) => `${dayId(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
const plus = (d, seconds) => new Date(d.getTime() + seconds * 1000);

// Fictional town center; incidents scatter within about 4 km.
const CENTER = { lat: 32.3601, lng: -89.4762 };

const STREETS = [
  "Oak St", "Willow Ln", "Main St", "Riverfront Pkwy", "Cedar Ave", "Magnolia Dr", "Elm St", "Pine Ct",
  "Station Rd", "Riverside Rd", "Bluff Rd", "Cypress Way", "Dogwood Cir", "Hickory Ridge Rd", "Lakeview Dr",
  "Commerce Dr", "Mill St", "Church St", "Sycamore Ln", "Poplar Ave",
];

// Demo buildings (match the demo occupancies) for calls that happen at a business.
const BUILDINGS = [
  { name: "Riverside High School", address: "4710 Riverside Rd", use: "Educational" },
  { name: "Main Street Diner", address: "214 Main St", use: "Mercantile / Business" },
  { name: "Riverside Distribution Center", address: "2600 Commerce Dr", use: "Storage" },
  { name: "Riverside Inn", address: "880 Riverfront Pkwy", use: "Residential - hotel" },
  { name: "Riverside City Hall", address: "3101 Main St", use: "Business" },
  { name: "Riverside Regional Medical Center", address: "1500 Hospital Dr", use: "Health care" },
  { name: "Willow Creek Nursing Home", address: "455 Willow Creek Ln", use: "Health care" },
  { name: "Riverside Plaza Shopping Center", address: "7100 Riverside Plaza", use: "Mercantile" },
];

const BATTALION_BY_SHIFT = ["Battalion C. Demo", "Battalion Q. Scenario", "Battalion Y. Showcase"];

const UNIT_INFO = {
  "Engine 1": ["Engine", "Station 1"],
  "Engine 2": ["Engine", "Station 2"],
  "Truck 3": ["Ladder", "Station 3"],
  "Medic 1": ["ALS Ambulance", "Station 1"],
  "Medic 2": ["ALS Ambulance", "Station 2"],
  "Rescue 1": ["Heavy Rescue", "Station 1"],
  "Battalion 1": ["Command", "Station 1"],
};

/*
 * Call mix (weights roughly match a small combination department: mostly EMS).
 * kind: fire | ems | rescue | hazmat | service | noemerg
 */
const CALL_TYPES = [
  // EMS
  { w: 9, kind: "ems", code: "MEDICAL: ILLNESS: CHEST_PAIN_NON_TRAUMA", complaint: "CHEST_PAIN", text: "chest pain" },
  { w: 8, kind: "ems", code: "MEDICAL: ILLNESS: BREATHING_PROBLEMS", complaint: "BREATHING_PROBLEM", text: "difficulty breathing" },
  { w: 9, kind: "ems", code: "MEDICAL: INJURY: FALL", complaint: "FALL", text: "a fall" },
  { w: 7, kind: "ems", code: "MEDICAL: ILLNESS: SICK_CASE", complaint: "SICK", text: "a sick person" },
  { w: 4, kind: "ems", code: "MEDICAL: ILLNESS: UNCONSCIOUS_VICTIM", complaint: "UNCONSCIOUS", text: "an unresponsive person" },
  { w: 3, kind: "ems", code: "MEDICAL: ILLNESS: STROKE_CVA", complaint: "STROKE", text: "possible stroke" },
  { w: 3, kind: "ems", code: "MEDICAL: ILLNESS: DIABETIC_PROBLEMS", complaint: "DIABETIC", text: "a diabetic emergency" },
  { w: 3, kind: "ems", code: "MEDICAL: ILLNESS: CONVULSIONS_SEIZURES", complaint: "SEIZURE", text: "a seizure" },
  { w: 2, kind: "ems", code: "MEDICAL: ILLNESS: OVERDOSE", complaint: "OVERDOSE", text: "a possible overdose" },
  { w: 1, kind: "ems", code: "MEDICAL: ILLNESS: CARDIAC_ARREST", complaint: "CARDIAC_ARREST", text: "a cardiac arrest" },
  { w: 4, kind: "ems", code: "MEDICAL: INJURY: MOTOR_VEHICLE_COLLISION", complaint: "TRAUMA", text: "a motor vehicle crash with injuries", road: true },
  // Fire
  { w: 2, kind: "fire", code: "FIRE: STRUCTURE_FIRE: CONFINED_COOKING_APPLIANCE_FIRE", structure: true, size: "small", text: "a kitchen fire" },
  { w: 1, kind: "fire", code: "FIRE: STRUCTURE_FIRE: ROOM_AND_CONTENTS_FIRE", structure: true, size: "room", text: "a house fire" },
  { w: 0.5, kind: "fire", code: "FIRE: STRUCTURE_FIRE: STRUCTURAL_INVOLVEMENT_FIRE", structure: true, size: "major", text: "a working structure fire" },
  { w: 0.6, kind: "fire", code: "FIRE: STRUCTURE_FIRE: CHIMNEY_FIRE", structure: true, size: "small", text: "a chimney fire" },
  { w: 1.5, kind: "fire", code: "FIRE: TRANSPORTATION_FIRE: VEHICLE_FIRE_PASSENGER", vehicle: true, road: true, text: "a vehicle fire" },
  { w: 1.5, kind: "fire", code: "FIRE: OUTSIDE_FIRE: VEGETATION_GRASS_FIRE", outside: true, text: "a grass fire" },
  { w: 1, kind: "fire", code: "FIRE: OUTSIDE_FIRE: DUMPSTER_OUTDOOR_CONTAINER_FIRE", outside: true, text: "a dumpster fire" },
  // Rescue
  { w: 1.5, kind: "rescue", code: "RESCUE: TRANSPORTATION: MOTOR_VEHICLE_EXTRICATION_ENTRAPPED", road: true, text: "a crash with a person trapped" },
  { w: 0.5, kind: "rescue", code: "RESCUE: STRUCTURE: ELEVATOR_ESCALATOR_RESCUE", building: true, text: "people stuck in an elevator" },
  // Hazardous conditions
  { w: 2.5, kind: "hazmat", code: "HAZSIT: HAZARDOUS_MATERIALS: GAS_LEAK_ODOR", text: "a natural gas odor" },
  { w: 1.5, kind: "hazmat", code: "HAZSIT: HAZARDOUS_MATERIALS: CARBON_MONOXIDE_RELEASE", text: "a carbon monoxide alarm with readings" },
  { w: 1.5, kind: "hazmat", code: "HAZSIT: HAZARD_NONCHEM: ELEC_POWER_LINE_DOWN_ARCHING_MALFUNC", text: "a power line down" },
  { w: 1, kind: "hazmat", code: "HAZSIT: HAZARDOUS_MATERIALS: FUEL_SPILL_ODOR", road: true, text: "a fuel spill" },
  // Public service
  { w: 5, kind: "service", code: "PUBSERV: CITIZEN_ASSIST: LIFT_ASSIST", text: "a lift assist" },
  { w: 2, kind: "service", code: "PUBSERV: CITIZEN_ASSIST: CITIZEN_ASSIST_SERVICE_CALL", text: "a citizen assist" },
  { w: 1, kind: "service", code: "PUBSERV: OTHER: STANDBY", building: true, text: "a standby" },
  // No emergency
  { w: 4, kind: "noemerg", code: "NOEMERG: FALSE_ALARM: MALFUNCTIONING_ALARM", building: true, text: "a fire alarm activation" },
  { w: 3, kind: "noemerg", code: "NOEMERG: FALSE_ALARM: ACCIDENTAL_ALARM", building: true, text: "a fire alarm activation" },
  { w: 2, kind: "noemerg", code: "NOEMERG: CANCELLED", cancelled: true, text: "a call cancelled en route" },
  { w: 1, kind: "noemerg", code: "NOEMERG: GOOD_INTENT: SMOKE_FROM_NONHOSTILE_SOURCE", text: "reported smoke (controlled burn)" },
];
const TOTAL_WEIGHT = CALL_TYPES.reduce((sum, t) => sum + t.w, 0);

function pick(rand, list) {
  return list[Math.floor(rand() * list.length) % list.length];
}

function pickType(rand) {
  let r = rand() * TOTAL_WEIGHT;
  for (const type of CALL_TYPES) {
    r -= type.w;
    if (r <= 0) return type;
  }
  return CALL_TYPES[0];
}

function unitsFor(type, station2Side, rand) {
  const engine = station2Side ? "Engine 2" : "Engine 1";
  const medic = station2Side ? "Medic 2" : "Medic 1";
  switch (type.kind) {
    case "ems":
      return type.complaint === "CARDIAC_ARREST" || type.complaint === "TRAUMA" || rand() < 0.45 ? [medic, engine] : [medic];
    case "fire":
      if (type.structure && type.size !== "small") return [engine, "Truck 3", station2Side ? "Engine 1" : "Engine 2", medic, "Battalion 1"];
      if (type.structure) return [engine, "Truck 3", "Battalion 1"];
      return [engine];
    case "rescue":
      return type.road ? [engine, "Rescue 1", medic, "Battalion 1"] : [engine, "Truck 3"];
    case "hazmat":
      return type.road ? [engine] : [engine, "Truck 3"];
    case "service":
      return [engine];
    default:
      return type.building ? [engine, "Truck 3"] : [engine];
  }
}

function actionsFor(type, rand) {
  switch (type.kind) {
    case "ems": {
      const als = ["CARDIAC_ARREST", "CHEST_PAIN", "STROKE", "UNCONSCIOUS", "OVERDOSE", "SEIZURE"].includes(type.complaint) || rand() < 0.4;
      const list = ["EMERGENCY_MEDICAL_CARE: PATIENT_ASSESSMENT", als ? "EMERGENCY_MEDICAL_CARE: PROVIDE_ADVANCED_LIFE_SUPPORT" : "EMERGENCY_MEDICAL_CARE: PROVIDE_BASIC_LIFE_SUPPORT"];
      return list;
    }
    case "fire":
      if (type.structure && type.size !== "small") {
        return ["COMMAND_AND_CONTROL: ESTABLISH_INCIDENT_COMMAND", "SUPPRESSION: STRUCTURAL_FIRE_SUPPRESSION: INTERIOR", "SEARCH_STRUCTURE: DOOR_INITIATED_SEARCH: DURING_SUPPRESSION", "VENTILATION: POSITIVE_PRESSURE: POST_SUPPRESSION", "SALVAGE_AND_OVERHAUL", "PERSONNEL_CONTAMINATION_REDUCTION: ON_SCENE_CONTAMINATION_REDUCTION"];
      }
      if (type.structure) return ["SUPPRESSION: STRUCTURAL_FIRE_SUPPRESSION: INTERIOR", "VENTILATION: POSITIVE_PRESSURE: POST_SUPPRESSION", "SALVAGE_AND_OVERHAUL"];
      return ["SUPPRESSION: OUTSIDE_FIRE_SUPPRESSION: FIRE_CONTROL_EXTINGUISHMENT", "SALVAGE_AND_OVERHAUL"];
    case "rescue":
      return ["COMMAND_AND_CONTROL: ESTABLISH_INCIDENT_COMMAND", "EMERGENCY_MEDICAL_CARE: PATIENT_ASSESSMENT", "EMERGENCY_MEDICAL_CARE: PROVIDE_ADVANCED_LIFE_SUPPORT"];
    case "hazmat":
      return type.code.includes("POWER_LINE")
        ? ["COMMAND_AND_CONTROL: NOTIFY_OTHER_AGENCIES", "HAZARDOUS_SITUATION_MITIGATION: REMOVE_HAZARD"]
        : ["HAZARDOUS_SITUATION_MITIGATION: ATMOSPHERIC_MONITORING_INTERIOR", "COMMAND_AND_CONTROL: NOTIFY_OTHER_AGENCIES"];
    case "service":
      return ["EMERGENCY_MEDICAL_CARE: PATIENT_ASSESSMENT"];
    default:
      return ["INVESTIGATION"];
  }
}

const DISCIPLINE = { fire: "fire", ems: "ems", rescue: "rescue", hazmat: "hazmat", service: "public_assist", noemerg: "" };

function narrativeFor({ type, units, address, ic, transported, loss }) {
  const lead = units[0];
  const unitText = units.length > 1 ? `${units.slice(0, -1).join(", ")} and ${units[units.length - 1]}` : lead;
  switch (type.kind) {
    case "ems":
      return `${unitText} responded to ${address} for ${type.text}. Crews found one adult patient, completed an assessment and provided care. ${transported ? `Patient transported by ${units.find((u) => u.startsWith("Medic")) || lead} to Riverside Regional Medical Center in stable condition.` : "Patient refused transport after evaluation; refusal signed."}`;
    case "fire":
      return `${unitText} responded to ${address} for ${type.text}. ${type.structure ? `${lead} arrived to find ${type.size === "small" ? "light smoke showing" : "smoke and fire showing"} and made an interior attack. ${ic} established command. Fire was contained ${type.size === "major" ? "after a second line was deployed" : "to the area of origin"}. Overhaul completed and the scene turned over to the owner. Estimated loss $${loss.toLocaleString()}.` : `${lead} extinguished the fire with a single line. No exposures involved. Scene turned over to the property owner.`}`;
    case "rescue":
      return `${unitText} responded to ${address} for ${type.text}. ${type.road ? "One occupant was pinned by dash intrusion. Rescue 1 stabilized the vehicle and removed the door with hydraulic tools; extrication took about 14 minutes. Patient transported to Riverside Regional Medical Center." : "Occupants were removed safely using the elevator key. Elevator taken out of service and the building manager notified."} ${ic} was in command.`;
    case "hazmat":
      return `${unitText} responded to ${address} for ${type.text}. ${type.code.includes("POWER_LINE") ? "Area secured and the utility company requested; units stood by until the line was de-energized." : "Crews metered the structure, located the source and ventilated. Utility company notified and the occupants allowed back in after readings returned to zero."}`;
    case "service":
      return `${lead} responded to ${address} for ${type.text}. Crew assisted the resident, checked for injuries (none found) and cleared the scene.`;
    default:
      return type.cancelled
        ? `${lead} was dispatched to ${address} and cancelled en route by dispatch before arrival.`
        : `${unitText} responded to ${address} for ${type.text}. Crews investigated and found no fire or hazard. ${type.building ? "The alarm system was reset and the keyholder advised to have it serviced." : "Burn was authorized and attended; no action needed."}`;
  }
}

/** @param {Date} [now] */
export function buildDemoNerisReports(now = new Date()) {
  const rand = rng(20260101);
  const year = now.getFullYear();
  const start = new Date(year, 0, 1, 12);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
  const reports = [];

  for (let day = new Date(start); day < today; day.setDate(day.getDate() + 1)) {
    // About 0.42 calls a day: 0, 1 or occasionally 2.
    const roll = rand();
    const calls = roll < 0.64 ? 0 : roll < 0.95 ? 1 : 2;
    for (let i = 0; i < calls; i += 1) {
      const type = pickType(rand);
      // Busier in the daytime.
      const hour = rand() < 0.75 ? 7 + Math.floor(rand() * 15) : Math.floor(rand() * 24);
      const received = new Date(day);
      received.setHours(hour, Math.floor(rand() * 60), Math.floor(rand() * 60), 0);

      const building = type.building || (type.kind !== "fire" && rand() < 0.2) ? pick(rand, BUILDINGS) : null;
      const address = type.road && !building
        ? pick(rand, ["Hwy 51 & Main St", "I-55 SB at mile marker 289", "Riverside Rd & Commerce Dr", "Hwy 51 near Bluff Rd", "Main St & Church St"])
        : building ? building.address : `${100 + Math.floor(rand() * 4800)} ${pick(rand, STREETS)}`;
      const station2Side = rand() < 0.45;
      const units = unitsFor(type, station2Side, rand);

      // Times (seconds). Most calls meet NFPA 1710; a share run long, as real data does.
      const processing = Math.round(25 + rand() * 32 + (rand() < 0.1 ? 45 : 0));
      const turnout = Math.round(45 + rand() * 40 + (hour < 6 || hour >= 22 ? 25 : 0));
      const travel = Math.round(110 + rand() * 150 + (rand() < 0.12 ? 150 : 0));
      const sceneMinutes = type.kind === "fire" && type.structure && type.size !== "small" ? 90 + rand() * 90
        : type.kind === "rescue" ? 45 + rand() * 40
          : type.kind === "noemerg" ? 8 + rand() * 15
            : 15 + rand() * 30;

      const dispatch = plus(received, processing);
      const enroute = plus(dispatch, turnout);
      const arrival = plus(enroute, travel);
      const clear = plus(arrival, Math.round(sceneMinutes * 60));
      const cancelled = Boolean(type.cancelled);

      const unitRows = units.map((unitId, index) => {
        const lag = index * Math.round(20 + rand() * 50);
        const uDispatch = plus(dispatch, index ? Math.round(rand() * 20) : 0);
        const uEnroute = plus(enroute, lag);
        const uArrival = cancelled ? null : plus(arrival, index ? lag + Math.round(30 + rand() * 120) : 0);
        const uClear = plus(cancelled ? plus(enroute, 120) : clear, -Math.round(rand() * 600 * (index ? 1 : 0)));
        const [apparatusType, stationName] = UNIT_INFO[unitId];
        return {
          unitId,
          apparatusType,
          station: stationName,
          dispatchTime: stamp(uDispatch),
          enrouteTime: stamp(uEnroute),
          arrivalTime: uArrival ? stamp(uArrival) : "",
          clearTime: stamp(uClear < (uArrival || uEnroute) ? plus(uArrival || uEnroute, 300) : uClear),
          source: "cad-import",
        };
      });

      const shiftIndex = ((Math.round((day - new Date(2026, 5, 7, 12)) / 86400000) % 3) + 3) % 3;
      const ic = BATTALION_BY_SHIFT[shiftIndex];


      const peoplePresent = type.kind === "ems" || type.kind === "rescue" || type.kind === "service" || (type.structure && rand() < 0.7);
      const transported = type.kind === "rescue" ? true : type.kind === "ems" ? rand() < 0.78 : false;

      // Losses and casualties (fires and crashes).
      let loss = 0;
      if (type.structure) loss = type.size === "small" ? 800 + Math.round(rand() * 4000) : type.size === "room" ? 18000 + Math.round(rand() * 40000) : 95000 + Math.round(rand() * 120000);
      if (type.vehicle) loss = 4000 + Math.round(rand() * 14000);
      if (type.outside && type.code.includes("DUMPSTER")) loss = 300 + Math.round(rand() * 900);
      const civilianInjuries = (type.structure && type.size !== "small" && rand() < 0.35) || (type.kind === "rescue" && type.road) ? 1 : 0;
      const ffInjuries = type.structure && type.size === "major" && rand() < 0.5 ? 1 : 0;

      const modules = {
        core_mod_incident: {
          incident_final_type: [type.code],
          incident_people_present: peoplePresent ? "True" : "False",
          ...(cancelled ? { incident_noaction: "CANCELLED" } : { incident_actions_taken: actionsFor(type, rand) }),
          ...(type.kind === "fire" && rand() < 0.15 ? { incident_aid_direction: "RECEIVED", incident_aid_type: "SUPPORT_AID", incident_aid_department_name: "Pearl County Fire District" } : {}),
        },
      };
      if (type.kind === "fire") {
        modules.mod_fire = {
          fire_water_supply: type.structure ? "HYDRANT_LESS_500" : "TANK_WATER",
          fire_investigation_need: type.size === "major" ? "YES" : "NO_CAUSE_OBVIOUS",
          ...(type.structure ? {
            structure_arrival_conditions: type.size === "small" ? "SMOKE_SHOWING" : type.size === "room" ? "SMOKE_FIRE_SHOWING" : "STRUCTURE_INVOLVED",
            structure_progression_conditions: type.size === "major" ? "True" : "False",
            structure_damage: type.size === "small" ? "MINOR_DAMAGE" : type.size === "room" ? "MODERATE_DAMAGE" : "MAJOR_DAMAGE",
            structure_floor_of_origin: "1",
            structure_room_of_origin: type.code.includes("COOKING") ? "KITCHEN" : type.code.includes("CHIMNEY") ? "LIVING_SPACE" : pick(rand, ["KITCHEN", "BEDROOM", "LIVING_SPACE", "GARAGE"]),
            structure_fire_cause: type.code.includes("COOKING") ? "COOKING" : type.code.includes("CHIMNEY") ? "HEAT_FROM_ANOTHER_OBJECT" : pick(rand, ["ELECTRICAL", "COOKING", "SMOKING_MATERIALS_ILLICIT_DRUGS", "UNABLE_TO_BE_DETERMINED"]),
          } : {}),
          ...(type.outside ? {
            outside_fire_cause: type.code.includes("DUMPSTER") ? "SMOKING_MATERIALS_ILLICIT_DRUGS" : "DEBRIS_OPEN_BURNING",
            outside_fire_acres_burned: type.code.includes("GRASS") ? String(Math.round((0.1 + rand() * 2.4) * 10) / 10) : "0",
          } : {}),
        };
      }
      if (type.kind === "hazmat") {
        modules.mod_hazard = {
          hazsit_disposition: type.code.includes("POWER_LINE") ? "RELEASED_TO_PRIVATE_AGENCY" : "COMPLETED_FIRE_SERVICE_ONLY",
          hazsit_evacuated: type.code.includes("GAS_LEAK") ? String(Math.floor(rand() * 12)) : "0",
        };
      }
      if (type.kind === "ems") {
        modules.mod_medical = {
          patient_evaluation_care: transported ? "PATIENT_EVALUATED_CARE_PROVIDED" : "PATIENT_EVALUATED_REFUSED_CARE",
          patient_improved_status: type.complaint === "CARDIAC_ARREST" ? "UNCHANGED" : rand() < 0.7 ? "IMPROVED" : "UNCHANGED",
          medical_disposition: transported ? "TRANSPORT_BY_EMS_UNIT" : "PATIENT_REFUSED_TRANSPORT",
        };
      }

      const jitter = () => (rand() - 0.5) * 0.07;
      const reportDate = dayId(received);
      const narrative = narrativeFor({ type, units, address, ic, transported, loss });
      const updated = plus(clear, 3600 * (2 + rand() * 20));
      const id = `NERIS-D${reportDate.replace(/-/g, "")}-${i + 1}`;

      reports.push({
        id,
        reportNumber: "",
        incidentDate: reportDate,
        incidentAddress: address,
        incidentTypeSummary: type.code,
        status: "Submitted",
        disciplines: DISCIPLINE[type.kind] ? [DISCIPLINE[type.kind]] : [],
        createdAt: `${stamp(clear)}`,
        updatedAt: `${stamp(updated)}`,
        syncStatus: "synced",
        workspace: {
          cad: {
            incidentNumber: "",
            cadCallNumber: "",
            receivedTime: stamp(received),
            dispatchTime: stamp(dispatch),
            enrouteTime: stamp(enroute),
            arrivalTime: cancelled ? "" : stamp(arrival),
            clearTime: stamp(cancelled ? plus(enroute, 150) : clear),
            priority: type.kind === "service" || type.kind === "noemerg" ? "Routine" : "Emergency",
            alarmLevel: "1",
          },
          location: {
            ...(building ? { occupancyName: building.name, propertyUse: building.use } : {}),
            latitude: Number((CENTER.lat + jitter()).toFixed(5)),
            longitude: Number((CENTER.lng + jitter()).toFixed(5)),
          },
          units: unitRows,
          personnel: [{ name: ic, rank: "Battalion Chief", unitId: units.includes("Battalion 1") ? "Battalion 1" : units[0], role: units.includes("Battalion 1") ? "Incident Commander" : "Shift Commander" }],
          ems: type.kind === "ems" || (type.kind === "rescue" && type.road) ? {
            chiefComplaint: type.complaint || "TRAUMA",
            patientCount: "1",
            responseLevel: "ALS",
            disposition: transported ? "TRANSPORTED" : "REFUSED",
            transportAgency: transported ? "Riverside Fire & EMS" : "",
          } : {},
          casualties: (type.kind === "fire" || type.kind === "rescue" || type.kind === "ems")
            ? { injuries: String(type.kind === "ems" ? 0 : civilianInjuries), fatalities: "0", ffInjuries: String(ffInjuries) }
            : {},
          propertyLoss: loss ? { property: String(Math.round(loss * 0.7)), contents: String(loss - Math.round(loss * 0.7)) } : {},
          actions: [],
          narrative: { body: narrative, aiGenerated: false },
          attachments: [],
          approvals: [{ stage: "company_officer", decision: "Approved", by: ic, at: stamp(updated) }],
          auditLog: [],
          disciplines: DISCIPLINE[type.kind] ? [DISCIPLINE[type.kind]] : [],
        },
        autoPopulateSources: { "workspace.cad": "cad-import", "workspace.units": "cad-import" },
        fieldOverrides: {},
        fieldInputOverrides: {},
        modules,
        submittedAt: stamp(updated),
      });
    }
  }

  // Number in date order, then put the newest first like the list shows them.
  reports.sort((a, b) => a.workspace.cad.receivedTime.localeCompare(b.workspace.cad.receivedTime));
  reports.forEach((report, index) => {
    const number = `NERIS-${year}-${pad(index + 1, 3)}`;
    const cadNumber = `${year}-${pad(1000 + index * 7 + (index % 5), 5)}`;
    report.reportNumber = number;
    report.workspace.cad.incidentNumber = cadNumber;
    report.workspace.cad.cadCallNumber = cadNumber;
    report.modules.core_mod_incident.incident_internal_id = number;
  });

  // The newest reports are still moving through review, so every stage has something.
  const newest = [...reports].reverse();
  const STAGES = ["In Progress", "Draft", "Needs Review", "In Progress", "Needs Review", "Needs Review", "Approved", "Approved", "Approved"];
  STAGES.forEach((status, index) => {
    const report = newest[index];
    if (!report) return;
    report.status = status;
    if (status === "Approved") return;
    delete report.submittedAt;
    report.workspace.approvals = [];
    if (status === "Draft" || status === "In Progress") {
      report.workspace.narrative = { body: "", aiGenerated: false };
    }
  });
  for (const report of reports) {
    const done = report.status === "Submitted" || report.status === "Approved";
    report.locked = done;
    report.reviewStage = done ? "complete" : report.status === "Needs Review" ? "company_officer" : "author";
  }
  return newest;
}
