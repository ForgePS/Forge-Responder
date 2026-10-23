// FORGE Field airplane-mode test on the production build.
//
//   npm run build && npx vite preview --port 4180
//   npm run test:field-offline -- http://localhost:4180 <screenshotDir>
//
// Drives a headless Chrome (CHROME_PATH to override) through the demo
// department: opens /field online, switches the page and its service worker to
// offline, reloads, saves one record of every field workflow, reloads again,
// goes back online and checks everything synced and shows in the desktop RMS,
// then makes a field/desktop edit conflict on the same daily log and resolves it.
// It writes test records to the demo department (forge-demo) only.
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { launchChrome, openPage, sleep } from "./cdp.mjs";

const BASE = process.argv[2] || "http://localhost:4180";
const SHOTS = process.argv[3] || join(tmpdir(), "forge-field-e2e-shots");
const PHOTO = process.argv[4] || fileURLToPath(new URL("../../public/field-icon-512.png", import.meta.url));
const RUN = Date.now().toString(36).slice(-5).toUpperCase();

const HELPERS = `
window.__f = {
  norm: (s) => String(s || "").replace(/\\s+/g, " ").trim(),
  q(sel, root = document) { return [...root.querySelectorAll(sel)]; },
  visible(el) { return el && el.getClientRects().length > 0; },
  byText(sel, text, root = document) {
    const t = text.toLowerCase();
    const all = this.q(sel, root).filter((el) => this.visible(el));
    return all.find((el) => this.norm(el.textContent).toLowerCase() === t)
      || all.find((el) => this.norm(el.textContent).toLowerCase().startsWith(t))
      || all.find((el) => this.norm(el.textContent).toLowerCase().includes(t));
  },
  click(text, sel = "button, a") { const el = this.byText(sel, text); if (!el) throw new Error("no clickable: " + text); el.click(); return true; },
  field(label) { return this.q(".fa-field").filter((f) => this.visible(f)).find((f) => { const l = f.querySelector(".fa-label"); return l && this.norm(l.textContent).toLowerCase().startsWith(label.toLowerCase()); }); },
  set(el, v) { const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, "value").set.call(el, v); el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); return true; },
  fill(label, v) { const f = this.field(label); if (!f) throw new Error("no field " + label); const el = f.querySelector("input, textarea"); return this.set(el, v); },
  openPicker(label) { const f = this.field(label); if (!f) throw new Error("no field " + label); f.querySelector(".fa-picker-btn").click(); return true; },
  sheetPick(text) { const row = this.byText(".fa-sheet-row", text); if (!row) throw new Error("no sheet row " + text); row.click(); return true; },
  sheetFirst(n = 1) { const rows = this.q(".fa-sheet-list .fa-sheet-row:not(.is-custom)").filter((r) => this.visible(r)); rows.slice(0, n).forEach((r) => r.click()); return rows.length; },
  sheetSearch(v) { const input = document.querySelector(".fa-sheet .fa-search input"); return this.set(input, v); },
  seg(itemLabel, option) {
    const item = this.q(".fa-check-item").find((el) => this.norm(el.querySelector(".fa-check-label")?.textContent).toLowerCase().startsWith(itemLabel.toLowerCase()));
    if (!item) throw new Error("no check item " + itemLabel);
    const btn = this.byText(".fa-seg-btn", option, item); if (!btn) throw new Error("no option " + option); btn.click(); return true;
  },
  segIn(fieldLabel, option) { const f = this.field(fieldLabel); const btn = this.byText(".fa-seg-btn, .fa-chip", option, f); if (!btn) throw new Error("no option " + option + " in " + fieldLabel); btn.click(); return true; },
  text() { return this.norm((document.querySelector(".fa-app") || document.body).innerText); },
  pill() { return this.norm(document.querySelector(".fa-sync-pill")?.innerText); },
};
true;
`;

const log = (...args) => console.log(new Date().toISOString().slice(11, 19), ...args);
const results = [];
function pass(name, detail = "") {
  results.push({ name, ok: true, detail });
  log("PASS", name, detail);
}

