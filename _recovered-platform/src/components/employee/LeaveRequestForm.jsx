import { useMemo } from "react";
import ManagedSelect from "../ManagedSelect.jsx";
import PortalDayPicker from "./PortalDayPicker.jsx";
import {
  calculateEndTime,
  formatSelectedDatesLabel,
  formatTimeLabel,
  LEAVE_START_TIME_OPTIONS,
} from "../../lib/employeePortalWorkflow.js";
import { defaultShiftRotation } from "../../data/defaultShiftRotation.js";

export default function LeaveRequestForm({
  value,
  onChange,
  scheduleDays = [],
  rotation = defaultShiftRotation,
  approvalHint = "",
}) {
  const endTime = useMemo(
    () => calculateEndTime(value.startTime, value.totalHours),
    [value.startTime, value.totalHours]
  );

  function update(patch) {
    onChange?.({ ...value, ...patch });
  }

  return (
    <div className="employee-request-form">
      <div className="workflow-form">
        <label>
          <span>Leave Type</span>
          <ManagedSelect
            dropdownId="leaveTypes"
            value={value.type}
            onChange={(nextType) => update({ type: nextType })}
          />
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
          <input value={endTime.label} readOnly />
        </label>
      </div>

      <PortalDayPicker
        label="Select leave dates"
        mode="range"
        selectedDates={value.selectedDates}
        scheduleDays={scheduleDays}
        rotation={rotation}
        onChange={(selectedDates) => update({
          selectedDates,
          dates: formatSelectedDatesLabel(selectedDates),
        })}
      />

      {approvalHint ? <p className="auth-help employee-approval-hint">{approvalHint}</p> : null}
    </div>
  );
}
