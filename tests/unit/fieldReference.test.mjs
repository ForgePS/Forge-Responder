import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeFieldAppConfig, usableContacts, usableDrugDosages,
} from "../../src/field/fieldAppConfig.js";
import { referenceKind } from "../../src/field/fieldReference.js";

test("settings keep contacts and dosage rows, even half-typed ones", () => {
  const config = normalizeFieldAppConfig({
    contacts: [{ name: "Riverside Water", phone: "555-0100" }, { name: "", phone: "" }],
    drugDosages: [{ drug: "Example drug" }, {}],
  });
  assert.equal(config.contacts.length, 2);
  assert.equal(config.drugDosages.length, 2);
  assert.deepEqual(normalizeFieldAppConfig({}).contacts, []);
  assert.deepEqual(normalizeFieldAppConfig(null).drugDosages, []);
});

test("phones only show complete contacts", () => {
  const rows = usableContacts([
    { name: "  Riverside Water  ", group: "Utilities", phone: " 555-0100 " },
    { name: "No phone" },
    { phone: "555-0199" },
  ]);
  assert.deepEqual(rows.map((row) => [row.name, row.phone]), [["Riverside Water", "555-0100"]]);
});

test("phones only show dosage rows with a drug and a dose", () => {
  const rows = usableDrugDosages([
    { drug: "Drug A", adult: "per protocol" },
    { drug: "Drug B" },
    { adult: "no drug name" },
    { drug: "Drug C", pediatric: "per protocol" },
  ]);
  assert.deepEqual(rows.map((row) => row.drug), ["Drug A", "Drug C"]);
});

test("documents are sorted into the EMS and HazMat cards", () => {
  assert.equal(referenceKind({ category: "EMS Protocol", title: "Cardiac arrest" }), "ems");
  assert.equal(referenceKind({ category: "SOG", title: "HazMat response" }), "hazmat");
  assert.equal(referenceKind({ category: "SOG", title: "Haz-Mat decon" }), "hazmat");
  assert.equal(referenceKind({ category: "SOG", title: "Hazardous materials levels" }), "hazmat");
  assert.equal(referenceKind({ category: "SOG", title: "Vehicle fires" }), "");
});
