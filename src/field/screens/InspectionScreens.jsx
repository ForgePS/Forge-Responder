/** Assigned fire/prevention inspections: conduct offline, record violations, complete. */
import { useMemo, useState } from "react";
import { Building2, CalendarClock, ClipboardCheck, Plus, Trash2 } from "lucide-react";
import { useField, useRecordForm } from "../fieldContext.jsx";
import { refItems } from "../fieldRefData.js";
import { localDate } from "../fieldValidation.js";
import {
  Banner, Chips, ErrorSummary, Field, PhotoStrip, PickerButton, PickerSheet, Screen, Section, Segmented, StatusChip, TextArea, TextInput, cx, formatDay,
} from "../ui.jsx";

export const INSPECTION_RESULTS = [
  "Passed",
  "Passed with conditions",
  "Failed",
  "Reinspection required",
  "Immediate action required",
  "Incomplete",
  "Unable to inspect",
  "No access",
  "Business closed",
];

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

export function inspectionFields(template) {
  return (template?.sections || []).flatMap((section) => (section.fields || []).map((field) => ({ ...field, sectionId: section.id })));
}

export function validateInspectionForm(data, rules) {
  const errors = {};
  if (data.finish) {
    for (const field of inspectionFields(data.inspection?.templateSnapshot)) {
      if (["heading", "instruction", "photo", "signature"].includes(field.type)) continue;
      const value = data.answers?.[field.key];
      if (field.required && (value === undefined || value === null || value === "" || (Array.isArray(value) && !value.length))) {
        errors[`a:${field.key}`] = "Answer this item.";
      }
    }
    if (!data.result) errors.result = "Pick the result.";
    if (/reinspection/i.test(data.result || "") && !data.nextReinspectionAt) errors.nextReinspectionAt = "Pick the reinspection date.";
    if (rules?.required("summary") && !String(data.summary || "").trim()) errors.summary = "Add a summary.";
  }
  (data.violations || []).forEach((violation, index) => {
    if (!String(violation.name || "").trim()) errors[`v:${index}`] = "Name the violation.";
  });
  return errors;
}

export function InspectionsScreen() {
  const { refData, records, navigate, back } = useField();
  const assigned = refItems(refData, "inspections");
  const localById = useMemo(() => {
    const map = new Map();
    records.filter((row) => row.kind === "inspection" && row.status !== "synced").forEach((row) => map.set(row.data?.inspectionId, row));
    return map;
  }, [records]);
  const today = localDate();
  return (
    <Screen title="Inspections" subtitle="Assigned to you" onBack={back}>
      {!assigned.length ? (
        <Banner tone="info" icon={<ClipboardCheck size={22} />} title="No open inspections assigned to you">
          Inspections assigned to you in the RMS show here and can be done offline.
        </Banner>
      ) : null}
      <div className="fa-list">
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
                  {[item.inspectionNumber, item.inspectionTypeSnapshot?.name || "Inspection", item.address || "No address"].filter(Boolean).join(" · ")}
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

function describe(data) {
  const inspection = data.inspection || {};
  return {
    title: `${inspection.occupancyName || inspection.address || "Inspection"} — ${inspection.inspectionNumber || ""}`.trim(),
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

export function InspectionFormScreen({ params = {} }) {
  const { refData, back, rulesFor } = useField();
  const rules = rulesFor("inspection");
  const fromRef = params.inspectionId ? refItems(refData, "inspections").find((item) => item.id === params.inspectionId) : null;
  const catalog = refItems(refData, "violationCatalog");
  const [sheet, setSheet] = useState(false);
  const form = useRecordForm({
    kind: "inspection",
    localId: params.localId,
    initialData: {
      inspectionId: fromRef?.id || "",
      inspection: fromRef ? {
        id: fromRef.id,
        inspectionNumber: fromRef.inspectionNumber,
        occupancyName: fromRef.occupancyName,
        address: fromRef.address,
        typeName: fromRef.inspectionTypeSnapshot?.name || "",
        templateSnapshot: fromRef.templateSnapshot,
        recordVersion: fromRef.recordVersion,
        updatedAt: fromRef.updatedAt,
      } : null,
      answers: { ...(fromRef?.answers || {}) },
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
          <Segmented value={data.result} options={INSPECTION_RESULTS.slice(0, 5).map((value) => ({ value, label: value, tone: /^Passed$/.test(value) ? "ok" : /Failed|Immediate/.test(value) ? "bad" : "warn" }))} onChange={(value) => update({ result: value, reinspectionRequired: /reinspection|failed/i.test(value) })} columns={1} />
          <Chips values={INSPECTION_RESULTS.slice(5).includes(data.result) ? [data.result] : []} options={INSPECTION_RESULTS.slice(5)} onChange={(values) => update({ result: values[values.length - 1] || "" })} />
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
