// Inspection form fields filled from the occupancy (name, address, contacts).
// Run: npm run test:unit
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { answersWithOccupancy, occupancyAddressParts, occupancyFieldFor, occupancySnapshotFor, prefillAnswersFromOccupancy, splitOneLineAddress } from "../../src/lib/inspections/occupancyPrefill.js";

const occupancy = {
  id: "occ-1",
  name: "Main Street Diner",
  address: "120 Main St",
  city: "Springfield",
  state: "IL",
  zip: "62701",
  primaryContactName: "Dana Owner",
  primaryContactPhone: "555-0100",
  primaryContactEmail: "dana@example.com",
  contacts: [
    { name: "Dana Owner", role: "Owner", phone: "555-0100", isPrimary: true },
    { name: "Sam Keys", role: "Emergency contact", phone: "555-0199" },
  ],
};

// The "Inspection Information" block from the uploaded form in the screenshot.
const template = { sections: [{ title: "Inspection Information", fields: [
  { key: "type", label: "Inspection Type", type: "dropdown", options: ["Annual", "Re-inspection", "Complaint"] },
  { key: "biz", label: "Business Name", type: "short_text" },
  { key: "addr", label: "Address", type: "long_text" },
  { key: "contact", label: "Contact Info/Name", type: "short_text" },
  { key: "phone", label: "Phone #s", type: "short_text" },
  { key: "ec", label: "Emergency Contact", type: "short_text" },
  { key: "ecPhone", label: "Emergency Contact Phone #s", type: "short_text" },
  { key: "lanes", label: "Fire lanes clear", type: "yes_no" },
  { key: "addrVisible", label: "Address visible", type: "pass_fail_na" },
] }] };

describe("inspection fields filled from the occupancy", () => {
  it("matches the usual labels", () => {
    assert.equal(occupancyFieldFor("Business Name"), "name");
    assert.equal(occupancyFieldFor("Contact Info/Name"), "contactName");
    assert.equal(occupancyFieldFor("Phone #s"), "phone");
    assert.equal(occupancyFieldFor("Emergency Contact"), "emergencyName");
    assert.equal(occupancyFieldFor("Emergency Contact Phone #s"), "emergencyPhone");
    assert.equal(occupancyFieldFor("Zip Code"), "zip");
    assert.equal(occupancyFieldFor("Fire lanes clear"), "");
  });

  it("fills the Inspection Information block", () => {
    const { answers, filled } = prefillAnswersFromOccupancy(template, occupancy, {}, { inspectionType: { name: "Annual Fire Inspection" } });
    assert.equal(answers.type, "Annual");
    assert.equal(answers.biz, "Main Street Diner");
    assert.equal(answers.addr, "120 Main St, Springfield, IL 62701");
    assert.equal(answers.contact, "Dana Owner");
    assert.equal(answers.phone, "555-0100");
    assert.equal(answers.ec, "Sam Keys");
    assert.equal(answers.ecPhone, "555-0199");
    assert.equal(answers.lanes, undefined);
    assert.equal(answers.addrVisible, undefined);
    assert.equal(filled.length, 7);
  });

  it("never overwrites what an inspector typed, and leaves unknowns blank", () => {
    const noEmergency = { ...occupancy, contacts: [occupancy.contacts[0]] };
    const { answers } = prefillAnswersFromOccupancy(template, noEmergency, { biz: "Diner (rear unit)" });
    assert.equal(answers.biz, "Diner (rear unit)");
    assert.equal(answers.ec, undefined);
    assert.equal(answers.type, undefined);
  });

  it("puts only the street in Address when the form has City/State/Zip", () => {
    const split = { sections: [{ fields: [
      { key: "a", label: "Street Address", type: "short_text" },
      { key: "c", label: "City", type: "short_text" },
      { key: "s", label: "State", type: "short_text" },
      { key: "z", label: "Zip", type: "short_text" },
    ] }] };
    const { answers } = prefillAnswersFromOccupancy(split, occupancy);
    assert.deepEqual(answers, { a: "120 Main St", c: "Springfield", s: "IL", z: "62701" });
  });

  it("fills open inspections from their snapshot, not completed ones", () => {
    const record = { status: "in_progress", templateSnapshot: template, occupancySnapshot: occupancySnapshotFor(occupancy), answers: { biz: "" } };
    assert.equal(answersWithOccupancy(record).ec, "Sam Keys");
    assert.equal(answersWithOccupancy({ ...record, status: "completed" }).biz, "");
    assert.equal(answersWithOccupancy({ ...record, occupancySnapshot: null }, occupancy).biz, "Main Street Diner");
  });
});

