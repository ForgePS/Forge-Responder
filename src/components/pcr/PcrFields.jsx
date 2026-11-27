/**
 * NEMSIS fields for the RMS patient care report editor (desktop), in the NERIS editor's look (nr-*).
 * Every field comes from the NEMSIS schema (pcrModel sectionLayout) with the department's form settings applied
 * (pcrForm customizeLayout): its wording, its drop-down choices, hidden and required fields.
 */
import { useId, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Clock, Plus, Trash2 } from "lucide-react";
import { Field, Picker, TextArea, TextInput } from "../neris/NerisControls.jsx";
import {
  SIGNATURE_FILE_FIELDS,
  SIGNATURE_GROUP,
  addGroupRow,
  composeLeaf,
  fieldPath,
  fromLocalInput,
  getLeaf,
  groupRows,
  nemsisDateTime,
  removeGroupRow,
  setLeaf,
  signatureImage,
  toLocalInput,
  notValueChoices,
  pertinentNegativeChoices,
} from "../../lib/nemsis/pcrModel.js";
import { readLeaf } from "../../lib/nemsis/schema.js";
import { countHidden } from "../../lib/pcr/pcrEditing.js";

/** New rows of these groups start with the time filled in. */
const PREFILL_NOW = { "eVitals.VitalGroup": "eVitals.01", "eMedications.MedicationGroup": "eMedications.01", "eProcedures.ProcedureGroup": "eProcedures.01" };

/**
 * One charting section as a card: essential fields first, the rest behind "More fields".
 * ctx: { schema, pcr, setPcr, issues, readOnly }
 */
export function PcrSectionCard({ section, layout, ctx, icon: Icon, blocking = 0 }) {
  const [showAll, setShowAll] = useState(false);
  const hasEssential = layout.some((item) => item.essential);
  const hidden = countHidden(layout);
  return (
    <section className={`nr-section pcr-section${blocking ? " nr-section-missing" : ""}`} id={`pcr-section-${section.id}`}>
      <header>
        <div className="nr-section-title">
          {Icon ? <span className="nr-section-icon"><Icon size={16} /></span> : null}
          <div>
            <h3>{section.label}</h3>
            {blocking ? <p className="pcr-section-todo">{blocking} to fix before posting</p> : null}
          </div>
        </div>
        {hasEssential && hidden ? (
          <button type="button" className="nr-btn nr-btn-ghost nr-small" onClick={() => setShowAll((v) => !v)}>
            {showAll ? <><ChevronUp size={15} /> Fewer fields</> : <><ChevronDown size={15} /> More fields</>}
          </button>
        ) : null}
      </header>
      <div className="nr-grid">
        <LayoutItems items={layout} ctx={ctx} at={{}} showAll={showAll || !hasEssential} />
      </div>
    </section>
  );
}

function LayoutItems({ items, ctx, at, showAll }) {
  return items
    .filter((item) => showAll || item.essential)
    // A signature row's image fields are shown as the signature itself (RepeatGroup).
    .filter((item) => !(item.type === "field" && SIGNATURE_FILE_FIELDS.includes(item.field.el)))
    .map((item) => {
      if (item.type === "field") return <LeafEditor key={item.field.el} field={item.field} ctx={ctx} at={at} />;
      if (item.repeating) return <RepeatGroup key={item.name} item={item} ctx={ctx} at={at} showAll={showAll} />;
      return (
        <fieldset key={item.name} className="pcr-group nr-wide">
          <legend>{item.label}</legend>
          <div className="nr-grid">
            <LayoutItems items={item.children} ctx={ctx} at={at} showAll={showAll} />
          </div>
        </fieldset>
      );
    });
}

