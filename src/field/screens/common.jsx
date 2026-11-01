/** Pieces shared by several field forms. */
import { useState } from "react";
import { useField } from "../fieldContext.jsx";
import { refItems, unitOptions } from "../fieldRefData.js";
import { localDate } from "../fieldValidation.js";
import { Field, PickerButton, PickerSheet } from "../ui.jsx";

/** Date + shift + person, defaulting to today, the last shift used and the signed-in member. */
export function CrewFields({ data, update, errors = {}, dateKey = "date", byKey = "testedBy", byLabel = "Done by", allowFuture = false }) {
  const { snapshot, refData, recent } = useField();
  const [sheet, setSheet] = useState("");
  const personnel = refItems(refData, "personnel");
  const shifts = snapshot.profile?.shifts || [];
  return (
    <>
      <div className="fa-grid-2">
        <Field label="Date" required error={errors[dateKey]}>
          <input className="fa-input" type="date" value={data[dateKey] || ""} max={allowFuture ? undefined : localDate()} onChange={(event) => update({ [dateKey]: event.target.value })} />
        </Field>
        <Field label="Shift" required error={errors.shift}>
          <PickerButton value={data.shift} onClick={() => setSheet("shift")} error={errors.shift} />
        </Field>
      </div>
      <Field label={byLabel} required error={errors[byKey]}>
        <PickerButton value={data[byKey]} onClick={() => setSheet("by")} error={errors[byKey]} />
      </Field>
      <PickerSheet
        open={sheet === "shift"}
        title="Shift"
        options={shifts.map((value) => ({ value, label: value }))}
        allowCustom
        onPick={(value) => { update({ shift: value }); setSheet(""); }}
        onClose={() => setSheet("")}
        selected={[data.shift]}
      />
      <PickerSheet
        open={sheet === "by"}
        title={byLabel}
        options={personnel.map((person) => ({ value: person.name, label: person.name, detail: [person.rank, person.shift].filter(Boolean).join(" · ") }))}
        recent={recent.testedByList || []}
        allowCustom
        onPick={(value) => { update({ [byKey]: value }); setSheet(""); }}
        onClose={() => setSheet("")}
        selected={[data[byKey]]}
      />
    </>
  );
}

/** A unit picker field (apparatus from fleet + older apparatus list). */
export function UnitField({ label = "Unit", value, onChange, error, required, placeholder }) {
  const { refData, recent } = useField();
  const [open, setOpen] = useState(false);
  const options = unitOptions(refData).map((unit) => ({ value: unit, label: unit }));
  return (
    <Field label={label} required={required} error={error}>
      <PickerButton value={value} placeholder={placeholder} onClick={() => setOpen(true)} error={error} />
      <PickerSheet
        open={open}
        title={label}
        options={options}
        recent={recent.unitList || []}
        allowCustom
        onPick={(next) => { onChange(next); setOpen(false); }}
        onClose={() => setOpen(false)}
        selected={[value]}
      />
    </Field>
  );
}

export function defaultCrew(snapshot, recent) {
  return {
    date: localDate(),
    shift: recent.shift || snapshot.assignedShift || "",
    testedBy: snapshot.displayName,
  };
}
