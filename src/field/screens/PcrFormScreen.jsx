/**
 * FORGE FIELD patient care report (ePCR), NEMSIS 3.5.1.
 *
 * Charted section by section; every field comes from the NEMSIS schema (src/lib/nemsis/pcrModel.js), with the
 * Mandatory, Required and national fields shown first and the rest under "More fields". Saved on the device
 * (encrypted) as you type, sent when there's signal. Posting is blocked until NEMSIS validation has no errors.
 */
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronRight, Clock, Loader2, Lock, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { version as APP_VERSION } from "../../../package.json";
import { useField, useRecordForm } from "../fieldContext.jsx";
import { describePcr, fieldPcrNumber, newPcrRecordData } from "../fieldPcr.js";
import { reopenIfUnlocked } from "../fieldPcrReopen.js";
import { dispatchPrefill, recentDispatches } from "../fieldDispatch.js";
import { refItems } from "../fieldRefData.js";
import {
  PCR_SECTIONS,
  SIGNATURE_FILE_FIELDS,
  SIGNATURE_GROUP,
  addGroupRow,
  composeLeaf,
  fieldPath,
  fromLocalInput,
  getLeaf,
  groupRows,
  nemsisDateTime,
  postCheck,
  removeGroupRow,
  sectionForPath,
  sectionLayout,
  sectionProgress,
  setLeaf,
  toLocalInput,
  notValueChoices,
  pertinentNegativeChoices,
} from "../../lib/nemsis/pcrModel.js";
import { readLeaf } from "../../lib/nemsis/schema.js";
import { applyFormDefaults, customizeLayout, normalizePcrForm, visibleSections, withDepartmentIssues } from "../../lib/pcr/pcrForm.js";
import { Banner, Field, PickerButton, PickerSheet, Screen, Section, TextArea, TextInput, cx, formatWhen } from "../ui.jsx";
import { UnitField } from "./common.jsx";
import SignaturePad from "./SignaturePad.jsx";
import PcrBillingPhotos from "./PcrBillingPhotos.jsx";

/** The NEMSIS schema is large (≈1 MB of JSON): load it when a report is opened, not with the app. */
function useNemsisSchema() {
  const [state, setState] = useState({ schema: null, error: "" });
  useEffect(() => {
    let active = true;
    import("../../lib/nemsis/index.js")
      .then((mod) => active && setState({ schema: mod.nemsisSchema, error: "" }))
      .catch(() => active && setState({ schema: null, error: "The ePCR couldn't load. Open the app once with signal so it's available offline." }));
    return () => {
      active = false;
    };
  }, []);
  return state;
}

/** Before an existing report opens, reopen it if a supervisor unlocked it in the RMS (needs signal). */
function useUnlockCheck(localId) {
  const { snapshot, online, toast } = useField();
  const [done, setDone] = useState(!localId || !online);
  useEffect(() => {
    if (done) return undefined;
    let active = true;
    reopenIfUnlocked({ departmentId: snapshot.departmentId, localId }).then((reopened) => {
      if (!active) return;
      if (reopened) toast("A supervisor unlocked this report. You can edit it again.", "ok");
      setDone(true);
    });
    return () => {
      active = false;
    };
  }, []); // once, when the report is opened
  return done;
}

export default function PcrFormScreen({ params = {} }) {
  const { back } = useField();
  const { schema, error } = useNemsisSchema();
  const unlockChecked = useUnlockCheck(params.localId);
  const { refData } = useField();
  // A new report can start from a recent dispatch (Active911): times, address and location filled in.
  const dispatches = useMemo(() => (params.localId ? [] : recentDispatches(refItems(refData, "dispatches"))), [params.localId, refData]);
  const [start, setStart] = useState(params.localId ? { chosen: true } : null);
  if (!schema || !unlockChecked) {
    return (
      <Screen title="Patient care report" onBack={back}>
        {error ? <Banner tone="warn" icon={<AlertTriangle size={22} />}>{error}</Banner> : (
          <div className="fa-map-loading" style={{ minHeight: 200 }}><Loader2 size={24} className="fa-spin" /></div>
        )}
      </Screen>
    );
  }
  if (!start && dispatches.length) {
    return <DispatchPicker dispatches={dispatches} onPick={(dispatch) => setStart({ chosen: true, dispatch })} onBlank={() => setStart({ chosen: true })} />;
  }
  return <PcrEditor schema={schema} params={params} dispatch={start?.dispatch ?? null} />;
}

