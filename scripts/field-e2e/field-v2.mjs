// FORGE Field v2 end-to-end test on the production build (demo department):
// admin settings (field rules) -> EMS check-off, assigned inspection, new
// pre-fire plan, hydrant crew session / inspection with item photo / flow test
// with NFPA override / hydrant info edit, incident with an admin-required
// field — all in airplane mode — then sync and check the desktop RMS.
//
//   npm run build && npx vite preview --port 4180
//   node scripts/field-e2e/field-v2.mjs http://localhost:4180 <screenshotDir>
//
// Needs an EMS check-off list in the demo department (Admin → FORGE Field).
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { launchChrome, openPage, sleep } from "./cdp.mjs";
import { HELPERS } from "./helpers.mjs";

const BASE = process.argv[2] || "http://localhost:4180";
const SHOTS = process.argv[3] || join(tmpdir(), "forge-field-e2e-v2");
const PHOTO = fileURLToPath(new URL("../../public/field-icon-512.png", import.meta.url));
const RUN = Date.now().toString(36).slice(-5).toUpperCase();
const log = (...args) => console.log(new Date().toISOString().slice(11, 19), ...args);
const results = [];
const pass = (name, detail = "") => { results.push(`PASS ${name} ${detail}`); log("PASS", name, detail); };

const DESKTOP_HELPERS = `
window.__d = {
  norm: (s) => String(s || "").replace(/\\s+/g, " ").trim(),
  button(text) { return [...document.querySelectorAll("button, a")].find((b) => this.norm(b.innerText).startsWith(text) && b.getClientRects().length); },
  click(text) { const b = this.button(text); if (!b) throw new Error("no button " + text); b.click(); return true; },
  select(el, value) { Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set.call(el, value); el.dispatchEvent(new Event("change", { bubbles: true })); return true; },
  radio(label) { const r = document.querySelector('input[type=radio][aria-label="' + label + '"]'); if (!r) throw new Error("no radio " + label); r.click(); return true; },
  text() { return document.body.innerText; },
};
true;
`;

function future(days) {
  const date = new Date(Date.now() + days * 86_400_000);
  return date.toISOString().slice(0, 10);
}

