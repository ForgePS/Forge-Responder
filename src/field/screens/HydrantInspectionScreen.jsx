import { CheckCheck, Droplets, Plus, Trash2 } from "lucide-react";
import { useField, useRecordForm } from "../fieldContext.jsx";
import { refItems } from "../fieldRefData.js";
import { findHydrant, hydrantAddress, hydrantLabel, hydrantSnapshot } from "../fieldHydrants.js";
import { isCrewSessionActive } from "../fieldCrew.js";
import { validateHydrantInspection } from "../fieldValidation.js";
import { Banner, ErrorSummary, Field, PhotoStrip, Screen, Section, Segmented, TextArea, TextInput, cx, formatDay } from "../ui.jsx";
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
  const { refData, snapshot, recent, back, crew, rulesFor } = useField();
  const rules = rulesFor("hydrantInspection");
  const hydrant = params.hydrantKey ? findHydrant(refItems(refData, "hydrants"), params.hydrantKey) : null;
  const session = isCrewSessionActive(crew) ? crew : null;
  const form = useRecordForm({
    kind: "hydrantInspection",
    localId: params.localId,
    initialData: {
      ...defaultCrew(snapshot, recent),
      ...(session ? { testedBy: session.testedBy, shift: session.shift, date: session.date || defaultCrew(snapshot, recent).date } : {}),
      hydrant: hydrant ? hydrantSnapshot(hydrant) : null,
      checklist: HYDRANT_INSPECTION_ITEMS
        .filter((item) => rules.show(`item:${item}`))
        .map((item) => ({ item, result: "", notes: "", repair_needed: "No", photoIds: [] })),
      notes: "",
    },
    describe,
    validate: (data) => {
      const errors = validateHydrantInspection(data);
      data.checklist.forEach((row, index) => {
        if (!String(row.item || "").trim()) errors[`row${index}`] = "Name this item.";
        if (rules.required("rowPhotos") && row.result === "No" && !(row.photoIds || []).length) errors[`row${index}:photo`] = "Add a photo of the problem.";
      });
      if (rules.required("notes") && !String(data.notes || "").trim()) errors.notes = "Add notes.";
      return errors;
    },
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
  const rowPhotoIds = new Set(data.checklist.flatMap((row) => row.photoIds || []));
  const generalPhotos = attachments.filter((attachment) => !rowPhotoIds.has(attachment.id));

  return (
    <Screen
      title={`Inspect ${hydrantLabel(data.hydrant)}`}
      subtitle={hydrantAddress(data.hydrant)}
      onBack={back}
      footer={(
        <>
          <ErrorSummary errors={errors} />
          <button type="button" className="fa-btn fa-btn-primary fa-btn-block" disabled={saving} onClick={() => submit({ recent: { shift: data.shift, testedBy: data.testedBy } })}>
            Complete inspection
          </button>
        </>
      )}
    >
      {session ? (
        <p className="fa-crew-line">{data.testedBy} · {data.shift} · {formatDay(data.date)}</p>
      ) : (
        <Section title="Crew">
          <CrewFields data={data} update={update} errors={errors} byLabel="Inspected by" />
        </Section>
      )}
      <Section
        title="Checklist"
        aside={unanswered ? (
          <button type="button" className="fa-link" onClick={() => { update((current) => ({ checklist: current.checklist.map((row) => (row.result ? row : { ...row, result: "Yes" })) })); form.setErrors((current) => Object.fromEntries(Object.entries(current).filter(([key]) => !/^row\d+$/.test(key)))); }}>
            <CheckCheck size={18} /> All OK
          </button>
        ) : null}
      >
        <div className="fa-check-list">
          {data.checklist.map((row, index) => {
            const rowPhotos = attachments.filter((attachment) => (row.photoIds || []).includes(attachment.id));
            const custom = !HYDRANT_INSPECTION_ITEMS.includes(row.item);
            return (
              <div key={`${row.item}-${index}`} className={cx("fa-check-item", row.result === "No" && "is-fail")} data-error={errors[`row${index}`] || errors[`row${index}:note`] || errors[`row${index}:photo`] ? "1" : undefined}>
                <div className="fa-check-label fa-check-label-row">
                  {custom ? <TextInput value={row.item} onChange={(value) => setRow(index, { item: value })} placeholder="Item" /> : <strong>{row.item}</strong>}
                  {custom ? <button type="button" className="fa-icon-btn sm" onClick={() => update((current) => ({ checklist: current.checklist.filter((_, i) => i !== index) }))} aria-label="Remove item"><Trash2 size={18} /></button> : null}
                </div>
                <Segmented value={row.result} options={RESULT_OPTIONS} onChange={(value) => setRow(index, { result: value, repair_needed: value === "No" ? "Yes" : row.repair_needed })} ariaLabel={row.item} />
                {errors[`row${index}`] ? <div className="fa-error-text">{errors[`row${index}`]}</div> : null}
                {row.result === "No" ? (
                  <Field label="What's wrong?" required error={errors[`row${index}:note`]}>
                    <TextArea value={row.notes} onChange={(value) => setRow(index, { notes: value })} rows={2} placeholder="Describe the problem" />
                  </Field>
                ) : null}
                {row.result && row.result !== "N/A" && rules.show("repairNeeded") ? (
                  <Field label="Repair needed">
                    <Segmented value={row.repair_needed} options={[{ value: "No", label: "No", tone: "ok" }, { value: "Yes", label: "Yes", tone: "bad" }]} onChange={(value) => setRow(index, { repair_needed: value })} columns={2} />
                  </Field>
                ) : null}
                {row.result === "No" && rules.show("rowPhotos") ? (
                  <Field label="Photo" required={rules.required("rowPhotos")} error={errors[`row${index}:photo`]}>
                    <PhotoStrip
                      attachments={rowPhotos}
                      max={3}
                      onAdd={async (file) => {
                        const attachment = await addPhoto(file);
                        if (attachment) setRow(index, { photoIds: [...(row.photoIds || []), attachment.id] });
                        form.setErrors((current) => { const next = { ...current }; delete next[`row${index}:photo`]; return next; });
                      }}
                      onRemove={(id) => { setRow(index, { photoIds: (row.photoIds || []).filter((photoId) => photoId !== id) }); removePhoto(id); }}
                    />
                  </Field>
                ) : null}
              </div>
            );
          })}
        </div>
        <button type="button" className="fa-btn fa-btn-ghost fa-btn-block" onClick={() => update((current) => ({ checklist: [...current.checklist, { item: "", result: "", notes: "", repair_needed: "No", photoIds: [] }] }))}>
          <Plus size={20} /> Add another item
        </button>
      </Section>
      {rules.show("notes") || rules.show("photos") ? (
        <Section title="Notes & photos">
          {rules.show("notes") ? (
            <Field label="General notes" required={rules.required("notes")} error={errors.notes}>
              <TextArea value={data.notes} onChange={(value) => update({ notes: value })} placeholder="Optional" />
            </Field>
          ) : null}
          {rules.show("photos") ? <PhotoStrip attachments={generalPhotos} onAdd={addPhoto} onRemove={removePhoto} /> : null}
        </Section>
      ) : null}
    </Screen>
  );
}
