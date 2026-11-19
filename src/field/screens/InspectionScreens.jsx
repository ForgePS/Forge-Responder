/**
 * Fire/prevention inspections: the ones assigned to you, plus ones you start
 * yourself (New inspection). Conduct offline, record violations, complete.
 */
import { useMemo, useState } from "react";
import { Building2, CalendarClock, ClipboardCheck, Plus, Trash2 } from "lucide-react";
import { useField, useRecordForm } from "../fieldContext.jsx";
import { refItems } from "../fieldRefData.js";
import { newLocalId } from "../fieldRecords.js";
import { buildNewInspectionDraft, localOnlyInspections, newFieldInspectionId } from "../inspectionStart.js";
import { localDate } from "../fieldValidation.js";
import { failDetailFields, isFailAnswer } from "../../lib/inspections/inspectionFailDetails.js";
import { inspectionFields, validateInspectionForm } from "../inspectionValidation.js";
import { answersWithOccupancy } from "../../lib/inspections/occupancyPrefill.js";
import { MAX_REPORT_RECIPIENTS, occupancyEmails } from "../../lib/inspections/inspectionEmailRecipients.js";
import { DEFAULT_INSPECTION_RESULTS, inspectionResultTone, resultNeedsReinspection } from "../../lib/inspections/inspectionResults.js";

export { inspectionFields, validateInspectionForm };
import {
  Banner, Chips, ErrorSummary, Field, PhotoStrip, PickerButton, PickerSheet, Screen, Section, Segmented, StatusChip, TextArea, TextInput, cx, formatDay,
} from "../ui.jsx";

/** The defaults; the department's own list comes down with the inspection data. */
export const INSPECTION_RESULTS = DEFAULT_INSPECTION_RESULTS;

const SEVERITIES = [
  { value: "minor", label: "Minor" },
  { value: "moderate", label: "Moderate", tone: "warn" },
  { value: "major", label: "Major", tone: "bad" },
  { value: "critical", label: "Critical", tone: "bad" },
];

const CHOICE_TYPES = {
  yes_no: [{ value: "Yes", label: "Yes", tone: "ok" }, { value: "No", label: "No", tone: "bad" }],
  pass_fail: [{ value: "Pass", label: "Pass", tone: "ok" }, { value: "Fail", label: "Fail", tone: "bad" }],
  pass_fail_na: [{ value: "Pass", label: "Pass", tone: "ok" }, { value: "Fail", label: "Fail", tone: "bad" }, { value: "N/A", label: "N/A", tone: "muted" }],
  compliant: [{ value: "Compliant", label: "Compliant", tone: "ok" }, { value: "Noncompliant", label: "Noncompliant", tone: "bad" }, { value: "Not observed", label: "Not observed", tone: "muted" }],
};

const FAIL_VALUES = new Set(["fail", "failed", "noncompliant", "no"]);

