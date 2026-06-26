import { useMemo, useState } from "react";
import { CalendarDays, Check, Search, Trash2, X } from "lucide-react";
import {
  advanceLeaveApproval,
  formatTimeLabel,
  isLeavePending,
  leaveStatusDetail,
  matchesLeaveEmployeeSearch,
  resolveLeaveStatusBucket,
} from "../../lib/employeePortalWorkflow.js";
import {
  findPersonnelForLeaveRequest,
  processLeaveDecision,
  restoreLeaveHoursToPerson,
} from "../../lib/leaveAccrualIntegration.js";
import { parseDayId } from "../../lib/shiftCalendar.js";
import "../../theme/leave-requests.css";

const FILTER_OPTIONS = ["All", "Pending", "Approved", "Denied"];

function Badge({ children }) {
  return <span className="badge">{children}</span>;
}

function toneFromBucket(bucket = "") {
  if (bucket === "Approved") return "success";
  if (bucket === "Denied") return "critical";
  if (bucket === "Pending") return "warning";
  return "info";
}

function formatSubmittedAt(value = "") {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatSelectedDatesList(request = {}) {
  const dates = Array.isArray(request.selectedDates) ? request.selectedDates : [];
  if (!dates.length) return request.dates || "—";
  return dates.map((dayId) => {
    const date = parseDayId(dayId);
    return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  }).join(", ");
}

function buildLeaveDetailRows(request = {}) {
  const hoursLabel = request.hours || (request.totalHours ? `${request.totalHours} hrs` : "—");
  const timeLabel = request.startTime
    ? `${formatTimeLabel(request.startTime)}${request.finishTimeLabel ? ` – ${request.finishTimeLabel}` : ""}`
    : "—";

  return [
    ["Request ID", request.id || "—"],
    ["Employee", request.person || "—"],
    ["Personnel ID", request.personnelId || "—"],
    ["Leave Type", request.type || "—"],
    ["Dates", request.dates || "—"],
    ["Selected Days", formatSelectedDatesList(request)],
    ["Total Hours", hoursLabel],
    ["Time Window", timeLabel],
    ["Status", leaveStatusDetail(request)],
    ["Approval Route", request.approvalRoute || "—"],
    ["Assigned Officer", request.assignedOfficer || "—"],
    ["Battalion Chief", request.assignedBattalionChief || "—"],
    ["Submitted", formatSubmittedAt(request.submittedAt)],
    ["Accrual Deducted", request.accrualDeducted ? `${request.accrualDeductedHours || request.totalHours || "—"} hrs` : "No"],
  ];
}

function LeaveRequestModal({
  request,
  onClose,
  onApprove,
  onDeny,
  onDelete,
  canApproveDeny = false,
  canDelete = false,
}) {
  if (!request) return null;
  const pending = isLeavePending(request);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section className="workflow-modal leave-request-modal" onClick={(event) => event.stopPropagation()}>
        <header>
          <strong>{request.person} · {request.type}</strong>
          <button type="button" onClick={onClose} aria-label="Close"><X size={14} /></button>
        </header>
        <div className="modal-content leave-request-modal-body">
          <div className="cert-detail-grid">
            {buildLeaveDetailRows(request).map(([label, value]) => (
              <div key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
        </div>
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>Close</button>
          {canDelete ? (
            <button type="button" className="secondary-button danger-button" onClick={() => onDelete?.(request)}>
              <Trash2 size={14} /> Delete
            </button>
          ) : null}
          {canApproveDeny && pending ? (
            <>
              <button type="button" className="secondary-button" onClick={() => onDeny?.(request)}>
                <X size={14} /> Deny
              </button>
              <button type="button" className="primary-button" onClick={() => onApprove?.(request)}>
                <Check size={14} /> Approve
              </button>
            </>
          ) : null}
        </div>
      </section>
    </div>
  );
}

export default function LeaveRequestsPanel({
  leaveRequests = [],
  setLeaveRequests,
  personnel = [],
  setPersonnel,
  canManage = false,
  allowSelfDeletePending = false,
  selfPersonnelId = "",
  title = "Leave Requests",
  showEmbedded = false,
}) {
  const [filter, setFilter] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [message, setMessage] = useState("");

  const statusCounts = useMemo(() => ({
    Pending: leaveRequests.filter((item) => resolveLeaveStatusBucket(item) === "Pending").length,
    Approved: leaveRequests.filter((item) => resolveLeaveStatusBucket(item) === "Approved").length,
    Denied: leaveRequests.filter((item) => resolveLeaveStatusBucket(item) === "Denied").length,
  }), [leaveRequests]);

  const visibleRequests = useMemo(() => leaveRequests.filter((request) => {
    const bucket = resolveLeaveStatusBucket(request);
    const matchesFilter = filter === "All" || bucket === filter;
    const matchesSearch = matchesLeaveEmployeeSearch(request, searchQuery);
    return matchesFilter && matchesSearch;
  }), [leaveRequests, filter, searchQuery]);

  function canDeleteRequest(request = {}) {
    if (canManage) return Boolean(setLeaveRequests);
    if (!allowSelfDeletePending || !setLeaveRequests) return false;
    if (!isLeavePending(request)) return false;
    if (!selfPersonnelId) return false;
    return String(request.personnelId || "") === String(selfPersonnelId);
  }

  function decideLeave(request, status) {
    if (!setLeaveRequests || !request) return;

    if (status === "Denied") {
      const {
        personnel: nextPersonnel,
        leavePatch,
        message: resultMessage,
        personnelChanged,
      } = processLeaveDecision(request, status, personnel);

      setLeaveRequests((current) => current.map((item) => (
        item.id === request.id ? { ...item, ...leavePatch, approvalStage: "complete" } : item
      )));

      if (personnelChanged && setPersonnel) {
        setPersonnel(nextPersonnel);
      }

      setMessage(resultMessage);
      setSelectedRequest(null);
      return;
    }

    const approvalStep = advanceLeaveApproval(request, status);
    const mergedRequest = { ...request, ...approvalStep.leavePatch };

    if (approvalStep.isFinal) {
      const {
        personnel: nextPersonnel,
        leavePatch,
        message: resultMessage,
        personnelChanged,
      } = processLeaveDecision(mergedRequest, "Approved", personnel);

      setLeaveRequests((current) => current.map((item) => (
        item.id === request.id ? { ...item, ...approvalStep.leavePatch, ...leavePatch } : item
      )));

      if (personnelChanged && setPersonnel) {
        setPersonnel(nextPersonnel);
      }

      setMessage(resultMessage || approvalStep.message);
      setSelectedRequest(null);
      return;
    }

    setLeaveRequests((current) => current.map((item) => (
      item.id === request.id ? { ...item, ...approvalStep.leavePatch } : item
    )));
    setMessage(approvalStep.message);
    setSelectedRequest((current) => (
      current?.id === request.id ? { ...current, ...approvalStep.leavePatch } : current
    ));
  }

  function deleteLeave(request) {
    if (!setLeaveRequests || !request) return;
    if (!canDeleteRequest(request)) return;

    if (request.status === "Approved" && request.accrualDeducted && setPersonnel) {
      const person = findPersonnelForLeaveRequest(personnel, request);
      if (person) {
        const result = restoreLeaveHoursToPerson(person, request);
        if (result.applied) {
          setPersonnel((current) => current.map((item) => (
            item.id === result.person.id ? result.person : item
          )));
        }
      }
    }

    setLeaveRequests((current) => current.filter((item) => item.id !== request.id));
    setMessage(`Leave request for ${request.person || "employee"} deleted.`);
    setSelectedRequest(null);
  }

  const panelBody = (
    <>
      <section className="leave-request-summary">
        {["Pending", "Approved", "Denied"].map((status) => (
          <button
            key={status}
            type="button"
            className={`cert-stat stat-${toneFromBucket(status)}`}
            onClick={() => setFilter(status)}
          >
            <strong>{statusCounts[status] || 0}</strong>
            <span>{status}</span>
          </button>
        ))}
      </section>

      {message ? (
        <div className="success-banner">
          {message}
          <button type="button" onClick={() => setMessage("")}><X size={13} /></button>
        </div>
      ) : null}

      <section className="cert-toolbar leave-request-toolbar">
        <div className="leave-request-toolbar-left">
          <div className="segmented-control leave-request-filters">
            {FILTER_OPTIONS.map((item) => (
              <button
                key={item}
                type="button"
                className={filter === item ? "active" : ""}
                onClick={() => setFilter(item)}
              >
                {item}
              </button>
            ))}
          </div>
          <label className="leave-request-search">
            <Search size={14} aria-hidden="true" />
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search by employee name"
              aria-label="Search leave requests by employee name"
            />
          </label>
        </div>
        <span>{visibleRequests.length} request{visibleRequests.length === 1 ? "" : "s"} shown</span>
      </section>

      <div className="leave-request-table">
        <div className="leave-request-row leave-request-head">
          <span>Employee</span>
          <span>Type</span>
          <span>Dates</span>
          <span>Hours</span>
          <span>Status</span>
          <span />
        </div>
        {visibleRequests.length ? visibleRequests.map((request) => {
          const hoursLabel = request.hours || (request.totalHours ? `${request.totalHours} hrs` : "—");
          return (
            <button
              key={request.id}
              type="button"
              className="leave-request-row leave-request-row-button"
              onClick={() => setSelectedRequest(request)}
            >
              <strong>{request.person}</strong>
              <span>{request.type}</span>
              <span>{request.dates}</span>
              <span>{hoursLabel}</span>
              <div className="leave-request-status-cell">
                <Badge>{request.status}</Badge>
                <small>{leaveStatusDetail(request)}</small>
              </div>
              <span className="leave-request-open-hint">View</span>
            </button>
          );
        }) : (
          <p className="auth-help leave-request-empty">No leave requests match your filters.</p>
        )}
      </div>

      {selectedRequest ? (
        <LeaveRequestModal
          request={selectedRequest}
          onClose={() => setSelectedRequest(null)}
          onApprove={(request) => decideLeave(request, "Approved")}
          onDeny={(request) => decideLeave(request, "Denied")}
          onDelete={deleteLeave}
          canApproveDeny={canManage}
          canDelete={canDeleteRequest(selectedRequest)}
        />
      ) : null}
    </>
  );

  if (showEmbedded) {
    return <div className="leave-requests-panel is-embedded">{panelBody}</div>;
  }

  return (
    <div className="leave-requests-panel">
      <section className="panel">
        <header>
          <div><CalendarDays size={15} /><strong>{title}</strong></div>
          <span className="panel-count">{statusCounts.Pending} pending</span>
        </header>
        <div className="panel-body">{panelBody}</div>
      </section>
    </div>
  );
}
