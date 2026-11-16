import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, LayoutGrid, Plus, RotateCcw, X } from "lucide-react";
import {
  MAX_QUICK_LINKS,
  addQuickLink,
  addableQuickLinks,
  canAddQuickLink,
  moveQuickLink,
  removeQuickLink,
  visibleQuickLinks,
} from "../../lib/dashboardQuickLinks.js";

/**
 * My Dashboard quick-link cards. `options` are the pages this person's menu
 * offers ({ name, icon, group }); `saved` is their stored list (undefined =
 * never customized, so the defaults show). `onSave(nextList)` stores a change.
 */
export default function DashboardQuickLinks({ options = [], saved, onSave, onNavigate }) {
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState("");
  const cards = useMemo(() => visibleQuickLinks(saved, options), [saved, options]);
  const addable = useMemo(() => addableQuickLinks(saved, options), [saved, options]);
  const addableGroups = useMemo(() => {
    const groups = new Map();
    for (const option of addable) {
      const label = option.group || "Pages";
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label).push(option);
    }
    return [...groups.entries()];
  }, [addable]);
  const roomLeft = canAddQuickLink(saved, options);

  function add() {
    if (!adding) return;
    onSave?.(addQuickLink(saved, options, adding));
    setAdding("");
  }

  return (
    <section className="panel quick-links-panel" aria-label="Quick links">
      <header>
        <div><LayoutGrid size={15} /><strong>Quick Links</strong></div>
        <button
          type="button"
          className="text-button"
          aria-pressed={editing}
          onClick={() => { setEditing((value) => !value); setAdding(""); }}
        >
          {editing ? "Done" : "Customize"}
        </button>
      </header>
      <div className="panel-body quick-links-body">
        {cards.length ? (
          <ul className={`quick-links-grid${editing ? " is-editing" : ""}`}>
            {cards.map(({ name, icon: Icon, group }, index) => (
              <li key={name}>
                {editing ? (
                  <div className="quick-link-card is-editing">
                    {Icon ? <Icon size={18} aria-hidden="true" /> : <LayoutGrid size={18} aria-hidden="true" />}
                    <span className="quick-link-name">{name}</span>
                    <span className="quick-link-tools">
                      <button type="button" className="icon-button" aria-label={`Move ${name} earlier`} title="Move earlier" disabled={index === 0} onClick={() => onSave?.(moveQuickLink(saved, options, name, -1))}>
                        <ChevronLeft size={16} aria-hidden="true" />
                      </button>
                      <button type="button" className="icon-button" aria-label={`Move ${name} later`} title="Move later" disabled={index === cards.length - 1} onClick={() => onSave?.(moveQuickLink(saved, options, name, 1))}>
                        <ChevronRight size={16} aria-hidden="true" />
                      </button>
                      <button type="button" className="icon-button danger-button" aria-label={`Remove ${name}`} title="Remove" onClick={() => onSave?.(removeQuickLink(saved, options, name))}>
                        <X size={16} aria-hidden="true" />
                      </button>
                    </span>
                  </div>
                ) : (
                  <button type="button" className="quick-link-card" onClick={() => onNavigate?.(name)} title={`Open ${name}`}>
                    {Icon ? <Icon size={18} aria-hidden="true" /> : <LayoutGrid size={18} aria-hidden="true" />}
                    <span className="quick-link-name">{name}</span>
                    {group ? <small>{group}</small> : null}
                  </button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="quick-links-empty">
            <b>No quick links yet</b>
            <span>{editing ? "Pick a page below to add a card." : "Choose Customize to add cards for the pages you use most."}</span>
          </p>
        )}
        {editing ? (
          <div className="quick-links-editor">
            {roomLeft && addable.length ? (
              <form className="quick-links-add" onSubmit={(event) => { event.preventDefault(); add(); }}>
                <label htmlFor="quick-link-add-select" className="sr-only">Page to add</label>
                <select id="quick-link-add-select" value={adding} onChange={(event) => setAdding(event.target.value)}>
                  <option value="">Add a page…</option>
                  {addableGroups.map(([label, items]) => (
                    <optgroup key={label} label={label}>
                      {items.map((option) => <option key={option.name} value={option.name}>{option.name}</option>)}
                    </optgroup>
                  ))}
                </select>
                <button type="submit" className="primary-button" disabled={!adding}>
                  <Plus size={15} aria-hidden="true" /> Add
                </button>
              </form>
            ) : (
              <span className="quick-links-note">
                {roomLeft ? "Every page you can open already has a card." : `Up to ${MAX_QUICK_LINKS} cards. Remove one to add another.`}
              </span>
            )}
            <button type="button" className="secondary-button quick-links-reset" onClick={() => onSave?.(null)}>
              <RotateCcw size={14} aria-hidden="true" /> Reset to defaults
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