export function InspectionsScreen() {
  const { refData, records, navigate, back, caps } = useField();
  const assigned = refItems(refData, "inspections");
  const localById = useMemo(() => {
    const map = new Map();
    records.filter((row) => row.kind === "inspection" && row.status !== "synced").forEach((row) => map.set(row.data?.inspectionId, row));
    return map;
  }, [records]);
  const started = useMemo(() => localOnlyInspections(records, assigned), [records, assigned]);
  const today = localDate();
  const canStart = Boolean(caps?.inspectionStart);
  return (
    <Screen title="Inspections" subtitle="Assigned to you" onBack={back}>
      {canStart ? (
        <div className="fa-inline-actions">
          <button type="button" className="fa-btn fa-btn-primary fa-btn-grow" onClick={() => navigate("inspectionNew")}>
            <Plus size={20} /> New inspection
          </button>
        </div>
      ) : null}
      {!assigned.length && !started.length ? (
        <Banner tone="info" icon={<ClipboardCheck size={22} />} title="No open inspections assigned to you">
          {canStart
            ? "Inspections assigned to you in the RMS show here, or start one with New inspection. Both work offline."
            : "Inspections assigned to you in the RMS show here and can be done offline."}
        </Banner>
      ) : null}
      <div className="fa-list">
        {started.map((row) => (
          <button key={row.localId} type="button" className="fa-row" onClick={() => navigate("inspectionForm", { localId: row.localId })}>
            <span className="fa-row-icon"><Building2 size={22} /></span>
            <span className="fa-row-text">
              <strong>{row.data?.inspection?.occupancyName || row.data?.inspection?.address || "New inspection"}</strong>
              <small>{["Started by you", row.data?.inspection?.typeName, row.data?.inspection?.address].filter(Boolean).join(" · ")}</small>
            </span>
            <StatusChip status={row.status} />
          </button>
        ))}
        {assigned.map((item) => {
          const local = localById.get(item.id);
          const when = item.scheduledStart || item.dueAt;
          const overdue = item.dueAt && String(item.dueAt).slice(0, 10) < today;
          return (
            <button key={item.id} type="button" className="fa-row" onClick={() => navigate("inspectionForm", local ? { localId: local.localId } : { inspectionId: item.id })}>
              <span className="fa-row-icon"><Building2 size={22} /></span>
              <span className="fa-row-text">
                <strong>{item.occupancyName || item.address || item.inspectionNumber}</strong>
                <small>
                  {[item.inspectionNumber, item.inspectionTypeSnapshot?.label || item.inspectionTypeSnapshot?.name || "Inspection", item.address || "No address"].filter(Boolean).join(" · ")}
                  {when ? <> · <CalendarClock size={13} /> {formatDay(String(when).slice(0, 10))}</> : null}
                </small>
              </span>
              {local ? <StatusChip status={local.status} /> : <span className={cx("fa-status", overdue ? "tone-warn" : "tone-muted")}>{overdue ? "Overdue" : item.status.replace(/_/g, " ")}</span>}
            </button>
          );
        })}
      </div>
    </Screen>
  );
}

/** Start an inspection that wasn't assigned: pick the occupancy and type (works offline). */
export function InspectionNewScreen() {
  const { refData, navigate, back, caps } = useField();
  const occupancies = refItems(refData, "inspectionOccupancies");
  const types = refItems(refData, "inspectionTypes");
  const [occupancyId, setOccupancyId] = useState("");
  const [typeId, setTypeId] = useState("");
  const [picking, setPicking] = useState(false);
  const occupancy = occupancies.find((row) => row.id === occupancyId);
  const type = types.find((row) => row.id === typeId) || (types.length === 1 ? types[0] : null);

  if (!caps?.inspectionStart) {
    return (
      <Screen title="New inspection" onBack={back}>
        <Banner tone="warn" title="You can't start inspections">Ask an admin for the Conduct inspections permission.</Banner>
      </Screen>
    );
  }
  if (!occupancies.length || !types.length) {
    return (
      <Screen title="New inspection" onBack={back}>
        <Banner tone="warn" title={!occupancies.length ? "No occupancies on this device" : "No inspection types on this device"}>
          Connect and tap Update on the home screen. Occupancies and inspection types are set up in the RMS.
        </Banner>
      </Screen>
    );
  }

  const start = () => {
    if (!occupancy || !type) return;
    navigate("inspectionForm", {
      localId: newLocalId("in"),
      newInspection: { id: newFieldInspectionId(), occupancyId: occupancy.id, inspectionTypeId: type.id },
    }, { replace: true });
  };

  return (
    <Screen
      title="New inspection"
      subtitle="Assigned to you"
      onBack={back}
      footer={(
        <div className="fa-footer-row">
          <button type="button" className="fa-btn fa-btn-primary fa-btn-grow" disabled={!occupancy || !type} onClick={start}>
            Start inspection
          </button>
        </div>
      )}
    >
      <Section title="Occupancy">
        <Field label="Occupancy" required>
          <PickerButton
            value={occupancy ? [occupancy.name, occupancy.address].filter(Boolean).join(" · ") : ""}
            placeholder="Search occupancies"
            icon={<Building2 size={20} />}
            onClick={() => setPicking(true)}
          />
        </Field>
      </Section>
      <Section title="Inspection type">
        <Field label="Type" required>
          {types.length <= 4 ? (
            <Segmented value={type?.id || ""} options={types.map((row) => ({ value: row.id, label: row.name }))} onChange={setTypeId} columns={1} />
          ) : (
            <Chips values={type ? [type.id] : []} options={types.map((row) => ({ value: row.id, label: row.name }))} onChange={(values) => setTypeId(values[values.length - 1] || "")} />
          )}
        </Field>
        {type && !type.templateSnapshot?.sections?.length ? <p className="fa-hint">This type has no checklist yet. You can still record the result, violations and photos.</p> : null}
      </Section>
      <PickerSheet
        open={picking}
        title="Occupancy"
        searchPlaceholder="Name or address"
        options={occupancies.map((row) => ({ value: row.id, label: row.name || row.address, detail: [row.address, row.occupancyType].filter(Boolean).join(" · "), keywords: [row.address, row.occupancyNumber, row.city].filter(Boolean).join(" ") }))}
        onPick={(value) => { setOccupancyId(value); setPicking(false); }}
        onClose={() => setPicking(false)}
      />
    </Screen>
  );
}

