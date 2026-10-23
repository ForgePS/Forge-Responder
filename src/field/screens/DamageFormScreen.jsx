import { useState } from "react";
import { FileWarning } from "lucide-react";
import { useField, useRecordForm } from "../fieldContext.jsx";
import { unitOptions } from "../fieldRefData.js";
import { localDate, validateDamageForm } from "../fieldValidation.js";
import { Banner, ErrorSummary, Field, PhotoStrip, PickerButton, PickerSheet, Screen, Section, TextArea, TextInput, formatDay } from "../ui.jsx";

function describe(data) {
  return {
    title: `Damage — ${data.location || "location not set"}`,
    subtitle: [data.equipment, formatDay(data.date)].filter(Boolean).join(" · "),
  };
}

export default function DamageFormScreen({ params = {} }) {
  const { refData, snapshot, recent, back, caps } = useField();
  const [sheet, setSheet] = useState(false);
  const form = useRecordForm({
    kind: "damageForm",
    localId: params.localId,
    initialData: {
      date: localDate(),
      location: recent.damageLocation || "",
      equipment: "",
      description: "",
      submittedBy: snapshot.displayName,
    },
    describe,
    validate: validateDamageForm,
  });
  const { data, update, errors, submit, saving, attachments, addPhoto, removePhoto } = form;
  const locations = [...new Set([...(snapshot.profile?.stations || []), ...unitOptions(refData)])].map((value) => ({ value, label: value }));
  const notify = caps.internalEmail ? "Command staff are notified when it sends." : "";

  return (
    <Screen
      title="Damage form"
      subtitle="Damaged property or equipment"
      onBack={back}
      footer={(
        <>
          <ErrorSummary errors={errors} />
          <button type="button" className="fa-btn fa-btn-primary fa-btn-block" disabled={saving} onClick={() => submit({ recent: { damageLocation: data.location } })}>
            Submit damage form
          </button>
        </>
      )}
    >
      <Banner tone="info" icon={<FileWarning size={22} />}>
        Creates a damage report{caps.maintenance ? " and a maintenance work order" : ""}. {notify}
      </Banner>
      <Section>
        <Field label="Date of damage" required error={errors.date}>
          <input className="fa-input" type="date" value={data.date} max={localDate()} onChange={(event) => update({ date: event.target.value })} />
        </Field>
        <Field label="Station or unit" required error={errors.location}>
          <PickerButton value={data.location} placeholder="Where is the damaged item?" onClick={() => setSheet(true)} error={errors.location} />
        </Field>
        <Field label="Equipment" hint="e.g. bay door, SCBA bottle, rear compartment door">
          <TextInput value={data.equipment} onChange={(value) => update({ equipment: value })} placeholder="What item?" />
        </Field>
        <Field label="What is damaged and how?" required error={errors.description}>
          <TextArea value={data.description} onChange={(value) => update({ description: value })} placeholder="Describe the damage" rows={4} />
        </Field>
        <Field label="Photos">
          <PhotoStrip attachments={attachments} onAdd={addPhoto} onRemove={removePhoto} />
        </Field>
        <Field label="Submitted by">
          <TextInput value={data.submittedBy} onChange={(value) => update({ submittedBy: value })} />
        </Field>
      </Section>
      <PickerSheet
        open={sheet}
        title="Station or unit"
        options={locations}
        recent={recent.damageLocationList || []}
        allowCustom
        onPick={(value) => { update({ location: value }); setSheet(false); }}
        onClose={() => setSheet(false)}
        selected={[data.location]}
      />
    </Screen>
  );
}
