import test from "node:test";
import assert from "node:assert/strict";
import { documentHasFile, documentPreviewKind } from "../../src/lib/documentPreview.js";

test("documents without a real file have nothing to preview", () => {
  assert.equal(documentHasFile({ fileUrl: "#" }), false);
  assert.equal(documentHasFile({}), false);
  assert.equal(documentPreviewKind({ fileUrl: "#", fileType: "PDF" }), "");
});

test("PDFs preview inline, by file type or by URL", () => {
  assert.equal(documentPreviewKind({ fileUrl: "https://x/doc", fileType: "PDF" }), "pdf");
  assert.equal(documentPreviewKind({ fileUrl: "https://x/sog.pdf?alt=media&token=1" }), "pdf");
});

test("images preview inline; other files open in a new tab", () => {
  assert.equal(documentPreviewKind({ fileUrl: "https://x/map.PNG" }), "image");
  assert.equal(documentPreviewKind({ fileUrl: "https://x/f", fileType: ".jpg" }), "image");
  assert.equal(documentPreviewKind({ fileUrl: "https://x/policy.docx", fileType: "docx" }), "");
});
