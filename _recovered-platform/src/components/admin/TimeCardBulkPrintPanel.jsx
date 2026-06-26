import { useMemo, useState } from "react";
import { Printer } from "lucide-react";
import TimeCardSheet from "../timecard/TimeCardSheet.jsx";
import {
  buildTimeCardModel,
  computeTimeCardTotals,
  resolveSavedTimeCardEntry,
} from "../../lib/timeCardWorkflow.js";
import { formatDayId, resolvePayPeriodForDay } from "../../lib/payPeriods.js";
import { defaultShiftRotation } from "../../data/defaultShiftRotation.js";

function isActivePerson(person = {}) {
  const status = String(person.status || "").trim().toLowerCase();
  return !status || status === "active" || status === "on duty";
}

export default function TimeCardBulkPrintPanel({
  personnel = [],
  timeCards = [],
  payPeriod = null,
  payRules = null,
  leaveRequests = [],
  roster = [],
  schedulingSettings = {},
  apparatus = [],
  shiftRotation = defaultShiftRotation,
  departmentTitle = "Fire and EMS",
  departmentLogoUrl = "",
}) {
  const todayId = formatDayId(new Date());
  const [referenceDayId, setReferenceDayId] = useState(todayId);
  const [shiftFilter, setShiftFilter] = useState("All");

  const payPeriodWindow = useMemo(
    () => resolvePayPeriodForDay(referenceDayId, payPeriod || {}),
    [referenceDayId, payPeriod]
  );

  const shiftOptions = useMemo(() => {
    const shifts = [...new Set(
      personnel
        .filter(isActivePerson)
        .map((person) => String(person.shift || "").trim())
        .filter(Boolean)
    )].sort();
    return ["All", ...shifts];
  }, [personnel]);

  const printablePeople = useMemo(() => {
    return personnel
      .filter(isActivePerson)
      .filter((person) => {
        if (shiftFilter === "All") return true;
        return String(person.shift || "").trim() === shiftFilter;
      })
      .filter((person) => person.name)
      .sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: "base" }));
  }, [personnel, shiftFilter]);

  const sheets = useMemo(() => (
    printablePeople.map((person) => {
      const savedEntry = resolveSavedTimeCardEntry(timeCards, person.id, payPeriodWindow.startDate);
      const model = buildTimeCardModel({
        referenceDayId,
        payPeriod,
        myPerson: person,
        membership: { personnelId: person.id, displayName: person.name },
        rotation: shiftRotation,
        leaveRequests,
        roster,
        personnel,
        schedulingSettings,
        apparatus,
        savedEntry: savedEntry || { days: {}, summary: {} },
        payRules,
      });
      const totals = computeTimeCardTotals(model.days, savedEntry?.summary || {}, payRules || {});
      return { person, model, totals, savedEntry };
    })
  ), [
    printablePeople,
    timeCards,
    payPeriodWindow.startDate,
    referenceDayId,
    payPeriod,
    payRules,
    leaveRequests,
    roster,
    personnel,
    schedulingSettings,
    apparatus,
    shiftRotation,
  ]);

  function shiftReference(delta) {
    const anchor = new Date(`${payPeriodWindow.startDate}T12:00:00`);
    const length = modelLengthDays();
    anchor.setDate(anchor.getDate() + (delta * length));
    setReferenceDayId(formatDayId(anchor));
  }

  function modelLengthDays() {
    const start = new Date(`${payPeriodWindow.startDate}T12:00:00`);
    const end = new Date(`${payPeriodWindow.endDate}T12:00:00`);
    return Math.max(1, Math.round((end - start) / 86400000) + 1);
  }

  function handlePrint() {
    window.print();
  }

  return (
    <section className="time-card-bulk-print-panel">
      <header className="time-card-bulk-print-toolbar">
        <div>
          <strong>Bulk Print Time Sheets</strong>
          <p className="auth-help">
            Generate printable time sheets for signatures. Holiday hours follow the configured holiday calendar.
            FF Medic unit hours are tracked separately and are not included in the grand total.
          </p>
        </div>
        <div className="time-card-bulk-print-controls">
          <label>
            <span>Pay period ending</span>
            <input
              type="date"
              value={payPeriodWindow.endDate}
              onChange={(event) => setReferenceDayId(event.target.value)}
            />
          </label>
          <label>
            <span>Shift</span>
            <select value={shiftFilter} onChange={(event) => setShiftFilter(event.target.value)}>
              {shiftOptions.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </label>
          <button type="button" className="primary-button" onClick={handlePrint} disabled={!sheets.length}>
            <Printer size={14} /> Print {sheets.length} time sheet{sheets.length === 1 ? "" : "s"}
          </button>
        </div>
      </header>

      {!sheets.length ? (
        <p className="auth-help">No active personnel match the selected shift filter.</p>
      ) : null}

      <div className="time-card-bulk-print-stack">
        {sheets.map(({ person, model, totals, savedEntry }) => (
          <TimeCardSheet
            key={person.id}
            className="time-card-bulk-print-page"
            model={model}
            totals={totals}
            savedEntry={savedEntry}
            departmentTitle={departmentTitle}
            departmentLogoUrl={departmentLogoUrl}
          />
        ))}
      </div>
    </section>
  );
}
