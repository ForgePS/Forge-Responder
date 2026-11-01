import { useState } from "react";
import { Droplets, LocateFixed, Loader2 } from "lucide-react";
import { useField, useRecordForm } from "../fieldContext.jsx";
import { refItems } from "../fieldRefData.js";
import { districtCounts, findHydrant, hydrantAddress, hydrantLabel, hydrantSnapshot } from "../fieldHydrants.js";
import { isCrewSessionActive } from "../fieldCrew.js";
import { calculateFlowGpm, validateFlowTest } from "../fieldValidation.js";
import { HYDRANT_STATUS_OPTIONS, nfpaClassForGpm, nfpaColorForClass, nfpaColorNameForClass } from "../../lib/hydrantStatusSync.js";
import { Banner, ErrorSummary, Field, Screen, Section, Segmented, TextArea, TextInput, formatDay } from "../ui.jsx";
import { CrewFields, defaultCrew } from "./common.jsx";

const SIZES = ["2", "2.25", "2.5"].map((value) => ({ value, label: `${value}"` }));
const NFPA_OPTIONS = ["Class AA", "Class A", "Class B", "Class C", "Out of Service", "Not Tested"];

function describe(data) {
  const gpm = calculateFlowGpm(data.dischargeSize, data.pitotPsi);
  return {
    title: `Hydrant ${data.hydrant ? hydrantLabel(data.hydrant) : ""} — flow test`,
    subtitle: [formatDay(data.date), gpm ? `${gpm} GPM` : ""].filter(Boolean).join(" · "),
  };
}

function PsiInput({ label, value, onChange, error }) {
  return (
    <Field label={label} required error={error}>
      <div className="fa-unit-input">
        <input className="fa-input fa-input-num" inputMode="decimal" value={value || ""} onChange={(event) => onChange(event.target.value.replace(/[^\d.]/g, ""))} placeholder="0" />
        <span>psi</span>
      </div>
    </Field>
  );
}

export function gpsText(hydrant = {}) {
  const lat = hydrant.latitude ?? hydrant.lat;
  const lon = hydrant.longitude ?? hydrant.lon;
  return lat && lon ? `${lat}, ${lon}` : "";
}

