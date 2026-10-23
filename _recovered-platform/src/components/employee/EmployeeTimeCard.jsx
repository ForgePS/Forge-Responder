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

export default function EmployeeTimeCard({
  myPerson = null,
  membership = {},
  payPeriod = null,
  payRules = null,
  leaveRequests = [],
  roster = [],
  personnel = [],
  schedulingSettings = {},
  apparatus = [],
  shiftRotation = defaultShiftRotation,
  departmentTitle = "Fire and EMS",
  departmentLogoUrl = "",
  timeCards = [],
  setTimeCards,
}) {
  const todayId = formatDayId(new Date());
  const [referenceDayId, setReferenceDayId] = useState(todayId);
  const [savedMessage, setSavedMessage] = useState("");

  const personnelId = myPerson?.id || membership?.personnelId || "";
  const payPeriodWindow = useMemo(
    () => resolvePayPeriodForDay(referenceDayId, payPeriod || {}),
    [referenceDayId, payPeriod]
  );

  const savedEntry = useMemo(
    () => resolveSavedTimeCardEntry(timeCards, personnelId, payPeriodWindow.startDate),
    [timeCards, personnelId, payPeriodWindow.startDate]
  );

  const model = useMemo(
    () => buildTimeCardModel({
      referenceDayId,
      payPeriod,
      myPerson,
      membership,
      rotation: shiftRotation,
      leaveRequests,
      roster,
      personnel,
      schedulingSettings,
      apparatus,
      savedEntry: savedEntry || { days: {}, summary: {} },
      payRules,
    }),
    [
      referenceDayId,
      payPeriod,
      payRules,
      myPerson,
      membership,
      shiftRotation,
      leaveRequests,
      roster,
      personnel,
      schedulingSettings,
      apparatus,
      savedEntry,
    ]
  );

  const recordId = buildTimeCardRecordId(personnelId, model.payPeriodStart);

  function persistEntry(patch = {}) {
    if (!setTimeCards || !personnelId) return;

    const current = savedEntry || {
      id: recordId,
      personnelId,
      payPeriodStart: model.payPeriodStart,
      payPeriodEnd: model.payPeriodEnd,
      days: {},
      summary: {},
    };

    const next = upsertTimeCardEntry(timeCards, {
      ...current,
      ...patch,
      id: recordId,
      personnelId,
      payPeriodStart: model.payPeriodStart,
      payPeriodEnd: model.payPeriodEnd,
      employeeName: model.employeeName,
    });
    setTimeCards(next);
    setSavedMessage("Time card saved.");
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

  function handleEmployeeSignature(value) {
    persistEntry({
      days: savedEntry?.days || {},
      summary: savedEntry?.summary || {},
      employeeSignature: value,
    });
  }

  function movePayPeriod(delta) {
    setReferenceDayId(shiftPayPeriodReference(referenceDayId, payPeriod, delta));
  }

  if (!myPerson && !membership?.displayName) {
    return (
      <p className="auth-help">
        No personnel profile linked. Ask an admin to link your user account before using the time card.
      </p>
    );
  }

  const totals = computeTimeCardTotals(model.days, savedEntry?.summary || {}, payRules || {});

  return (
    <div className="time-card-portal-wrap">
      {savedMessage ? <p className="time-card-save-note">{savedMessage}</p> : null}
      <TimeCardSheet
        model={model}
        totals={totals}
        savedEntry={savedEntry}
        departmentTitle={departmentTitle}
        departmentLogoUrl={departmentLogoUrl}
        interactive
        showPayPeriodNav
        onPayPeriodPrevious={() => movePayPeriod(-1)}
        onPayPeriodNext={() => movePayPeriod(1)}
        onMedicHoursChange={handleMedicHoursChange}
        onSummaryChange={handleSummaryChange}
        onEmployeeSignature={handleEmployeeSignature}
      />
    </div>
  );
}
