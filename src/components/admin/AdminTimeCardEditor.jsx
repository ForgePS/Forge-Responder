import { useMemo, useState } from "react";
import { Printer } from "lucide-react";
import {
  buildTimeCardModel,
  buildTimeCardRecordId,
  resolveSavedTimeCardEntry,
  shiftPayPeriodReference,
  upsertTimeCardEntry,
} from "../../lib/timeCardWorkflow.js";
import { formatDayId } from "../../lib/shiftCalendar.js";
import { resolvePayPeriodForDay } from "../../lib/payPeriods.js";
import { defaultShiftRotation } from "../../data/defaultShiftRotation.js";
import { printTimeCard } from "../../lib/printTimeCard.js";
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
  scheduleDays = [],
  leaveRequests = [],
  roster = [],
  schedulingSettings = {},
  apparatus = [],
  shiftRotation = defaultShiftRotation,
  shiftTrades = [],
  departmentTitle = "Fire and EMS",
  departmentLogoUrl = "",
  shiftChangeTime = "07:00",
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
      scheduleDays,
      leaveRequests,
      roster,
      personnel,
      schedulingSettings,
      apparatus,
      shiftTrades,
      savedEntry: savedEntry || { days: {}, summary: {} },
      payRules,
      shiftChangeTime,
    }) : null),
    [
      selectedPerson,
      referenceDayId,
      payPeriod,
      payRules,
      shiftRotation,
      scheduleDays,
      leaveRequests,
      roster,
      personnel,
      schedulingSettings,
      apparatus,
      shiftTrades,
      savedEntry,
      shiftChangeTime,
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

  function handleMedicHoursChange(dayId, value) {
    persistEntry({
      days: {
        ...(savedEntry?.days || {}),
        [dayId]: {
          ...(savedEntry?.days?.[dayId] || {}),
          medicUnitHours: value,
        },
      },
      summary: savedEntry?.summary || {},
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

  const totals = model?.totals || {};

  return (
    <section className="admin-time-card-editor">
      <header className="admin-time-card-editor-toolbar">
        <div>
          <strong>Time Sheets</strong>
          <p className="auth-help">
            Select an employee and pay period to review or adjust day-level OT, medic unit hours,
            workers comp, and department head signature. Changes save immediately.
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
          <button
            type="button"
            className="primary-button"
            disabled={!selectedPerson}
            onClick={() => printTimeCard("single")}
          >
            <Printer size={14} /> Print time sheet
          </button>
        </div>
      </header>

      {!selectedPerson ? (
        <p className="auth-help">Select an employee to view and edit their time sheet.</p>
      ) : (
        <div className="time-card-portal-wrap time-card-single-print-target">
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
            onMedicHoursChange={handleMedicHoursChange}
            onSummaryChange={handleSummaryChange}
            onDepartmentHeadSignature={handleDepartmentHeadSignature}
          />
        </div>
      )}
    </section>
  );
}
