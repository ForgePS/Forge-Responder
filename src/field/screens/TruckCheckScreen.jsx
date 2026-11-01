import { useMemo, useState } from "react";
import { CheckCheck, CheckCircle2, ChevronRight, ClipboardCheck, OctagonAlert, TriangleAlert } from "lucide-react";
import { useField, useRecordForm } from "../fieldContext.jsx";
import { refItems } from "../fieldRefData.js";
import { checklistFields, isFailAnswer, localDate, validateTruckCheck } from "../fieldValidation.js";
import { Banner, ErrorSummary, Field, Screen, Section, Segmented, TextArea, TextInput, cx, formatWhen } from "../ui.jsx";

const EMPTY = {
  checkId: "",
  assetId: "",
  assetLabel: "",
  fleetNumber: "",
  unitDesignation: "",
  station: "",
  template: null,
  answers: {},
  failNotes: {},
  startedAt: "",
  completedAt: "",
  operatorName: "",
};

function describe(data) {
  const failed = checklistFields(data.template).filter((field) => isFailAnswer(data.answers?.[field.key])).length;
  return {
    title: `${data.assetLabel || "Unit"} — ${data.template?.name || "Truck check"}`,
    subtitle: data.completedAt ? (failed ? `${failed} item${failed === 1 ? "" : "s"} failed` : "All passed") : "In progress",
  };
}