function describe(data) {
  const inspection = data.inspection || {};
  return {
    title: [inspection.occupancyName || inspection.address || "Inspection", inspection.inspectionNumber || (inspection.isNew ? "New" : "")].filter(Boolean).join(" — "),
    subtitle: data.finish ? (data.result || "Completed") : "In progress",
  };
}

function AnswerInput({ field, value, onChange, disabled }) {
  const [open, setOpen] = useState(false);
  const type = field.type || "short_text";
  if (CHOICE_TYPES[type]) return <Segmented value={value || ""} options={CHOICE_TYPES[type]} onChange={(next) => !disabled && onChange(next)} ariaLabel={field.label} />;
  const options = (field.options || []).map((option) => (typeof option === "string" ? { value: option, label: option } : { value: option.value ?? option.label, label: option.label ?? option.value }));
  if (["single_select", "dropdown"].includes(type)) {
    if (options.length <= 4) return <Segmented value={value || ""} options={options} onChange={(next) => !disabled && onChange(next)} columns={Math.min(2, options.length) || 1} />;
    return (
      <>
        <PickerButton value={options.find((option) => option.value === value)?.label || value} onClick={() => setOpen(true)} />
        <PickerSheet open={open} title={field.label} options={options} selected={[value]} onPick={(next) => { onChange(next); setOpen(false); }} onClose={() => setOpen(false)} />
      </>
    );
  }
  if (["multi_select", "checkbox"].includes(type)) {
    const list = options.length ? options : [{ value: "Yes", label: "Yes" }];
    return <Chips values={Array.isArray(value) ? value : value ? [value] : []} options={list} onChange={(next) => !disabled && onChange(next)} />;
  }
  if (type === "number") return <TextInput value={value} onChange={(next) => onChange(next.replace(/[^\d.-]/g, ""))} inputMode="decimal" disabled={disabled} />;
  if (type === "date") return <input className="fa-input" type="date" value={value || ""} onChange={(event) => onChange(event.target.value)} disabled={disabled} />;
  if (type === "long_text") return <TextArea value={value} onChange={onChange} disabled={disabled} placeholder={field.placeholder || ""} />;
  if (type === "photo") return <p className="fa-hint">Add photos in the Photos section below.</p>;
  if (type === "signature") return <p className="fa-hint">Signatures are collected in the RMS.</p>;
  return <TextInput value={value} onChange={onChange} disabled={disabled} placeholder={field.placeholder || ""} />;
}

/** Starting data for an inspection the inspector began on this device (New inspection). */
function useNewInspectionDraft(params, refData, snapshot) {
  const [draft] = useState(() => {
    const pending = params.newInspection;
    if (!pending?.id) return null;
    const occupancy = refItems(refData, "inspectionOccupancies").find((row) => row.id === pending.occupancyId);
    const type = refItems(refData, "inspectionTypes").find((row) => row.id === pending.inspectionTypeId);
    if (!occupancy || !type) return null;
    return buildNewInspectionDraft({ occupancy, type, snapshot, id: pending.id });
  });
  return draft;
}

