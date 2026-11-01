// Run: npm run test:unit
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  PERSONNEL_PRIVATE_KEYS,
  listHasPrivateFields,
  listHasPrivateKeys,
  mergePersonnelPrivate,
  personnelPrivateDocId,
  pickPersonnelPrivateFields,
  privateFieldsPatch,
  splitPersonnelList,
  splitPersonnelRecord,
  stripBlankPrivateKeys,
  stripPersonnelPrivateKeys,
} from "../../src/lib/personnelPrivateFields.js";

const person = {
  id: "P-001",
  firstName: "Ana",
  lastName: "Reyes",
  rank: "Captain",
  birthDate: "1980-02-03",
  socialSecurityNumber: "000-00-0000",
  gender: "",
  race: "   ",
  driversLicenseNumber: "D123",
  driversLicenseState: "MS",
};

describe("private key list", () => {
  it("covers SSN, birth date, demographics and license number, not license state/class", () => {
    assert.deepEqual([...PERSONNEL_PRIVATE_KEYS].sort(), [
      "birthDate", "citizenship", "driversLicenseNumber", "ethnicity", "gender", "maritalStatus", "race", "socialSecurityNumber",
    ]);
  });

  it("applies to the personnel list only", () => {
    assert.equal(listHasPrivateFields("hlfd-rms-personnel"), true);
    assert.equal(listHasPrivateFields("hlfd-rms-apparatus"), false);
  });
});

describe("splitPersonnelRecord", () => {
  it("removes every private key from the public part and keeps only real values", () => {
    const { publicRecord, privateFields } = splitPersonnelRecord(person);
    assert.deepEqual(publicRecord, {
      id: "P-001", firstName: "Ana", lastName: "Reyes", rank: "Captain", driversLicenseState: "MS",
    });
    assert.deepEqual(privateFields, {
      birthDate: "1980-02-03", socialSecurityNumber: "000-00-0000", driversLicenseNumber: "D123",
    });
    PERSONNEL_PRIVATE_KEYS.forEach((key) => assert.equal(key in publicRecord, false));
  });

  it("handles empty input", () => {
    assert.deepEqual(splitPersonnelRecord(undefined), { publicRecord: {}, privateFields: {} });
    assert.deepEqual(stripPersonnelPrivateKeys({ id: "x", gender: "" }), { id: "x" });
  });
});

describe("mergePersonnelPrivate", () => {
  it("round-trips a split record", () => {
    const { publicRecord, privateFields } = splitPersonnelRecord(person);
    const merged = mergePersonnelPrivate(publicRecord, privateFields);
    assert.equal(merged.birthDate, "1980-02-03");
    assert.equal(merged.socialSecurityNumber, "000-00-0000");
    assert.equal(merged.gender, "");
    assert.equal(merged.rank, "Captain");
    PERSONNEL_PRIVATE_KEYS.forEach((key) => assert.equal(key in merged, true));
  });

  it("prefers the private doc and falls back to values still on the list record", () => {
    const merged = mergePersonnelPrivate(
      { id: "P-001", birthDate: "1999-01-01", gender: "Female" },
      { birthDate: "1980-02-03", ssnIgnored: "x" },
    );
    assert.equal(merged.birthDate, "1980-02-03");
    assert.equal(merged.gender, "Female");
  });

  it("can ignore inline values", () => {
    const merged = mergePersonnelPrivate({ gender: "Female" }, {}, { inlineFallback: false });
    assert.equal(merged.gender, "");
  });
});

describe("pickPersonnelPrivateFields", () => {
  it("keeps only private keys with values", () => {
    assert.deepEqual(
      pickPersonnelPrivateFields({ birthDate: "1980-02-03", gender: "", updatedAt: "now", updatedBy: "u1" }),
      { birthDate: "1980-02-03" },
    );
  });
});

describe("privateFieldsPatch", () => {
  it("returns only changed keys, with blanks meaning clear", () => {
    const stored = { birthDate: "1980-02-03", gender: "Female" };
    const draft = { birthDate: "1980-02-03", gender: "", race: "Asian", rank: "Captain" };
    assert.deepEqual(privateFieldsPatch(draft, stored), { gender: "", race: "Asian" });
  });

  it("treats inline values not yet in the private doc as changes (so saving moves them)", () => {
    assert.deepEqual(privateFieldsPatch({ socialSecurityNumber: "000-00-0000" }, {}), { socialSecurityNumber: "000-00-0000" });
  });

  it("is empty when nothing changed (whitespace ignored)", () => {
    assert.deepEqual(privateFieldsPatch({ birthDate: " 1980-02-03 " }, { birthDate: "1980-02-03" }), {});
  });
});

describe("personnelPrivateDocId", () => {
  it("accepts normal ids and refuses ones Firestore can't use", () => {
    assert.equal(personnelPrivateDocId(" P-001 "), "P-001");
    assert.equal(personnelPrivateDocId(""), "");
    assert.equal(personnelPrivateDocId("a/b"), "");
    assert.equal(personnelPrivateDocId("__x__"), "");
  });
});

describe("splitPersonnelList", () => {
  it("strips every item and collects values by id", () => {
    const { items, privateById, keptInline } = splitPersonnelList([
      person,
      { id: "P-002", firstName: "Bo", gender: "" },
      { id: "", firstName: "No id", birthDate: "1990-01-01", race: "" },
    ]);
    assert.deepEqual(privateById, {
      "P-001": { birthDate: "1980-02-03", socialSecurityNumber: "000-00-0000", driversLicenseNumber: "D123" },
    });
    assert.equal(listHasPrivateKeys(items.slice(0, 2)), false);
    // No usable id: real values stay (nowhere to put them), blanks go.
    assert.deepEqual(items[2], { id: "", firstName: "No id", birthDate: "1990-01-01" });
    assert.deepEqual(keptInline, [""]);
  });
});

describe("stripBlankPrivateKeys", () => {
  it("drops blank private keys but keeps real values", () => {
    assert.deepEqual(stripBlankPrivateKeys([{ id: "P-1", gender: "", birthDate: "1980-02-03" }]), [
      { id: "P-1", birthDate: "1980-02-03" },
    ]);
  });
});
