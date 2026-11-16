import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_BROWSER_TITLE,
  DEFAULT_FAVICON_PATH,
  MAX_BROWSER_TITLE_LENGTH,
  applyTabBranding,
  faviconType,
  isSafeFaviconUrl,
  normalizeBrowserTitle,
  resolveTabBranding,
  tabTitle,
} from "../../src/lib/browserTabBranding.js";

test("defaults when nothing is saved", () => {
  assert.deepEqual(resolveTabBranding({}), { title: DEFAULT_BROWSER_TITLE, faviconUrl: DEFAULT_FAVICON_PATH });
  assert.deepEqual(resolveTabBranding(null), { title: DEFAULT_BROWSER_TITLE, faviconUrl: DEFAULT_FAVICON_PATH });
});

test("saved title and favicon are used", () => {
  const branding = resolveTabBranding({ browserTitle: "  FORGE   Responder ", faviconUrl: "https://firebasestorage.googleapis.com/v0/b/x/o/favicon.png?alt=media" });
  assert.equal(branding.title, "FORGE Responder");
  assert.match(branding.faviconUrl, /^https:\/\/firebasestorage/);
});

test("titles are tidied and capped", () => {
  assert.equal(normalizeBrowserTitle("a\n\tb"), "a b");
  assert.equal(normalizeBrowserTitle("x".repeat(200)).length, MAX_BROWSER_TITLE_LENGTH);
  assert.equal(resolveTabBranding({ browserTitle: "   " }).title, DEFAULT_BROWSER_TITLE);
});

test("only https addresses, site paths and this computer can be a favicon", () => {
  assert.equal(isSafeFaviconUrl("/favicon.png"), true);
  assert.equal(isSafeFaviconUrl("https://example.com/icon.svg"), true);
  assert.equal(isSafeFaviconUrl("http://127.0.0.1:9199/v0/b/x/o/f.png"), true);
  assert.equal(isSafeFaviconUrl("http://example.com/icon.png"), false);
  assert.equal(isSafeFaviconUrl("//evil.example/icon.png"), false);
  assert.equal(isSafeFaviconUrl("javascript:alert(1)"), false);
  assert.equal(isSafeFaviconUrl("data:image/png;base64,AAAA"), false);
  assert.equal(resolveTabBranding({ faviconUrl: "javascript:alert(1)" }).faviconUrl, DEFAULT_FAVICON_PATH);
});

test("test-environment prefix is kept", () => {
  assert.equal(tabTitle("FORGE Responder", "[STAGING] "), "[STAGING] FORGE Responder");
  assert.equal(tabTitle("", ""), DEFAULT_BROWSER_TITLE);
});

test("icon type follows the file", () => {
  assert.equal(faviconType("/x.svg"), "image/svg+xml");
  assert.equal(faviconType("https://h/o/a.ICO?alt=media"), "image/x-icon");
  assert.equal(faviconType("https://h/o/a.png?alt=media&token=1"), "image/png");
});

function fakeDocument() {
  const links = [];
  return {
    title: "Old",
    head: { appendChild: (el) => links.push(el) },
    createElement: () => {
      const attrs = {};
      return { attrs, setAttribute: (k, v) => { attrs[k] = v; }, getAttribute: (k) => attrs[k] ?? null };
    },
    querySelector: () => links[0] || null,
    links,
  };
}

test("applying sets the title and adds or updates one icon link", () => {
  const doc = fakeDocument();
  applyTabBranding(doc, { title: "FORGE Responder", faviconUrl: "/custom.svg" }, "[STAGING] ");
  assert.equal(doc.title, "[STAGING] FORGE Responder");
  assert.equal(doc.links.length, 1);
  assert.equal(doc.links[0].attrs.href, "/custom.svg");
  assert.equal(doc.links[0].attrs.type, "image/svg+xml");
  applyTabBranding(doc, { title: "Other", faviconUrl: "/favicon.png" });
  assert.equal(doc.title, "Other");
  assert.equal(doc.links.length, 1);
  assert.equal(doc.links[0].attrs.href, "/favicon.png");
});