async function main() {
  const chrome = await launchChrome({ port: 9341 });
  const page = await openPage(chrome.port);
  const f = (code) => page.eval(`(${code})`);
  const act = async (code, wait = 250) => { await page.eval(HELPERS); const value = await page.eval(code); await sleep(wait); return value; };
  const desk = async (code, wait = 300) => { await page.eval(DESKTOP_HELPERS); const value = await page.eval(code); await sleep(wait); return value; };
  let shot = 0;
  const snap = async (name) => { shot += 1; await page.screenshot(`${SHOTS}/${String(shot).padStart(2, "0")}-${name}.png`); };

  try {
    // ---------------- Desktop: demo sign-in, field rules, a new inspection ----------------
    await page.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
    await page.goto(`${BASE}/demo`);
    await page.eval(HELPERS);
    await page.waitFor(`!!window.__f.byText("button", "Launch Demo RMS")`);
    await act(`__f.click("Launch Demo RMS")`);
    await page.waitFor(`location.pathname.includes("forge-demo") && !document.body.innerText.includes("Loading department access")`, { timeout: 60000 });
    pass("demo sign-in");

    await page.goto(`${BASE}/forge-demo?page=system-admin`);
    await page.waitFor(`document.body.innerText.includes("FORGE Field (field app)")`, { timeout: 60000 });
    await desk(`__d.click("FORGE Field (field app)")`, 1500);
    await desk(`__d.click("Form fields")`, 500);
    await desk(`__d.select(document.querySelector(".fa-admin-fields select"), "hydrantInspection")`, 400);
    await desk(`__d.radio("General notes: Hide")`);
    await desk(`__d.select(document.querySelector(".fa-admin-fields select"), "incident")`, 400);
    await desk(`__d.radio("Narrative: Required")`);
    await snap("admin-form-fields");
    await desk(`__d.click("Save settings")`, 2500);
    await page.waitFor(`document.body.innerText.includes("Saved ")`, { timeout: 20000, label: "settings saved" });
    pass("admin saved field rules (hydrant notes hidden, incident narrative required)");
    await desk(`__d.click("Check-off lists")`, 1200);
    await snap("admin-checkoff-lists");
    if (!(await f(`document.body.innerText.includes("Medic 1")`))) throw new Error("expected an EMS check-off list for Medic 1 in the demo department");

    await page.goto(`${BASE}/forge-demo?page=all-inspections`);
    await page.waitFor(`!!__d && document.body.innerText.includes("New inspection")`, { timeout: 60000 }).catch(() => null);
    await page.waitFor(`document.body.innerText.includes("New inspection")`, { timeout: 60000 });
    await desk(`__d.click("New inspection")`, 1000);
    await desk(`__d.click("Create")`, 4000);
    const inspectionNumber = await f(`(document.body.innerText.match(/Created (INS-[0-9-]+)/) || [])[1] || ""`);
    pass("desktop created an inspection assigned to the demo user", inspectionNumber);

    // ---------------- Field app online: download settings, lists, inspection ----------------
    await page.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await page.goto(`${BASE}/field`);
    await page.waitFor(`!!document.querySelector(".fa-tile")`, { timeout: 60000 });
    await page.waitFor(`!!navigator.serviceWorker.controller`, { timeout: 30000 });
    await page.eval(HELPERS);
    await page.waitFor(`/Inspections/.test(__f.text()) && /assigned to you/.test(__f.text()) && /EMS unit check-off/.test(__f.text())`, { timeout: 60000, label: "settings, lists and inspection downloaded" });
    await snap("home-online");
    pass("field app shows EMS check-off and the assigned inspection");

    // ---------------- Airplane mode ----------------
    await page.setOffline(true);
    await page.reload();
    await page.waitFor(`!!document.querySelector(".fa-tile")`, { timeout: 30000 });
    await page.eval(HELPERS);
    await page.waitFor(`/Offline/.test(__f.pill())`);
    pass("offline after reload");

    // EMS check-off: epinephrine expired, BVM missing.
    await act(`__f.click("EMS unit check-off")`, 500);
    await act(`__f.click("Medic 1", ".fa-row")`, 600);
    await act(`(() => {
      const items = __f.q(".fa-check-item");
      const epi = items.find((el) => el.innerText.includes("Epinephrine"));
      const bvm = items.find((el) => el.innerText.includes("Bag valve"));
      __f.set(epi.querySelector(".fa-stepper input"), "2");
      __f.set(epi.querySelector("input[type=date]"), "2026-10-01");
      __f.set(bvm.querySelector(".fa-stepper input"), "0");
      return true;
    })()`, 400);
    await snap("ems-checkoff");
    const restockShown = await f(`/to restock/.test(__f.text())`);
    if (!restockShown) throw new Error("expected the restock count in the footer");
    await act(`__f.click("Finish check-off")`, 900);
    pass("EMS check-off saved offline with shortages flagged");
    await act(`history.back()`, 400);

    // Assigned inspection: answer everything, add a violation, fail with reinspection.
    await act(`__f.click("Inspections", ".fa-tile")`, 500);
    await act(`__f.click(${JSON.stringify(inspectionNumber)}, ".fa-row")`, 700);
    await act(`(() => {
      let answered = 0;
      __f.q(".fa-check-item").forEach((item) => {
        const seg = item.querySelector(".fa-seg-btn");
        const date = item.querySelector("input[type=date]");
        const text = item.querySelector("input.fa-input:not([type=date]), textarea");
        const chip = item.querySelector(".fa-chip");
        const picker = item.querySelector(".fa-picker-btn");
        if (seg) { seg.click(); answered += 1; }
        else if (date) { __f.set(date, "${future(0)}"); answered += 1; }
        else if (chip) { chip.click(); answered += 1; }
        else if (picker) { picker.click(); const row = document.querySelector(".fa-sheet-row"); if (row) row.click(); answered += 1; }
        else if (text) { __f.set(text, "OK"); answered += 1; }
      });
      return answered;
    })()`, 500);
    await act(`__f.click("Other")`, 400);
    await act(`(() => { const v = __f.q(".fa-check-item.is-fail").pop(); __f.set(v.querySelector("input.fa-input"), "Blocked exit door ${RUN}"); return true; })()`);
    await act(`__f.click("Failed", ".fa-seg-btn")`, 300);
    await act(`__f.set(__f.field("Reinspection date").querySelector("input"), "${future(14)}")`);
    await snap("inspection");
    await act(`__f.click("Complete")`, 900);
    const inspectionErrors = await f(`/need fixing|needs fixing/.test(__f.text())`);
    if (inspectionErrors) {
      await snap("inspection-errors");
      throw new Error("inspection validation blocked completion: " + (await f(`__f.q(".fa-error-text").map((e) => e.innerText).join(" | ")`)));
    }
    pass("inspection completed offline with a violation", inspectionNumber);
    await act(`history.back()`, 400);

    // New pre-fire plan with a photo.
    await act(`__f.click("Pre-fire plans", ".fa-tile")`, 500);
    await act(`__f.click("New pre-fire plan")`, 600);
    await act(`__f.fill("Building / business name", "Riverside Feed Store ${RUN}")`);
    await act(`__f.fill("Address", "410 Levee Rd")`);
    await act(`__f.click("High", ".fa-seg-btn")`);
    await act(`(() => { const f = __f.field("Primary access"); if (f) __f.set(f.querySelector("input, textarea"), "Front lot off Levee Rd; rear gate locked"); return Boolean(f); })()`);
    await page.setFiles(".fa-photos input[type=file]", [PHOTO]);
    await page.waitFor(`document.querySelectorAll(".fa-thumb img").length > 0`);
    await snap("new-plan");
    await act(`__f.click("Save plan")`, 900);
    await page.waitFor(`/Riverside Feed Store/.test(__f.text())`, { label: "new plan listed" });
    pass("new pre-fire plan saved offline");
    await act(`history.back()`, 400);

    // Hydrants: crew session, inspection (notes hidden by admin), item photo, flow test override, info edit.
    await act(`__f.click("Hydrants", ".fa-tile")`, 600);
    if (await f(`/set your shift/i.test(__f.text())`)) {
      await act(`__f.openPicker("Shift")`, 300);
      await act(`__f.sheetPick("A Shift")`, 300);
      await act(`__f.click("Set shift")`, 500);
    }
    await page.waitFor(`/until/.test(__f.text())`, { label: "crew session set" });
    await snap("hydrants-hub");
    await act(`__f.set(document.querySelector(".fa-search input"), "RV 105")`, 300);
    await act(`__f.click("RV 105", ".fa-row")`, 500);
    await act(`__f.click("Inspect")`, 500);
    if (await f(`/General notes/.test(__f.text())`)) throw new Error("General notes should be hidden by the admin setting");
    await act(`__f.click("All OK")`, 300);
    await act(`__f.seg("Caps Present", "Problem")`, 300);
    await act(`(() => { const item = __f.q(".fa-check-item").find((el) => el.innerText.startsWith("Caps Present")); __f.set(item.querySelector("textarea"), "Pumper cap cracked"); return true; })()`);
    await page.setFiles(".fa-check-item.is-fail .fa-photos input[type=file]", [PHOTO]);
    await page.waitFor(`document.querySelectorAll(".fa-check-item.is-fail .fa-thumb img").length > 0`, { label: "row photo" });
    await snap("hydrant-inspection-row-photo");
    await act(`__f.click("Complete inspection")`, 900);
    pass("hydrant inspection with item photo (general notes hidden by setting)");
    await act(`__f.click("Flow test")`, 500);
    await act(`__f.fill("Static", "70")`);
    await act(`__f.fill("Residual", "55")`);
    await act(`__f.fill("Pitot", "40")`);
    await act(`__f.click("B", ".fa-seg-btn")`, 300);
    await snap("flow-test-override");
    await act(`__f.click("Save flow test")`, 900);
    await act(`__f.click("Edit hydrant info")`, 500);
    await act(`__f.fill("Issue", "Faces away from street ${RUN}")`);
    await act(`__f.click("Save hydrant info")`, 900);
    pass("flow test with NFPA override and hydrant info edit saved offline");
    await act(`history.back()`, 300);
    await act(`history.back()`, 300);
    await page.waitFor(`!!document.querySelector(".fa-tile")`, { label: "home after hydrants" });

    // Incident: narrative is required by the admin setting.
    await act(`__f.click("Incident report", ".fa-tile")`, 500);
    await act(`__f.click("New incident report")`, 500);
    await act(`__f.openPicker("Type")`, 300);
    await act(`__f.sheetPick("Fire alarm")`, 300);
    await act(`__f.fill("Address", "200 Station Ave ${RUN}")`);
    await act(`__f.click("Save report")`, 600);
    const blocked = await f(`/Write the narrative/.test(__f.text())`);
    if (!blocked) throw new Error("expected the admin-required narrative to block saving");
    await snap("incident-required-narrative");
    await act(`__f.set(document.querySelector("textarea[placeholder^='What you found']"), "Alarm activation, no fire. ${RUN}")`);
    await act(`__f.click("Save report")`, 900);
    pass("admin-required narrative enforced, then saved");
    await act(`history.back()`, 400);

    await page.reload();
    await page.waitFor(`!!document.querySelector(".fa-tile")`, { timeout: 30000 });
    await page.eval(HELPERS);
    const pill = await f(`__f.pill()`);
    await snap("home-offline-waiting");
    pass("all saved on device", pill);

    // ---------------- Back online ----------------
    await page.setOffline(false);
    await page.eval(`window.dispatchEvent(new Event("online")); true`);
    await page.waitFor(`/All synced/.test(__f.pill()) || /attention/.test(__f.pill())`, { timeout: 150000, label: "sync finished" });
    await sleep(1000);
    const finalPill = await f(`__f.pill()`);
    if (!/All synced/.test(finalPill)) {
      await act(`__f.click("Records", ".fa-tab")`, 500);
      await snap("sync-problem");
      const rows = await page.eval(`(async () => { const db = await new Promise((r) => { const q = indexedDB.open("forge-field"); q.onsuccess = () => r(q.result); }); return new Promise((r) => { const t = db.transaction("records").objectStore("records").getAll(); t.onsuccess = () => r(t.result.filter((x) => x.status !== "synced").map((x) => ({ kind: x.kind, status: x.status, err: x.lastError, att: x.attention }))); }); })()`);
      throw new Error(`sync did not finish cleanly: ${finalPill} ${JSON.stringify(rows)}`);
    }
    pass("everything synced", finalPill);

    // Plan update for review (online), on the plan made offline.
    await act(`__f.click("Pre-fire plans", ".fa-tile")`, 500);
    await act(`__f.set(document.querySelector(".fa-search input"), "Riverside Feed Store ${RUN}")`, 400);
    await page.waitFor(`/Riverside Feed Store/.test(__f.text()) && !/Not sent/.test(__f.text())`, { timeout: 60000, label: "synced plan listed" }).catch(async () => {
      await act(`history.back()`, 300);
      await act(`__f.click("Update")`, 4000);
      await act(`__f.click("Pre-fire plans", ".fa-tile")`, 500);
      await act(`__f.set(document.querySelector(".fa-search input"), "Riverside Feed Store ${RUN}")`, 400);
    });
    await act(`__f.click("Riverside Feed Store", ".fa-row")`, 600);
    await snap("plan-view");
    await act(`__f.click("Send update")`, 500);
    await act(`__f.fill("What changed?", "Knox box moved to east entrance ${RUN}")`);
    await act(`__f.click("Send for review")`, 1500);
    await page.waitFor(`/All synced/.test(__f.pill())`, { timeout: 60000 });
    pass("plan update sent for review");

    // ---------------- Desktop checks ----------------
    await page.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
    await page.goto(`${BASE}/forge-demo?page=system-admin`);
    await page.waitFor(`document.body.innerText.includes("FORGE Field (field app)")`, { timeout: 60000 });
    await desk(`__d.click("FORGE Field (field app)")`, 1500);
    await desk(`__d.click("Check-off results")`, 1500);
    await page.waitFor(`document.body.innerText.includes("Needs restock") && document.body.innerText.includes("Bag valve")`, { timeout: 30000, label: "check-off results" });
    await snap("desktop-checkoff-results");
    pass("desktop shows the check-off and what to restock");
    await desk(`__d.click("Plan updates")`, 1500);
    await page.waitFor(`document.body.innerText.includes("Knox box moved to east entrance ${RUN}")`, { timeout: 30000, label: "plan update listed" });
    await snap("desktop-plan-updates");
    await desk(`__d.click("Mark reviewed")`, 2000);
    pass("desktop shows the plan update for review and marks it reviewed");

    await page.goto(`${BASE}/forge-demo?page=all-inspections`);
    await page.waitFor(`document.body.innerText.includes(${JSON.stringify(inspectionNumber)})`, { timeout: 60000 });
    await sleep(1500);
    const row = await f(`(() => { const tr = [...document.querySelectorAll("tr")].find((r) => r.innerText.includes(${JSON.stringify(inspectionNumber)})); return tr ? tr.innerText : ""; })()`);
    await snap("desktop-inspections");
    if (!/complet/i.test(row)) throw new Error(`inspection not completed on desktop: ${row}`);
    pass("desktop shows the inspection completed", row.replace(/\s+/g, " "));

    await page.goto(`${BASE}/forge-demo?page=all-preplans`);
    await page.waitFor(`document.body.innerText.includes("Riverside Feed Store ${RUN}")`, { timeout: 60000, label: "plan in desktop preplans" });
    await snap("desktop-preplans");
    pass("desktop lists the new pre-fire plan");

    // Put the demo department's field rules back to the defaults.
    await page.goto(`${BASE}/forge-demo?page=system-admin`);
    await page.waitFor(`document.body.innerText.includes("FORGE Field (field app)")`, { timeout: 60000 });
    await desk(`__d.click("FORGE Field (field app)")`, 1500);
    await desk(`__d.click("Form fields")`, 500);
    await desk(`__d.select(document.querySelector(".fa-admin-fields select"), "hydrantInspection")`, 400);
    await desk(`__d.radio("General notes: Default")`);
    await desk(`__d.select(document.querySelector(".fa-admin-fields select"), "incident")`, 400);
    await desk(`__d.radio("Narrative: Default")`);
    await desk(`__d.click("Save settings")`, 2500);
    pass("demo field rules reset to defaults");
  } catch (error) {
    console.error("FAIL", error.message);
    await snap("failure").catch(() => null);
    console.log((await page.eval(`document.body.innerText`).catch(() => "")).slice(0, 1200));
    console.log(page.console.filter((line) => !/WebChannel|Synced departments/.test(line)).slice(-20).join("\n"));
    process.exitCode = 1;
  } finally {
    console.log(JSON.stringify(results, null, 2));
    chrome.proc.kill();
  }
}

main();
