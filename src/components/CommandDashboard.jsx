import {
  Activity, AlertTriangle, BarChart3, BookOpen, CalendarDays, ClipboardCheck, Droplets, FileCheck2,
  GraduationCap, Truck, Users, Wrench
} from "lucide-react";
import { useEffect, useState } from "react";
import { normalizeTableRows } from "../lib/tableRows.js";
import { buildDashboardMetrics, buildDashboardStaffingRows } from "../utils/dashboardMetrics.js";
import { useAuth } from "../context/AuthContext.jsx";
import { resolveEmployeePerson } from "../lib/employeePortalUtils.js";
import { acknowledgementKeys } from "../lib/documentAcknowledgement.js";
import { loadDepartmentHydrants, applyLocalHydrantOverrides } from "../lib/hydrantTenantService.js";
import { currentHydrantYear } from "../lib/hydrantCompletionStats.js";
import HydrantCompletionChart from "./HydrantCompletionChart.jsx";
import DamageFormsPanel from "./DamageFormsPanel.jsx";

import ThemeToggle from "./ThemeToggle.jsx";

function Panel({ title, icon: Icon, action, children, className = "" }) {
  return (
    <section className={`panel ${className}`}>
      <header><div><Icon size={15} /><strong>{title}</strong></div>{action}</header>
      <div className="panel-body">{children}</div>
    </section>
  );
}

function MiniTable({ columns, rows }) {
  const safeRows = normalizeTableRows(rows);
  return (
    <div className="mini-table">
      <div className="mini-row mini-head" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}>
        {columns.map((column) => <span key={column}>{column}</span>)}
      </div>
      {safeRows.map((row, rowIndex) => (
        <div className="mini-row" key={`${row.join("-")}-${rowIndex}`} style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}>
          {row.map((cell, index) => <span key={`${cell}-${index}`}>{cell}</span>)}
        </div>
      ))}
    </div>
  );
}

