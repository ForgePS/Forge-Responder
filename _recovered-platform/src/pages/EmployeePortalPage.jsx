import { useMemo, useState } from "react";
import {
  Activity, CalendarDays, Check, CirclePlus, ClipboardCheck, FileCheck2, FileText, Home, Mail, Truck, UserRound, Wrench
} from "lucide-react";
import InternalEmailBoard from "../components/InternalEmailBoard.jsx";
import LeaveRequestForm from "../components/employee/LeaveRequestForm.jsx";
import ShiftTradeForm from "../components/employee/ShiftTradeForm.jsx";
import { createNotification } from "../lib/notificationService.js";
import { writeAuditLog } from "../lib/auditService.js";
import {
  filterEmployeeRoster,
  recordBelongsToEmployee,
  resolveEmployeeApparatus,
  resolveEmployeePerson,
  resolveEmployeeShiftDay,
  trainingBelongsToEmployee
} from "../lib/employeePortalUtils.js";
import {
  buildLeaveApprovalMeta,
  calculateEndTime,
  resolveOfficerName,
  shouldShowOfficerBox,
} from "../lib/employeePortalWorkflow.js";
import { resolveShiftRotation } from "../lib/shiftCalendar.js";
import { hasPermission } from "../lib/permissions.js";
import { useTenant } from "../context/TenantContext.jsx";

const employeeNav = [
  ["My Dashboard", Home],
  ["My Profile", UserRound],
  ["My Schedule", CalendarDays],
  ["My Certifications", FileCheck2],
  ["My Training", Activity],
  ["My Documents", FileText],
  ["Leave Requests", CalendarDays],
  ["Shift Trades", Activity],
  ["Assigned Tasks", ClipboardCheck],
  ["Apparatus Checks", Truck],
  ["Maintenance Issues", Wrench],
  ["Messages", Mail]
];

const defaultLeaveForm = {
  type: "Vacation",
  selectedDates: [],
  dates: "",
  startTime: "0700",
  totalHours: "12",
  finishTime: "1900",
  finishTimeLabel: "19:00",
};

const defaultTradeForm = {
  give: "",
  receive: "",
  giveDayId: "",
  receiveDayId: "",
  giveShift: "",
  receiveShift: "",
  coverage: "",
};

function Panel({ title, icon: Icon, action, children }) {
  return (
    <section className="panel">
      <header><div><Icon size={15} /><strong>{title}</strong></div>{action}</header>
      <div className="panel-body">{children}</div>
    </section>
  );
}

function OfficerBox({ person }) {
  const officerName = resolveOfficerName(person);
  return (
    <div className="employee-officer-box">
      <span>Assigned Officer</span>
      <strong>{officerName || "Not assigned — contact admin"}</strong>
    </div>
  );
}

function buildLeaveApprovalHint(person, personnel, leaveType) {
  const meta = buildLeaveApprovalMeta(person, personnel, leaveType);
  if (meta.approvalRoute === "officer-then-battalion") {
    return `Vacation requests are sent to ${meta.assignedOfficer} for approval, then to ${meta.assignedBattalionChief} for final approval.`;
  }
  if (meta.approvalRoute === "direct-battalion") {
    return `${leaveType} requests go directly to ${meta.assignedBattalionChief} for approval.`;
  }
  return `This request will be sent to ${meta.assignedBattalionChief} for approval.`;
}

function leaveStatusDetail(item = {}) {
  if (item.approvalStage === "officer") {
    return `${item.status} · ${item.assignedOfficer || "Officer"}`;
  }
  if (item.approvalStage === "battalionChief") {
    return `${item.status} · ${item.assignedBattalionChief || "Battalion Chief"}`;
  }
  return item.status;
}

