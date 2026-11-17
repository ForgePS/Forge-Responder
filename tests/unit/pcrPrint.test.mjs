// Printable patient care report (RMS Print button).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { loadNemsisSchema, ROOT } from "./helpers/nemsisSchema.mjs";
import { pcrPrintHtml } from "../../src/lib/nemsis/pcrPrint.js";
import { setLeaf } from "../../src/lib/nemsis/pcrModel.js";

const schema = loadNemsisSchema("3.5.1");
const fixture = JSON.parse(fs.readFileSync(path.join(ROOT, "tests", "fixtures", "nemsis", "pcr-chest-pain.json"), "utf8"));
const when = (iso) => `@${iso}`;

test("the print view lists every charted section with labels and readable values", () => {
  const html = pcrPrintHtml(schema, { number: "P-1", status: "posted", postedAt: "2026-11-15T15:10:00Z", postedByName: "FF Sample", unit: "Medic 1", nemsis: fixture.data },
    { agencyName: "Test EMS", printedBy: "Capt. Review", printedAt: "2026-11-17T09:00:00Z", when });
  assert.match(html, /^<!doctype html>/);
  assert.match(html, /<title>Patient care report P-1<\/title>/);
  assert.match(html, /<h2>Times<\/h2>/);
  assert.match(html, /<h2>Vitals<\/h2>|<h2>Vital signs<\/h2>/);
  assert.match(html, /Unit Notified by Dispatch Date\/Time<\/dt><dd>@2026-11-15T14:03:05-06:00/, "date/times go through the formatter");
  assert.match(html, /<b>Patient:<\/b> Alex Testpatient/);
  assert.match(html, /Posted @2026-11-15T15:10:00Z by FF Sample/);
  assert.match(html, /Printed @2026-11-17T09:00:00Z by Capt\. Review\. Contains protected health information\./);
  assert.doesNotMatch(html, /<h2>Injury<\/h2>/, "empty sections are left out");
});

test("charted text is escaped and drafts are marked", () => {
  const nemsis = setLeaf(schema, {}, "eNarrative.01", `<script>alert("x")</script> & more`);
  const html = pcrPrintHtml(schema, { number: "P-2", status: "draft", nemsis }, { when });
  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt; &amp; more/);
  assert.match(html, /class="draft"><b>Status:<\/b> DRAFT — not posted/);
});

test("signatures print as images", async () => {
  const { setSignature, SIGNATURE_GROUP } = await import("../../src/lib/nemsis/pcrModel.js");
  const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
  const nemsis = setSignature(schema, {}, { [SIGNATURE_GROUP]: 0 }, { dataUrl: `data:image/png;base64,${PNG}`, signedAt: "2026-11-17T10:00:00-06:00" });
  const html = pcrPrintHtml(schema, { number: "P-3", status: "draft", nemsis }, { when });
  assert.ok(html.includes(`<img class="sig" src="data:image/png;base64,${PNG}" alt="Signature Graphic">`));
});