export default function FlowTestScreen({ params = {} }) {
  const { refData, snapshot, recent, back, crew, rulesFor } = useField();
  const rules = rulesFor("flowTest");
  const hydrants = refItems(refData, "hydrants");
  const hydrant = params.hydrantKey ? findHydrant(hydrants, params.hydrantKey) : null;
  const session = isCrewSessionActive(crew) ? crew : null;
  const [locating, setLocating] = useState(false);
  const form = useRecordForm({
    kind: "flowTest",
    localId: params.localId,
    initialData: {
      ...defaultCrew(snapshot, recent),
      ...(session ? { testedBy: session.testedBy, shift: session.shift, date: session.date || defaultCrew(snapshot, recent).date } : {}),
      hydrant: hydrant ? hydrantSnapshot(hydrant) : null,
      dischargeSize: hydrant?.discharge_size || "2.5",
      staticPsi: "",
      residualPsi: "",
      pitotPsi: "",
      flowGpm: "",
      nfpaOverride: "",
      info: {
        district: hydrant?.district || "",
        gps: gpsText(hydrant || {}),
        provider: hydrant?.provider || hydrant?.water_assoc || "",
        status: hydrant?.status || "In Service",
      },
      notes: "",
    },
    describe,
    validate: (data) => {
      const errors = validateFlowTest(data);
      if (rules.required("notes") && !String(data.notes || "").trim()) errors.notes = "Add notes.";
      return errors;
    },
  });
  const { data, update, errors, submit, saving } = form;

  if (!data.hydrant) {
    return (
      <Screen title="Flow test" onBack={back}>
        <Banner tone="warn" icon={<Droplets size={22} />} title="Hydrant not found on this device">Go back and pick the hydrant again.</Banner>
      </Screen>
    );
  }

  const gpm = calculateFlowGpm(data.dischargeSize, data.pitotPsi);
  const nfpaClass = data.nfpaOverride || nfpaClassForGpm(gpm);
  const setInfo = (patch) => update((current) => ({ info: { ...current.info, ...patch } }));
  const districts = districtCounts(hydrants).map((row) => row.district).filter((value) => value !== "Unassigned");

  function fillMyLocation() {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => { setInfo({ gps: `${pos.coords.latitude.toFixed(6)}, ${pos.coords.longitude.toFixed(6)}` }); setLocating(false); },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }

  return (
    <Screen
      title={`Flow test ${hydrantLabel(data.hydrant)}`}
      subtitle={hydrantAddress(data.hydrant)}
      onBack={back}
      footer={(
        <>
          <ErrorSummary errors={errors} />
          <button
            type="button"
            className="fa-btn fa-btn-primary fa-btn-block"
            disabled={saving}
            onClick={() => submit({
              recent: { shift: data.shift, testedBy: data.testedBy },
              finalize: (current) => ({ ...current, flowGpm: calculateFlowGpm(current.dischargeSize, current.pitotPsi) }),
            })}
          >
            Save flow test
          </button>
        </>
      )}
    >
      {session ? <p className="fa-crew-line">{data.testedBy} · {data.shift} · {formatDay(data.date)}</p> : (
        <Section title="Crew">
          <CrewFields data={data} update={update} errors={errors} byLabel="Tested by" />
        </Section>
      )}
      <Section title="Readings">
        <Field label="Outlet size">
          <Segmented value={data.dischargeSize} options={SIZES} onChange={(value) => update({ dischargeSize: value })} columns={3} />
        </Field>
        <div className="fa-grid-3">
          <PsiInput label="Static" value={data.staticPsi} onChange={(value) => update({ staticPsi: value })} error={errors.staticPsi} />
          <PsiInput label="Residual" value={data.residualPsi} onChange={(value) => update({ residualPsi: value })} error={errors.residualPsi} />
          <PsiInput label="Pitot" value={data.pitotPsi} onChange={(value) => update({ pitotPsi: value })} error={errors.pitotPsi} />
        </div>
        <div className="fa-gpm" style={{ "--gpm-color": nfpaColorForClass(nfpaClass) }}>
          <div>
            <span>Flow</span>
            <strong>{gpm ? `${gpm.toLocaleString()} GPM` : "—"}</strong>
          </div>
          <div className="fa-gpm-class">
            <span className="fa-gpm-swatch" aria-hidden="true" />
            {gpm || data.nfpaOverride ? `${nfpaClass} · ${nfpaColorNameForClass(nfpaClass)}` : "Enter pitot pressure"}
          </div>
        </div>
        {rules.show("nfpaClass") ? (
          <Field label="NFPA class" hint="Leave on Auto to use the class from the calculated flow.">
            <Segmented value={data.nfpaOverride} options={[{ value: "", label: "Auto" }, ...NFPA_OPTIONS.map((value) => ({ value, label: value.replace("Class ", "") }))]} onChange={(value) => update({ nfpaOverride: value })} columns={4} />
          </Field>
        ) : null}
      </Section>
      {rules.show("hydrantInfo") ? (
        <Section title="Hydrant info" hint="Changes here update the hydrant record too.">
          <Field label="Status">
            <Segmented value={data.info.status} options={HYDRANT_STATUS_OPTIONS.map((value) => ({ value, label: value.replace(" (Do Not Test)", ""), tone: /out/i.test(value) ? "bad" : /repair|private/i.test(value) ? "warn" : "ok" }))} onChange={(value) => setInfo({ status: value })} columns={2} />
          </Field>
          <Field label="District">
            <Segmented value={data.info.district} options={[{ value: "", label: "None" }, ...districts.map((value) => ({ value, label: value }))]} onChange={(value) => setInfo({ district: value })} columns={Math.min(4, districts.length + 1)} />
          </Field>
          <Field label="GPS (lat, long)">
            <div className="fa-add-row">
              <TextInput value={data.info.gps} onChange={(value) => setInfo({ gps: value })} inputMode="decimal" />
              <button type="button" className="fa-btn fa-btn-secondary" onClick={fillMyLocation} disabled={locating}>{locating ? <Loader2 size={18} className="fa-spin" /> : <LocateFixed size={18} />} Here</button>
            </div>
          </Field>
          <Field label="Water provider">
            <TextInput value={data.info.provider} onChange={(value) => setInfo({ provider: value })} />
          </Field>
        </Section>
      ) : null}
      {rules.show("notes") ? (
        <Section title="Notes">
          <Field required={rules.required("notes")} error={errors.notes}>
            <TextArea value={data.notes} onChange={(value) => update({ notes: value })} placeholder="Optional" />
          </Field>
        </Section>
      ) : null}
    </Screen>
  );
}
