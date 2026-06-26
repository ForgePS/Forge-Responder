import { useMemo, useState } from "react";
import {
  buildTimeCardModel,
  buildTimeCardRecordId,
  computeTimeCardTotals,
  resolveSavedTimeCardEntry,
  shiftPayPeriodReference,
  upsertTimeCardEntry,
} from "../../lib/timeCardWorkflow.js";
import { formatDayId } from "../../lib/shiftCalendar.js";
import { resolvePayPeriodForDay } from "../../lib/payPeriods.js";
import { defaultShiftRotation } from "../../data/defaultShiftRotation.js";
import TimeCardSheet from "../timecard/TimeCardSheet.jsx";

function isActivePerson(person = {}) {
  const status = String(person.status || "").trim().toLowerCase();
  return !status || status === "active" || status === "on duty";
}

export default function AdminTimeCardEditor({
  personnel = [],
  timeCards = [],
  setTimeCards,
  payPeriod = null,
  payRules = null,
  leaveRequests = [],
  roster = [],
  schedulingSettings = {},
  apparatus = [],
  shiftRotation = defaultShiftRotation,
  shiftTrades = [],
  departmentTitle = "Fire and EMS",
  departmentLogoUrl = "",
}) {
  const todayId = formatDayId(new Date());
  const [referenceDayId, setReferenceDayId] = useState(todayId);
  const [selectedPersonnelId, setSelectedPersonnelId] = useState("");
  const [savedMessage, setSavedMessage] = useState("");

  const activePeople = useMemo(
    () => personnel
      .filter(isActivePerson)
      .filter((person) => person.name)
      .sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: "base" })),
    [personnel]
  );

  const selectedPerson = useMemo(
    () => activePeople.find((person) => person.id === selectedPersonnelId) || null,
    [activePeople, selectedPersonnelId]
  );

  const payPeriodWindow = useMemo(
    () => resolvePayPeriodForDay(referenceDayId, payPeriod || {}),
    [referenceDayId, payPeriod]
  );

  const savedEntry = useMemo(
    () => (selectedPerson
      ? resolveSavedTimeCardEntry(timeCards, selectedPerson.id, payPeriodWindow.startDate)
      : null),
    [timeCards, selectedPerson, payPeriodWindow.startDate]
  );

  const model = useMemo(
    () => (selectedPerson ? buildTimeCardModel({
      referenceDayId,
      payPeriod,
      myPerson: selectedPerson,
      membership: { personnelId: selectedPerson.id, displayName: selectedPerson.name },
      rotation: shiftRotation,
      leaveRequests,
      roster,
      personnel,
      schedulingSettings,
      apparatus,
      shiftTrades,
      savedEntry: savedEntry || { days: {}, summary: {} },
      payRules,
    }) : null),
    [
      selectedPerson,
      referenceDayId,
      payPeriod,
      payRules,
      shiftRotation,
      leaveRequests,
      roster,
      personnel,
      schedulingSettings,
      apparatus,
      shiftTrades,
      savedEntry,
    ]
  );

  const recordId = selectedPerson
    ? buildTimeCardRecordId(selectedPerson.id, model?.payPeriodStart || payPeriodWindow.startDate)
    : "";

  function persistEntry(patch = {}) {
    if (!setTimeCards || !selectedPerson || !model) return;

    const current = savedEntry || {
      id: recordId,
      personnelId: selectedPerson.id,
      payPeriodStart: model.payPeriodStart,
      payPeriodEnd: model.payPeriodEnd,
      days: {},
      summary: {},
    };

    const next = upsertTimeCardEntry(timeCards, {
      ...current,
      ...patch,
      id: recordId,
      personnelId: selectedPerson.id,
      payPeriodStart: model.payPeriodStart,
      payPeriodEnd: model.payPeriodEnd,
      employeeName: model.employeeName,
    });
    setTimeCards(next);
    setSavedMessage("Time sheet saved.");
    window.setTimeout(() => setSavedMessage(""), 2500);
  }

  function handleOvertimeChange(category, value) {
    persistEntry({
      days: savedEntry?.days || {},
      summary: {
        ...(savedEntry?.summary || {}),
        overtime: {
          ...(savedEntry?.summary?.overtime || {}),
          [category]: value,
        },
      },
    });
  }

  function handleSummaryChange(key, value) {
    persistEntry({
      days: savedEntry?.days || {},
      summary: {
        ...(savedEntry?.summary || {}),
        [key]: value,
      },
    });
  }

  function handleDepartmentHeadSignature(value) {
    persistEntry({
      days: savedEntry?.days || {},
      summary: savedEntry?.summary || {},
      departmentHeadSignature: value,
    });
  }

  function movePayPeriod(delta) {
    setReferenceDayId(shiftPayPeriodReference(referenceDayId, payPeriod, delta));
  }

  const totals = model
    ? computeTimeCardTotals(model.days, savedEntry?.summary || {}, payRules || {})
    : {};

  return (
    <section className="admin-time-card-editor">
      <header className="admin-time-card-editor-toolbar">
        <div>
          <strong>Edit Time Sheets</strong>
          <p className="auth-help">
            Add overtime for late calls, hold over, training, and other. Threshold overtime still
            auto-calculates from regular hours. Changes save immediately and appear on bulk-printed sheets.
          </p>
        </div>
        <div className="admin-time-card-editor-controls">
          <label>
            <span>Employee</span>
            <select
              value={selectedPersonnelId}
              onChange={(event) => setSelectedPersonnelId(event.target.value)}
            >
              <option value="">Select employee…</option>
              {activePeople.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}{person.shift ? ` · ${person.shift}` : ""}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>

      {!selectedPerson ? (
        <p className="auth-help">Select an employee to edit their time sheet overtime.</p>
      ) : (
        <div className="time-card-portal-wrap">
          {savedMessage ? <p className="time-card-save-note">{savedMessage}</p> : null}
          <TimeCardSheet
            model={model}
            totals={totals}
            savedEntry={savedEntry}
            departmentTitle={departmentTitle}
            departmentLogoUrl={departmentLogoUrl}
            interactive
            adminMode
            showPayPeriodNav
            onPayPeriodPrevious={() => movePayPeriod(-1)}
            onPayPeriodNext={() => movePayPeriod(1)}
            onSummaryChange={handleSummaryChange}
            onOvertimeChange={handleOvertimeChange}
            onDepartmentHeadSignature={handleDepartmentHeadSignature}
          />
        </div>
      )}
    </section>
  );
}
