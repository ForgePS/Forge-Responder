/**
 * EMS patient care reports for the Riverside demo, shared by the online demo (src/lib/demoEms.js, on demo sign-in)
 * and the offline demo seed (scripts/offline-demo/seedEms.mjs).
 *
 *   - report permissions for the demo roles (Fire Chief: all; Battalion Chief: all; Captain: chart + read all;
 *     Firefighter: chart)
 *   - EMS agency settings (made-up IDs) so NEMSIS export works
 *   - form settings: the AI narrator on, a destination drop-down
 *   - sample reports for the demo crew: posted, posted with NEMSIS errors ("Needs review"), and a draft
 *
 * Every patient, address and ID here is invented. Pure data and builders: no Firebase, no file access.
 */
import { getValue, newPcr, setLeaf } from "../lib/nemsis/pcrModel.js";

// Demo-only grants: production roles keep these off until a department chooses who sees patient data.
export const DEMO_PCR_ROLE_GRANTS = {
  fireChief: ["editPcrs", "viewAllPcrs", "unlockPcrs", "exportPcrs", "reviewPcrs"],
  battalionChief: ["editPcrs", "viewAllPcrs", "unlockPcrs", "exportPcrs", "reviewPcrs"],
  companyOfficer: ["editPcrs", "viewAllPcrs"],
  firefighter: ["editPcrs"],
};

/** Demo form settings: the AI narrator on, and a department drop-down for destinations (all invented). */
export const DEMO_EMS_FORM = {
  aiNarrative: true,
  sections: {},
  fields: {
    "eDisposition.01": { label: "Destination", choices: ["Riverside Regional Medical Center", "St. Mary's Hospital", "Riverside Children's Hospital"] },
    "eNarrative.01": { help: "Write it yourself or use the AI narrator." },
  },
};

export const DEMO_EMS_SETTINGS = { stateAgencyId: "37-DEMO-0001", agencyNumber: "DEMO01", agencyName: "Riverside Fire & EMS", state: "37" };

export const DEMO_PCR_IDS = [
  "0d3e8f1a-5b7c-4a1e-9c2d-000000000001",
  "0d3e8f1a-5b7c-4a1e-9c2d-000000000002",
  "0d3e8f1a-5b7c-4a1e-9c2d-000000000003",
];

/** "2026-11-15T14:03:05-06:00" moved by `days` (keeps the written offset). */
export function shiftDays(value, days) {
  const m = /^(.*)([+-]\d{2}:\d{2})$/.exec(String(value));
  if (!m) return value;
  const t = new Date(`${m[1]}Z`);
  t.setUTCDate(t.getUTCDate() + days);
  return `${t.toISOString().slice(0, 19)}${m[2]}`;
}

function shiftAllTimes(node, days) {
  if (Array.isArray(node)) return node.map((n) => shiftAllTimes(n, days));
  if (node && typeof node === "object") return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, shiftAllTimes(v, days)]));
  return typeof node === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/.test(node) ? shiftDays(node, days) : node;
}

function daysBetween(fromIso, to) {
  return Math.max(0, Math.floor((to.getTime() - Date.parse(fromIso)) / 86_400_000));
}

/**
 * The three sample reports, charted by `crewUid`. `sample` is the synthetic chest-pain call (src/data/demoPcrSample.json);
 * its times move to yesterday and today, keeping the times of day.
 */
export function buildDemoPcrs(schema, { sample, crewUid, crewName, source, now = new Date() }) {
  const base = daysBetween("2026-11-15T12:00:00Z", now);
  const settings = DEMO_EMS_SETTINGS;
  const reports = [];
  const make = ({ uuid, number, days, status, edit = (p) => p, patient }) => {
    let nemsis = edit(shiftAllTimes({ ...sample.data, attrs: { UUID: uuid } }, base + days));
    nemsis = setLeaf(schema, nemsis, "eRecord.01", number);
    nemsis = setLeaf(schema, nemsis, "eResponse.01", settings.agencyNumber);
    nemsis = setLeaf(schema, nemsis, "eResponse.02", settings.agencyName);
    if (patient) {
      nemsis = setLeaf(schema, nemsis, "ePatient.02", patient.last);
      nemsis = setLeaf(schema, nemsis, "ePatient.03", patient.first);
    }
    const notified = getValue(schema, nemsis, "eTimes.03") || getValue(schema, nemsis, "eTimes.01") || new Date(now.getTime() - 3 * 3600_000).toISOString();
    const at = new Date(Date.parse(notified) + 90 * 60_000).toISOString();
    reports.push({
      id: uuid,
      uuid,
      number,
      status,
      crewUids: [crewUid],
      incidentNumber: getValue(schema, nemsis, "eResponse.03") || "",
      unit: "Medic 1",
      nemsis,
      createdAt: at,
      createdByUid: crewUid,
      createdByName: crewName,
      updatedAt: at,
      updatedByUid: crewUid,
      updatedByName: crewName,
      source,
      ...(status === "posted" ? { postedAt: at, postedByUid: crewUid, postedByName: crewName } : {}),
    });
  };
  make({ uuid: DEMO_PCR_IDS[0], number: "DEMO-PCR-0001", days: -1, status: "posted" });
  // Posted with errors the server check will find: the unit-notified time is missing.
  make({
    uuid: DEMO_PCR_IDS[1], number: "DEMO-PCR-0002", days: 0, status: "posted",
    patient: { first: "Jordan", last: "Samplecase" },
    edit: (p) => {
      const { eTimes, ...rest } = p;
      const { "eTimes.03": _notified, ...times } = eTimes;
      return { ...rest, eTimes: times };
    },
  });
  // A draft the crew is still charting: dispatch and times only.
  const draftUuid = DEMO_PCR_IDS[2];
  const draft = newPcr(schema, {
    uuid: draftUuid, number: "DEMO-PCR-0003", softwareVersion: "demo",
    agency: { number: settings.agencyNumber, name: settings.agencyName },
    unit: { callSign: "MEDIC 1", vehicleNumber: "M1" },
    cad: { notified: shiftDays("2026-11-15T09:12:00-06:00", base), address: "220 River Rd", stateCode: "37" },
  });
  const nowIso = now.toISOString();
  reports.push({
    id: draftUuid, uuid: draftUuid, number: "DEMO-PCR-0003", status: "draft", crewUids: [crewUid], incidentNumber: "", unit: "Medic 1",
    nemsis: draft, createdAt: nowIso, createdByUid: crewUid, createdByName: crewName,
    updatedAt: nowIso, updatedByUid: crewUid, updatedByName: crewName, source,
  });
  return reports;
}
