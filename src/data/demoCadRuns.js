/*
 * Sample CAD calls for the demo department only (forge-demo, "Riverside Fire & EMS").
 * Import from CAD lists these so a demo can start a NERIS report from a realistic
 * dispatch record with one click. All fictional; dates are relative to today.
 *
 * Each run is shaped like a CAD JSON export, so it goes through the same parser as a
 * pasted or uploaded record.
 */

function at(daysAgo, hhmm, plusMinutes = 0) {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(h, m + plusMinutes, 0, 0);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Unit times as minutes after the call was received: [dispatch, en route, on scene, clear]. */
function unit(unitId, apparatusType, station, daysAgo, received, [dispatch, enroute, arrive, clear]) {
  return {
    unit_id: unitId,
    apparatus_type: apparatusType,
    station,
    dispatch_time: at(daysAgo, received, dispatch),
    enroute_time: at(daysAgo, received, enroute),
    arrival_time: arrive == null ? "" : at(daysAgo, received, arrive),
    clear_time: at(daysAgo, received, clear),
  };
}

const E1 = ["Engine 1", "Engine", "Station 1"];
const E2 = ["Engine 2", "Engine", "Station 2"];
const T3 = ["Truck 3", "Ladder", "Station 3"];
const M1 = ["Medic 1", "ALS Ambulance", "Station 1"];
const M2 = ["Medic 2", "ALS Ambulance", "Station 2"];
const R1 = ["Rescue 1", "Heavy Rescue", "Station 1"];
const BC1 = ["Battalion 1", "Command", "Station 1"];

function run({ seq, daysAgo, received, type, address, priority, alarm = "1", comments, units, clearAfter }) {
  const year = new Date().getFullYear();
  return {
    incident_number: `${year}-${String(seq).padStart(5, "0")}`,
    incident_type: type,
    address,
    city: "Riverside",
    state: "MS",
    priority,
    alarm_level: alarm,
    received_time: at(daysAgo, received),
    dispatch_time: at(daysAgo, received, 1),
    clear_time: at(daysAgo, received, clearAfter),
    comments,
    units: units.map(([[id, kind, station], times]) => unit(id, kind, station, daysAgo, received, times)),
  };
}

export function buildDemoCadRuns() {
  return [
    run({
      seq: 4187, daysAgo: 0, received: "06:42", type: "Structure fire - residential", address: "412 Oak St",
      priority: "Emergency", comments: "Caller reports smoke from the attic of a single-story home. All occupants out. Second caller reports flames through the roof.",
      clearAfter: 148,
      units: [
        [E1, [1, 2, 7, 140]], [T3, [1, 3, 9, 148]], [E2, [1, 2, 10, 132]], [M1, [1, 2, 8, 95]], [BC1, [1, 3, 9, 146]],
      ],
    }),
    run({
      seq: 4179, daysAgo: 1, received: "16:38", type: "Cardiac arrest", address: "88 Willow Ln",
      priority: "Emergency", comments: "62-year-old male collapsed in the garage. Wife doing CPR per dispatcher instructions. AED not available.",
      clearAfter: 61,
      units: [[M1, [1, 2, 7, 61]], [E1, [1, 2, 6, 38]]],
    }),
    run({
      seq: 4171, daysAgo: 2, received: "07:51", type: "Motor vehicle crash with entrapment", address: "Hwy 51 & Main St",
      priority: "Emergency", comments: "Two-vehicle T-bone, one driver pinned, airbag deployed. Fluids leaking. Law enforcement en route.",
      clearAfter: 84,
      units: [[E1, [1, 2, 7, 70]], [R1, [1, 3, 8, 78]], [M2, [1, 2, 9, 62]], [BC1, [1, 3, 10, 84]]],
    }),
    run({
      seq: 4166, daysAgo: 3, received: "11:19", type: "Natural gas leak - commercial", address: "214 Main St",
      priority: "Urgent", comments: "Main Street Diner manager reports strong odor of gas in the kitchen. Building being evacuated.",
      clearAfter: 56,
      units: [[E2, [1, 2, 6, 56]], [T3, [1, 3, 9, 48]]],
    }),
    run({
      seq: 4160, daysAgo: 3, received: "19:04", type: "Fire alarm activation - commercial", address: "4710 Riverside Rd",
      priority: "Routine", comments: "Riverside High School general fire alarm, zone 4 smoke detector (gym). Keyholder en route.",
      clearAfter: 27,
      units: [[E1, [1, 2, 8, 27]], [T3, [1, 3, 10, 22]]],
    }),
    run({
      seq: 4152, daysAgo: 4, received: "09:27", type: "Lift assist", address: "455 Willow Creek Ln",
      priority: "Routine", comments: "Willow Creek Nursing Home staff request help lifting a resident back to bed. No injuries reported.",
      clearAfter: 24,
      units: [[E2, [1, 2, 7, 24]]],
    }),
    run({
      seq: 4148, daysAgo: 5, received: "22:46", type: "Vehicle fire", address: "I-55 SB at mile marker 289",
      priority: "Emergency", comments: "Pickup truck on fire on the shoulder, driver out of the vehicle. Fire showing from the engine compartment.",
      clearAfter: 52,
      units: [[E2, [1, 2, 9, 52]]],
    }),
    run({
      seq: 4141, daysAgo: 6, received: "13:10", type: "Fall with injury", address: "880 Riverfront Pkwy",
      priority: "Urgent", comments: "Riverside Inn guest fell down the south stairwell. Conscious, complaining of hip pain, unable to stand.",
      clearAfter: 47,
      units: [[M2, [1, 2, 7, 47]], [E2, [1, 2, 6, 22]]],
    }),
  ];
}

/** One line for the picker: "Structure fire - residential · 412 Oak St". */
export function describeDemoCadRun(record) {
  const units = (record.units || []).map((u) => u.unit_id).join(", ");
  return { number: record.incident_number, type: record.incident_type, address: record.address, received: record.received_time, units };
}