async function main() {
  const chrome = await launchChrome({ port: 9333 });
  const page = await openPage(chrome.port);
  const f = (code) => page.eval(`(${code})`);
  const helpers = async () => page.eval(HELPERS);
  const act = async (code, wait = 250) => {
    await helpers();
    const value = await page.eval(code);
    await sleep(wait);
    return value;
  };
  let shot = 0;
  const snap = async (name) => {
    shot += 1;
    const file = `${SHOTS}/${String(shot).padStart(2, "0")}-${name}.png`;
    await page.screenshot(file);
    log("shot", file);
  };

  try {
    // 1. Sign in to the demo (online).
    await page.goto(`${BASE}/demo`);
    await helpers();
    await page.waitFor(`!!window.__f.byText("button", "Launch Demo RMS")`, { label: "demo button" });
    await act(`__f.click("Launch Demo RMS")`);
    await page.waitFor(`location.pathname.includes("forge-demo") && !document.body.innerText.includes("Loading department access")`, { timeout: 60000, label: "demo loaded" });
    pass("demo sign-in");

    // 2. Open the field app online; wait for data download and offline support.
    await page.goto(`${BASE}/field`);
    await page.waitFor(`!!document.querySelector(".fa-tile")`, { timeout: 60000, label: "field home" });
    await page.waitFor(`!!navigator.serviceWorker.controller`, { timeout: 30000, label: "service worker controls page" });
    await helpers();
    await page.waitFor(`/Field data from/.test(__f.text())`, { timeout: 60000, label: "field data downloaded" });
    await sleep(1500);
    await snap("home-online");
    pass("field app online", await f(`__f.pill()`));

    // 3. Airplane mode, then reload: the app must still open.
    await page.setOffline(true);
    await sleep(500);
    await page.reload();
    await page.waitFor(`!!document.querySelector(".fa-tile")`, { timeout: 30000, label: "field home offline after reload" });
    await helpers();
    await page.waitFor(`/Offline/.test(__f.pill())`, { label: "offline pill" });
    const onLine = await f(`navigator.onLine`);
    if (onLine) throw new Error("navigator.onLine should be false in airplane mode");
    await snap("home-offline-reloaded");
    pass("opens offline after reload", await f(`__f.pill()`));

    // 4. Truck check.
    await act(`__f.click("Truck check")`, 500);
    await snap("truck-units");
    await act(`document.querySelector(".fa-unit").click()`, 500);
    await page.waitFor(`!!document.querySelector(".fa-check-item") || !!__f.byText(".fa-row", "Daily")`, { label: "checklist or template list" });
    if (!(await f(`!!document.querySelector(".fa-check-item")`))) await act(`document.querySelector(".fa-row").click()`, 500);
    // Validation first: finishing with nothing answered must be refused.
    await act(`__f.click("Finish check")`, 400);
    const blocked = await f(`/need fixing|needs fixing/.test(__f.text())`);
    if (!blocked) throw new Error("expected validation errors before finishing the check");
    await snap("truck-validation");
    pass("truck check validation blocks incomplete check");
    await act(`__f.click("Mark the")`, 300);
    await act(`__f.seg("Siren", "Fail")`, 300);
    await act(`(() => { const item = __f.q(".fa-check-item").find((el) => el.innerText.includes("Siren")); return __f.set(item.querySelector("textarea"), "Siren intermittent on wail - field test ${RUN}"); })()`);
    await act(`(() => { const item = __f.q(".fa-check-item").find((el) => el.innerText.startsWith("Odometer")); return __f.set(item.querySelector("input"), "48213"); })()`);
    await act(`__f.seg("Fuel level", "¾")`);
    await snap("truck-filled");
    await act(`__f.click("Finish check")`, 800);
    await page.waitFor(`!!document.querySelector(".fa-tile")`, { label: "back home after truck check" });
    pass("truck check saved offline", await f(`__f.pill()`));

    // 5. Daily log.
    await act(`__f.click("Daily log")`, 400);
    await act(`__f.click("New log")`, 400);
    await act(`__f.openPicker("Shift")`, 300);
    await act(`__f.sheetPick("A Shift")`, 300);
    await act(`__f.openPicker("Unit")`, 300);
    await act(`__f.sheetPick("Engine 1")`, 300);
    if (await f(`/already exists/.test(__f.text())`)) {
      // A log for this unit and shift is already on the server: add to it instead.
      await snap("daily-log-duplicate-guard");
      await act(`__f.click("Open it")`, 500);
      pass("daily log duplicate guard offers the existing log");
      const existingNotes = await f(`__f.field("Notes").querySelector("textarea").value`);
      await act(`__f.fill("Notes", ${JSON.stringify("")} + ${JSON.stringify("")} + document.querySelector("textarea").value + "\\nField log ${RUN}: truck check done, hydrant district 2 inspected.")`);
      log("existing notes length", existingNotes.length);
    } else {
      await act(`__f.click("Add crew")`, 300);
      await act(`__f.sheetFirst(2)`, 200);
      await act(`__f.click("Done")`, 300);
      await act(`__f.fill("Notes", "Field log ${RUN}: truck check done, hydrant district 2 inspected.")`);
    }
    await snap("daily-log");
    await act(`__f.click("Save log")`, 800);
    await page.waitFor(`/Daily log/.test(__f.text()) && !!__f.byText(".fa-row", "A Shift")`, { label: "log listed" });
    await act(`history.back()`, 400);
    pass("daily log saved offline");

    // 6. Damage form with a photo.
    await act(`__f.click("Damage form")`, 400);
    await act(`__f.openPicker("Station or unit")`, 300);
    await act(`__f.sheetPick("Station 2")`, 300);
    await act(`__f.fill("Equipment", "Bay door 2")`);
    await act(`__f.fill("What is damaged", "Bottom panel bent, door drifts when open. Field test ${RUN}.")`);
    if (PHOTO) {
      await page.setFiles(".fa-photos input[type=file]", [PHOTO]);
      await page.waitFor(`document.querySelectorAll(".fa-thumb img").length > 0`, { label: "photo thumbnail" });
    }
    await snap("damage-form");
    await act(`__f.click("Submit damage form")`, 800);
    await page.waitFor(`!!document.querySelector(".fa-tile")`, { label: "home after damage form" });
    pass("damage form saved offline", PHOTO ? "with photo" : "");

    // 7. Hose test.
    await act(`__f.click("Hose testing")`, 400);
    await act(`(() => { const input = document.querySelector(".fa-add-row input"); __f.set(input, "F${RUN}1, F${RUN}2"); return true; })()`);
    await act(`__f.click("Add")`, 300);
    await snap("hose-test");
    await act(`__f.click("Save 2")`, 800);
    await page.waitFor(`!!document.querySelector(".fa-tile")`, { label: "home after hose test" });
    pass("hose test saved offline");

    // 8. Hydrants: inspection, flow test, damage.
    await act(`__f.click("Hydrants")`, 400);
    await page.waitFor(`/RV 1/.test(__f.text())`, { label: "hydrant list" });
    await act(`(() => __f.set(document.querySelector(".fa-search input"), "RV 103"))()`, 300);
    await act(`__f.click("RV 103", ".fa-row")`, 400);
    await snap("hydrant-detail");
    await act(`__f.click("Inspect")`, 400);
    await act(`__f.click("All OK")`, 300);
    await act(`__f.seg("Caps Present", "Problem")`, 200);
    await act(`(() => { const item = __f.q(".fa-check-item").find((el) => el.innerText.startsWith("Caps Present")); return __f.set(item.querySelector("textarea"), "Steamer cap missing"); })()`);
    await snap("hydrant-inspection");
    await act(`__f.click("Save inspection")`, 800);
    await page.waitFor(`/Flow test/.test(__f.text())`, { label: "back on hydrant detail" });
    await act(`__f.click("Flow test")`, 400);
    await act(`__f.fill("Static", "72")`);
    await act(`__f.fill("Residual", "58")`);
    await act(`__f.fill("Pitot", "38")`);
    await snap("flow-test");
    await act(`__f.click("Save flow test")`, 800);
    await page.waitFor(`/Report damage/.test(__f.text())`, { label: "back on hydrant detail 2" });
    await act(`__f.click("Report damage")`, 400);
    await act(`__f.click("Missing cap", ".fa-chip")`, 200);
    await act(`__f.click("In service with limitation", ".fa-seg-btn")`, 200);
    await act(`__f.fill("Description", "Steamer cap missing, threads exposed. ${RUN}")`);
    await snap("hydrant-damage");
    await act(`__f.click("Save damage report")`, 800);
    pass("hydrant inspection, flow test and damage saved offline");
    await act(`history.back()`, 300);
    await act(`history.back()`, 300);
    await page.waitFor(`!!document.querySelector(".fa-tile")`, { label: "home after hydrants" });

    // 9. Incident report.
    await act(`__f.click("Incident report")`, 400);
    await act(`__f.click("New incident report")`, 400);
    await act(`__f.openPicker("Type")`, 300);
    await act(`__f.sheetPick("Vehicle accident")`, 300);
    await act(`__f.fill("Address", "I-55 NB mile 112 ${RUN}")`);
    await act(`(() => { const btns = __f.q("button").filter((b) => __f.norm(b.innerText) === "Now"); btns[0].click(); btns[1].click(); return btns.length; })()`, 300);
    await act(`__f.click("Units", ".fa-chip")`, 300);
    await act(`__f.sheetFirst(2)`, 200);
    await act(`__f.click("Done")`, 300);
    await act(`(() => __f.set(document.querySelector(".fa-section textarea, textarea[placeholder^='What you found']"), "Two-vehicle MVA, no entrapment. ${RUN}"))()`);
    await snap("incident");
    await act(`__f.click("Save report")`, 800);
    await act(`history.back()`, 400);
    await page.waitFor(`!!document.querySelector(".fa-tile")`, { label: "home after incident" });
    pass("incident report saved offline");

    // 10. Still offline: reload and confirm everything is still on the device.
    await page.reload();
    await page.waitFor(`!!document.querySelector(".fa-tile")`, { timeout: 30000, label: "home after second offline reload" });
    await helpers();
    const pill = await f(`__f.pill()`);
    const waiting = Number((pill.match(/(\d+) saved/) || [])[1] || 0);
    await snap("home-offline-waiting");
    if (waiting < 8) throw new Error(`expected at least 8 records waiting, pill says: ${pill}`);
    pass("records survive offline reload", pill);
    await act(`__f.click("Records", ".fa-tab")`, 500);
    await snap("records-offline");

    // 11. Back online: everything syncs.
    await page.setOffline(false);
    await page.eval(`window.dispatchEvent(new Event("online")); true`);
    await page.waitFor(`/All synced/.test(__f.pill()) || /attention/.test(__f.pill())`, { timeout: 120000, label: "sync finished" });
    await sleep(1000);
    const finalPill = await f(`__f.pill()`);
    await snap("records-synced");
    if (!/All synced/.test(finalPill)) throw new Error(`sync did not finish cleanly: ${finalPill}`);
    pass("all records synced when back online", finalPill);

    const stored = await page.eval(`(async () => {
      const db = await new Promise((r) => { const q = indexedDB.open("forge-field"); q.onsuccess = () => r(q.result); });
      const rows = await new Promise((r) => { const t = db.transaction("records").objectStore("records").getAll(); t.onsuccess = () => r(t.result); });
      return rows.map((row) => ({ kind: row.kind, status: row.status, serverIds: row.serverIds, warnings: row.warnings || [], history: (row.history || []).map((h) => h.note).join(" > ") }));
    })()`);
    console.log(JSON.stringify(stored, null, 2));

    // 12. Check the records landed in the desktop RMS.
    const checks = [
      ["daily-log", `Field log ${RUN}`],
      ["neris-fire-reports", stored.find((row) => row.kind === "incident")?.serverIds?.reportNumber],
      ["open-damage-reports", "RV-1003"],
    ];
    for (const [slug, needle] of checks) {
      await page.goto(`${BASE}/forge-demo?page=${slug}`);
      await page.waitFor(`document.body.innerText.includes(${JSON.stringify(needle)}) || [...document.querySelectorAll("textarea, input")].some((el) => String(el.value || "").includes(${JSON.stringify(needle)}))`, { timeout: 60000, label: `${slug} shows ${needle}` });
      pass(`desktop ${slug} shows the field record`, needle);
    }
    await page.goto(`${BASE}/forge-demo?page=open-damage-reports`);
    await sleep(1500);
    await snap("desktop-damage-reports");

    // 13. Conflict: the same daily log is edited offline in the field and on the desktop.
    const logId = stored.find((row) => row.kind === "dailyLog")?.serverIds?.logId;
    await page.goto(`${BASE}/field`);
    await page.waitFor(`!!document.querySelector(".fa-tile")`, { timeout: 60000, label: "field home again" });
    await helpers();
    await page.waitFor(`/Field data from/.test(__f.text())`, { timeout: 60000 });
    await sleep(3000); // let the background refresh pick up the synced log
    await page.setOffline(true);
    await act(`__f.click("Daily log")`, 500);
    await act(`__f.click("Engine 1", ".fa-row")`, 600);
    await act(`__f.fill("Notes", document.querySelector("textarea").value + "\\nFIELD-EDIT ${RUN}")`);
    await act(`__f.click("Save log")`, 800);
    pass("field edit of synced log saved offline", logId);
    // Desktop edit of the same log while the field copy waits.
    await page.setOffline(false);
    await page.goto(`${BASE}/forge-demo?page=daily-log`);
    await page.waitFor(`[...document.querySelectorAll("textarea")].some((el) => el.value.includes(${JSON.stringify(`Field log ${RUN}`)}))`, { timeout: 60000, label: "desktop log loaded" });
    await sleep(10000); // let the desktop list finish its live sync before editing
    await page.eval(`(() => {
      const el = [...document.querySelectorAll("textarea")].find((t) => t.value.includes(${JSON.stringify(`Field log ${RUN}`)}));
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(el, el.value + "\\nDESK-EDIT ${RUN}");
      el.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    })()`);
    await sleep(300);
    await page.eval(`[...document.querySelectorAll("button")].find((b) => b.innerText.trim() === "Save").click(), true`);
    await sleep(8000);
    await page.goto(`${BASE}/forge-demo?page=daily-log`);
    await page.waitFor(`[...document.querySelectorAll("textarea")].some((el) => el.value.includes(${JSON.stringify(`DESK-EDIT ${RUN}`)}))`, { timeout: 60000, label: "desktop edit saved on the server" });
    pass("desktop edited the same log (confirmed after reload)");
    // Back to the field app: sync must flag the conflict, not overwrite.
    await page.goto(`${BASE}/field`);
    await page.waitFor(`!!document.querySelector(".fa-tile")`, { timeout: 60000 });
    await helpers();
    await page.waitFor(`/attention/.test(__f.pill())`, { timeout: 90000, label: "conflict flagged" });
    await snap("conflict-flagged");
    pass("conflict flagged as needs attention", await f(`__f.pill()`));
    await act(`__f.click("Review")`, 500);
    await act(`document.querySelector(".fa-row").click()`, 600);
    await snap("conflict-resolver");
    await act(`__f.click("Keep both", ".fa-seg-btn")`, 300);
    await act(`__f.click("Save choices and send")`, 500);
    await page.waitFor(`/All synced/.test(__f.pill())`, { timeout: 90000, label: "conflict resolved and synced" });
    pass("conflict resolved with Keep both and synced");
    await page.goto(`${BASE}/forge-demo?page=daily-log`);
    await page.waitFor(`[...document.querySelectorAll("textarea")].some((el) => el.value.includes(${JSON.stringify(`FIELD-EDIT ${RUN}`)}) && el.value.includes(${JSON.stringify(`DESK-EDIT ${RUN}`)}))`, { timeout: 60000, label: "both edits on the server" });
    pass("server log has both the field and the desktop edits");
    await snap("desktop-log-merged");
  } catch (error) {
    console.error("FAIL", error.message);
    await snap("failure").catch(() => null);
    console.log((await page.eval(`(window.__f && __f.text()) || document.body.innerText`).catch(() => "")).slice(0, 1500));
    console.log(page.console.slice(-25).join("\n"));
    process.exitCode = 1;
  } finally {
    console.log(JSON.stringify(results.map((r) => `${r.ok ? "PASS" : "FAIL"} ${r.name} ${r.detail}`), null, 2));
    chrome.proc.kill();
  }
}

main();
