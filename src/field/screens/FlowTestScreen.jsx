import { Droplets } from "lucide-react";
import { useField, useRecordForm } from "../fieldContext.jsx";
import { refItems } from "../fieldRefData.js";
import { findHydrant, hydrantAddress, hydrantLabel, hydrantSnapshot } from "../fieldHydrants.js";
import { calculateFlowGpm, validateFlowTest } from "../fieldValidation.js";
import { nfpaClassForGpm, nfpaColorForClass, nfpaColorNameForClass } from "../../lib/hydrantStatusSync.js";
import { Banner, ErrorSummary, Field, Screen, Section, Segmented, TextArea, formatDay } from "../ui.jsx";
import { CrewFields, defaultCrew } from "./common.jsx";

const SIZES = ["2", "2.25", "2.5"].map((value) => ({ value, label: `${value}"` }));

function describe(data) {
  const gpm = calculateFlowGpm(data.dischargeSize, data.pitotPsi);
  return {
    title: `Hydrant ${data.hydrant ? hydrantLabel(data.hydrant) : ""} — flow test`,
    subtitle: [formatDay(data.date), gpm ? `${gpm} GPM` : ""].filter(Boolean).join(" · "),
  };
}

function PsiInput({ label, value, onChange, error, hint }) {
  return (
    <Field label={label} required error={error} hint={hint}>
      <div className="fa-unit-input">
        <input className="fa-input fa-input-num" inputMode="decimal" value={value || ""} onChange={(event) => onChange(event.target.value.replace(/[^\d.]/g, ""))} placeholder="0" />
        <span>psi</span>
      </div>
    </Field>
  );
}

export default function FlowTestScreen({ params = {} }) {
  const { refData, snapshot, recent, back } = useField();
  const hydrant = params.hydrantKey ? findHydrant(refItems(refData, "hydrants"), params.hydrantKey) : null;
  const form = useRecordForm({
    kind: "flowTest",
    localId: params.localId,
    initialData: {
      ...defaultCrew(snapshot, recent),
      hydrant: hydrant ? hydrantSnapshot(hydrant) : null,
      dischargeSize: hydrant?.discharge_size || "2.5",
      staticPsi: "",
      residualPsi: "",
      pitotPsi: "",
      flowGpm: "",
      notes: "",
    },
    describe,
    validate: validateFlowTest,
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
  const nfpaClass = nfpaClassForGpm(gpm);

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
      <Section title="Crew">
        <CrewFields data={data} update={update} errors={errors} byLabel="Tested by" />
      </Section>
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
            {gpm ? `${nfpaClass} · ${nfpaColorNameForClass(nfpaClass)}` : "Enter pitot pressure"}
          </div>
        </div>
      </Section>
      <Section title="Notes">
        <TextArea value={data.notes} onChange={(value) => update({ notes: value })} placeholder="Optional" />
      </Section>
    </Screen>
  );
}
