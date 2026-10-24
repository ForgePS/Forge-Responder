/** Edit hydrant info from the field (status, district, address, GPS, provider, type, notes). */
import { useState } from "react";
import { Droplets, LocateFixed, Loader2 } from "lucide-react";
import { useField, useRecordForm } from "../fieldContext.jsx";
import { refItems } from "../fieldRefData.js";
import { districtCounts, findHydrant, hydrantAddress, hydrantLabel, hydrantSnapshot } from "../fieldHydrants.js";
import { isCrewSessionActive } from "../fieldCrew.js";
import { HYDRANT_STATUS_OPTIONS } from "../../lib/hydrantStatusSync.js";
import { Banner, ErrorSummary, Field, Screen, Section, Segmented, TextArea, TextInput } from "../ui.jsx";
import { gpsText } from "./FlowTestScreen.jsx";

export const HYDRANT_EDIT_FIELDS = ["status", "district", "address", "gps", "provider", "hydrant_type", "issue", "notes"];

function fieldsFrom(hydrant = {}) {
  return {
    status: hydrant.status || "In Service",
    district: hydrant.district || "",
    address: hydrant.address || hydrant.location || "",
    gps: gpsText(hydrant),
    provider: hydrant.provider || hydrant.water_assoc || "",
    hydrant_type: hydrant.hydrant_type || "",
    issue: hydrant.issue || "",
    notes: hydrant.notes || "",
  };
}

function describe(data) {
  return { title: `Hydrant ${data.hydrant ? hydrantLabel(data.hydrant) : ""} — info`, subtitle: data.fields?.status || "" };
}

export default function HydrantEditScreen({ params = {} }) {
  const { refData, back, crew, snapshot } = useField();
  const hydrants = refItems(refData, "hydrants");
  const hydrant = params.hydrantKey ? findHydrant(hydrants, params.hydrantKey) : null;
  const session = isCrewSessionActive(crew) ? crew : null;
  const [locating, setLocating] = useState(false);
  const start = fieldsFrom(hydrant || {});
  const form = useRecordForm({
    kind: "hydrantEdit",
    localId: params.localId,
    initialData: {
      hydrant: hydrant ? hydrantSnapshot(hydrant) : null,
      fields: start,
      editedBy: session?.testedBy || snapshot.displayName,
      shift: session?.shift || "",
    },
    base: hydrant ? { fields: start } : null,
    describe,
    validate: (data) => {
      const errors = {};
      const gps = String(data.fields.gps || "").trim();
      if (gps) {
        const [lat, lon] = gps.split(",").map((part) => Number(part.trim()));
        if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) errors.gps = "Use “latitude, longitude”, e.g. 34.96047, -90.04863";
      }
      return errors;
    },
  });
  const { data, update, errors, submit, saving } = form;
  if (!data.hydrant) {
    return <Screen title="Hydrant info" onBack={back}><Banner tone="warn" icon={<Droplets size={22} />} title="Hydrant not found on this device">Go back and pick the hydrant again.</Banner></Screen>;
  }
  const setField = (patch) => update((current) => ({ fields: { ...current.fields, ...patch } }));
  const districts = districtCounts(hydrants).map((row) => row.district).filter((value) => value !== "Unassigned");

  function fillHere() {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => { setField({ gps: `${pos.coords.latitude.toFixed(6)}, ${pos.coords.longitude.toFixed(6)}` }); setLocating(false); },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }

  return (
    <Screen
      title={`Edit ${hydrantLabel(data.hydrant)}`}
      subtitle={hydrantAddress(data.hydrant)}
      onBack={back}
      footer={(
        <>
          <ErrorSummary errors={errors} />
          <button type="button" className="fa-btn fa-btn-primary fa-btn-block" disabled={saving} onClick={() => submit({ message: navigator.onLine ? "Hydrant info saved — sending now" : "Hydrant info saved on this device" })}>Save hydrant info</button>
        </>
      )}
    >
      <Section>
        <Field label="Status">
          <Segmented value={data.fields.status} options={HYDRANT_STATUS_OPTIONS.map((value) => ({ value, label: value.replace(" (Do Not Test)", ""), tone: /out/i.test(value) ? "bad" : /repair|private/i.test(value) ? "warn" : "ok" }))} onChange={(value) => setField({ status: value })} columns={2} />
        </Field>
        <Field label="District">
          <Segmented value={data.fields.district} options={[{ value: "", label: "None" }, ...districts.map((value) => ({ value, label: value }))]} onChange={(value) => setField({ district: value })} columns={Math.min(4, districts.length + 1)} />
        </Field>
        <Field label="Address / location">
          <TextInput value={data.fields.address} onChange={(value) => setField({ address: value })} />
        </Field>
        <Field label="GPS (lat, long)" error={errors.gps}>
          <div className="fa-add-row">
            <TextInput value={data.fields.gps} onChange={(value) => setField({ gps: value })} inputMode="decimal" />
            <button type="button" className="fa-btn fa-btn-secondary" onClick={fillHere} disabled={locating}>{locating ? <Loader2 size={18} className="fa-spin" /> : <LocateFixed size={18} />} Here</button>
          </div>
        </Field>
        <div className="fa-grid-2">
          <Field label="Water provider">
            <TextInput value={data.fields.provider} onChange={(value) => setField({ provider: value })} />
          </Field>
          <Field label="Hydrant type">
            <TextInput value={data.fields.hydrant_type} onChange={(value) => setField({ hydrant_type: value })} />
          </Field>
        </div>
        <Field label="Issue">
          <TextInput value={data.fields.issue} onChange={(value) => setField({ issue: value })} placeholder="e.g. Faces away from street" />
        </Field>
        <Field label="Hydrant notes">
          <TextArea value={data.fields.notes} onChange={(value) => setField({ notes: value })} />
        </Field>
      </Section>
    </Screen>
  );
}