function RepeatGroup({ item, ctx, at, showAll }) {
  const { schema, pcr, setPcr, readOnly } = ctx;
  const rows = groupRows(schema, pcr, item.name, at);
  const shown = rows.length ? rows : item.required ? [{}] : [];
  const add = () => setPcr((current) => {
    const prefill = PREFILL_NOW[item.name];
    const row = prefill ? { [prefill]: nemsisDateTime() } : {};
    // A required first row is shown before it is stored: store it, then add the next.
    const base = rows.length || !item.required ? current : addGroupRow(schema, current, item.name, {}, at).pcr;
    return addGroupRow(schema, base, item.name, row, at).pcr;
  });
  return (
    <div className="pcr-repeat nr-wide">
      {shown.map((_, index) => {
        const here = { ...at, [item.name]: index };
        return (
          <fieldset key={index} className="pcr-group">
            <legend>
              <span>{item.label}{shown.length > 1 ? ` ${index + 1}` : ""}</span>
              {!readOnly && rows.length ? (
                <button type="button" className="nr-icon-btn" aria-label={`Remove ${item.label} ${index + 1}`} title="Remove" onClick={() => setPcr((current) => removeGroupRow(schema, current, item.name, index, at))}>
                  <Trash2 size={15} />
                </button>
              ) : null}
            </legend>
            <div className="nr-grid">
              <LayoutItems items={item.children} ctx={ctx} at={here} showAll={showAll} />
              {item.name === SIGNATURE_GROUP ? <SignatureView ctx={ctx} at={here} /> : null}
            </div>
          </fieldset>
        );
      })}
      {!readOnly && item.name !== SIGNATURE_GROUP ? (
        <button type="button" className="nr-btn nr-btn-soft pcr-add-row" onClick={add}><Plus size={15} /> Add {item.label.toLowerCase()}</button>
      ) : null}
    </div>
  );
}

