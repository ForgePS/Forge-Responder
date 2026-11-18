import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, CirclePlus, GripVertical, Trash2 } from "lucide-react";
import {
  addField,
  addSectionAtTop,
  moveField,
  moveSection,
  PREPLAN_FIELD_TYPES,
  removeField,
  removeSection,
  updateField,
  updateSection,
} from "../../lib/inspections/preplanTemplateLayout.js";

function typeLabel(type) {
  if (type === "textarea") return "Long text";
  if (type === "dropdown") return "Dropdown";
  return PREPLAN_FIELD_TYPES.find((row) => row.id === type)?.label || type || "Short text";
}

/**
 * Section + field layout editor for a preplan template.
 * Drag the grip to move a section or field (fields can move between sections),
 * or use the arrow buttons. Changes stay in the draft until the template is saved.
 */
export default function PreplanSectionsEditor({ sections = [], onChange, libraries = [], canManage = false }) {
  const [armed, setArmed] = useState(null); // grip pressed: { kind, section, index }
  const [drag, setDrag] = useState(null); // what is being dragged
  const [over, setOver] = useState(null); // drop target: { kind, section, index }

  // Releasing the grip anywhere (without dragging) disarms it so inputs select text normally.
  useEffect(() => {
    if (!armed || drag) return undefined;
    const disarm = () => setArmed(null);
    window.addEventListener("pointerup", disarm);
    return () => window.removeEventListener("pointerup", disarm);
  }, [armed, drag]);

  function reset() {
    setArmed(null);
    setDrag(null);
    setOver(null);
  }

  function dropSection(target) {
    if (drag?.kind === "section" && drag.section !== target) onChange(moveSection(sections, drag.section, target));
    reset();
  }

  function dropField(section, index) {
    if (drag?.kind !== "field") return reset();
    // Moving down within one section: the slot shifts up once the field is taken out.
    const sameSection = drag.section === section;
    const target = sameSection && drag.index < index ? index - 1 : index;
    if (!sameSection || drag.index !== target) {
      onChange(moveField(sections, { section: drag.section, index: drag.index }, { section, index: target }));
    }
    reset();
  }

  if (!canManage) {
    return (
      <div className="pp-layout">
        {sections.map((section) => (
          <div key={section.id} className="pp-section is-readonly">
            <strong className="pp-section-title">{section.title}</strong>
            <ul className="pp-readonly-fields">
              {(section.fields || []).map((field) => (
                <li key={field.key}><span>{field.label}</span><small>{typeLabel(field.type)}</small></li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="pp-layout">
      <button className="rms-add-row is-block" type="button" onClick={() => onChange(addSectionAtTop(sections))}>
        <CirclePlus size={14} /> Add section
      </button>

      {sections.map((section, sectionIndex) => {
        const sectionArmed = armed?.kind === "section" && armed.section === sectionIndex;
        const sectionOver = drag?.kind === "section" && over?.kind === "section" && over.section === sectionIndex && drag.section !== sectionIndex;
        const fields = section.fields || [];
        return (
          <div
            key={section.id || sectionIndex}
            className={`pp-section${sectionOver ? " is-drop-target" : ""}${drag?.kind === "section" && drag.section === sectionIndex ? " is-dragging" : ""}`}
            draggable={sectionArmed}
            onDragStart={(e) => {
              if (!sectionArmed) return;
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData("text/plain", section.id || String(sectionIndex));
              setDrag({ kind: "section", section: sectionIndex });
            }}
            onDragOver={(e) => {
              if (drag?.kind !== "section") return;
              e.preventDefault();
              if (over?.section !== sectionIndex || over?.kind !== "section") setOver({ kind: "section", section: sectionIndex });
            }}
            onDrop={(e) => {
              if (drag?.kind !== "section") return;
              e.preventDefault();
              dropSection(sectionIndex);
            }}
            onDragEnd={reset}
          >
            <div className="pp-section-head">
              <span
                className="pp-grip"
                title="Drag to move section"
                aria-hidden
                onPointerDown={() => setArmed({ kind: "section", section: sectionIndex })}
                onPointerUp={() => setArmed(null)}
              >
                <GripVertical size={16} />
              </span>
              <label className="pp-section-title-input">
                <span className="sr-only">Section title</span>
                <input
                  value={section.title || ""}
                  placeholder="Section title"
                  onChange={(e) => onChange(updateSection(sections, sectionIndex, { title: e.target.value }))}
                />
              </label>
              <div className="pp-actions">
                <button type="button" className="icon-button" title="Move section up" aria-label={`Move ${section.title || "section"} up`} disabled={sectionIndex === 0} onClick={() => onChange(moveSection(sections, sectionIndex, sectionIndex - 1))}><ArrowUp size={15} /></button>
                <button type="button" className="icon-button" title="Move section down" aria-label={`Move ${section.title || "section"} down`} disabled={sectionIndex === sections.length - 1} onClick={() => onChange(moveSection(sections, sectionIndex, sectionIndex + 1))}><ArrowDown size={15} /></button>
                <button
                  type="button"
                  className="icon-button danger"
                  title="Remove section"
                  aria-label={`Remove ${section.title || "section"}`}
                  onClick={() => {
                    if (fields.length && !window.confirm(`Remove "${section.title || "this section"}" and its ${fields.length} field(s)?`)) return;
                    onChange(removeSection(sections, sectionIndex));
                  }}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>

            <div
              className={`pp-fields${drag?.kind === "field" && over?.kind === "end" && over.section === sectionIndex ? " is-drop-end" : ""}`}
              onDragOver={(e) => {
                if (drag?.kind !== "field") return;
                e.preventDefault();
                e.stopPropagation();
                if (e.target === e.currentTarget && (over?.kind !== "end" || over.section !== sectionIndex)) setOver({ kind: "end", section: sectionIndex });
              }}
              onDrop={(e) => {
                if (drag?.kind !== "field") return;
                e.preventDefault();
                e.stopPropagation();
                dropField(sectionIndex, fields.length);
              }}
            >
              {!fields.length ? <p className="pp-empty">No fields. Add one, or drag a field here.</p> : null}
              {fields.map((field, fieldIndex) => {
                const fieldArmed = armed?.kind === "field" && armed.section === sectionIndex && armed.index === fieldIndex;
                const fieldOver = drag?.kind === "field" && over?.kind === "field" && over.section === sectionIndex && over.index === fieldIndex;
                const isDropdown = field.type === "select" || field.type === "dropdown";
                const typeValue = field.type === "textarea" ? "long_text" : field.type === "dropdown" ? "select" : (field.type || "text");
                return (
                  <div
                    key={field.key || fieldIndex}
                    className={`pp-field${fieldOver ? " is-drop-target" : ""}${drag?.kind === "field" && drag.section === sectionIndex && drag.index === fieldIndex ? " is-dragging" : ""}`}
                    draggable={fieldArmed}
                    onDragStart={(e) => {
                      if (!fieldArmed) return;
                      e.stopPropagation();
                      e.dataTransfer.effectAllowed = "move";
                      e.dataTransfer.setData("text/plain", field.key || "");
                      setDrag({ kind: "field", section: sectionIndex, index: fieldIndex });
                    }}
                    onDragOver={(e) => {
                      if (drag?.kind !== "field") return;
                      e.preventDefault();
                      e.stopPropagation();
                      if (over?.kind !== "field" || over.section !== sectionIndex || over.index !== fieldIndex) setOver({ kind: "field", section: sectionIndex, index: fieldIndex });
                    }}
                    onDrop={(e) => {
                      if (drag?.kind !== "field") return;
                      e.preventDefault();
                      e.stopPropagation();
                      dropField(sectionIndex, fieldIndex);
                    }}
                    onDragEnd={(e) => { e.stopPropagation(); reset(); }}
                  >
                    <span
                      className="pp-grip"
                      title="Drag to move field (also into another section)"
                      aria-hidden
                      onPointerDown={() => setArmed({ kind: "field", section: sectionIndex, index: fieldIndex })}
                      onPointerUp={() => setArmed(null)}
                    >
                      <GripVertical size={15} />
                    </span>
                    <label className="pp-field-label">
                      <span>Label</span>
                      <input value={field.label || ""} onChange={(e) => onChange(updateField(sections, sectionIndex, fieldIndex, { label: e.target.value }))} />
                    </label>
                    <label className="pp-field-type">
                      <span>Type</span>
                      <select value={typeValue} onChange={(e) => onChange(updateField(sections, sectionIndex, fieldIndex, { type: e.target.value }))}>
                        {PREPLAN_FIELD_TYPES.map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}
                      </select>
                    </label>
                    {isDropdown ? (
                      <label className="pp-field-library">
                        <span>Dropdown list</span>
                        <select value={field.dropdownLibrary || ""} onChange={(e) => onChange(updateField(sections, sectionIndex, fieldIndex, { dropdownLibrary: e.target.value }))}>
                          <option value="">Choose a list…</option>
                          {libraries.map((row) => <option key={row.id} value={row.key}>{row.name || row.key}</option>)}
                        </select>
                      </label>
                    ) : <span className="pp-field-library" aria-hidden />}
                    <label className="pp-field-flag" title="Only shown to members allowed to see restricted preplan details">
                      <input type="checkbox" checked={Boolean(field.sensitive)} onChange={(e) => onChange(updateField(sections, sectionIndex, fieldIndex, { sensitive: e.target.checked }))} />
                      Restricted
                    </label>
                    <div className="pp-actions">
                      <button type="button" className="icon-button" title="Move field up" aria-label={`Move ${field.label || "field"} up`} disabled={fieldIndex === 0 && sectionIndex === 0} onClick={() => onChange(fieldIndex > 0
                        ? moveField(sections, { section: sectionIndex, index: fieldIndex }, { section: sectionIndex, index: fieldIndex - 1 })
                        : moveField(sections, { section: sectionIndex, index: 0 }, { section: sectionIndex - 1, index: (sections[sectionIndex - 1].fields || []).length }))}
                      ><ArrowUp size={15} /></button>
                      <button type="button" className="icon-button" title="Move field down" aria-label={`Move ${field.label || "field"} down`} disabled={fieldIndex === fields.length - 1 && sectionIndex === sections.length - 1} onClick={() => onChange(fieldIndex < fields.length - 1
                        ? moveField(sections, { section: sectionIndex, index: fieldIndex }, { section: sectionIndex, index: fieldIndex + 1 })
                        : moveField(sections, { section: sectionIndex, index: fieldIndex }, { section: sectionIndex + 1, index: 0 }))}
                      ><ArrowDown size={15} /></button>
                      <button type="button" className="icon-button danger" title="Remove field" aria-label={`Remove ${field.label || "field"}`} onClick={() => onChange(removeField(sections, sectionIndex, fieldIndex))}><Trash2 size={15} /></button>
                    </div>
                  </div>
                );
              })}
            </div>

            <button className="rms-add-row" type="button" onClick={() => onChange(addField(sections, sectionIndex))}>
              <CirclePlus size={14} /> Add field
            </button>
          </div>
        );
      })}
    </div>
  );
}
