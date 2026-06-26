import WeekRosterBoard from "./WeekRosterBoard.jsx";

export default function WeekRosterView(props) {
  return (
    <section className="week-roster-panel">
      <WeekRosterBoard {...props} title="7-Day Apparatus Roster" />
    </section>
  );
}
