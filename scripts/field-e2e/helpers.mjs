// In-page helpers injected into the field app by the end-to-end scripts.
export const HELPERS = `
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