// Occupancies with the whole address in Address and City/State/ZIP blank (e.g. 662 Tire).
describe("one-line occupancy addresses", () => {
  const oneLine = { id: "occ-2", name: "662 Tire", address: "2214 Goodman Rd W, Horn Lake, MS 38637" };
  const split = { sections: [{ fields: [
    { key: "addr", label: "Address", type: "short_text" },
    { key: "city", label: "City", type: "short_text" },
    { key: "state", label: "State", type: "short_text" },
    { key: "zip", label: "Zip Code", type: "short_text" },
  ] }] };

  it("splits street, city, state and ZIP", () => {
    assert.deepEqual(splitOneLineAddress("2214 Goodman Rd W, Horn Lake, MS 38637"), { street: "2214 Goodman Rd W", city: "Horn Lake", state: "MS", zip: "38637" });
    assert.deepEqual(splitOneLineAddress("2214 Goodman Rd W, Horn Lake MS 38637"), { street: "2214 Goodman Rd W", city: "Horn Lake", state: "MS", zip: "38637" });
    assert.deepEqual(splitOneLineAddress("2214 Goodman Rd W, Horn Lake, ms, 38637-1234"), { street: "2214 Goodman Rd W", city: "Horn Lake", state: "MS", zip: "38637-1234" });
    assert.deepEqual(splitOneLineAddress("Suite 4, 10 Main St, Horn Lake, MS"), { street: "Suite 4, 10 Main St", city: "Horn Lake", state: "MS", zip: "" });
  });

  it("leaves lines that don't end in a state or ZIP alone", () => {
    assert.equal(splitOneLineAddress("2214 Goodman Rd W"), null);
    assert.equal(splitOneLineAddress("Rear lot, behind store"), null);
    assert.equal(splitOneLineAddress("100 Main St, Apt B, NW"), null);
  });

  it("fills a template's separate Address, City, State and ZIP items", () => {
    const { answers } = prefillAnswersFromOccupancy(split, oneLine, {});
    assert.deepEqual(answers, { addr: "2214 Goodman Rd W", city: "Horn Lake", state: "MS", zip: "38637" });
  });

  it("keeps the full line in a single Address item", () => {
    const { answers } = prefillAnswersFromOccupancy({ sections: [{ fields: [{ key: "addr", label: "Address", type: "long_text" }] }] }, oneLine, {});
    assert.equal(answers.addr, "2214 Goodman Rd W, Horn Lake, MS 38637");
  });

  it("uses the occupancy's own City/State/ZIP whenever any is set", () => {
    assert.deepEqual(occupancyAddressParts({ address: "2214 Goodman Rd W, Horn Lake, MS 38637", city: "Southaven" }),
      { address: "2214 Goodman Rd W, Horn Lake, MS 38637", city: "Southaven", state: "", zip: "" });
    assert.deepEqual(prefillAnswersFromOccupancy(split, occupancy, {}).answers, { addr: "120 Main St", city: "Springfield", state: "IL", zip: "62701" });
  });

  it("fills blanks on an open inspection that was created before this", () => {
    const record = { status: "in_progress", templateSnapshot: split, occupancySnapshot: oneLine, answers: { addr: "", city: "", state: "", zip: "" } };
    assert.deepEqual(answersWithOccupancy(record), { addr: "2214 Goodman Rd W", city: "Horn Lake", state: "MS", zip: "38637" });
  });

  it("moves an earlier whole-line Address answer into the separate items, but keeps typed answers", () => {
    const earlier = { addr: "2214 Goodman Rd W, Horn Lake, MS 38637", city: "", state: "", zip: "" };
    assert.deepEqual(prefillAnswersFromOccupancy(split, oneLine, earlier).answers, { addr: "2214 Goodman Rd W", city: "Horn Lake", state: "MS", zip: "38637" });
    const typed = { addr: "2214 Goodman Rd W (rear bay)", city: "", state: "", zip: "" };
    assert.equal(prefillAnswersFromOccupancy(split, oneLine, typed).answers.addr, "2214 Goodman Rd W (rear bay)");
  });
});