function SignatureView({ ctx, at }) {
  const image = signatureImage(ctx.schema, ctx.pcr, at);
  return (
    <div className="nr-field nr-wide">
      <span className="nr-label">Signature</span>
      {image ? <img className="pcr-signature" src={image} alt="Captured signature" /> : <small className="nr-help">Signatures are captured on the crew's device in FORGE FIELD.</small>}
    </div>
  );
}

function LeafEditor({ field, ctx, at }) {
  const { schema, pcr, setPcr, issues, readOnly } = ctx;
  const listId = useId();
  const raw = getLeaf(schema, pcr, field.el, at);
  const path = fieldPath(schema, field.el, at);
  const fieldIssues = issues.filter((i) => i.path === path || i.path.startsWith(`${path}[`) || i.path.startsWith(`${path}.`));
  const error = fieldIssues.find((i) => i.severity === "error")?.message;
  const write = (value) => setPcr((current) => setLeaf(schema, current, field.el, value, at));

  // Repeating fields hold a list; not-recorded / pertinent negative apply to the field as a whole.
  const values = field.repeating ? (Array.isArray(raw) ? raw : raw === undefined ? [] : [raw]) : null;
  const single = field.repeating ? readLeaf(values.find((v) => readLeaf(v).NV || readLeaf(v).PN)) : readLeaf(raw);
  const plainValues = field.repeating ? values.map((v) => readLeaf(v).value).filter((v) => v !== undefined) : [];
  const notValue = single.NV || "";
  const pertinentNegative = single.PN || "";
  const disabled = readOnly || Boolean(notValue);

  const options = useMemo(() => (field.options || []).map((o) => ({ value: o.code, label: o.label, pinned: o.pinned })), [field.options]);
  const pinned = options.some((o) => o.pinned);

  const setValue = (value) => {
    if (field.repeating) write(Array.isArray(value) ? value : [value].filter(Boolean));
    else write(composeLeaf(raw, { value: value === "" ? undefined : value, NV: undefined }));
  };
  const setNot = (choice) => {
    const [kind, code] = choice.split(":");
    if (field.repeating) {
      write(!code ? plainValues : kind === "NV" ? [{ NV: code }] : [{ PN: code }]);
      return;
    }
    if (!code) write(composeLeaf(raw, { NV: undefined, PN: undefined }));
    else if (kind === "NV") write({ NV: code });
    else write(composeLeaf(raw, { PN: code, NV: undefined }));
  };

  let input;
  switch (field.kind) {
    case "select":
      input = (
        <Picker
          value={single.value !== undefined ? String(single.value) : ""}
          options={options}
          disabled={disabled}
          placeholder={notValue ? "Not recorded" : "Choose…"}
          groupBy={pinned ? (o) => (o.pinned ? "Common" : "All choices") : undefined}
          onChange={(value) => setValue(value)}
        />
      );
      break;
    case "multiselect":
      input = <Picker multiple value={plainValues.map(String)} options={options} disabled={disabled} placeholder={notValue ? "Not recorded" : "Choose one or more…"} onChange={(picked) => setValue(picked)} />;
      break;
    case "datetime":
      input = (
        <div className="pcr-inline">
          <TextInput type="datetime-local" step="1" disabled={disabled} value={toLocalInput(single.value)} onChange={(value) => setValue(fromLocalInput(value))} />
          {!disabled ? <button type="button" className="nr-btn nr-btn-soft" title="Set to now" onClick={() => setValue(nemsisDateTime())}><Clock size={15} /> Now</button> : null}
        </div>
      );
      break;
    case "date":
      input = <TextInput type="date" disabled={disabled} value={single.value ?? ""} onChange={setValue} />;
      break;
    case "number":
      input = <TextInput inputMode="decimal" disabled={disabled} value={single.value ?? ""} min={field.min} max={field.max} onChange={(value) => setValue(value.trim())} />;
      break;
    case "textarea":
      input = <TextArea disabled={disabled} value={single.value ?? ""} onChange={setValue} rows={field.el === "eNarrative.01" ? 12 : 3} />;
      break;
    case "file":
      input = <small className="nr-help">Files are attached on the crew's device.</small>;
      break;
    default:
      input = field.repeating ? (
        <TextInput disabled={disabled} value={plainValues.join(", ")} placeholder="Separate with commas" onChange={(value) => setValue(value.split(",").map((v) => v.trim()).filter(Boolean))} />
      ) : (
        <>
          <TextInput
            disabled={disabled}
            value={single.value ?? ""}
            maxLength={field.maxLength}
            list={field.choices?.length ? listId : undefined}
            placeholder={field.choices?.length ? "Choose or type…" : undefined}
            onChange={setValue}
          />
          {field.choices?.length ? <datalist id={listId}>{field.choices.map((c) => <option key={c} value={c} />)}</datalist> : null}
        </>
      );
  }

  // The "Not documented…" picker only in History and Assessment (pcrModel notValueChoices / pertinentNegativeChoices).
  const nvChoices = notValueChoices(field, notValue);
  const pnChoices = pertinentNegativeChoices(field, pertinentNegative);
  const notOptions = [...nvChoices.map((o) => ({ ...o, kind: "NV" })), ...pnChoices.map((o) => ({ ...o, kind: "PN" }))];
  const attrDefs = (field.attrs || []).filter((a) => a.codes?.length && !field.repeating);
  const nemsisRequired = field.usage === "Mandatory" || field.usage === "Required";
  const help = error || field.help || (field.definition && field.definition.length < 170 ? field.definition : "");
  const wide = field.kind === "textarea" || field.kind === "multiselect";
  return (
    <Field
      label={<>{field.label} <small className="pcr-el" title={field.label !== field.nemsisLabel ? `NEMSIS: ${field.nemsisLabel}` : "NEMSIS element"}>{field.el}</small></>}
      required={nemsisRequired || field.departmentRequired}
      missing={Boolean(error)}
      wide={wide}
      help={help}
    >
      {input}
      {attrDefs.map((def) => (
        <label key={def.n} className="pcr-attr">
          <span>{def.n}</span>
          <select className="nr-input" disabled={readOnly} value={single.attrs?.[def.n] ?? ""} onChange={(event) => write(composeLeaf(raw, { attrs: { ...(single.attrs || {}), [def.n]: event.target.value } }))}>
            <option value="">—</option>
            {def.codes.map((code) => <option key={code} value={code}>{schema.codeLabel(field.el, code) ?? code}</option>)}
          </select>
        </label>
      ))}
      {notOptions.length && !readOnly ? (
        <select
          className="nr-input pcr-not"
          aria-label={pnChoices.length ? `${field.label}: not recorded or pertinent negative` : `${field.label}: not recorded`}
          value={notValue ? `NV:${notValue}` : pertinentNegative ? `PN:${pertinentNegative}` : ""}
          onChange={(event) => setNot(event.target.value)}
        >
          <option value="">{notValue || pertinentNegative ? "Clear" : pnChoices.length ? "Not documented / pertinent negative…" : "Not documented…"}</option>
          {notOptions.map((o) => <option key={`${o.kind}:${o.code}`} value={`${o.kind}:${o.code}`}>{o.label}</option>)}
        </select>
      ) : readOnly && (notValue || pertinentNegative) ? (
        <small className="nr-help">{[...field.nv, ...field.pn].find((o) => o.code === (notValue || pertinentNegative))?.label}</small>
      ) : null}
    </Field>
  );
}