export default function EmployeePortalPage({
  current,
  onNavigate,
  membership,
  user,
  permissions = {},
  showInternalEmail = true,
  personnel = [],
  certifications = [],
  training = [],
  documents = [],
  setDocuments,
  leaveRequests = [],
  setLeaveRequests,
  shiftTrades = [],
  setShiftTrades,
  scheduleDays = [],
  roster = [],
  apparatus = [],
  workOrders = [],
  setWorkOrders,
  shiftRotation,
  profileShifts = [],
}) {
  const { departmentId } = useTenant();
  const [message, setMessage] = useState("");
  const [leaveForm, setLeaveForm] = useState(defaultLeaveForm);
  const [tradeForm, setTradeForm] = useState(defaultTradeForm);
  const [maintenanceForm, setMaintenanceForm] = useState({ unit: "", issue: "" });

  const rotation = useMemo(
    () => resolveShiftRotation(shiftRotation, profileShifts),
    [shiftRotation, profileShifts]
  );

  const myPerson = useMemo(
    () => resolveEmployeePerson(personnel, membership),
    [personnel, membership]
  );

  const showOfficerBox = useMemo(
    () => shouldShowOfficerBox(myPerson || {}),
    [myPerson]
  );

  const leaveApprovalHint = useMemo(
    () => (myPerson ? buildLeaveApprovalHint(myPerson, personnel, leaveForm.type) : ""),
    [myPerson, personnel, leaveForm.type]
  );

  const coverageOptions = useMemo(() => {
    if (!myPerson?.shift) return [];
    const shift = String(myPerson.shift).trim().toLowerCase();
    return personnel
      .filter((person) => (
        person.id !== myPerson.id
        && String(person.shift || "").trim().toLowerCase() === shift
        && String(person.status || "").toLowerCase() !== "inactive"
      ))
      .map((person) => person.name)
      .sort((a, b) => a.localeCompare(b));
  }, [personnel, myPerson]);

  const myShift = useMemo(
    () => resolveEmployeeShiftDay(scheduleDays, myPerson, membership),
    [scheduleDays, myPerson, membership]
  );

  const myCerts = useMemo(
    () => certifications.filter((item) => recordBelongsToEmployee(item, membership, myPerson)),
    [certifications, membership, myPerson]
  );

  const myTraining = useMemo(
    () => training.filter((item) => trainingBelongsToEmployee(item, membership, myPerson)),
    [training, membership, myPerson]
  );

  const myDocs = useMemo(
    () => documents.filter((item) => item.acknowledgementStatus === "Pending"),
    [documents]
  );

  const myLeave = useMemo(
    () => leaveRequests.filter((item) => recordBelongsToEmployee(item, membership, myPerson)),
    [leaveRequests, membership, myPerson]
  );

  const myTrades = useMemo(
    () => shiftTrades.filter((item) => recordBelongsToEmployee(item, membership, myPerson)),
    [shiftTrades, membership, myPerson]
  );

  const myRoster = useMemo(
    () => filterEmployeeRoster(roster, membership, myPerson, myShift),
    [roster, membership, myPerson, myShift]
  );

  const myUnit = useMemo(
    () => resolveEmployeeApparatus(apparatus, myPerson, membership),
    [apparatus, myPerson, membership]
  );

  const trainingDue = myTraining.filter((item) => item.status !== "Complete").length;
  const pendingTrades = myTrades.filter((item) => /pending|awaiting/i.test(item.status || "")).length;
  const certAlerts = myCerts.filter((item) => /due|expired|overdue/i.test(item.status || "")).length;

  const canSubmitLeave = hasPermission(permissions, "submitLeaveRequests") || hasPermission(permissions, "accessAdminRms");
  const canSubmitTrades = hasPermission(permissions, "submitShiftTrades") || hasPermission(permissions, "accessAdminRms");
  const canSubmitMaintenance = hasPermission(permissions, "submitMaintenanceIssues") || hasPermission(permissions, "accessAdminRms");
  const canViewInternalEmail = showInternalEmail && hasPermission(permissions, "viewInternalEmail");
  const portalNav = employeeNav.filter(([name]) => name !== "Messages" || canViewInternalEmail);

  async function logAction(action, module, summary, recordId = "") {
    await writeAuditLog(departmentId, {
      action,
      module,
      recordId,
      summary,
      actorUid: user?.uid,
      actorName: membership?.displayName
    });
    await createNotification(departmentId, {
      userId: "all",
      title: `${module} update`,
      message: summary,
      module,
      recordId
    });
  }

  async function submitLeave() {
    if (!canSubmitLeave) {
      setMessage("Your role cannot submit leave requests.");
      return;
    }
    if (!leaveForm.selectedDates?.length) {
      setMessage("Select at least one day on the calendar for your leave request.");
      return;
    }

    const totalHours = parseFloat(leaveForm.totalHours);
    if (!totalHours || totalHours <= 0) {
      setMessage("Enter the total hours for your leave request.");
      return;
    }

    const endTime = calculateEndTime(leaveForm.startTime, totalHours);
    const approvalMeta = buildLeaveApprovalMeta(myPerson || {}, personnel, leaveForm.type);
    const id = `L-${300 + leaveRequests.length}`;
    const record = {
      id,
      person: myPerson?.name || membership?.displayName || "Employee",
      personnelId: myPerson?.id || membership?.personnelId || "",
      type: leaveForm.type,
      dates: leaveForm.dates,
      selectedDates: leaveForm.selectedDates,
      startTime: leaveForm.startTime,
      totalHours: String(totalHours),
      finishTime: endTime.time,
      finishTimeLabel: endTime.label,
      hours: `${totalHours} hrs`,
      submittedAt: new Date().toISOString(),
      ...approvalMeta,
    };

    setLeaveRequests((current) => [record, ...current]);
    await logAction("create", "Employee Portal", `Leave request submitted by ${record.person}`, id);
    setMessage(`Leave request submitted — ${record.status}`);
    setLeaveForm(defaultLeaveForm);
  }

  async function submitTrade() {
    if (!canSubmitTrades) {
      setMessage("Your role cannot submit shift trades.");
      return;
    }
    if (!tradeForm.giveDayId || !tradeForm.receiveDayId) {
      setMessage("Select both the shift you are giving and the shift you want to receive on the calendars.");
      return;
    }

    const id = `TR-${500 + shiftTrades.length}`;
    const record = {
      id,
      requestedBy: myPerson?.name || membership?.displayName || "Employee",
      personnelId: myPerson?.id || membership?.personnelId || "",
      give: tradeForm.give,
      receive: tradeForm.receive,
      giveDayId: tradeForm.giveDayId,
      receiveDayId: tradeForm.receiveDayId,
      giveShift: tradeForm.giveShift,
      receiveShift: tradeForm.receiveShift,
      coverage: tradeForm.coverage,
      submitted: "Today",
      submittedAt: new Date().toISOString(),
      status: "Pending Review"
    };
    setShiftTrades((current) => [record, ...current]);
    await logAction("create", "Employee Portal", `Shift trade submitted by ${record.requestedBy}`, id);
    setMessage("Shift trade submitted for review");
    setTradeForm(defaultTradeForm);
  }

  async function submitMaintenanceIssue() {
    if (!canSubmitMaintenance) {
      setMessage("Your role cannot submit maintenance issues.");
      return;
    }
    if (!maintenanceForm.unit.trim() || !maintenanceForm.issue.trim()) {
      setMessage("Enter the unit and describe the issue.");
      return;
    }

    const id = `WO-E${26000 + workOrders.length}`;
    const record = {
      id,
      unit: maintenanceForm.unit,
      issue: maintenanceForm.issue,
      category: "General",
      priority: "Medium",
      opened: "Today",
      vendor: "Internal Fleet",
      cost: "Pending",
      status: "Open",
      reportedBy: myPerson?.name || membership?.displayName || "Employee"
    };
    setWorkOrders((current) => [record, ...current]);
    await logAction("create", "Employee Portal", `Maintenance issue reported on ${record.unit}`, id);
    setMessage("Maintenance issue submitted");
    setMaintenanceForm({ unit: "", issue: "" });
  }

  async function acknowledgeDocument(docId) {
    const doc = documents.find((item) => item.id === docId);
    if (!doc || !setDocuments) return;
    setDocuments((current) =>
      current.map((item) => item.id === docId ? { ...item, acknowledgementStatus: "Acknowledged" } : item)
    );
    await logAction("approve", "Documents", `Document acknowledged: ${doc.title}`, docId);
    setMessage(`Acknowledged ${doc.title}`);
  }

  return (
    <div className="employee-portal">
      <section className="module-heading employee-portal-heading">
        <div>
          <span className="module-icon"><UserRound size={22} /></span>
          <div>
            <h1>Employee Portal</h1>
            <p>
              {myPerson?.name || membership?.displayName || "Member"}
              {myPerson?.rank ? ` · ${myPerson.rank}` : ""}
              {myPerson?.shift ? ` · ${myPerson.shift}` : ""}
            </p>
          </div>
        </div>
      </section>

      <section className="cert-toolbar">
        <div className="segmented-control employee-nav-scroll">
          {portalNav.map(([name, Icon]) => (
            <button key={name} className={current === name ? "active" : ""} onClick={() => onNavigate(name)}>{name}</button>
          ))}
        </div>
      </section>
      {message && <div className="success-banner">{message}<button onClick={() => setMessage("")}>×</button></div>}

      {current === "My Dashboard" && (
        <>
          {showOfficerBox && myPerson ? (
            <OfficerBox person={myPerson} />
          ) : null}
          <section className="training-summary">
            {[["Next Shift", myShift ? `${myShift.date} · ${myShift.shift}` : "—", "info"], ["Certification Alerts", certAlerts, certAlerts ? "warning" : "success"], ["Training Due", trainingDue, trainingDue ? "warning" : "success"], ["Documents", myDocs.length, myDocs.length ? "warning" : "success"], ["Pending Trades", pendingTrades, pendingTrades ? "warning" : "info"]].map(([label, value, tone]) => (
              <div key={label} className={`fleet-stat stat-${tone}`}><strong>{value}</strong><span>{label}</span></div>
            ))}
          </section>
          <section className="dashboard-grid">
            <div className="dashboard-column">
              <Panel title="Certification Alerts" icon={FileCheck2}>
                <div className="operational-notes">
                  {myCerts.map((item) => <p key={item.id}><time>{item.expires}</time><b>{item.type}</b><span>{item.status}</span></p>)}
                  {!myCerts.length && <p><b>All clear</b><span>No certification alerts</span></p>}
                </div>
              </Panel>
            </div>
            <div className="dashboard-column">
              <Panel title="Pending Requests" icon={CalendarDays}>
                <div className="operational-notes employee-leave-history">
                  {myLeave.map((item) => (
                    <p key={item.id}>
                      <time>{item.dates}</time>
                      <b>{item.type}</b>
                      <span>{leaveStatusDetail(item)}</span>
                    </p>
                  ))}
                  {myTrades.map((item) => <p key={item.id}><time>{item.submitted}</time><b>Shift trade</b><span>{item.status}</span></p>)}
                  {!myLeave.length && !myTrades.length && <p><b>No pending requests</b><span>Leave and trades will appear here</span></p>}
                </div>
              </Panel>
            </div>
            <div className="dashboard-column">
              <Panel title="Documents to Acknowledge" icon={FileText}>
                <div className="operational-notes">
                  {myDocs.map((item) => <p key={item.id}><time>{item.effectiveDate}</time><b>{item.title}</b><span>{item.category}</span></p>)}
                  {!myDocs.length && <p><b>All caught up</b><span>No pending acknowledgements</span></p>}
                </div>
              </Panel>
            </div>
          </section>
        </>
      )}

      {current === "My Profile" && (
        <Panel title="My Profile" icon={UserRound}>
          {myPerson ? (
            <>
              {showOfficerBox ? <OfficerBox person={myPerson} /> : null}
              <div className="cert-detail-grid">
                {[["Name", myPerson.name], ["ID", myPerson.id], ["Rank", myPerson.rank], ["Shift", myPerson.shift], ["Station", myPerson.station], ["Assignment", myPerson.assignment], ["EMS", myPerson.ems], ["Email", myPerson.email], ["Phone", myPerson.phone]].map(([label, value]) => (
                  <div key={label}><span>{label}</span><strong>{value || "—"}</strong></div>
                ))}
              </div>
            </>
          ) : (
            <p className="auth-help">No personnel profile linked. Ask an admin to link your user to a personnel record in System Admin → Users.</p>
          )}
        </Panel>
      )}

      {current === "My Schedule" && (
        <Panel title="My Schedule" icon={CalendarDays}>
          <div className="cert-detail-grid">
            <div><span>Current Shift Day</span><strong>{myShift ? `${myShift.date} · ${myShift.shift}` : "—"}</strong></div>
            <div><span>Staffing</span><strong>{myShift ? `${myShift.staffed} / ${myShift.minimum}` : "—"}</strong></div>
            <div><span>Your Shift</span><strong>{myPerson?.shift || membership?.assignedShift || "—"}</strong></div>
          </div>
          <div className="mini-table" style={{ marginTop: 12 }}>
            <div className="mini-row mini-head" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}><span>Name</span><span>Apparatus</span><span>Position</span><span>Status</span></div>
            {myRoster.map((row) => <div className="mini-row" key={row.id} style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>{[row.name, row.apparatus, row.position, row.status].map((c, i) => <span key={i}>{c}</span>)}</div>)}
            {!myRoster.length && <p className="empty-table">No roster entries for your shift yet.</p>}
          </div>
        </Panel>
      )}

      {current === "My Certifications" && (
        <Panel title="My Certifications" icon={FileCheck2}>
          <div className="cert-table">
            <div className="cert-row cert-head"><span>Type</span><span>Expires</span><span>Renewal</span><span>Status</span></div>
            {myCerts.map((item) => <div className="cert-row" key={item.id}><span>{item.type}</span><span>{item.expires}</span><span>{item.renewal}</span><span>{item.status}</span></div>)}
            {!myCerts.length && <p className="empty-table">No certifications on file for your profile.</p>}
          </div>
          <p className="auth-help">Upload renewal documents through the admin Certifications module or request admin assistance.</p>
        </Panel>
      )}

      {current === "My Training" && (
        <Panel title="My Training" icon={Activity}>
          <div className="training-table">
            <div className="training-row training-head"><span>Course</span><span>Date</span><span>Completion</span><span>Status</span></div>
            {myTraining.map((item) => <div className="training-row" key={item.id}><span>{item.course}</span><span>{item.date}</span><span>{item.completion}%</span><span>{item.status}</span></div>)}
            {!myTraining.length && <p className="empty-table">No training assigned to your shift or profile yet.</p>}
          </div>
        </Panel>
      )}

      {current === "My Documents" && (
        <Panel title="My Documents" icon={FileText}>
          <div className="document-library">
            {myDocs.map((item) => (
              <div className="doc-row" key={item.id}>
                <span><strong>{item.title}</strong><small>{item.category}</small></span>
                <button className="row-action" onClick={() => acknowledgeDocument(item.id)}>Acknowledge</button>
              </div>
            ))}
            {!myDocs.length && <p className="empty-table">No pending document acknowledgements.</p>}
          </div>
        </Panel>
      )}

      {current === "Leave Requests" && (
        <Panel title="Submit Leave Request" icon={CalendarDays}>
          {canSubmitLeave ? (
            <>
              <LeaveRequestForm
                value={leaveForm}
                onChange={setLeaveForm}
                scheduleDays={scheduleDays}
                rotation={rotation}
                approvalHint={leaveApprovalHint}
              />
              <button className="primary-button" style={{ marginTop: 12 }} onClick={submitLeave}>
                <CirclePlus size={14} /> Submit Leave Request
              </button>
            </>
          ) : (
            <p className="auth-help">Your role can view leave history but cannot submit new requests.</p>
          )}
          <div className="operational-notes employee-leave-history" style={{ marginTop: 16 }}>
            {myLeave.map((item) => (
              <p key={item.id}>
                <time>{item.dates}</time>
                <b>{item.type}</b>
                <span>
                  {leaveStatusDetail(item)}
                  {item.startTime ? ` · ${formatTimeLabel(item.startTime)}-${item.finishTimeLabel || formatTimeLabel(item.finishTime)}` : ""}
                </span>
              </p>
            ))}
            {!myLeave.length && <p><b>No leave requests</b><span>Submitted requests will appear here</span></p>}
          </div>
        </Panel>
      )}

      {current === "Shift Trades" && (
        <Panel title="Submit Shift Trade" icon={Activity}>
          {canSubmitTrades ? (
            <>
              <ShiftTradeForm
                value={tradeForm}
                onChange={setTradeForm}
                scheduleDays={scheduleDays}
                rotation={rotation}
                coverageOptions={coverageOptions}
              />
              <button className="primary-button" style={{ marginTop: 12 }} onClick={submitTrade}>
                <CirclePlus size={14} /> Submit Trade
              </button>
            </>
          ) : (
            <p className="auth-help">Your role can view trades but cannot submit new requests.</p>
          )}
          <div className="operational-notes employee-trade-history" style={{ marginTop: 16 }}>
            {myTrades.map((item) => <p key={item.id}><time>{item.submitted}</time><b>{item.give} → {item.receive}</b><span>{item.status}</span></p>)}
            {!myTrades.length && <p><b>No shift trades</b><span>Submitted trades will appear here</span></p>}
          </div>
        </Panel>
      )}

      {current === "Assigned Tasks" && (
        <Panel title="Assigned Tasks" icon={ClipboardCheck}>
          <p className="auth-help">Assigned operational tasks will appear here when command staff publish tasks for your shift.</p>
        </Panel>
      )}

      {current === "Apparatus Checks" && (
        <Panel title="Apparatus Checks" icon={Truck}>
          {myUnit ? (
            <div className="cert-detail-grid">
              <div><span>Unit</span><strong>{myUnit.unit}</strong></div>
              <div><span>Status</span><strong>{myUnit.status}</strong></div>
              <div><span>Station</span><strong>{myUnit.station}</strong></div>
              <div><span>Operator</span><strong>{myUnit.operator || "Unassigned"}</strong></div>
            </div>
          ) : <p className="auth-help">No apparatus currently assigned to your profile. Ask command staff to update your assignment.</p>}
          <button className="primary-button" style={{ marginTop: 12 }} disabled={!myUnit} onClick={async () => {
            await logAction("create", "Apparatus", `Daily check submitted for ${myUnit?.unit || "unit"}`, myUnit?.id || "");
            setMessage("Apparatus check submitted");
          }}><Check size={14} /> Submit Daily Check</button>
        </Panel>
      )}

      {current === "Messages" && canViewInternalEmail && (
        <Panel title="Messages" icon={Mail}>
          <InternalEmailBoard compact onMessage={setMessage} personnelRecords={personnel} />
        </Panel>
      )}

      {current === "Maintenance Issues" && (
        <Panel title="Report Maintenance Issue" icon={Wrench}>
          {canSubmitMaintenance ? (
            <>
              <div className="workflow-form">
                <label><span>Unit</span><input value={maintenanceForm.unit} onChange={(e) => setMaintenanceForm({ ...maintenanceForm, unit: e.target.value })} placeholder={myUnit?.unit || "Engine 1"} /></label>
                <label className="wide-field"><span>Issue</span><input value={maintenanceForm.issue} onChange={(e) => setMaintenanceForm({ ...maintenanceForm, issue: e.target.value })} placeholder="Describe the issue" /></label>
              </div>
              <button className="primary-button" onClick={submitMaintenanceIssue}><CirclePlus size={14} /> Submit Issue</button>
            </>
          ) : (
            <p className="auth-help">Your role cannot submit maintenance issues.</p>
          )}
        </Panel>
      )}
    </div>
  );
}
