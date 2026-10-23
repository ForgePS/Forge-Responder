import {
  Activity, AlertTriangle, BarChart3, BookOpen, CalendarDays, ClipboardCheck, FileCheck2,
  GraduationCap, Truck, Users, Wrench
} from "lucide-react";
import { buildDashboardMetrics } from "../utils/dashboardMetrics.js";

function Panel({ title, icon: Icon, action, children, className = "" }) {
  return (
    <section className={`panel ${className}`}>
      <header><div><Icon size={15} /><strong>{title}</strong></div>{action}</header>
      <div className="panel-body">{children}</div>
    </section>
  );
}

function MiniTable({ columns, rows }) {
  return (
    <div className="mini-table">
      <div className="mini-row mini-head" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}>
        {columns.map((column) => <span key={column}>{column}</span>)}
      </div>
      {rows.map((row) => (
        <div className="mini-row" key={row.join("-")} style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}>
          {row.map((cell, index) => <span key={`${cell}-${index}`}>{cell}</span>)}
        </div>
      ))}
    </div>
  );
}

export default function CommandDashboard({
  onNavigate,
  personnel,
  certifications,
  training,
  apparatus,
  workOrders,
  assets,
  inspections,
  documents,
  scheduleDays,
  leaveRequests,
  shiftTrades
}) {
  const metrics = buildDashboardMetrics({
    personnel,
    certifications,
    training,
    apparatus,
    workOrders,
    assets,
    inspections,
    documents,
    scheduleDays,
    leaveRequests,
    shiftTrades
  });

  const kpis = [
    ["Personnel On Duty", metrics.onDuty, `of ${personnel.length} Assigned`, "info", Users, "Personnel"],
    ["Staffing Deficit", metrics.staffingDeficit, metrics.staffingDeficit ? "Below Target" : "Covered", metrics.staffingDeficit ? "critical" : "success", Users, "Scheduling"],
    ["Certifications Expiring", metrics.certsExpiring90, "Next 90 Days", "warning", FileCheck2, "Certifications"],
    ["Training Compliance", `${metrics.trainingCompliance}%`, "Department-wide", metrics.trainingCompliance >= 85 ? "success" : "warning", GraduationCap, "Training"],
    ["Units Available", metrics.unitsAvailable, `of ${apparatus.length} Total`, "success", Truck, "Apparatus"],
    ["Units Out of Service", metrics.unitsOos, "Fleet Status", metrics.unitsOos ? "critical" : "success", Wrench, "Maintenance"],
    ["Inspections Due", metrics.inspectionsDue, "Prevention Queue", "warning", ClipboardCheck, "Inspections"],
    ["Open Tasks", metrics.openTasks, "Across All Areas", "info", Activity, "Dashboard"]
  ];

  const actionRows = [
    ...metrics.pendingTrades.slice(0, 2).map((trade) => ["Shift trade review", trade.requestedBy, "Shift Trades"]),
    ...metrics.pendingLeave.slice(0, 2).map((leave) => ["Leave approval", leave.person, "Scheduling"]),
    ...metrics.openWorkOrders.slice(0, 2).map((order) => ["Maintenance request", `${order.unit} · ${order.id}`, "Maintenance"]),
    ...metrics.overdueInspections.slice(0, 2).map((item) => ["Inspection follow-up", item.occupancy, "Inspections"])
  ];
  if (metrics.pendingAcknowledgements) {
    actionRows.unshift(["Policy acknowledgements pending", `${metrics.pendingAcknowledgements} documents`, "SOGs / Policies"]);
  }

  return (
    <div className="dashboard">
      <section className="kpi-grid">
        {kpis.map(([label, value, note, tone, Icon, target]) => (
          <button key={label} className={`kpi-card tone-${tone}`} onClick={() => onNavigate(target)}>
            <Icon size={27} />
            <span>{label}</span>
            <strong>{value}</strong>
            <small>{note}</small>
          </button>
        ))}
      </section>
      <section className="dashboard-grid">
        <div className="dashboard-column">
          <h2>Readiness</h2>
          <Panel title="Staffing Summary" icon={Users}>
            <MiniTable
              columns={["Shift", "Staffed", "Minimum", "Status"]}
              rows={scheduleDays.slice(0, 4).map((day) => [day.shift, day.staffed, day.minimum, day.status])}
            />
          </Panel>
          <Panel title="Fleet Readiness" icon={Truck}>
            <MiniTable columns={["Unit", "Status"]} rows={metrics.fleetReadiness} />
          </Panel>
          <Panel title="Training Compliance" icon={BookOpen}>
            <div className="compliance-chart">
              <div className="donut"><strong>{metrics.trainingCompliance}%</strong><span>Complete</span></div>
              <div className="chart-legend">
                <span><i className="legend-success" /><b>Fire / EMS / Driver</b>{metrics.trainingCompliance}%</span>
                <span><i className="legend-warning" /><b>Needs documentation</b>{training.filter((t) => t.status === "Needs Documentation").length}</span>
                <span><i className="legend-critical" /><b>Overdue</b>{training.filter((t) => t.status === "Overdue").length}</span>
              </div>
            </div>
          </Panel>
        </div>
        <div className="dashboard-column">
          <h2>Action Center</h2>
          <Panel title="Work Queue" icon={Activity} action={<button className="text-button" onClick={() => onNavigate("Shift Trades")}>View all</button>}>
            <div className="operational-notes">
              {actionRows.length ? actionRows.map(([title, detail, target]) => (
                <p key={`${title}-${detail}`}>
                  <time>Today</time>
                  <button className="link-button" onClick={() => onNavigate(target)}><b>{title}</b></button>
                  <span>{detail}</span>
                </p>
              )) : <p><time>Today</time><b>All clear</b><span>No pending command actions</span></p>}
            </div>
          </Panel>
        </div>
        <div className="dashboard-column">
          <h2>Alerts & Trends</h2>
          <Panel title="Certification Expirations" icon={FileCheck2}>
            <MiniTable columns={["Personnel", "Certification", "Days"]} rows={metrics.expiringCerts.slice(0, 4).map((c) => [c.person, c.type, c.days])} />
          </Panel>
          <Panel title="Inspection Backlog" icon={ClipboardCheck}>
            <MiniTable columns={["Occupancy", "Due", "Status"]} rows={inspections.filter((i) => i.status !== "Complete").slice(0, 4).map((i) => [i.occupancy, i.due, i.status])} />
          </Panel>
          <Panel title="30-Day Trends" icon={BarChart3}>
            <div className="trend-cards">
              {[["Training Hours", `${training.reduce((s, t) => s + Number(t.hours || 0), 0)}`, "text-success", "spark-success"], ["Open Work Orders", metrics.openWorkOrders.length, "text-warning", "spark-warning"], ["Inspections Due", metrics.inspectionsDue, "text-info", "spark-info"], ["Asset Inspections", metrics.assetInspectionsDue, "text-purple", "spark-purple"]].map(([label, value, textClass, spark]) => (
                <div key={label}><span>{label}</span><strong className={textClass}>{value}</strong><b>30 days</b><i className={spark} /></div>
              ))}
            </div>
          </Panel>
        </div>
      </section>
    </div>
  );
}
