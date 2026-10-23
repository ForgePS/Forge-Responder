import { CheckCheck, Droplets } from "lucide-react";
import { useField, useRecordForm } from "../fieldContext.jsx";
import { refItems } from "../fieldRefData.js";
import { findHydrant, hydrantAddress, hydrantLabel, hydrantSnapshot } from "../fieldHydrants.js";
import { validateHydrantInspection } from "../fieldValidation.js";
import { Banner, ErrorSummary, Field, PhotoStrip, Screen, Section, Segmented, TextArea, cx, formatDay } from "../ui.jsx";
import { CrewFields, defaultCrew } from "./common.jsx";

// Same checklist as the desktop hydrant inspection.
export const HYDRANT_INSPECTION_ITEMS = [
  "No Obstructions",
  "Operable (Turns Open/Closed)",
  "Caps Present",
  "Threads in Good Condition",
  "Oil Nut Provided",
  "Barrel Drains Properly",
  "Leaks (Valve / Caps / Barrel)",
  "Steamer Port / Pumper Outlet Good",
  "Adequate Clearance (3 ft all sides)",
];

const RESULT_OPTIONS = [
  { value: "Yes", label: "OK", tone: "ok" },
  { value: "No", label: "Problem", tone: "bad" },
  { value: "N/A", label: "N/A", tone: "muted" },
];

function describe(data) {
  const problems = (data.checklist || []).filter((row) => row.result === "No").length;
  return {
    title: `Hydrant ${data.hydrant ? hydrantLabel(data.hydrant) : ""} — inspection`,
    subtitle: [formatDay(data.date), problems ? `${problems} problem${problems === 1 ? "" : "s"}` : "No problems"].join(" · "),
  };
}

export default function HydrantInspectionScreen({ params = {} }) {
  const { refData, snapshot, recent, back } = useField();
  const hydrant = params.hydrantKey ? findHydrant(refItems(refData, "hydrants"), params.hydrantKey) : null;
  const form = useRecordForm({
    kind: "hydrantInspection",
    localId: params.localId,
    initialData: {
      ...defaultCrew(snapshot, recent),
      hydrant: hydrant ? hydrantSnapshot(hydrant) : null,
      checklist: HYDRANT_INSPECTION_ITEMS.map((item) => ({ item, result: "", notes: "" })),
      notes: "",
    },
    describe,
    validate: validateHydrantInspection,
  });
  const { data, update, errors, clearError, submit, saving, attachments, addPhoto, removePhoto } = form;

  if (!data.hydrant) {
    return (
      <Screen title="Hydrant inspection" onBack={back}>
        <Banner tone="warn" icon={<Droplets size={22} />} title="Hydrant not found on this device">Go back and pick the hydrant again.</Banner>
      </Screen>
    );
  }

  const setRow = (index, patch) => {
    update((current) => ({
      checklist: current.checklist.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)),
    }));
    if (patch.result && patch.result !== "No") clearError(`row${index}`);
    if (patch.result === "No") form.setErrors((current) => { const next = { ...current }; delete next[`row${index}`]; return next; });
    if (patch.notes && String(patch.notes).trim()) form.setErrors((current) => { const next = { ...current }; delete next[`row${index}:note`]; return next; });
  };
  const unanswered = data.checklist.filter((row) => !row.result).length;

  return (
    <Screen
      title={`Inspect ${hydrantLabel(data.hydrant)}`}
      subtitle={hydrantAddress(data.hydrant)}
      onBack={back}
      footer={(
        <>
          <ErrorSummary errors={errors} />
          <button type="button" className="fa-btn fa-btn-primary fa-btn-block" disabled={saving} onClick={() => submit({ recent: { shift: data.shift, testedBy: data.testedBy } })}>
            Save inspection
          </button>
        </>
      )}
    >
      <Section title="Crew">
        <CrewFields data={data} update={update} errors={errors} byLabel="Inspected by" />
      </Section>
      <Section
        title="Checklist"
        aside={unanswered ? (
          <button type="button" className="fa-link" onClick={() => { update((current) => ({ checklist: current.checklist.map((row) => (row.result ? row : { ...row, result: "Yes" })) })); form.setErrors((current) => Object.fromEntries(Object.entries(current).filter(([key]) => !/^rowd+$/.test(key)))); }}>
            <CheckCheck size={18} /> All OK
          </button>
        ) : null}
      >
        <div className="fa-check-list">
          {data.checklist.map((row, index) => (
            <div key={row.item} className={cx("fa-check-item", row.result === "No" && "is-fail")} data-error={errors[`row${index}`] || errors[`row${index}:note`] ? "1" : undefined}>
              <div className="fa-check-label"><strong>{row.item}</strong></div>
              <Segmented value={row.result} options={RESULT_OPTIONS} onChange={(value) => setRow(index, { result: value })} ariaLabel={row.item} />
              {errors[`row${index}`] ? <div className="fa-error-text">{errors[`row${index}`]}</div> : null}
              {row.result === "No" ? (
                <Field label="What's wrong?" required error={errors[`row${index}:note`]}>
                  <TextArea value={row.notes} onChange={(value) => setRow(index, { notes: value })} rows={2} placeholder="Describe the problem" />
                </Field>
              ) : null}
            </div>
          ))}
        </div>
      </Section>
      <Section title="Notes & photos">
        <Field label="Notes">
          <TextArea value={data.notes} onChange={(value) => update({ notes: value })} placeholder="Optional" />
        </Field>
        <PhotoStrip attachments={attachments} onAdd={addPhoto} onRemove={removePhoto} />
      </Section>
    </Screen>
  );
}
