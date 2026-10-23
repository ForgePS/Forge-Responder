import ManagedSelect from "../ManagedSelect.jsx";
import PortalDayPicker from "./PortalDayPicker.jsx";
import { buildShiftTradeLabel, shiftLabelForDay } from "../../lib/employeePortalWorkflow.js";
import { defaultShiftRotation } from "../../data/defaultShiftRotation.js";

export default function ShiftTradeForm({
  value,
  onChange,
  scheduleDays = [],
  rotation = defaultShiftRotation,
  coverageOptions = [],
}) {
  function update(patch) {
    onChange?.({ ...value, ...patch });
  }

  function updateGiveDay(dayId) {
    const shift = shiftLabelForDay(dayId, rotation);
    update({
      giveDayId: dayId,
      give: buildShiftTradeLabel(dayId, shift),
      giveShift: shift,
    });
  }

  function updateReceiveDay(dayId) {
    const shift = shiftLabelForDay(dayId, rotation);
    update({
      receiveDayId: dayId,
      receive: buildShiftTradeLabel(dayId, shift),
      receiveShift: shift,
    });
  }

  return (
    <div className="employee-request-form employee-trade-form">
      <div className="workflow-form">
        <label>
          <span>Coverage Member</span>
          {coverageOptions.length ? (
            <ManagedSelect
              dropdownId={null}
              value={value.coverage}
              options={coverageOptions}
              onChange={(nextValue) => update({ coverage: nextValue })}
            />
          ) : (
            <input
              value={value.coverage}
              onChange={(event) => update({ coverage: event.target.value })}
              placeholder="Member covering your shift"
            />
          )}
        </label>
        <label>
          <span>Give Shift Summary</span>
          <input value={value.give} readOnly placeholder="Select a day below" />
        </label>
        <label>
          <span>Receive Shift Summary</span>
          <input value={value.receive} readOnly placeholder="Select a day below" />
        </label>
      </div>

      <div className="employee-trade-calendars">
        <PortalDayPicker
          label="Shift you are giving"
          mode="single"
          selectedDates={value.giveDayId ? [value.giveDayId] : []}
          scheduleDays={scheduleDays}
          rotation={rotation}
          onChange={(selectedDates) => updateGiveDay(selectedDates[0] || "")}
        />
        <PortalDayPicker
          label="Shift you want to receive"
          mode="single"
          selectedDates={value.receiveDayId ? [value.receiveDayId] : []}
          scheduleDays={scheduleDays}
          rotation={rotation}
          onChange={(selectedDates) => updateReceiveDay(selectedDates[0] || "")}
        />
      </div>
    </div>
  );
}