function DispatchPicker({ dispatches, onPick, onBlank }) {
  const { back } = useField();
  return (
    <Screen title="New patient care report" onBack={back}>
      <Section title="Start from a dispatch" hint="Fills in when your unit was notified, the scene address and location. You can change them.">
        <div className="fa-list">
          {dispatches.map((dispatch) => (
            <button key={dispatch.id} type="button" className="fa-row" onClick={() => onPick(dispatch)}>
              <span className="fa-row-text">
                <strong>{dispatch.description}</strong>
                <small>{[formatWhen(dispatch.sentAt), dispatch.address, dispatch.city, dispatch.units && `Units: ${dispatch.units}`].filter(Boolean).join(" · ")}</small>
              </span>
              <ChevronRight size={20} aria-hidden="true" />
            </button>
          ))}
        </div>
      </Section>
      <button type="button" className="fa-btn fa-btn-secondary fa-btn-block" onClick={onBlank}>Start a blank report</button>
    </Screen>
  );
}

const PREFILL_NOW = { "eVitals.VitalGroup": "eVitals.01", "eMedications.MedicationGroup": "eMedications.01", "eProcedures.ProcedureGroup": "eProcedures.01" };

function PcrEditor({ schema, params, dispatch = null }) {
  const { snapshot, back, caps, online, config, recent } = useField();
  // The department's form settings (RMS Patient Care Reports → Form settings).
  const pcrForm = useMemo(() => normalizePcrForm(config?.emsForm), [config]);
  const [initial] = useState(() => {
    const record = newPcrRecordData(schema, {
    uuid: globalThis.crypto.randomUUID(),
    number: fieldPcrNumber(),
    softwareVersion: APP_VERSION,
    uid: snapshot.uid,
    agency: { number: config?.ems?.agencyNumber || "", name: config?.ems?.agencyName || snapshot.departmentName || "" },
    unit: recent.unit ? { callSign: recent.unit, vehicleNumber: recent.unit } : undefined,
    cad: { notified: params.notified || "", ...dispatchPrefill(dispatch) },
    });
    return { ...record, nemsis: applyFormDefaults(schema, record.nemsis, normalizePcrForm(config?.emsForm)) };
  });
  const form = useRecordForm({ kind: "pcr", localId: params.localId, initialData: initial, describe: describePcr, validate: () => ({}) });
  const { data, update, submit, saving, existingStatus, loaded } = form;
  const [sectionId, setSectionId] = useState(params.section || "dispatch");
  const [showAll, setShowAll] = useState(false);
  const [showIssues, setShowIssues] = useState(false);

  const pcr = data.nemsis || {};
  const deferredPcr = useDeferredValue(pcr);
  const check = useMemo(() => withDepartmentIssues(postCheck(schema, deferredPcr), schema, deferredPcr, pcrForm), [schema, deferredPcr, pcrForm]);
  const progress = useMemo(() => sectionProgress(schema, deferredPcr), [schema, deferredPcr]);
  const sections = useMemo(() => visibleSections(schema, pcrForm), [schema, pcrForm]);
  const layout = useMemo(() => customizeLayout(sectionLayout(schema, sectionId), pcrForm), [schema, sectionId, pcrForm]);
  const hasEssential = layout.some((item) => item.essential);

  const posted = data.status === "posted";
  const readOnly = !caps.pcr || existingStatus === "syncing" || (posted && existingStatus === "synced");
  const setPcr = (fn) => update((current) => ({ nemsis: fn(current.nemsis || {}) }));
  const ctx = { schema, pcr, setPcr, issues: check.issues, readOnly };

  const sectionIndex = sections.findIndex((s) => s.id === sectionId);
  const nextSection = sections[sectionIndex + 1];
  const blockingBySection = useMemo(() => {
    const out = {};
    for (const issue of check.blocking) out[sectionForPath(issue.path)] = (out[sectionForPath(issue.path)] || 0) + 1;
    return out;
  }, [check.blocking]);

  if (!loaded) return <Screen title="Patient care report" onBack={back} />;

  const goTo = (id) => {
    setSectionId(id);
    setShowAll(false);
    window.scrollTo?.({ top: 0 });
  };

  function post() {
    if (!check.ok) {
      setShowIssues(true);
      const first = check.blocking[0];
      if (first) goTo(sectionForPath(first.path));
      return;
    }
    submit({ finalize: (current) => ({ ...current, status: "posted" }), message: "Report posted" });
  }

  return (
    <Screen
      title={data.number || "Patient care report"}
      subtitle={[posted ? "Posted" : "Draft", data.unit, "NEMSIS 3.5.1"].filter(Boolean).join(" · ")}
      onBack={back}
      wide
      footer={readOnly ? null : (
        <div className="fa-pcr-footer">
          <button type="button" className="fa-btn fa-btn-secondary" disabled={saving} onClick={() => submit({ message: online ? "Saved and sent" : "Saved — sends when there's signal" })}>
            {online ? "Save and send" : "Save"}
          </button>
          <button type="button" className={cx("fa-btn", check.ok ? "fa-btn-primary" : "fa-btn-ghost")} disabled={saving} onClick={post}>
            {check.ok ? <ShieldCheck size={20} /> : <AlertTriangle size={20} />} {check.ok ? "Post report" : `Post (${check.blocking.length} left)`}
          </button>
        </div>
      )}
    >
      <Banner tone="info" icon={<Lock size={22} />}>
        Patient information is encrypted on this phone and removed when you sign out. Only the crew on this report and
        supervisors can open it in the RMS.
      </Banner>
      {posted && existingStatus === "synced" ? (
        <Banner tone="info" icon={<CheckCircle2 size={22} />} title="Posted">This report is locked. A supervisor can unlock it for an amendment.</Banner>
      ) : null}
      {!caps.pcr ? <Banner tone="info" title="View only">Your role can't chart patient care reports.</Banner> : null}

      <nav className="fa-pcr-sections" aria-label="Report sections">
        {sections.map((section) => {
          const p = progress[section.id];
          const blocking = blockingBySection[section.id] || 0;
          return (
            <button
              key={section.id}
              type="button"
              className={cx("fa-chip", section.id === sectionId && "is-active", blocking && "has-error")}
              aria-current={section.id === sectionId ? "step" : undefined}
              onClick={() => goTo(section.id)}
            >
              {section.label}
              {blocking ? <span className="fa-pcr-badge is-error" aria-label={`${blocking} to fix`}>{blocking}</span>
                : p?.total ? <span className="fa-pcr-badge">{p.filled}/{p.total}</span> : null}
            </button>
          );
        })}
      </nav>

      {sectionId === "response" && !readOnly ? (
        <Section>
          <UnitField
            label="Unit"
            value={data.unit}
            onChange={(unit) => update((current) => ({
              unit,
              nemsis: setLeaf(schema, setLeaf(schema, current.nemsis || {}, "eResponse.14", unit), "eResponse.13", unit),
            }))}
          />
        </Section>
      ) : null}

      <Section title={sections[sectionIndex]?.label || PCR_SECTIONS.find((s) => s.id === sectionId)?.label}>
        <LayoutItems items={layout} ctx={ctx} at={{}} showAll={showAll || !hasEssential} />
        {hasEssential ? (
          <button type="button" className="fa-btn fa-btn-ghost fa-btn-block" onClick={() => setShowAll((v) => !v)}>
            {showAll ? "Fewer fields" : "More fields"}
          </button>
        ) : null}
      </Section>

      {sectionId === "payment" ? (
        <PcrBillingPhotos localId={form.localId} attachments={form.attachments} addPhoto={form.addPhoto} removePhoto={form.removePhoto} readOnly={readOnly} />
      ) : null}

      {nextSection ? (
        <button type="button" className="fa-btn fa-btn-secondary fa-btn-block" onClick={() => goTo(nextSection.id)}>
          Next: {nextSection.label} <ChevronRight size={20} />
        </button>
      ) : null}

      <IssuesPanel check={check} open={showIssues} onToggle={() => setShowIssues((v) => !v)} onGo={goTo} />
    </Screen>
  );
}

function IssuesPanel({ check, open, onToggle, onGo }) {
  const { blocking, warnings } = check;
  return (
    <Section
      title={check.ok ? "Ready to post" : `${blocking.length} to fix before posting`}
      aside={<button type="button" className="fa-btn fa-btn-sm" onClick={onToggle}>{open ? "Hide" : "Show"}</button>}
    >
      <p className="fa-hint">
        {check.ok
          ? `NEMSIS checks pass.${warnings.length ? ` ${warnings.length} recommended field${warnings.length === 1 ? " is" : "s are"} empty and will be reported as Not Recorded.` : ""}`
          : "Required by NEMSIS. Tap one to go to it."}
      </p>
      {open ? (
        <ul className="fa-pcr-issues">
          {[...blocking, ...warnings.slice(0, 50)].map((issue, index) => (
            <li key={`${issue.path}-${issue.code}-${index}`}>
              <button type="button" className={cx("fa-pcr-issue", issue.blocking && "is-error")} onClick={() => onGo(sectionForPath(issue.path))}>
                {issue.blocking ? <AlertTriangle size={16} /> : <Clock size={16} />} {issue.message}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </Section>
  );
}

function LayoutItems({ items, ctx, at, showAll }) {
  return items
    .filter((item) => showAll || item.essential)
    // A signature row's file fields are drawn as one signature pad (RepeatGroup).
    .filter((item) => !(item.type === "field" && SIGNATURE_FILE_FIELDS.includes(item.field.el)))
    .map((item) => {
      if (item.type === "field") return <LeafEditor key={item.field.el} field={item.field} ctx={ctx} at={at} />;
      if (item.repeating) return <RepeatGroup key={item.name} item={item} ctx={ctx} at={at} showAll={showAll} />;
      return (
        <fieldset key={item.name} className="fa-pcr-group">
          <legend>{item.label}</legend>
          <LayoutItems items={item.children} ctx={ctx} at={at} showAll={showAll} />
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
    const target = rows.length || !item.required ? addGroupRow(schema, current, item.name, row, at).pcr
      // The required first row is shown but not stored yet: store it, then add the next.
      : addGroupRow(schema, addGroupRow(schema, current, item.name, {}, at).pcr, item.name, row, at).pcr;
    return target;
  });
  return (
    <div className="fa-pcr-repeat">
      {shown.map((_, index) => {
        const here = { ...at, [item.name]: index };
        return (
          <fieldset key={index} className="fa-pcr-group">
            <legend>
              {item.label} {shown.length > 1 ? index + 1 : ""}
              {!readOnly && rows.length ? (
                <button type="button" className="fa-icon-btn" aria-label={`Remove ${item.label} ${index + 1}`} onClick={() => setPcr((current) => removeGroupRow(schema, current, item.name, index, at))}>
                  <Trash2 size={18} />
                </button>
              ) : null}
            </legend>
            <LayoutItems items={item.children} ctx={ctx} at={here} showAll={showAll} />
            {item.name === SIGNATURE_GROUP ? <SignaturePad ctx={ctx} at={here} /> : null}
          </fieldset>
        );
      })}
      {!readOnly ? (
        <button type="button" className="fa-btn fa-btn-secondary" onClick={add}><Plus size={20} /> Add {item.label.toLowerCase()}</button>
      ) : null}
    </div>
  );
}

function LeafEditor({ field, ctx, at }) {
  const { schema, pcr, setPcr, issues, readOnly } = ctx;
  const [sheet, setSheet] = useState(false);
  const raw = getLeaf(schema, pcr, field.el, at);
  const path = fieldPath(schema, field.el, at);
  const fieldIssues = issues.filter((i) => i.path === path || i.path.startsWith(`${path}[`));
  const error = fieldIssues.find((i) => i.severity === "error")?.message;
  const write = (value) => setPcr((current) => setLeaf(schema, current, field.el, value, at));

  // Repeating fields hold a list of codes/values; NV/PN apply to the field as a whole.
  const values = field.repeating ? (Array.isArray(raw) ? raw : raw === undefined ? [] : [raw]) : null;
  const single = field.repeating ? readLeaf(values.find((v) => readLeaf(v).NV || readLeaf(v).PN)) : readLeaf(raw);
  const plainValues = field.repeating ? values.map((v) => readLeaf(v).value).filter((v) => v !== undefined) : [];
  const notValue = single.NV || "";
  const pertinentNegative = single.PN || "";
  const label = (code) => field.options?.find((o) => o.code === String(code))?.label ?? String(code);

  const setValue = (value) => {
    if (field.repeating) write(value.map((v) => v));
    else write(composeLeaf(raw, { value, NV: undefined }));
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
  const hint = field.help || (field.definition && field.definition.length < 160 ? field.definition : "");
  const disabled = readOnly || Boolean(notValue);

  let input;
  switch (field.kind) {
    case "select":
      input = (
        <>
          <PickerButton value={single.value !== undefined ? label(single.value) : ""} onClick={() => !disabled && setSheet(true)} error={error} />
          <PickerSheet
            open={sheet}
            title={field.label}
            options={field.options.map((o) => ({ value: o.code, label: o.label, keywords: o.code }))}
            onPick={(value) => { setValue(value); setSheet(false); }}
            onClose={() => setSheet(false)}
            selected={single.value !== undefined ? [String(single.value)] : []}
          />
        </>
      );
      break;
    case "multiselect":
      input = (
        <>
          <PickerButton value={plainValues.map(label).join(", ")} onClick={() => !disabled && setSheet(true)} error={error} />
          <PickerSheet
            open={sheet}
            title={field.label}
            multiple
            options={field.options.map((o) => ({ value: o.code, label: o.label, keywords: o.code }))}
            onPick={(picked) => { setValue(picked); setSheet(false); }}
            onClose={() => setSheet(false)}
            selected={plainValues.map(String)}
          />
        </>
      );
      break;
    case "datetime":
      input = (
        <div className="fa-inline-actions">
          <input className="fa-input" type="datetime-local" step="1" disabled={disabled} value={toLocalInput(single.value)} onChange={(event) => setValue(fromLocalInput(event.target.value))} />
          {!disabled ? <button type="button" className="fa-btn fa-btn-secondary" onClick={() => setValue(nemsisDateTime())}><Clock size={18} /> Now</button> : null}
        </div>
      );
      break;
    case "date":
      input = <input className="fa-input" type="date" disabled={disabled} value={single.value ?? ""} onChange={(event) => setValue(event.target.value)} />;
      break;
    case "number":
      input = <TextInput inputMode="decimal" disabled={disabled} value={single.value ?? ""} min={field.min} max={field.max} onChange={(value) => setValue(value.trim())} />;
      break;
    case "textarea":
      input = <TextArea disabled={disabled} value={single.value ?? ""} onChange={setValue} rows={field.el === "eNarrative.01" ? 10 : 3} />;
      break;
    case "file":
      input = <p className="fa-hint">File attachments aren't supported on the phone yet.</p>;
      break;
    default:
      input = field.repeating
        ? <TextInput disabled={disabled} value={plainValues.join(", ")} onChange={(value) => setValue(value.split(",").map((v) => v.trim()).filter(Boolean))} />
        : (
          <>
            <TextInput disabled={disabled} value={single.value ?? ""} maxLength={field.maxLength} onChange={setValue} list={field.choices?.length ? `pcr-choices-${field.el}` : undefined} />
            {field.choices?.length ? <datalist id={`pcr-choices-${field.el}`}>{field.choices.map((c) => <option key={c} value={c} />)}</datalist> : null}
          </>
        );
  }

  // The "Not documented…" picker only in History and Assessment (pcrModel notValueChoices / pertinentNegativeChoices).
  const nvChoices = notValueChoices(field, notValue);
  const pnChoices = pertinentNegativeChoices(field, pertinentNegative);
  const notOptions = [...nvChoices.map((o) => ({ ...o, kind: "NV" })), ...pnChoices.map((o) => ({ ...o, kind: "PN" }))];
  const attrDefs = (field.attrs || []).filter((a) => a.codes?.length && !field.repeating);
  return (
    <Field label={`${field.label} (${field.el})`} required={field.usage === "Mandatory" || field.departmentRequired} error={error} hint={hint}>
      {input}
      {attrDefs.map((def) => (
        <label key={def.n} className="fa-pcr-attr">
          <span>{def.n}</span>
          <select className="fa-input" disabled={readOnly} value={single.attrs?.[def.n] ?? ""} onChange={(event) => write(composeLeaf(raw, { attrs: { ...(single.attrs || {}), [def.n]: event.target.value } }))}>
            <option value="">—</option>
            {def.codes.map((code) => <option key={code} value={code}>{schema.codeLabel(field.el, code) ?? code}</option>)}
          </select>
        </label>
      ))}
      {notOptions.length && !readOnly ? (
        <select
          className="fa-input fa-pcr-not"
          aria-label={pnChoices.length ? `${field.label}: not recorded or pertinent negative` : `${field.label}: not recorded`}
          value={notValue ? `NV:${notValue}` : pertinentNegative ? `PN:${pertinentNegative}` : ""}
          onChange={(event) => setNot(event.target.value)}
        >
          <option value="">{notValue || pertinentNegative ? "Clear" : pnChoices.length ? "Not documented / pertinent negative…" : "Not documented…"}</option>
          {notOptions.map((o) => <option key={`${o.kind}:${o.code}`} value={`${o.kind}:${o.code}`}>{o.label}</option>)}
        </select>
      ) : null}
    </Field>
  );
}
