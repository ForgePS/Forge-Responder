import { useState } from "react";
import { Clock, LocateFixed, Loader2, Plus, Siren, Trash2, Users } from "lucide-react";
import { useField, useRecordForm } from "../fieldContext.jsx";
import { refItems, unitOptions } from "../fieldRefData.js";
import { latestSentCopy } from "../fieldRecords.js";
import { localDate, localDateTime, validateIncident } from "../fieldValidation.js";
import { requiredFieldErrors } from "../fieldAppConfig.js";
import { EMS_CHIEF_COMPLAINTS, INCIDENT_DISCIPLINES } from "../../lib/neris/picklists.js";
import { Banner, Chips, ErrorSummary, Field, PickerButton, PickerSheet, Screen, Section, Stepper, TextArea, TextInput, formatDay } from "../ui.jsx";

const TYPE_QUICK = [
  "Structure fire",
  "Vehicle fire",
  "Brush / grass fire",
  "Medical call",
  "Vehicle accident",
  "Fire alarm",
  "Gas leak / odor",
  "Hazmat",
  "Rescue",
  "Public assist",
  "Smoke investigation",
  "Lift assist",
];

function describe(data) {
  return {
    title: `${data.incidentTypeSummary || "Incident"} — ${data.incidentAddress || "no address"}`,
    subtitle: [formatDay(data.incidentDate), data.workspace?.cad?.incidentNumber].filter(Boolean).join(" · "),
  };
}

function newReport() {
  const year = new Date().getFullYear();
  const stamp = Date.now().toString(36).toUpperCase();
  return {
    id: `NERIS-F${stamp}${Math.random().toString(36).slice(2, 4).toUpperCase()}`,
    reportNumber: `NERIS-${year}-F${stamp.slice(-5)}`,
    incidentDate: localDate(),
    incidentAddress: "",
    incidentTypeSummary: "",
    disciplines: [],
    workspace: {
      cad: { incidentNumber: "", dispatchTime: "", arrivalTime: "", clearTime: "" },
      units: [],
      personnel: [],
      ems: { patientCount: "", chiefComplaint: "" },
      narrative: { body: "" },
    },
  };
}

function fromServer(report) {
  const workspace = report.workspace || {};
  return {
    id: report.id,
    reportNumber: report.reportNumber,
    incidentDate: report.incidentDate || "",
    incidentAddress: report.incidentAddress || "",
    incidentTypeSummary: report.incidentTypeSummary || "",
    disciplines: report.disciplines || [],
    workspace: {
      cad: {
        incidentNumber: workspace.cad?.incidentNumber || "",
        dispatchTime: workspace.cad?.dispatchTime || "",
        arrivalTime: workspace.cad?.arrivalTime || "",
        clearTime: workspace.cad?.clearTime || "",
      },
      units: workspace.units || [],
      personnel: workspace.personnel || [],
      ems: { patientCount: workspace.ems?.patientCount || "", chiefComplaint: workspace.ems?.chiefComplaint || "" },
      narrative: { body: workspace.narrative?.body || "" },
    },
  };
}

function TimeField({ label, value, onChange, error }) {
  return (
    <Field label={label} error={error}>
      <div className="fa-add-row">
        <input className="fa-input" type="datetime-local" value={value || ""} onChange={(event) => onChange(event.target.value)} />
        <button type="button" className="fa-btn fa-btn-secondary" onClick={() => onChange(localDateTime())} aria-label={`${label}: now`}>
          <Clock size={18} /> Now
        </button>
      </div>
    </Field>
  );
}

