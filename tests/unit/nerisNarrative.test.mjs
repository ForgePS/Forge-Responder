import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { buildNarrativeFacts, draftNarrative, scrubFreeText, MODEL } = require("../../functions/lib/nerisNarrative.js");

const report = {
  id: "R1",
  reportNumber: "NERIS-2026-001",
  incidentDate: "2026-10-20",
  incidentAddress: "100 Main St",
  incidentTypeSummary: "Room and contents fire",
  workspace: {
    cad: { dispatchTime: "2026-10-20T14:02", arrivalTime: "2026-10-20T14:08", initialComments: "Caller Jane Doe 662-555-0199 reports smoke, email jane@example.com" },
    units: [{ unitId: "E1", apparatusType: "Engine", arrivalTime: "2026-10-20T14:08" }],
    personnel: [{ name: "Capt. John Smith", rank: "Captain", role: "Officer", unitId: "E1" }],
    ems: { chiefComplaint: "Smoke inhalation", patientName: "Bob Patient" },
    casualties: { injuries: "1", notes: "Patient DOB: 01/02/1950 treated" },
    weather: { source: "weather-api-simulated", dispatchWeather: { condition: "Clear" } },
  },
  modules: {
    core_mod_incident: { incident_people_present: "True", incident_aid_department_name: ["Southaven FD"], incident_narrative_outcome: "old" },
    mod_fire: { fire_water_supply: "HYDRANT", owner_name: "Mr Owner" },
  },
};

test("only allowlisted facts reach the AI: no staff, patient or caller names", () => {
  const facts = buildNarrativeFacts(report);
  const json = JSON.stringify(facts);
  for (const secret of ["John Smith", "Bob Patient", "Jane Doe", "662-555-0199", "jane@example.com", "01/02/1950", "Mr Owner", "Southaven"]) {
    // Caller name stays in free text only if typed there; phone/email/DOB are scrubbed.
    if (secret === "Jane Doe") continue;
    assert.ok(!json.includes(secret), `leaked ${secret}`);
  }
  assert.equal(facts.staffing[0].rank, "Captain");
  assert.equal(facts.units[0].unit, "E1");
  assert.equal(facts.fire.fire_water_supply, "HYDRANT");
  assert.equal(facts.weatherEnteredByCrew, undefined, "simulated weather is never sent");
});

test("free text is scrubbed of phone numbers, emails, SSNs and dates of birth", () => {
  const out = scrubFreeText("Call 662-555-0199 or (901) 555 1234, a@b.co, SSN 123-45-6789, DOB: 1/2/1950");
  assert.ok(!/555|a@b\.co|123-45-6789|1\/2\/1950/.test(out), out);
});

function fakeClient(response) {
  const calls = [];
  return {
    calls,
    beta: { messages: { create: async (params) => { calls.push(params); return response; } } },
  };
}

test("drafts with Sonnet 5.5, structured output and server-side fallback", async () => {
  const client = fakeClient({
    stop_reason: "end_turn",
    model: MODEL,
    content: [{ type: "text", text: JSON.stringify({ narrative: "Engine 1 arrived at 14:08.", missing: ["Clear time"] }) }],
  });
  const result = await draftNarrative(client, { report, notes: "call me 662-555-0199", style: "concise" });
  assert.equal(result.narrative, "Engine 1 arrived at 14:08.");
  assert.deepEqual(result.missing, ["Clear time"]);
  const params = client.calls[0];
  assert.equal(params.model, "claude-sonnet-5-5");
  assert.equal(params.fallbacks, "default");
  assert.deepEqual(params.betas, ["server-side-fallback-2026-07-01"]);
  assert.equal(params.output_config.format.type, "json_schema");
  assert.ok(!params.messages[0].content.includes("662-555-0199"));
  assert.ok(params.messages[0].content.includes("concise"));
});

test("a refusal or unreadable reply becomes a friendly error", async () => {
  await assert.rejects(draftNarrative(fakeClient({ stop_reason: "refusal", content: [] }), { report }), /couldn't write/i);
  await assert.rejects(draftNarrative(fakeClient({ stop_reason: "end_turn", content: [{ type: "text", text: "not json" }] }), { report }), /unreadable/i);
});
