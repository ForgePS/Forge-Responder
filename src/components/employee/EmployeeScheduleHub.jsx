import ScheduleCalendar from "../ScheduleCalendar.jsx";
import WeekRosterBoard from "../WeekRosterBoard.jsx";

export const SCHEDULE_HUB_TABS = [
  { id: "daily", label: "Daily Roster" },
  { id: "leave", label: "Leave Request" },
  { id: "trades", label: "Shift Trades" },
];

export const SCHEDULE_RANGE_TABS = [
  { id: "week", label: "7 Day Schedule" },
  { id: "month", label: "30 Day Calendar" },
];

export default function EmployeeScheduleHub({
  activeTab = "daily",
  onTabChange,
  calendarProps = {},
  weekRosterProps = {},
  dailyRosterPanel = null,
  summaryPanel = null,
  leavePanel = null,
  tradesPanel = null,
}) {
  return (
    <div className="employee-schedule-hub">
      <div className="employee-schedule-pills" role="tablist" aria-label="Schedule views">
        {SCHEDULE_HUB_TABS.slice(0, 1).map((tab) => (
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

        <div className="employee-schedule-range-group" role="presentation">
          {SCHEDULE_RANGE_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              className={`employee-schedule-pill employee-schedule-range-pill${activeTab === tab.id ? " is-active" : ""}`}
              onClick={() => onTabChange?.(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {SCHEDULE_HUB_TABS.slice(1).map((tab) => (
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

      {activeTab === "month" && (
        <div className="employee-schedule-calendar-pane" role="tabpanel">
          <ScheduleCalendar
            {...calendarProps}
            showTitle={false}
            showViewToggle={false}
            className="schedule-calendar-employee"
            viewMode="month"
          />
          {summaryPanel}
        </div>
      )}

      {activeTab === "week" && (
        <div className="employee-schedule-week-pane" role="tabpanel">
          <WeekRosterBoard
            {...weekRosterProps}
            title="7-Day Schedule"
          />
        </div>
      )}

      {activeTab === "daily" && (
        <div className="employee-schedule-daily-pane" role="tabpanel">
          {dailyRosterPanel}
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
