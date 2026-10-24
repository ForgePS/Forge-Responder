import { useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import { useField, useRecordForm } from "../fieldContext.jsx";
import { refItems, unitOptions } from "../fieldRefData.js";
import { localDate, validateHoseTest } from "../fieldValidation.js";
import { requiredFieldErrors } from "../fieldAppConfig.js";
import { ErrorSummary, Field, PickerButton, PickerSheet, Screen, Section, Segmented, TextArea, cx, formatDay } from "../ui.jsx";

function describe(data) {
  const count = data.hoseIds?.length || 0;
  return {
    title: `Hose test — ${count ? `${count} hose${count === 1 ? "" : "s"}` : "no hoses yet"}`,
    subtitle: [data.apparatus, data.result, formatDay(data.testDate)].filter(Boolean).join(" · "),
  };
}

const DIAMETERS = ["1.75", "2.5", "3", "5"].map((value) => ({ value, label: `${value}"` }));
const LENGTHS = ["50 ft", "100 ft", "Pony"];
const PRESSURES = ["200 psi", "250 psi", "300 psi"];

export default function HoseTestScreen({ params = {} }) {
  const { refData, recent, snapshot, back, rulesFor } = useField();
  const rules = rulesFor("hoseTest");
  const inventory = refItems(refData, "hoseInventory");
  const testedThisYear = useMemo(() => new Set(refItems(refData, "hoseTests").map((row) => String(row.hoseId || "").toUpperCase())), [refData]);
  const shifts = snapshot.profile?.shifts || [];
  const form = useRecordForm({
    kind: "hoseTest",
    localId: params.localId,
    initialData: {
      testDate: localDate(),
      shift: recent.shift || snapshot.assignedShift || "",
      apparatus: recent.hoseApparatus || "",
      diameter: recent.hoseDiameter || "1.75",
      length: recent.hoseLength || "50 ft",
      pressure: recent.hosePressure || "200 psi",
      result: "Passed",
      testedBy: snapshot.displayName,
      hoseIds: [],
      notes: "",
    },
    describe,
    validate: (data) => ({
      ...requiredFieldErrors(rules, [
        { field: "apparatus", value: data.apparatus, message: "Pick the apparatus." },
        { field: "notes", value: data.notes, message: "Add notes." },
      ]),
      ...validateHoseTest(data),
    }),
  });
  const { data, update, errors, submit, saving } = form;
  const [typed, setTyped] = useState("");
  const [sheet, setSheet] = useState("");
  const personnel = refItems(refData, "personnel");

  const apparatusOptions = useMemo(() => {
    const fromInventory = inventory.map((hose) => hose.apparatus).filter(Boolean);
    return [...new Set([...fromInventory, ...unitOptions(refData)])].map((value) => ({ value, label: value }));
  }, [inventory, refData]);

  const dueHoses = useMemo(() => inventory
    .filter((hose) => (!data.apparatus || hose.apparatus === data.apparatus) && (!data.diameter || hose.diameter === data.diameter))
    .filter((hose) => !testedThisYear.has(hose.hoseId.toUpperCase()))
    .sort((a, b) => a.hoseId.localeCompare(b.hoseId, undefined, { numeric: true })), [inventory, data.apparatus, data.diameter, testedThisYear]);

  function addHoses(text) {
    const ids = String(text).split(/[\s,;]+/).map((id) => id.trim().toUpperCase()).filter(Boolean);
    if (!ids.length) return;
    update((current) => ({ hoseIds: [...new Set([...(current.hoseIds || []), ...ids])] }));
    setTyped("");
  }

  function toggleHose(id) {
    update((current) => {
      const set = new Set(current.hoseIds || []);
      if (set.has(id)) set.delete(id);
      else set.add(id);
      return { hoseIds: [...set] };
    });
  }

  return (
    <Screen
      title="Hose testing"
      onBack={back}
      footer={(
        <>
          <ErrorSummary errors={errors} />
          <button
            type="button"
            className="fa-btn fa-btn-primary fa-btn-block"
            disabled={saving}
            onClick={() => submit({ recent: { shift: data.shift, hoseApparatus: data.apparatus, hoseDiameter: data.diameter, hoseLength: data.length, hosePressure: data.pressure } })}
          >
            Save {data.hoseIds.length || ""} {data.result === "Failed" ? "failed" : "passed"} test{data.hoseIds.length === 1 ? "" : "s"}
          </button>
        </>
      )}
    >
      <Section title="Test setup">
        <div className="fa-grid-2">
          <Field label="Test date" required error={errors.testDate}>
            <input className="fa-input" type="date" value={data.testDate} max={localDate()} onChange={(event) => update({ testDate: event.target.value })} />
          </Field>
          <Field label="Shift" required error={errors.shift}>
            <PickerButton value={data.shift} onClick={() => setSheet("shift")} error={errors.shift} />
          </Field>
        </div>
        <Field label="Tested by" required error={errors.testedBy}>
          <PickerButton value={data.testedBy} onClick={() => setSheet("testedBy")} />
        </Field>
        {rules.show("apparatus") ? (
          <Field label="Apparatus" required={rules.required("apparatus")} error={errors.apparatus}>
            <PickerButton value={data.apparatus} placeholder="Any apparatus" onClick={() => setSheet("apparatus")} error={errors.apparatus} />
          </Field>
        ) : null}
        <Field label="Hose size">
          <Segmented value={data.diameter} options={DIAMETERS} onChange={(value) => update({ diameter: value })} columns={4} />
        </Field>
        <div className="fa-grid-2">
          {rules.show("length") ? (
            <Field label="Length">
              <Segmented value={data.length} options={LENGTHS} onChange={(value) => update({ length: value })} columns={3} />
            </Field>
          ) : null}
          {rules.show("pressure") ? (
            <Field label="Test pressure">
              <Segmented value={data.pressure} options={PRESSURES} onChange={(value) => update({ pressure: value })} columns={3} />
            </Field>
          ) : null}
        </div>
      </Section>

      <Section title="Hoses" hint="Tap hoses due this year, or type hose numbers (several at once is fine).">
        <Field error={errors.hoseIds}>
          <div className="fa-add-row">
            <input
              className="fa-input"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  addHoses(typed);
                }
              }}
              placeholder="Hose number, e.g. 1752"
              autoCapitalize="characters"
              enterKeyHint="done"
            />
            <button type="button" className="fa-btn fa-btn-secondary" onClick={() => addHoses(typed)} disabled={!typed.trim()}>
              <Plus size={20} /> Add
            </button>
          </div>
        </Field>
        {data.hoseIds.length ? (
          <div className="fa-chips">
            {data.hoseIds.map((id) => (
              <button key={id} type="button" className="fa-chip is-active" onClick={() => toggleHose(id)} aria-label={`Remove hose ${id}`}>
                {id} <X size={16} />
              </button>
            ))}
          </div>
        ) : null}
        {dueHoses.length ? (
          <>
            <div className="fa-subhead">Due this year{data.apparatus ? ` on ${data.apparatus}` : ""} · {dueHoses.length}</div>
            <div className="fa-chips">
              {dueHoses.slice(0, 60).map((hose) => (
                <button key={hose.hoseId} type="button" className={cx("fa-chip", data.hoseIds.includes(hose.hoseId.toUpperCase()) && "is-active")} onClick={() => toggleHose(hose.hoseId.toUpperCase())}>
                  {hose.hoseId}
                </button>
              ))}
            </div>
          </>
        ) : null}
      </Section>

      <Section title="Result">
        <Field required error={errors.result}>
          <Segmented
            value={data.result}
            options={[{ value: "Passed", label: "Pass", tone: "ok" }, { value: "Failed", label: "Fail", tone: "bad" }]}
            onChange={(value) => update({ result: value })}
          />
        </Field>
        {rules.show("notes") || data.result === "Failed" ? (
          <Field label={data.result === "Failed" ? "Why did it fail?" : "Notes"} required={data.result === "Failed" || rules.required("notes")} error={errors.notes}>
            <TextArea value={data.notes} onChange={(value) => update({ notes: value })} placeholder={data.result === "Failed" ? "Leak at coupling, jacket damage…" : "Optional"} />
          </Field>
        ) : null}
      </Section>

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
        open={sheet === "testedBy"}
        title="Tested by"
        options={personnel.map((person) => ({ value: person.name, label: person.name, detail: [person.rank, person.shift].filter(Boolean).join(" · ") }))}
        recent={recent.testedByList || []}
        allowCustom
        onPick={(value) => { update({ testedBy: value }); setSheet(""); }}
        onClose={() => setSheet("")}
        selected={[data.testedBy]}
      />
      <PickerSheet
        open={sheet === "apparatus"}
        title="Apparatus"
        options={[{ value: "", label: "Any apparatus" }, ...apparatusOptions]}
        recent={recent.hoseApparatusList || []}
        allowCustom
        onPick={(value) => { update({ apparatus: value }); setSheet(""); }}
        onClose={() => setSheet("")}
        selected={[data.apparatus]}
      />
    </Screen>
  );
}
