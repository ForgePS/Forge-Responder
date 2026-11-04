// Full personnel profile: masking, service length, contacts, issued equipment, attention list.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  PROFILE_GROUPS, SELF_EDIT_KEYS, contactPatch, equipmentExpiration, expiryState, lengthOfService, maskSecret,
  profileAttention, profileEmails, profilePhones, suggestedRetirement, usableEquipment,
} from "../../src/lib/personnelProfile.js";
import { PERSONNEL_PRIVATE_KEYS } from "../../src/lib/personnelPrivateFields.js";

const NOW = new Date(2026, 10, 4, 12);

describe("personnel profile", () => {
  it("masks SSN and license numbers", () => {
    assert.equal(maskSecret("123-45-6789", { ssn: true }), "•••-••-6789");
    assert.equal(maskSecret("922738178"), "•••••8178");
    assert.equal(maskSecret(""), "");
  });

  it("works out length of service", () => {
    assert.equal(lengthOfService("2016-08-14", NOW), "10 yrs 2 mos");
    assert.equal(lengthOfService("2026-10-01", NOW), "1 mo");
    assert.equal(lengthOfService("", NOW), "");
    assert.equal(lengthOfService("2030-01-01", NOW), "");
  });

  it("knows expired and expiring soon", () => {
    assert.equal(expiryState("2026-11-01", NOW), "expired");
    assert.equal(expiryState("2027-01-15", NOW), "soon");
    assert.equal(expiryState("2028-01-01", NOW), "ok");
    assert.equal(expiryState("", NOW), "");
  });

  it("starts the phone and email lists from the single legacy values", () => {
    assert.deepEqual(profilePhones({ phone: "870-555-0100" }).map((row) => [row.number, row.primary]), [["870-555-0100", true]]);
    assert.deepEqual(profileEmails({}), []);
  });

  it("keeps one primary and copies it to phone/email", () => {
    const patch = contactPatch(
      [{ number: " 555-0100 ", primary: false }, { number: "555-0200", primary: true }, { number: "" }],
      [{ address: "A@Example.com", primary: true }, { address: "b@example.com", primary: true }],
    );
    assert.equal(patch.phones.length, 2);
    assert.equal(patch.phone, "555-0200");
    assert.equal(patch.emails.filter((row) => row.primary).length, 1);
    assert.equal(patch.email, "a@example.com");
  });

  it("retires structural gear 10 years after manufacture", () => {
    assert.equal(suggestedRetirement({ category: "Turnout coat", mfgDate: "2017-03-01" }), "2027-03-01");
    assert.equal(suggestedRetirement({ category: "Radio", mfgDate: "2017-03-01" }), "");
    assert.equal(equipmentExpiration({ category: "Helmet", mfgDate: "2017-03-01", expirationDate: "2026-12-31" }), "2026-12-31");
  });

  it("drops empty equipment rows", () => {
    const rows = usableEquipment([{ status: "Issued" }, { item: " Coat ", serial: "X1" }]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].item, "Coat");
  });

  it("lists what needs attention, soonest first", () => {
    const person = {
      stateLicenseExpiration: "2026-10-31",
      driversLicenseExpiration: "2027-01-10",
      immunizations: [{ vaccine: "Hep B", expiration: "2026-12-01" }],
      issuedEquipment: [
        { item: "Coat", category: "Turnout coat", mfgDate: "2016-12-20", serial: "C9" },
        { item: "Old helmet", category: "Helmet", mfgDate: "2010-01-01", status: "Retired" },
      ],
    };
    const items = profileAttention(person, [{ type: "CPR", expires: "2028-01-01" }], NOW);
    assert.deepEqual(items.map((row) => row.area), ["credentials", "health", "equipment", "personal"]);
    assert.equal(items[0].state, "expired");
    assert.match(items[2].label, /Coat #C9/);
  });

  it("never lets members self-edit private or admin fields", () => {
    const privateKeys = new Set(PERSONNEL_PRIVATE_KEYS);
    SELF_EDIT_KEYS.forEach((key) => assert.ok(!privateKeys.has(key), key));
    ["rank", "issuedEquipment", "payRates", "badgeNumber", "status"].forEach((key) => assert.ok(!SELF_EDIT_KEYS.includes(key), key));
    // Every field marked self-editable is in the list the rules use.
    Object.values(PROFILE_GROUPS).flatMap((group) => group.fields).filter((field) => field.self)
      .forEach((field) => assert.ok(SELF_EDIT_KEYS.includes(field.key), field.key));
    // Private profile fields are exactly the stored private keys.
    Object.values(PROFILE_GROUPS).flatMap((group) => group.fields).filter((field) => field.private)
      .forEach((field) => assert.ok(privateKeys.has(field.key), field.key));
  });
});

describe("personnel dates", () => {
  it("reads a plain date as that calendar day in local time", async () => {
    const { formatPersonnelDateForInput, formatPersonnelDateForDisplay } = await import("../../src/lib/personnelDates.js");
    assert.equal(formatPersonnelDateForInput("2017-03-01"), "2017-03-01");
    assert.equal(formatPersonnelDateForDisplay("2017-03-01"), "Mar 1, 2017");
  });
});