export function InspectionFormScreen({ params = {} }) {
  const { refData, back, rulesFor, snapshot } = useField();
  const rules = rulesFor("inspection");
  const fromRef = params.inspectionId ? refItems(refData, "inspections").find((item) => item.id === params.inspectionId) : null;
  const newDraft = useNewInspectionDraft(params, refData, snapshot);
  const catalog = refItems(refData, "violationCatalog");
  const departmentResults = refItems(refData, "inspectionResults");
  const results = departmentResults.length ? departmentResults : INSPECTION_RESULTS;
  const [sheet, setSheet] = useState(false);
  const form = useRecordForm({
    kind: "inspection",
    localId: params.localId,
    initialData: newDraft || {
      inspectionId: fromRef?.id || "",
      inspection: fromRef ? {
        id: fromRef.id,
        inspectionNumber: fromRef.inspectionNumber,
        occupancyName: fromRef.occupancyName,
        address: fromRef.address,
        typeName: fromRef.inspectionTypeSnapshot?.label || fromRef.inspectionTypeSnapshot?.name || "",
        templateSnapshot: fromRef.templateSnapshot,
        recordVersion: fromRef.recordVersion,
        updatedAt: fromRef.updatedAt,
      } : null,
      answers: fromRef ? answersWithOccupancy(fromRef) : {},
      // Emailed to the occupancy once the completed inspection syncs (fieldSyncHandlers.syncInspection).
      emailReport: { send: false, to: occupancyEmails(fromRef?.occupancySnapshot).join(", "), note: "" },
      violations: [],
      result: fromRef?.result || "",
      summary: fromRef?.summary || "",
      internalNotes: fromRef?.internalNotes || "",
      reinspectionRequired: Boolean(fromRef?.reinspectionRequired),
      nextReinspectionAt: fromRef?.nextReinspectionAt || "",
      finish: false,
    },
    base: fromRef ? {
      answers: { ...(fromRef.answers || {}) },
      summary: fromRef.summary || "",
      internalNotes: fromRef.internalNotes || "",
      result: fromRef.result || "",
      updatedAt: fromRef.updatedAt || "",
    } : null,
    describe,
    validate: (data) => validateInspectionForm(data, rules),
  });
  const { data, update, errors, setErrors, submit, saving, attachments, addPhoto, removePhoto, existingStatus } = form;
  const inspection = data.inspection;
  const readOnly = existingStatus === "syncing";

  if (!inspection) {
    return (
      <Screen title="Inspection" onBack={back}>
        <Banner tone="warn" title="This inspection isn't on this device">Connect and tap Update on the home screen.</Banner>
      </Screen>
    );
  }

  const fields = inspectionFields(inspection.templateSnapshot);
  const answerable = fields.filter((field) => !["heading", "instruction", "photo", "signature"].includes(field.type));
  const answered = answerable.filter((field) => {
    const value = data.answers[field.key];
    return value !== undefined && value !== "" && !(Array.isArray(value) && !value.length);
  }).length;
  const setAnswer = (key, value) => {
    update((current) => ({ answers: { ...current.answers, [key]: value } }));
    setErrors((current) => {
      if (!current[`a:${key}`]) return current;
      const next = { ...current };
      delete next[`a:${key}`];
      return next;
    });
  };
  const addViolation = (item) => {
    update((current) => ({
      violations: [...current.violations, {
        id: `VIO-F${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 5).toUpperCase()}`,
        catalogItemId: item?.id || "",
        name: item?.name || "",
        codeCitation: item?.codeCitation || "",
        severity: item?.severity || "moderate",
        correctiveAction: item?.correctiveAction || "",
        description: "",
        locationOnProperty: "",
      }],
    }));
  };
  const setViolation = (index, patch) => update((current) => ({ violations: current.violations.map((row, i) => (i === index ? { ...row, ...patch } : row)) }));
  const failedCount = fields.filter((field) => field.autoCreateViolation && FAIL_VALUES.has(String(data.answers[field.key] || "").toLowerCase())).length;

  return (
    <Screen
      title={inspection.occupancyName || inspection.address}
      subtitle={[inspection.typeName, inspection.inspectionNumber].filter(Boolean).join(" · ")}
      onBack={back}
      footer={readOnly ? null : (
        <>
          <ErrorSummary errors={errors} />
          <div className="fa-footer-row">
            <button type="button" className="fa-btn fa-btn-secondary" disabled={saving} onClick={() => submit({ finalize: (current) => ({ ...current, finish: false }), message: navigator.onLine ? "Progress saved — sending now" : "Progress saved on this device" })}>
              Save progress
            </button>
            <button type="button" className="fa-btn fa-btn-primary fa-btn-grow" disabled={saving} onClick={() => submit({ finalize: (current) => ({ ...current, finish: true, completedAt: new Date().toISOString() }) })}>
              Complete
            </button>
          </div>
        </>
      )}
    >
      <div className="fa-progress"><div className="fa-progress-bar" style={{ width: `${Math.round((answered / Math.max(1, answerable.length)) * 100)}%` }} /></div>
      {inspection.address ? <p className="fa-hint">{inspection.address}</p> : null}
      {(inspection.templateSnapshot?.sections || []).map((section) => (
        <Section key={section.id || section.title} title={section.title}>
          <div className="fa-check-list">
            {(section.fields || []).map((field) => {
              if (field.type === "heading") return <h3 key={field.key || field.id} className="fa-check-heading">{field.label}</h3>;
              if (field.type === "instruction") return <p key={field.key || field.id} className="fa-hint">{field.helpText || field.label}</p>;
              const value = data.answers[field.key];
              const isFail = FAIL_VALUES.has(String(value || "").toLowerCase());
              return (
                <div key={field.key} className={cx("fa-check-item", isFail && "is-fail")} data-error={errors[`a:${field.key}`] ? "1" : undefined}>
                  <div className="fa-check-label">
                    <strong>{field.label}{field.required ? <span className="fa-req-dot">*</span> : null}</strong>
                    {field.helpText ? <small>{field.helpText}</small> : null}
                    {field.autoCreateViolation ? <small className="fa-fail-rule">A fail counts as a violation</small> : null}
                  </div>
                  <AnswerInput field={field} value={value} onChange={(next) => setAnswer(field.key, next)} disabled={readOnly} />
                  {errors[`a:${field.key}`] ? <div className="fa-error-text">{errors[`a:${field.key}`]}</div> : null}
                  {isFailAnswer(field, value) ? (() => {
                    const remarks = failDetailFields(field, value).remarks;
                    return (
                      <div className="fa-fail-details" data-error={errors[`a:${remarks.key}`] ? "1" : undefined}>
                        <Field label={remarks.label} required error={errors[`a:${remarks.key}`]}>
                          <TextArea value={data.answers[remarks.key] || ""} onChange={(next) => setAnswer(remarks.key, next)} rows={2} placeholder={remarks.placeholder} disabled={readOnly} />
                        </Field>
                        {rules.show("photos") ? <small className="fa-hint">Add photos of this in the Photos section below.</small> : null}
                      </div>
                    );
                  })() : null}
                </div>
              );
            })}
          </div>
        </Section>
      ))}

      {rules.show("violations") ? (
        <Section title="Violations" hint={failedCount ? `${failedCount} failed item${failedCount === 1 ? "" : "s"} marked as violations. Add details below to create violation records.` : "Add violations found on site."}>
          {data.violations.map((violation, index) => (
            <div key={violation.id} className="fa-check-item is-fail" data-error={errors[`v:${index}`] ? "1" : undefined}>
              <div className="fa-check-label fa-check-label-row">
                <strong>{violation.name || "New violation"}</strong>
                <button type="button" className="fa-icon-btn sm" onClick={() => update((current) => ({ violations: current.violations.filter((_, i) => i !== index) }))} aria-label="Remove violation"><Trash2 size={18} /></button>
              </div>
              {violation.codeCitation ? <small className="fa-hint">{violation.codeCitation}</small> : null}
              {!violation.catalogItemId ? (
                <Field label="Violation" error={errors[`v:${index}`]}>
                  <TextInput value={violation.name} onChange={(value) => setViolation(index, { name: value })} placeholder="What's wrong" />
                </Field>
              ) : null}
              <Field label="Severity">
                <Segmented value={violation.severity} options={SEVERITIES} onChange={(value) => setViolation(index, { severity: value })} columns={2} />
              </Field>
              <Field label="Location on property">
                <TextInput value={violation.locationOnProperty} onChange={(value) => setViolation(index, { locationOnProperty: value })} placeholder="e.g. Rear exit, 2nd floor corridor" />
              </Field>
              <Field label="Details">
                <TextArea value={violation.description} onChange={(value) => setViolation(index, { description: value })} rows={2} />
              </Field>
            </div>
          ))}
          <div className="fa-inline-actions">
            <button type="button" className="fa-btn fa-btn-secondary" onClick={() => setSheet(true)} disabled={readOnly}><Plus size={20} /> From code list</button>
            <button type="button" className="fa-btn fa-btn-ghost" onClick={() => addViolation(null)} disabled={readOnly}><Plus size={20} /> Other</button>
          </div>
        </Section>
      ) : null}

      {rules.show("photos") ? (
        <Section title="Photos">
          <PhotoStrip attachments={attachments} onAdd={addPhoto} onRemove={removePhoto} max={12} />
        </Section>
      ) : null}

      <Section title="Result">
        <Field label="Result" required error={errors.result}>
          <Segmented value={data.result} options={results.slice(0, 5).map((value) => ({ value, label: value, tone: inspectionResultTone(value) }))} onChange={(value) => update({ result: value, reinspectionRequired: resultNeedsReinspection(value) })} columns={1} />
          {results.length > 5 ? (
            <Chips values={results.slice(5).includes(data.result) ? [data.result] : []} options={results.slice(5)} onChange={(values) => update({ result: values[values.length - 1] || "" })} />
          ) : null}
        </Field>
        {data.reinspectionRequired || /reinspection/i.test(data.result) ? (
          <Field label="Reinspection date" required={/reinspection/i.test(data.result)} error={errors.nextReinspectionAt}>
            <input className="fa-input" type="date" min={localDate()} value={String(data.nextReinspectionAt || "").slice(0, 10)} onChange={(event) => update({ nextReinspectionAt: event.target.value })} />
          </Field>
        ) : null}
        {rules.show("summary") ? (
          <Field label="Summary" required={rules.required("summary")} error={errors.summary}>
            <TextArea value={data.summary} onChange={(value) => update({ summary: value })} placeholder="Shared with the occupant on the report" />
          </Field>
        ) : null}
        {rules.show("internalNotes") ? (
          <Field label="Internal notes" required={rules.required("internalNotes")}>
            <TextArea value={data.internalNotes} onChange={(value) => update({ internalNotes: value })} placeholder="Only visible inside the department" rows={2} />
          </Field>
        ) : null}
      </Section>

      {data.inspectionId || data.newInspection ? (
        <Section title="Email report" hint="A PDF copy goes to the occupancy once this inspection is completed and synced.">
          <Field label="Email the report to the occupancy?">
            <Segmented
              value={data.emailReport?.send ? "yes" : "no"}
              options={[{ value: "no", label: "No" }, { value: "yes", label: "Yes", tone: "ok" }]}
              onChange={(value) => update({ emailReport: { ...(data.emailReport || {}), send: value === "yes" } })}
            />
          </Field>
          {data.emailReport?.send ? (
            <>
              <Field label="Send to" required error={errors.emailTo} hint={`Up to ${MAX_REPORT_RECIPIENTS}, separated by commas.`}>
                <TextInput
                  type="text"
                  inputMode="email"
                  autoCapitalize="none"
                  value={data.emailReport?.to || ""}
                  onChange={(value) => update({ emailReport: { ...(data.emailReport || {}), to: value } })}
                  placeholder="owner@business.com"
                  disabled={readOnly}
                />
              </Field>
              <Field label="Note (optional)">
                <TextArea
                  value={data.emailReport?.note || ""}
                  onChange={(value) => update({ emailReport: { ...(data.emailReport || {}), note: value } })}
                  rows={2}
                  disabled={readOnly}
                />
              </Field>
            </>
          ) : null}
        </Section>
      ) : null}

      <PickerSheet
        open={sheet}
        title="Violation from code list"
        options={catalog.map((item) => ({ value: item.id, label: item.name, detail: [item.codeCitation, item.severity].filter(Boolean).join(" · "), keywords: item.category }))}
        onPick={(value) => { addViolation(catalog.find((item) => item.id === value)); setSheet(false); }}
        onClose={() => setSheet(false)}
      />
    </Screen>
  );
}