export default function IncidentFormScreen({ params = {} }) {
  const { refData, recent, back, records, rulesFor } = useField();
  const rules = rulesFor("incident");
  const downloaded = params.reportId ? refItems(refData, "incidents").find((report) => report.id === params.reportId) : null;
  const sent = params.reportId ? latestSentCopy(records, "incident", params.reportId, downloaded?.updatedAt) : null;
  const serverReport = sent ? { ...(downloaded || {}), ...sent.base, id: params.reportId, reportNumber: sent.data.reportNumber } : downloaded;
  const initial = serverReport ? fromServer(serverReport) : newReport();
  const form = useRecordForm({
    kind: "incident",
    localId: params.localId,
    initialData: initial,
    base: serverReport ? fromServer(serverReport) : null,
    describe,
    validate: (data) => ({
      ...validateIncident(data),
      ...requiredFieldErrors(rules, [
        { field: "cadNumber", value: data.workspace?.cad?.incidentNumber, message: "Enter the CAD / incident number." },
        { field: "disciplines", value: data.disciplines, message: "Pick at least one." },
        { field: "times", errorKey: "dispatchTime", value: data.workspace?.cad?.dispatchTime, message: "Enter the dispatch time." },
        { field: "units", value: data.workspace?.units, message: "Add the units." },
        { field: "crew", value: data.workspace?.personnel, message: "Add the crew." },
        { field: "narrative", value: data.workspace?.narrative?.body, message: "Write the narrative." },
      ]),
    }),
  });
  const { data, update, errors, submit, saving } = form;
  const [sheet, setSheet] = useState("");
  const [locating, setLocating] = useState(false);
  const personnel = refItems(refData, "personnel");
  const cad = data.workspace?.cad || {};
  const ems = data.workspace?.ems || {};

  const setWorkspace = (key, patch) => update((current) => ({
    workspace: { ...current.workspace, [key]: Array.isArray(patch) ? patch : { ...(current.workspace?.[key] || {}), ...patch } },
  }));

  function fillFromGps() {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const text = `GPS ${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`;
        update((current) => ({ incidentAddress: current.incidentAddress ? `${current.incidentAddress} (${text})` : text }));
        setLocating(false);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }

  const isEms = (data.disciplines || []).includes("ems") || /medical|ems|lift/i.test(data.incidentTypeSummary || "");

  return (
    <Screen
      title={serverReport || data.reportNumber ? data.reportNumber || "Incident report" : "New incident report"}
      subtitle="Field draft — finish the NERIS report in the RMS"
      onBack={back}
      footer={(
        <>
          <ErrorSummary errors={errors} />
          <button type="button" className="fa-btn fa-btn-primary fa-btn-block" disabled={saving} onClick={() => submit({ recent: { incidentUnits: (data.workspace?.units || []).map((unit) => unit.unitId) } })}>
            Save report
          </button>
        </>
      )}
    >
      {serverReport ? <Banner tone="info" icon={<Siren size={22} />}>Changes here are merged into the report in the RMS. Fields edited by someone else in the meantime are flagged for you to choose.</Banner> : null}
      <Section title="Incident">
        <Field label="Type" required error={errors.incidentTypeSummary}>
          <PickerButton value={data.incidentTypeSummary} placeholder="Pick the incident type" onClick={() => setSheet("type")} error={errors.incidentTypeSummary} />
        </Field>
        <Field label="Address or location" required error={errors.incidentAddress}>
          <div className="fa-add-row">
            <TextInput value={data.incidentAddress} onChange={(value) => update({ incidentAddress: value })} placeholder="123 Main St" autoComplete="off" />
            <button type="button" className="fa-btn fa-btn-secondary" onClick={fillFromGps} disabled={locating} aria-label="Use GPS location">
              {locating ? <Loader2 size={18} className="fa-spin" /> : <LocateFixed size={18} />} GPS
            </button>
          </div>
        </Field>
        <div className="fa-grid-2">
          <Field label="Date" required error={errors.incidentDate}>
            <input className="fa-input" type="date" value={data.incidentDate} max={localDate()} onChange={(event) => update({ incidentDate: event.target.value })} />
          </Field>
          {rules.show("cadNumber") ? (
            <Field label="CAD / incident #" required={rules.required("cadNumber")} error={errors.cadNumber}>
              <TextInput value={cad.incidentNumber} onChange={(value) => setWorkspace("cad", { incidentNumber: value })} inputMode="text" autoCapitalize="characters" />
            </Field>
          ) : null}
        </div>
        {rules.show("disciplines") ? (
          <Field label="Disciplines" required={rules.required("disciplines")} error={errors.disciplines}>
            <Chips values={data.disciplines} options={INCIDENT_DISCIPLINES.map((row) => ({ value: row.value, label: row.label }))} onChange={(values) => update({ disciplines: values })} />
          </Field>
        ) : null}
      </Section>

      {rules.show("times") ? <Section title="Times">
        <TimeField label="Dispatched" value={cad.dispatchTime} onChange={(value) => setWorkspace("cad", { dispatchTime: value })} error={errors.dispatchTime} />
        <TimeField label="On scene" value={cad.arrivalTime} onChange={(value) => setWorkspace("cad", { arrivalTime: value })} error={errors.arrivalTime} />
        <TimeField label="Cleared" value={cad.clearTime} onChange={(value) => setWorkspace("cad", { clearTime: value })} error={errors.clearTime} />
      </Section> : null}

      {rules.show("units") || rules.show("crew") ? <Section title="Units & crew">
        {errors.units || errors.crew ? <div className="fa-error-text" data-error="1">{errors.units || errors.crew}</div> : null}
        {rules.show("units") ? <div className="fa-chips">
          {(data.workspace?.units || []).map((unit) => (
            <button key={unit.unitId} type="button" className="fa-chip is-active" onClick={() => setWorkspace("units", data.workspace.units.filter((row) => row.unitId !== unit.unitId))} aria-label={`Remove ${unit.unitId}`}>
              {unit.unitId} <Trash2 size={15} />
            </button>
          ))}
          <button type="button" className="fa-chip" onClick={() => setSheet("units")}><Plus size={16} /> Units</button>
        </div> : null}
        {rules.show("crew") ? <div className="fa-chips">
          {(data.workspace?.personnel || []).map((person) => (
            <button key={person.personnelId || person.name} type="button" className="fa-chip is-active" onClick={() => setWorkspace("personnel", data.workspace.personnel.filter((row) => row.name !== person.name))} aria-label={`Remove ${person.name}`}>
              {person.name} <Trash2 size={15} />
            </button>
          ))}
          <button type="button" className="fa-chip" onClick={() => setSheet("crew")}><Users size={16} /> Crew</button>
        </div> : null}
      </Section> : null}

      {isEms && rules.show("patients") ? (
        <Section title="Patients">
          <div className="fa-grid-2">
            <Field label="Number of patients" error={errors.patientCount}>
              <Stepper value={ems.patientCount} onChange={(value) => setWorkspace("ems", { patientCount: value })} ariaLabel="Number of patients" />
            </Field>
            <Field label="Chief complaint">
              <PickerButton value={EMS_CHIEF_COMPLAINTS.find((row) => row.value === ems.chiefComplaint)?.label || ems.chiefComplaint} placeholder="Pick" onClick={() => setSheet("complaint")} />
            </Field>
          </div>
          <p className="fa-hint">Patient care records stay in your EMS charting system.</p>
        </Section>
      ) : null}

      {rules.show("narrative") ? (
        <Section title="Narrative">
          <Field required={rules.required("narrative")} error={errors.narrative}>
            <TextArea value={data.workspace?.narrative?.body} onChange={(value) => setWorkspace("narrative", { body: value })} placeholder="What you found, what you did, outcome" rows={6} />
          </Field>
        </Section>
      ) : null}

      <PickerSheet
        open={sheet === "type"}
        title="Incident type"
        options={TYPE_QUICK.map((value) => ({ value, label: value }))}
        allowCustom
        onPick={(value) => { update({ incidentTypeSummary: value }); setSheet(""); }}
        onClose={() => setSheet("")}
        selected={[data.incidentTypeSummary]}
      />
      <PickerSheet
        open={sheet === "units"}
        title="Units on the call"
        multiple
        allowCustom
        customLabel="Add"
        selected={(data.workspace?.units || []).map((unit) => unit.unitId)}
        options={unitOptions(refData).map((value) => ({ value, label: value }))}
        recent={recent.incidentUnits || []}
        onPick={(values) => {
          const existing = new Map((data.workspace?.units || []).map((unit) => [unit.unitId, unit]));
          setWorkspace("units", values.map((unitId) => existing.get(unitId) || { unitId, source: "field" }));
          setSheet("");
        }}
        onClose={() => setSheet("")}
      />
      <PickerSheet
        open={sheet === "crew"}
        title="Crew on the call"
        multiple
        allowCustom
        customLabel="Add"
        selected={(data.workspace?.personnel || []).map((person) => person.name)}
        options={personnel.map((person) => ({ value: person.name, label: person.name, detail: [person.rank, person.shift].filter(Boolean).join(" · ") }))}
        onPick={(values) => {
          const existing = new Map((data.workspace?.personnel || []).map((person) => [person.name, person]));
          setWorkspace("personnel", values.map((name) => {
            if (existing.has(name)) return existing.get(name);
            const person = personnel.find((row) => row.name === name);
            return { personnelId: person?.id || "", name, rank: person?.rank || "", source: "field" };
          }));
          setSheet("");
        }}
        onClose={() => setSheet("")}
      />
      <PickerSheet
        open={sheet === "complaint"}
        title="Chief complaint"
        options={EMS_CHIEF_COMPLAINTS.map((row) => ({ value: row.value, label: row.label }))}
        onPick={(value) => { setWorkspace("ems", { chiefComplaint: value }); setSheet(""); }}
        onClose={() => setSheet("")}
        selected={[ems.chiefComplaint]}
      />
    </Screen>
  );
}
