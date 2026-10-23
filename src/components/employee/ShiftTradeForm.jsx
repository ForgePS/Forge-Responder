import { useEffect, useMemo } from "react";
import PortalDayPicker from "./PortalDayPicker.jsx";
import {
  buildShiftTradeDateWindow,
  buildShiftTradeLabel,
  isDayWithinRange,
  isEmployeeShiftWorkDay,
  isOppositeShiftWorkDay,
  shiftLabelForDay,
} from "../../lib/employeePortalWorkflow.js";
import { shiftTradeRulesHint } from "../../lib/employeePortalRules.js";
import { defaultShiftRotation } from "../../data/defaultShiftRotation.js";

export default function ShiftTradeForm({
  value,
  onChange,
  myPerson = null,
  scheduleDays = [],
  rotation = defaultShiftRotation,
  coverageOptions = [],
  payPeriod = null,
  portalRules = null,
  leaveRequests = [],
  personnel = [],
  roster = [],
  approvalHint = "",
}) {
  const tradeWindow = useMemo(
    () => buildShiftTradeDateWindow(myPerson || {}, rotation, new Date(), portalRules),
    [myPerson, rotation, portalRules]
  );
  const tradeRangeHint = shiftTradeRulesHint(portalRules);
  const myShift = myPerson?.shift || "";

  const isGiveDayDisplayed = useMemo(
    () => (dayId) => isEmployeeShiftWorkDay(dayId, myShift, rotation),
    [myShift, rotation]
  );

  const isReceiveDayDisplayed = useMemo(
    () => (dayId) => isOppositeShiftWorkDay(dayId, myShift, rotation),
    [myShift, rotation]
  );

  useEffect(() => {
    if (!myShift || !onChange) return;

    const patch = {};
    if (value.giveDayId && !isGiveDayDisplayed(value.giveDayId)) {
      patch.giveDayId = "";
      patch.give = "";
      patch.giveShift = "";
    }
    if (value.receiveDayId && !isReceiveDayDisplayed(value.receiveDayId)) {
      patch.receiveDayId = "";
      patch.receive = "";
      patch.receiveShift = "";
    }
    if (Object.keys(patch).length) {
      onChange({ ...value, ...patch });
    }
  }, [myShift, rotation]);

  function update(patch) {
    onChange?.({ ...value, ...patch });
  }

  function updateGiveDay(dayId) {
    if (dayId && !isDayWithinRange(dayId, tradeWindow.minDate, tradeWindow.maxDate)) return;
    if (dayId && !isGiveDayDisplayed(dayId)) return;
    const shift = shiftLabelForDay(dayId, rotation);
    update({
      giveDayId: dayId,
      give: buildShiftTradeLabel(dayId, shift),
      giveShift: shift,
    });
  }

  function updateReceiveDay(dayId) {
    if (dayId && !isDayWithinRange(dayId, tradeWindow.minDate, tradeWindow.maxDate)) return;
    if (dayId && !isReceiveDayDisplayed(dayId)) return;
    const shift = shiftLabelForDay(dayId, rotation);
    update({
      receiveDayId: dayId,
      receive: buildShiftTradeLabel(dayId, shift),
      receiveShift: shift,
    });
  }

  return (
    <div className="employee-request-form employee-trade-form">
      {approvalHint ? <p className="auth-help">{approvalHint}</p> : null}
      <div className="workflow-form">
        <label>
          <span>Coverage Member</span>
          {coverageOptions.length ? (
            <select
              value={value.coverage}
              onChange={(event) => update({ coverage: event.target.value })}
            >
              <option value="">Select member...</option>
              {coverageOptions.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
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
          payPeriod={payPeriod}
          leaveRequests={leaveRequests}
          personnel={personnel}
          roster={roster}
          minDate={tradeWindow.minDate}
          maxDate={tradeWindow.maxDate}
          rangeHint={[tradeRangeHint, "Only your shift work days are shown."].filter(Boolean).join(" ")}
          isDayDisplayed={isGiveDayDisplayed}
          onChange={(selectedDates) => updateGiveDay(selectedDates[0] || "")}
        />
        <PortalDayPicker
          label="Shift you want to receive"
          mode="single"
          selectedDates={value.receiveDayId ? [value.receiveDayId] : []}
          scheduleDays={scheduleDays}
          rotation={rotation}
          payPeriod={payPeriod}
          leaveRequests={leaveRequests}
          personnel={personnel}
          roster={roster}
          minDate={tradeWindow.minDate}
          maxDate={tradeWindow.maxDate}
          rangeHint={[tradeRangeHint, "Only the other shift days are shown."].filter(Boolean).join(" ")}
          isDayDisplayed={isReceiveDayDisplayed}
          onChange={(selectedDates) => updateReceiveDay(selectedDates[0] || "")}
        />
      </div>
    </div>
  );
}