function newCheckId() {
  return `CHK-F${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
}

function optionsFor(field) {
  if (field.type === "yes_no") return [{ value: "Yes", label: "Yes", tone: "ok" }, { value: "No", label: "No", tone: "bad" }];
  if (field.type === "pass_fail_na") return [{ value: "Pass", label: "Pass", tone: "ok" }, { value: "Fail", label: "Fail", tone: "bad" }, { value: "N/A", label: "N/A", tone: "muted" }];
  return [{ value: "Pass", label: "Pass", tone: "ok" }, { value: "Fail", label: "Fail", tone: "bad" }];
}

const FUEL_QUICK = [
  { value: "25", label: "¼" },
  { value: "50", label: "½" },
  { value: "75", label: "¾" },
  { value: "100", label: "Full" },
];

function failActionLabel(action) {
  if (action === "oos") return "Fails put the unit out of service";
  if (action === "restrict") return "Fails restrict the unit";
  return "";
}

function UnitPicker({ assets, records, onPick }) {
  const today = localDate();
  const lastLocal = useMemo(() => {
    const map = new Map();
    records.filter((record) => record.kind === "truckCheck" && record.data?.completedAt).forEach((record) => {
      const prev = map.get(record.data.assetId);
      if (!prev || prev < record.data.completedAt) map.set(record.data.assetId, record.data.completedAt);
    });
    return map;
  }, [records]);
  return (
    <div className="fa-unit-grid">
      {assets.map((asset) => {
        const last = [asset.lastCheckAt, lastLocal.get(asset.id)].filter(Boolean).sort().pop();
        const doneToday = last && localDate(new Date(last)) === today;
        return (
          <button key={asset.id} type="button" className={cx("fa-unit", doneToday && "is-done")} onClick={() => onPick(asset)}>
            <strong>{asset.label}</strong>
            <small>{[asset.type, asset.station].filter(Boolean).join(" · ") || "Apparatus"}</small>
            <span className="fa-unit-status">
              {doneToday ? <><CheckCircle2 size={16} /> Checked {formatWhen(last)}</> : last ? `Last: ${formatWhen(last)}` : "Not checked yet"}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export default function TruckCheckScreen({ params = {} }) {
  const { refData, records, snapshot, back } = useField();
  const assets = refItems(refData, "assets");
  const templates = refItems(refData, "templates");
  const form = useRecordForm({
    kind: "truckCheck",
    localId: params.localId,
    initialData: { ...EMPTY },
    describe,
    validate: (data) => validateTruckCheck({ template: data.template, answers: data.answers, failNotes: data.failNotes }),
  });
  const { data, update, errors, clearError, submit, saving, loaded, existingStatus } = form;
  const [templatePick, setTemplatePick] = useState("");
  const readOnly = existingStatus === "synced" || existingStatus === "syncing";

  const fields = useMemo(() => checklistFields(data.template), [data.template]);
  const answered = fields.filter((field) => String(data.answers?.[field.key] ?? "").trim() !== "").length;
  const passable = fields.filter((field) => ["pass_fail", "pass_fail_na", "yes_no"].includes(field.type) && String(data.answers?.[field.key] ?? "") === "").length;
  const failed = fields.filter((field) => isFailAnswer(data.answers?.[field.key]));
  const worst = failed.some((field) => field.failAction === "oos") ? "oos" : failed.some((field) => field.failAction === "restrict") ? "restrict" : failed.length ? "continue" : "";

  function startOn(asset, template) {
    update({
      checkId: data.checkId || newCheckId(),
      assetId: asset.id,
      assetLabel: asset.label,
      fleetNumber: asset.fleetNumber,
      unitDesignation: asset.unitDesignation,
      station: asset.station,
      template,
      answers: {},
      failNotes: {},
      startedAt: new Date().toISOString(),
      operatorName: snapshot.displayName,
    });
  }

  function pickAsset(asset) {
    if (templates.length === 1) startOn(asset, templates[0]);
    else update({ assetId: asset.id, assetLabel: asset.label, fleetNumber: asset.fleetNumber, unitDesignation: asset.unitDesignation, station: asset.station });
  }

  function setAnswer(key, value) {
    update((current) => ({ answers: { ...current.answers, [key]: value } }));
    if (!isFailAnswer(value)) clearError(key);
    else if (errors[key]) form.setErrors((current) => { const next = { ...current }; delete next[key]; return next; });
  }

  function setNote(key, value) {
    update((current) => ({ failNotes: { ...current.failNotes, [key]: value } }));
    if (String(value).trim()) form.setErrors((current) => { const next = { ...current }; delete next[`${key}:note`]; return next; });
  }

  function passRemaining() {
    update((current) => {
      const answers = { ...current.answers };
      fields.forEach((field) => {
        if (String(answers[field.key] ?? "") !== "") return;
        if (field.type === "pass_fail" || field.type === "pass_fail_na") answers[field.key] = "Pass";
        if (field.type === "yes_no") answers[field.key] = "Yes";
      });
      return { answers };
    });
    form.setErrors((current) => Object.fromEntries(Object.entries(current).filter(([key]) => {
      const field = fields.find((row) => row.key === key);
      return !field || !["pass_fail", "pass_fail_na", "yes_no"].includes(field.type);
    })));
  }

  if (!loaded) return <Screen title="Truck check" onBack={back} />;

  if (!assets.length) {
    return (
      <Screen title="Truck check" onBack={back}>
        <Banner tone="info" icon={<ClipboardCheck size={22} />} title="No apparatus on this device">
          Connect once and tap Update on the home screen to download your apparatus and checklists.
        </Banner>
      </Screen>
    );
  }

  if (!data.assetId) {
    return (
      <Screen title="Truck check" subtitle="Pick the unit you're checking" onBack={back}>
        <UnitPicker assets={assets} records={records} onPick={pickAsset} />
      </Screen>
    );
  }

  if (!data.template) {
    if (!templates.length) {
      return (
        <Screen title={data.assetLabel} onBack={() => update({ assetId: "" })}>
          <Banner tone="warn" icon={<TriangleAlert size={22} />} title="No checklist on this device">
            Your department hasn't published a checklist yet, or it hasn't downloaded. Connect and tap Update.
          </Banner>
        </Screen>
      );
    }
    return (
      <Screen title={data.assetLabel} subtitle="Which checklist?" onBack={() => update({ assetId: "" })}>
        <div className="fa-list">
          {templates.map((template) => (
            <button
              key={template.templateId}
              type="button"
              className={cx("fa-row", templatePick === template.templateId && "is-active")}
              onClick={() => {
                setTemplatePick(template.templateId);
                startOn(assets.find((asset) => asset.id === data.assetId) || { id: data.assetId, label: data.assetLabel }, template);
              }}
            >
              <span className="fa-row-text">
                <strong>{template.name}</strong>
                <small>{checklistFields(template).length} items · v{template.version || 1}</small>
              </span>
              <ChevronRight size={22} />
            </button>
          ))}
        </div>
      </Screen>
    );
  }

  const progress = fields.length ? Math.round((answered / fields.length) * 100) : 0;

  return (
    <Screen
      title={data.assetLabel}
      subtitle={data.template.name}
      onBack={back}
      footer={readOnly ? null : (
        <>
          <ErrorSummary errors={errors} />
          <div className="fa-footer-row">
            <div className={cx("fa-result", worst === "oos" && "tone-bad", worst === "restrict" && "tone-warn", !worst && answered === fields.length && "tone-ok")}>
              {worst === "oos" ? <><OctagonAlert size={18} /> Out of service</> : worst === "restrict" ? <><TriangleAlert size={18} /> Restricted</> : failed.length ? `${failed.length} failed` : `${answered}/${fields.length} done`}
            </div>
            <button
              type="button"
              className="fa-btn fa-btn-primary fa-btn-grow"
              disabled={saving}
              onClick={() => submit({
                finalize: (current) => ({ ...current, completedAt: current.completedAt || new Date().toISOString() }),
                message: navigator.onLine ? "Check saved — sending now" : "Check saved on this device — it will send when you're back online",
              })}
            >
              Finish check
            </button>
          </div>
        </>
      )}
    >
      <div className="fa-progress" aria-label={`${answered} of ${fields.length} answered`}>
        <div className="fa-progress-bar" style={{ width: `${progress}%` }} />
      </div>
      {readOnly ? <Banner tone="ok" icon={<CheckCircle2 size={22} />} title="This check was sent">Completed {formatWhen(data.completedAt)}.</Banner> : null}
      {!readOnly && passable ? (
        <button type="button" className="fa-btn fa-btn-ghost fa-btn-block" onClick={passRemaining}>
          <CheckCheck size={20} /> Mark the {passable} unanswered item{passable === 1 ? "" : "s"} as Pass
        </button>
      ) : null}
      {(data.template.sections || []).map((section) => (
        <Section key={section.id} title={section.title || section.name}>
          <div className="fa-check-list">
            {(section.fields || []).map((field) => {
              if (field.type === "heading") return <h3 key={field.key || field.id} className="fa-check-heading">{field.label}</h3>;
              if (field.type === "instruction") return <p key={field.key || field.id} className="fa-hint">{field.helpText || field.label}</p>;
              const value = data.answers?.[field.key] ?? "";
              const isFail = isFailAnswer(value);
              const noteError = errors[`${field.key}:note`];
              return (
                <div key={field.key} className={cx("fa-check-item", isFail && "is-fail", errors[field.key] && "is-error")} data-error={errors[field.key] || noteError ? "1" : undefined}>
                  <div className="fa-check-label">
                    <strong>{field.label}{field.required ? <span className="fa-req-dot" aria-label="required">*</span> : null}</strong>
                    {field.helpText ? <small>{field.helpText}</small> : null}
                    {failActionLabel(field.failAction) ? <small className="fa-fail-rule">{failActionLabel(field.failAction)}</small> : null}
                  </div>
                  {["pass_fail", "pass_fail_na", "yes_no"].includes(field.type) ? (
                    <Segmented value={value} options={optionsFor(field)} onChange={(next) => !readOnly && setAnswer(field.key, next)} ariaLabel={field.label} />
                  ) : field.type === "fuel_level" ? (
                    <div className="fa-inline">
                      <Segmented value={value} options={FUEL_QUICK} onChange={(next) => !readOnly && setAnswer(field.key, next)} ariaLabel={field.label} columns={4} />
                      <TextInput value={value} onChange={(next) => setAnswer(field.key, next.replace(/[^\d.]/g, ""))} inputMode="decimal" placeholder="%" aria-label={`${field.label} percent`} disabled={readOnly} className="fa-input fa-input-num" />
                    </div>
                  ) : field.type === "meter_reading" || field.type === "number" ? (
                    <TextInput value={value} onChange={(next) => setAnswer(field.key, next.replace(/[^\d.]/g, ""))} inputMode="decimal" placeholder={field.unit || field.meterType || "Reading"} disabled={readOnly} />
                  ) : field.type === "long_text" ? (
                    <TextArea value={value} onChange={(next) => setAnswer(field.key, next)} disabled={readOnly} />
                  ) : (
                    <TextInput value={value} onChange={(next) => setAnswer(field.key, next)} disabled={readOnly} />
                  )}
                  {errors[field.key] ? <div className="fa-error-text">{errors[field.key]}</div> : null}
                  {isFail ? (
                    <Field label="What's wrong?" required={field.noteRequiredOnFail || field.failAction === "oos"} error={noteError}>
                      <TextArea value={data.failNotes?.[field.key] || ""} onChange={(next) => setNote(field.key, next)} placeholder="Describe the problem" rows={2} disabled={readOnly} />
                    </Field>
                  ) : null}
                </div>
              );
            })}
          </div>
        </Section>
      ))}
    </Screen>
  );
}
