import { useMemo, useState } from "react";
import { Lock, Users, X } from "lucide-react";
import { useField, useRecordForm } from "../fieldContext.jsx";
import { refItems } from "../fieldRefData.js";
import { latestSentCopy } from "../fieldRecords.js";
import { localDate, validateDailyLog } from "../fieldValidation.js";
import { requiredFieldErrors } from "../fieldAppConfig.js";
import { buildDailyLogId } from "../../lib/dailyLogSchema.js";
import { formatAutoLockLabel, isDailyLogLocked, resolveAutoLockAt } from "../../lib/dailyLogLock.js";
import { Banner, ErrorSummary, Field, PickerButton, PickerSheet, Screen, Section, TextArea, formatDay } from "../ui.jsx";
import { UnitField } from "./common.jsx";

function describe(data) {
  return {
    title: `Daily log — ${data.apparatus || "unit"} · ${data.shift || "shift"}`,
    subtitle: [formatDay(data.date), `${(data.crew || []).length} crew`].join(" · "),
  };
}

export default function DailyLogFormScreen({ params = {} }) {
  const { refData, snapshot, recent, caps, back, navigate, records, rulesFor } = useField();
  const rules = rulesFor("dailyLog");
  const downloaded = params.logId ? refItems(refData, "dailyLogs").find((log) => log.id === params.logId) : null;
  const sent = params.logId ? latestSentCopy(records, "dailyLog", params.logId, downloaded?.updatedAt) : null;
  const serverLog = sent
    ? { ...(downloaded || {}), ...sent.data, crew: sent.base.crew, notes: sent.base.notes, updatedAt: sent.base.updatedAt }
    : downloaded;
  const shiftChangeTime = snapshot.settings?.shiftChangeTime;
  const [sheet, setSheet] = useState("");
  const form = useRecordForm({
    kind: "dailyLog",
    localId: params.localId,
    initialData: serverLog
      ? { id: serverLog.id, date: serverLog.date, shift: serverLog.shift, apparatus: serverLog.apparatus, crew: serverLog.crew || [], notes: serverLog.notes || "" }
      : { id: "", date: localDate(), shift: recent.shift || snapshot.assignedShift || "", apparatus: recent.unit || "", crew: [], notes: "" },
    base: serverLog ? { crew: serverLog.crew || [], notes: serverLog.notes || "", updatedAt: serverLog.updatedAt } : null,
    describe,
    validate: (data) => ({
      ...validateDailyLog(data),
      ...requiredFieldErrors(rules, [
        { field: "crew", value: data.crew, message: "Add the crew." },
        { field: "notes", value: data.notes, message: "Add notes." },
      ]),
    }),
  });
  const { data, update, errors, submit, saving, existingStatus } = form;
  const personnel = refItems(refData, "personnel");
  const isExisting = Boolean(serverLog || form.data.id);
  const locked = serverLog ? isDailyLogLocked(serverLog, shiftChangeTime) : false;
  const readOnly = !caps.dailyLogEdit || locked || existingStatus === "syncing";
  const proposedId = buildDailyLogId(data.date, data.shift, data.apparatus);
  const duplicate = !isExisting && data.date && data.shift && data.apparatus
    ? refItems(refData, "dailyLogs").find((log) => log.id === proposedId)
    : null;
  const lockLabel = formatAutoLockLabel(resolveAutoLockAt(data.date, shiftChangeTime));
  const crewSet = useMemo(() => new Set(data.crew || []), [data.crew]);

  return (
    <Screen
      title={isExisting ? `${data.apparatus} · ${data.shift}` : "New daily log"}
      subtitle={formatDay(data.date)}
      onBack={back}
      footer={readOnly ? null : (
        <>
          <ErrorSummary errors={errors} />
          <button
            type="button"
            className="fa-btn fa-btn-primary fa-btn-block"
            disabled={saving || Boolean(duplicate)}
            onClick={() => submit({
              recent: { shift: data.shift, unit: data.apparatus, crew: data.crew },
              finalize: (current) => ({ ...current, id: current.id || buildDailyLogId(current.date, current.shift, current.apparatus) }),
            })}
          >
            Save log
          </button>
        </>
      )}
    >
      {locked ? (
        <Banner tone="info" icon={<Lock size={22} />} title="This log is locked">
          Logs lock 3 hours after shift change. An officer can unlock it in the RMS.
        </Banner>
      ) : null}
      {!caps.dailyLogEdit ? <Banner tone="info" title="View only">Your role can read logs but not edit them.</Banner> : null}
      {duplicate ? (
        <Banner
          tone="warn"
          title={`A log for ${data.apparatus} · ${data.shift} on this day already exists`}
          action={<button type="button" className="fa-btn fa-btn-sm" onClick={() => navigate("dailyLogForm", { logId: duplicate.id }, { replace: true })}>Open it</button>}
        >
          Add to that log instead of starting another.
        </Banner>
      ) : null}
      <Section>
        {!isExisting ? (
          <>
            <div className="fa-grid-2">
              <Field label="Date" required error={errors.date}>
                <input className="fa-input" type="date" value={data.date} max={localDate()} onChange={(event) => update({ date: event.target.value })} />
              </Field>
              <Field label="Shift" required error={errors.shift}>
                <PickerButton value={data.shift} onClick={() => setSheet("shift")} error={errors.shift} />
              </Field>
            </div>
            <UnitField label="Unit" required value={data.apparatus} onChange={(value) => update({ apparatus: value })} error={errors.apparatus} />
          </>
        ) : null}
        {rules.show("crew") ? <Field label="Crew" required={rules.required("crew")} error={errors.crew}>
          {data.crew?.length ? (
            <div className="fa-chips">
              {data.crew.map((name) => (
                <button key={name} type="button" className="fa-chip is-active" disabled={readOnly} onClick={() => update((current) => ({ crew: current.crew.filter((item) => item !== name) }))} aria-label={`Remove ${name}`}>
                  {name} {readOnly ? null : <X size={16} />}
                </button>
              ))}
            </div>
          ) : null}
          {!readOnly ? (
            <div className="fa-inline-actions">
              <button type="button" className="fa-btn fa-btn-secondary" onClick={() => setSheet("crew")}><Users size={20} /> {data.crew?.length ? "Change crew" : "Add crew"}</button>
              {recent.crew?.length && !data.crew?.length ? (
                <button type="button" className="fa-btn fa-btn-ghost" onClick={() => update({ crew: recent.crew })}>Same crew as last time ({recent.crew.length})</button>
              ) : null}
            </div>
          ) : null}
        </Field> : null}
        {rules.show("notes") ? (
          <Field label="Notes" required={rules.required("notes")} error={errors.notes} hint={!readOnly && lockLabel ? `Locks ${lockLabel}` : ""}>
            <TextArea value={data.notes} onChange={(value) => update({ notes: value })} placeholder="Training, station duties, equipment issues, visitors…" rows={6} disabled={readOnly} />
          </Field>
        ) : null}
      </Section>
      <PickerSheet
        open={sheet === "shift"}
        title="Shift"
        options={(snapshot.profile?.shifts || []).map((value) => ({ value, label: value }))}
        allowCustom
        onPick={(value) => { update({ shift: value }); setSheet(""); }}
        onClose={() => setSheet("")}
        selected={[data.shift]}
      />
      <PickerSheet
        open={sheet === "crew"}
        title="Crew"
        multiple
        selected={[...crewSet]}
        options={personnel.map((person) => ({ value: person.name, label: person.name, detail: [person.rank, person.shift].filter(Boolean).join(" · ") }))}
        allowCustom
        customLabel="Add"
        onPick={(values) => { update({ crew: values }); setSheet(""); }}
        onClose={() => setSheet("")}
      />
    </Screen>
  );
}
