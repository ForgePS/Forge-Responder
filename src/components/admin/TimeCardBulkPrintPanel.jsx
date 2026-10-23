import { useMemo, useState } from "react";
import { Printer } from "lucide-react";
import TimeCardSheet from "../timecard/TimeCardSheet.jsx";
import {
  buildTimeCardModel,
  resolveSavedTimeCardEntry,
} from "../../lib/timeCardWorkflow.js";
import { formatDayId } from "../../lib/shiftCalendar.js";
import { resolvePayPeriodForDay } from "../../lib/payPeriods.js";
import { defaultShiftRotation } from "../../data/defaultShiftRotation.js";
import { printTimeCard } from "../../lib/printTimeCard.js";

function isActivePerson(person = {}) {
  const status = String(person.status || "").trim().toLowerCase();
  return !status || status === "active" || status === "on duty";
}

export default function TimeCardBulkPrintPanel({
  personnel = [],
  timeCards = [],
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
      });
      const totals = model.totals;
      return { person, model, totals, savedEntry };
    })
  ), [
    printablePeople,
    timeCards,
    payPeriodWindow.startDate,
    referenceDayId,
    payPeriod,
    payRules,
    scheduleDays,
    leaveRequests,
    roster,
    personnel,
    schedulingSettings,
    apparatus,
    shiftRotation,
    shiftTrades,
    shiftChangeTime,
  ]);

  function handlePrint() {
    printTimeCard("bulk");
  }

  return (
    <section className="time-card-bulk-print-panel">
      <header className="time-card-bulk-print-toolbar">
        <div>
          <strong>Time Sheets — Bulk Print</strong>
          <p className="auth-help">
            Generate printable time sheets for all active personnel or filter by shift. Holiday hours follow
            the configured holiday calendar. FF Medic unit hours are tracked separately and are not included in the grand total.
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
