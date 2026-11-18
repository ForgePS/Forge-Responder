import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_QUICK_LINKS,
  MAX_QUICK_LINKS,
  addQuickLink,
  addableQuickLinks,
  canAddQuickLink,
  moveQuickLink,
  quickLinkOptions,
  quickLinksPreferenceKey,
  removeQuickLink,
  storedQuickLinks,
  visibleQuickLinks,
} from "../../src/lib/dashboardQuickLinks.js";

const Icon = () => null;
const groups = [
  { label: "", items: [["My Dashboard", Icon], ["My Profile", Icon]] },
  { label: "Schedule & records", items: [["My Schedule", Icon], ["Time Card", Icon], ["Academy", Icon, "https://academy.example"]] },
  { label: "Communications", items: [["Messages", Icon], ["Help Desk", Icon]] },
];
const options = quickLinkOptions(groups);
const names = (list) => list.map((item) => item.name);

test("options come from the menu in order, without the dashboard, outside links or duplicates", () => {
  const withDuplicate = [...groups, { label: "Other", items: [["Messages", Icon]] }];
  assert.deepEqual(names(quickLinkOptions(withDuplicate)), ["My Profile", "My Schedule", "Time Card", "Messages", "Help Desk"]);
  assert.equal(options[1].group, "Schedule & records");
  assert.equal(options[1].icon, Icon);
});

test("the Dashboard itself (or its old My Dashboard name) is never offered", () => {
  const menu = [{ label: "", items: [["Dashboard", Icon], ["Forge AI", Icon]] }, { label: "My Work", items: [["My Dashboard", Icon], ["My Profile", Icon]] }];
  assert.deepEqual(names(quickLinkOptions(menu)), ["Forge AI", "My Profile"]);
});

test("options read nested menu trees through the leaves helper", () => {
  const tree = [{ label: "Prevention", tree: [], items: [] }];
  const leaves = () => [["Inspections", Icon], ["Preplans", Icon]];
  assert.deepEqual(names(quickLinkOptions(tree, leaves)), ["Inspections", "Preplans"]);
});

test("new users get the defaults they can open", () => {
  assert.deepEqual(storedQuickLinks(undefined, options), ["My Schedule", "Time Card", "Messages"]);
  assert.deepEqual(names(visibleQuickLinks(null, options)), ["My Schedule", "Time Card", "Messages"]);
  // A full personal menu gets four defaults, all openable.
  const fullMenu = [{ label: "", items: DEFAULT_QUICK_LINKS.map((name) => [name, Icon]) }];
  const defaults = storedQuickLinks(undefined, quickLinkOptions(fullMenu));
  assert.deepEqual(defaults, DEFAULT_QUICK_LINKS.slice(0, 4));
});

test("an empty saved list stays empty (the person removed every card)", () => {
  assert.deepEqual(visibleQuickLinks([], options), []);
});

test("cards for pages the person can no longer open are hidden but kept", () => {
  const saved = ["Messages", "Fleet Work Orders", "My Schedule"];
  assert.deepEqual(names(visibleQuickLinks(saved, options)), ["Messages", "My Schedule"]);
  // Editing keeps the hidden page saved for if access comes back.
  assert.deepEqual(addQuickLink(saved, options, "Help Desk"), ["Messages", "My Schedule", "Help Desk", "Fleet Work Orders"]);
  assert.deepEqual(removeQuickLink(saved, options, "Messages"), ["My Schedule", "Fleet Work Orders"]);
  assert.deepEqual(moveQuickLink(saved, options, "My Schedule", -1), ["My Schedule", "Messages", "Fleet Work Orders"]);
});

test("only openable pages can be added, once each", () => {
  assert.deepEqual(addQuickLink(["Messages"], options, "Fleet Work Orders"), ["Messages"]);
  assert.deepEqual(addQuickLink(["Messages"], options, "Messages"), ["Messages"]);
  assert.deepEqual(names(addableQuickLinks(["Messages"], options)), ["My Profile", "My Schedule", "Time Card", "Help Desk"]);
});

test("adding starts from the defaults when nothing is saved", () => {
  assert.deepEqual(addQuickLink(undefined, options, "Help Desk"), ["My Schedule", "Time Card", "Messages", "Help Desk"]);
});

test("moving past either end changes nothing", () => {
  const saved = ["Messages", "My Schedule"];
  assert.deepEqual(moveQuickLink(saved, options, "Messages", -1), saved);
  assert.deepEqual(moveQuickLink(saved, options, "My Schedule", 1), saved);
  assert.deepEqual(moveQuickLink(saved, options, "Messages", 1), ["My Schedule", "Messages"]);
});

test("saved lists are cleaned and capped", () => {
  assert.deepEqual(storedQuickLinks(["Messages", "Messages", 4, "", null, "My Schedule"], options), ["Messages", "My Schedule"]);
  const many = Array.from({ length: 20 }, (_, index) => `Page ${index}`);
  const manyOptions = many.map((name) => ({ name, icon: null, group: "" }));
  assert.equal(storedQuickLinks(many, manyOptions).length, MAX_QUICK_LINKS);
  assert.equal(canAddQuickLink(many, manyOptions), false);
  assert.equal(canAddQuickLink(["Messages"], options), true);
});

test("demo personas keep their own cards", () => {
  assert.equal(quickLinksPreferenceKey({}), "dashboardQuickLinks");
  assert.equal(quickLinksPreferenceKey({ demoPersona: "firefighter" }), "dashboardQuickLinks_firefighter");
});
