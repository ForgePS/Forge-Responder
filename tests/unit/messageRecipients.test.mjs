import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { messageVisibleToUser } from "../../src/lib/internalEmailRecipients.js";

const require = createRequire(import.meta.url);
const { resolveMessageAudience } = require("../../functions/lib/messageRecipients.js");

const personnel = [
  { id: "P1", name: "Chief One", rank: "Fire Chief", shift: "", station: "Station 1", email: "chief@dept.test" },
  { id: "P2", name: "Capt Two", rank: "Captain", shift: "A Shift", station: "Station 1", email: "capt@dept.test" },
  { id: "P3", name: "FF Three", rank: "Firefighter", shift: "B Shift", station: "Station 2", email: "ff3@dept.test" },
  { id: "P4", name: "FF Four", rank: "Firefighter", shift: "A Shift", station: "Station 2", email: "ff4@dept.test" },
];
const members = [
  { uid: "u1", email: "chief@dept.test", role: "fireChief", personnelId: "P1" },
  { uid: "u2", email: "capt@dept.test", role: "companyOfficer", personnelId: "P2" },
  { uid: "u3", email: "ff3@dept.test", role: "firefighter", personnelId: "P3" },
  { uid: "u4", email: "ff4@dept.test", role: "firefighter" }, // linked by email only
  { uid: "u5", email: "clerk@dept.test", role: "readOnly" }, // no personnel record
];
const customGroups = [
  { id: "cg-a-crew", label: "A crew", members: ["shift:A Shift", "user:u5"] },
  { id: "cg-empty", label: "Empty", members: [] },
  { id: "cg-loop", label: "Loop", members: ["group:cg-loop"] },
];

const cases = [
  "g:all", "g:command", "g:on-duty", "shift:A Shift", "shift:b shift", "station:Station 2",
  "user:u5", "person:P3", "group:cg-a-crew", "group:cg-empty", "group:cg-missing", "group:cg-loop",
  "ff4@dept.test", ["person:P1", "station:Station 2"],
];

for (const recipients of cases) {
  test(`server and browser agree on recipients ${JSON.stringify(recipients)}`, () => {
    const message = { fromUid: "someone-else", recipients };
    const audience = resolveMessageAudience(message, members, personnel, customGroups);
    for (const member of members) {
      const user = { uid: member.uid, email: member.email };
      const visible = messageVisibleToUser(message, user, member, personnel, customGroups);
      const serverSays = audience.toAll || audience.recipientUids.includes(member.uid);
      assert.equal(serverSays, visible, `${member.uid}`);
    }
  });
}

test("a message to everyone is marked toAll with no uid list", () => {
  assert.deepEqual(resolveMessageAudience({ recipients: "all" }, members, personnel, []), { toAll: true, recipientUids: [] });
  assert.deepEqual(resolveMessageAudience({ recipients: [] }, members, personnel, []), { toAll: true, recipientUids: [] });
});

test("a message to one person lists only them", () => {
  assert.deepEqual(resolveMessageAudience({ recipients: ["person:P3"] }, members, personnel, []), { toAll: false, recipientUids: ["u3"] });
});