export default function CommandDashboard({
  onNavigate,
  departmentId = "",
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
  shiftTrades,
  shiftRotation,
  liveDayMetrics = {},
}) {
  const [hydrants, setHydrants] = useState([]);
  const [hydrantsLoading, setHydrantsLoading] = useState(Boolean(departmentId));
  const hydrantYear = currentHydrantYear();

  useEffect(() => {
    let cancelled = false;
    if (!departmentId) {
      setHydrants([]);
      setHydrantsLoading(false);
      return undefined;
    }

    setHydrantsLoading(true);
    loadDepartmentHydrants(departmentId)
      .then((records) => {
        if (cancelled) return;
        setHydrants(applyLocalHydrantOverrides(departmentId, records));
      })
      .catch(() => {
        if (!cancelled) setHydrants([]);
      })
      .finally(() => {
        if (!cancelled) setHydrantsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [departmentId]);

  const { user, membership } = useAuth();
  const viewerPerson = resolveEmployeePerson(Array.isArray(personnel) ? personnel : [], membership, user);
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
    shiftTrades,
    // Documents waiting on the person looking at the dashboard.
    acknowledgementKeys: acknowledgementKeys({ personnelId: viewerPerson?.id || membership?.personnelId, uid: user?.uid }),
  });

  const staffingRows = buildDashboardStaffingRows({
    scheduleDays,
    liveDayMetrics,
    rotation: shiftRotation,
  });

  const kpis = [
    ["Personnel On Duty", metrics.onDuty, `of ${personnel.length} Assigned`, "info", Users, "Personnel"],
    ["Staffing Deficit", metrics.staffingDeficit, metrics.staffingDeficit ? "Below Target" : "Covered", metrics.staffingDeficit ? "critical" : "success", Users, "Scheduling"],
    ["Certifications Expiring", metrics.certsExpiring90, "Next 90 Days", "warning", FileCheck2, "Certifications"],
    ["Training Compliance", `${metrics.trainingCompliance}%`, "Department-wide", metrics.trainingCompliance >= 85 ? "success" : "warning", GraduationCap, "Training"],
    ["Units Available", metrics.unitsAvailable, `of ${apparatus.length} Total`, "success", Truck, "Apparatus"],
    ["Units Out of Service", metrics.unitsOos, "Fleet Status", metrics.unitsOos ? "critical" : "success", Wrench, "Maintenance"],
    ["Inspections Due", metrics.inspectionsDue, "Prevention Queue", "warning", ClipboardCheck, "Inspections Dashboard"],
    ["Open Tasks", metrics.openTasks, "Across All Areas", "info", Activity, "Dashboard"]
  ];

  const actionRows = [
    ...metrics.pendingTrades.slice(0, 2).map((trade) => ({
      title: "Shift trade review",
      detail: trade.requestedBy,
      target: "Scheduling",
      options: { schedulingTab: "trades" },
    })),
    ...metrics.pendingLeave.slice(0, 2).map((leave) => ({
      title: "Leave approval",
      detail: leave.person,
      target: "Scheduling",
    })),
    ...metrics.openWorkOrders.slice(0, 2).map((order) => ({
      title: "Maintenance request",
      detail: `${order.unit} · ${order.id}`,
      target: "Maintenance",
    })),
    ...metrics.overdueInspections.slice(0, 2).map((item) => ({
      title: "Inspection follow-up",
      detail: item.occupancy,
      target: "Inspections Dashboard",
    })),
  ];
  if (metrics.pendingAcknowledgements) {
    actionRows.unshift({
      title: "Documents for you to acknowledge",
      detail: `${metrics.pendingAcknowledgements} documents`,
      target: "SOGs / Policies",
    });
  }

  return (
    <div className="dashboard">
      <section className="dashboard-theme-bar">
        <div className="dashboard-theme-bar-copy">
          <strong>Command Dashboard</strong>
          <span>Operational overview, readiness, and action items</span>
        </div>
        <div className="dashboard-theme-actions">
          <ThemeToggle />
        </div>
      </section>
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
          <Panel title="Staffing Summary" icon={Users} className="panel-light-black-text">
            <MiniTable
              columns={["Date", "Shift", "Staffed", "Minimum", "Status"]}
              rows={staffingRows}
            />
          </Panel>
          <Panel title="Fleet Readiness" icon={Truck} className="panel-light-black-text">
            <MiniTable columns={["Unit", "Status"]} rows={metrics.fleetReadiness} />
          </Panel>
          <Panel
            title="Hydrant Testing Progress"
            icon={Droplets}
            action={(
              <button type="button" className="text-button" onClick={() => onNavigate("Hydrants")}>
                Open hydrants
              </button>
            )}
          >
            <HydrantCompletionChart hydrants={hydrants} year={hydrantYear} loading={hydrantsLoading} />
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
          <Panel title="Work Queue" icon={Activity} action={<button type="button" className="text-button" onClick={() => onNavigate("Scheduling", { schedulingTab: "trades" })}>View all</button>}>
            <div className="operational-notes">
              {actionRows.length ? actionRows.map(({ title, detail, target, options }) => (
                <p key={`${title}-${detail}`}>
                  <time>Today</time>
                  <button type="button" className="link-button" onClick={() => onNavigate(target, options)}><b>{title}</b></button>
                  <span>{detail}</span>
                </p>
              )) : <p><time>Today</time><b>All clear</b><span>No pending command actions</span></p>}
            </div>
          </Panel>
          <Panel title="Damage Forms" icon={AlertTriangle}>
            <DamageFormsPanel departmentId={departmentId} />
          </Panel>
        </div>
        <div className="dashboard-column">
          <h2>Alerts & Trends</h2>
          <Panel title="Certification Expirations" icon={FileCheck2} className="panel-light-black-text">
            <MiniTable columns={["Personnel", "Certification", "Days"]} rows={metrics.expiringCerts.slice(0, 4).map((c) => [c.person, c.type, c.days])} />
          </Panel>
          <Panel title="Inspection Backlog" icon={ClipboardCheck} className="panel-light-black-text">
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
