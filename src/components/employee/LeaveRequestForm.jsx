import { useEffect, useMemo } from "react";
import { useDropdowns } from "../../context/DropdownContext.jsx";
import PortalDayPicker from "./PortalDayPicker.jsx";
import {
  buildVacationDateWindow,
  calculateEndTime,
  formatSelectedDatesLabel,
  formatTimeLabel,
  isDayWithinRange,
  isEmployeeShiftWorkDay,
  isVacationLeaveType,
  LEAVE_START_TIME_OPTIONS,
} from "../../lib/employeePortalWorkflow.js";
import { vacationRulesHint } from "../../lib/employeePortalRules.js";
import { defaultShiftRotation } from "../../data/defaultShiftRotation.js";

export default function LeaveRequestForm({
  value,
  onChange,
  myPerson = null,
  scheduleDays = [],
  rotation = defaultShiftRotation,
  approvalHint = "",
  payPeriod = null,
  portalRules = null,
  leaveRequests = [],
  personnel = [],
  roster = [],
}) {
  const { getOptions } = useDropdowns();
  const leaveTypeOptions = useMemo(
    () => getOptions("leaveTypes", value.type).filter(
      (option) => !/^personal$/i.test(String(option).trim())
    ),
    [getOptions, value.type]
  );
  const endTime = useMemo(
    () => calculateEndTime(value.startTime, value.totalHours),
    [value.startTime, value.totalHours]
  );
  const isVacation = isVacationLeaveType(value.type);
  const vacationWindow = useMemo(
    () => buildVacationDateWindow(new Date(), portalRules),
    [portalRules]
  );
  const minDate = isVacation ? vacationWindow.minDate : "";
  const maxDate = isVacation ? vacationWindow.maxDate : "";
  const myShift = myPerson?.shift || "";
  const isLeaveDayDisplayed = useMemo(
    () => (dayId) => isEmployeeShiftWorkDay(dayId, myShift, rotation),
    [myShift, rotation]
  );
  const pickerRangeHint = [
    isVacation ? vacationRulesHint(portalRules) : "",
    myShift ? "Only your shift work days are shown." : "",
  ].filter(Boolean).join(" ");

  useEffect(() => {
    if (!value.selectedDates?.length) return;

    const filtered = value.selectedDates.filter((dayId) => {
      if (myShift && !isEmployeeShiftWorkDay(dayId, myShift, rotation)) return false;
      if (isVacation && !isDayWithinRange(dayId, vacationWindow.minDate, vacationWindow.maxDate)) return false;
      return true;
    });

    if (filtered.length === value.selectedDates.length) return;
    onChange?.({
      ...value,
      selectedDates: filtered,
      dates: formatSelectedDatesLabel(filtered),
    });
  }, [
    isVacation,
    vacationWindow.minDate,
    vacationWindow.maxDate,
    myShift,
    rotation,
    value.selectedDates,
    value,
    onChange,
  ]);

  function update(patch) {
    onChange?.({ ...value, ...patch });
  }

  return (
    <div className="employee-request-form">
      <div className="workflow-form">
        <label>
          <span>Leave Type</span>
          <select
            value={leaveTypeOptions.includes(value.type) ? value.type : leaveTypeOptions[0] || ""}
            onChange={(event) => update({ type: event.target.value })}
          >
            {!value.type && <option value="">Select...</option>}
            {leaveTypeOptions.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Start Time</span>
          <select
            value={value.startTime}
            onChange={(event) => update({ startTime: event.target.value })}
          >
            {LEAVE_START_TIME_OPTIONS.map((option) => (
              <option key={option} value={option}>{formatTimeLabel(option)}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Total Hours</span>
          <input
            type="number"
            min="0"
            step="0.5"
            value={value.totalHours}
            onChange={(event) => update({ totalHours: event.target.value })}
          />
        </label>
        <label>
          <span>Finish Time</span>
          <input
            className="employee-computed-value"
            value={endTime.label}
            readOnly
            tabIndex={-1}
            aria-readonly="true"
          />
        </label>
      </div>

      <PortalDayPicker
        label="Select leave dates"
        mode="multiple"
        selectedDates={value.selectedDates}
        scheduleDays={scheduleDays}
        rotation={rotation}
        payPeriod={payPeriod}
        leaveRequests={leaveRequests}
        personnel={personnel}
        roster={roster}
        minDate={minDate}
        maxDate={maxDate}
        rangeHint={pickerRangeHint}
        isDayDisplayed={myShift ? isLeaveDayDisplayed : null}
        onChange={(selectedDates) => update({
          selectedDates,
          dates: formatSelectedDatesLabel(selectedDates),
        })}
      />

      {approvalHint ? <p className="auth-help employee-approval-hint">{approvalHint}</p> : null}
    </div>
  );
}
