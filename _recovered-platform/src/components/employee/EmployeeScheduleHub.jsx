import ScheduleCalendar from "../ScheduleCalendar.jsx";

export const SCHEDULE_HUB_TABS = [
  { id: "month", label: "30 Day Schedule" },
  { id: "week", label: "7 Day Schedule" },
  { id: "leave", label: "Leave Request" },
  { id: "trades", label: "Shift Trades" },
];

export default function EmployeeScheduleHub({
  activeTab = "month",
  onTabChange,
  calendarProps = {},
  summaryPanel = null,
  leavePanel = null,
  tradesPanel = null,
}) {
  return (
    <div className="employee-schedule-hub">
      <div className="employee-schedule-pills" role="tablist" aria-label="Schedule views">
        {SCHEDULE_HUB_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`employee-schedule-pill${activeTab === tab.id ? " is-active" : ""}`}
            onClick={() => onTabChange?.(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {(activeTab === "month" || activeTab === "week") && (
        <div className="employee-schedule-calendar-pane" role="tabpanel">
          <ScheduleCalendar
            {...calendarProps}
            showTitle={false}
            showViewToggle={false}
            className="schedule-calendar-employee"
            viewMode={activeTab === "week" ? "week" : "month"}
          />
          {activeTab === "month" ? summaryPanel : null}
        </div>
      )}

      {activeTab === "leave" && (
        <div className="employee-schedule-form-pane" role="tabpanel">
          {leavePanel}
        </div>
      )}

      {activeTab === "trades" && (
        <div className="employee-schedule-form-pane" role="tabpanel">
          {tradesPanel}
        </div>
      )}
    </div>
  );
}
