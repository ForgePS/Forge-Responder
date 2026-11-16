import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { CATEGORIES, PRIORITIES, STATUSES, isDepartmentAdminMembership, statusLabel } from "../../src/lib/helpDesk/constants.js";
import { searchHelpArticles, splitGuide } from "../../src/lib/helpDesk/helpArticleSearch.js";
import { ticketIdFromLocation } from "../../src/lib/helpDesk/launch.js";

const require = createRequire(import.meta.url);
const server = require("../../functions/lib/helpDesk.js");

test("the app offers the same categories, priorities and statuses the server accepts", () => {
  assert.deepEqual(CATEGORIES.map((item) => item.id), Object.keys(server.CATEGORIES));
  assert.deepEqual(PRIORITIES.map((item) => item.id), Object.keys(server.PRIORITIES));
  assert.deepEqual(STATUSES.map((item) => item.id), Object.keys(server.STATUSES));
  assert.deepEqual(CATEGORIES.map((item) => item.label), Object.values(server.CATEGORIES));
});

test("requesters see 'Waiting on you', staff see 'Waiting on user'", () => {
  assert.equal(statusLabel("waiting_on_user", { requester: true }), "Waiting on you");
  assert.equal(statusLabel("waiting_on_user"), "Waiting on user");
});

test("department admin matches the rules' definition", () => {
  assert.equal(isDepartmentAdminMembership({ role: "department_admin", status: "active" }), true);
  assert.equal(isDepartmentAdminMembership({ roleIds: ["itAdmin"], status: "active" }), true);
  assert.equal(isDepartmentAdminMembership({ roleIds: ["captain"], status: "active" }), false);
  assert.equal(isDepartmentAdminMembership({ roleIds: ["fireChief"], status: "disabled" }), false);
});

test("email lists are trimmed, lowercased, de-duplicated and validated", () => {
  assert.deepEqual(server.normalizeEmails(" A@x.gov, a@x.gov;b@y.org "), ["a@x.gov", "b@y.org"]);
  assert.throws(() => server.normalizeEmails(["nope"]), /valid email/);
  assert.throws(() => server.normalizeEmails(Array.from({ length: 21 }, (_, i) => `u${i}@x.gov`)), /at most 20/);
});

test("ticket links only accept a safe id", () => {
  assert.equal(ticketIdFromLocation({ search: "?page=help-desk&ticket=AbC123" }), "AbC123");
  assert.equal(ticketIdFromLocation({ search: "?helpDeskTicket=x/../y" }), "xy");
  assert.equal(ticketIdFromLocation({ search: "" }), "");
});

test("guides split at ## headings and search ranks title matches first", () => {
  const sections = splitGuide("# Guide\nIntro text.\n## Reset a password\nUse Forgot password.\n## Fuel\nLog fuel; password not needed.\n![shot](a.jpg)", "g.md");
  assert.deepEqual(sections.map((s) => s.title), ["Overview", "Reset a password", "Fuel"]);
  assert.ok(sections.every((s) => s.guide === "Guide" && !s.body.includes("a.jpg")));
  const found = searchHelpArticles(sections, "password");
  assert.equal(found[0].title, "Reset a password");
  assert.equal(found.length, 2);
  assert.equal(searchHelpArticles(sections, "password fuel").length, 1);
});

test("every guide listed for Help articles exists", () => {
  const source = readFileSync(new URL("../../src/lib/helpDesk/helpArticles.js", import.meta.url), "utf8");
  const paths = [...source.matchAll(/"(\/docs\/[^"]+\.md)"/g)].map((match) => match[1]);
  assert.ok(paths.length >= 5);
  for (const path of paths) assert.ok(readFileSync(new URL(`../..${path}`, import.meta.url), "utf8").length > 0, path);
});
