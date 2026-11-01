import { useState } from "react";
import { Activity, Check, CirclePlus, X } from "lucide-react";
import {
  advanceShiftTradeApproval,
  buildShiftTradeApprovalMeta,
  buildShiftTradeLabel,
  shiftLabelForDay,
  getPendingBattalionChiefs,
  inferShiftTradeStage,
  shiftTradeStatusDetail,
} from "../../lib/employeePortalWorkflow.js";
import {
  appendActivityLogToPersonnel,
  buildShiftTradeActivityEntry,
  personHasActivityLogEntry,
} from "../../lib/personnelActivityLog.js";
import { findPersonnelForLeaveRequest } from "../../lib/leaveAccrualIntegration.js";
import { defaultShiftRotation } from "../../data/defaultShiftRotation.js";
import { shortDateLabel, uniqueRecordId } from "../../lib/recordIds.js";
import { exportCsv } from "../../utils/dashboardMetrics.js";

const blankTrade = { personnelId: "", giveDayId: "", receiveDayId: "", coverage: "" };

function Badge({ children }) {
  return <span className="badge">{children}</span>;
}

function Panel({ title, icon: Icon, action, children }) {
  return (
    <section className="panel">
      <header><div><Icon size={15} /><strong>{title}</strong></div>{action}</header>
      <div className="panel-body">{children}</div>
    </section>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <header><strong>{title}</strong><button type="button" onClick={onClose}><X size={14} /></button></header>
        {children}
      </div>
    </div>
  );
}

function toneFromStatus(status) {
  if (status === "Approved") return "success";
  if (status === "Denied") return "critical";
  if (status === "Pending Battalion Chief") return "warning";
  return "info";
}

export default function ShiftTradesPanel({ trades = [], setTrades, personnel = [], setPersonnel, rotation = defaultShiftRotation }) {
  const [filter, setFilter] = useState("All");
  const [showNew, setShowNew] = useState(false);
  const [tradeForm, setTradeForm] = useState(blankTrade);
  const [formError, setFormError] = useState("");
  const people = (Array.isArray(personnel) ? personnel : [])
    .filter((person) => person?.name && !/inactive|separated|retired/i.test(person.status || ""))
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const [message, setMessage] = useState("");
  const visibleTrades = trades.filter((trade) => filter === "All" || trade.status === filter);

  function applyTradeDecision(trade, status, approver = {}) {
    const step = advanceShiftTradeApproval(trade, status, approver);
    const mergedTrade = { ...trade, ...step.tradePatch };

    setTrades((current) => current.map((item) => (
      item.id === trade.id ? mergedTrade : item
    )));

    if (step.isFinal && status === "Approved" && setPersonnel) {
      const entry = buildShiftTradeActivityEntry({ ...mergedTrade, approvedAt: mergedTrade.approvedAt });
      const person = findPersonnelForLeaveRequest(personnel, {
        personnelId: trade.personnelId,
        person: trade.requestedBy,
      });
      if (person && entry && !personHasActivityLogEntry(person, entry.id)) {
        setPersonnel((current) => appendActivityLogToPersonnel(current, person.id, entry));
      }
    }

    setMessage(step.message);
  }

  function decideTrade(id, status) {
    const trade = trades.find((item) => item.id === id);
    if (!trade) return;

    const stage = inferShiftTradeStage(trade);
    if (stage === "coverageMember" && status === "Approved") {
      setMessage(`Awaiting ${trade.assignedCoverageMember || trade.coverage || "coverage member"} approval.`);
      return;
    }

    let approver = {};
    if (stage === "battalionChief") {
      const pending = getPendingBattalionChiefs(trade);
      approver = pending[0] || {};
    }

    applyTradeDecision(trade, status, approver);
  }

  function submitTrade() {
    const requester = people.find((person) => person.id === tradeForm.personnelId);
    if (!requester) { setFormError("Choose the requesting member."); return; }
    if (!tradeForm.giveDayId || !tradeForm.receiveDayId) { setFormError("Choose both the shift to give and the shift to receive."); return; }
    if (!tradeForm.coverage) { setFormError("Choose the coverage member."); return; }
    if (tradeForm.coverage === requester.name) { setFormError("The coverage member must be someone other than the requester."); return; }
    const giveShift = shiftLabelForDay(tradeForm.giveDayId, rotation);
    const receiveShift = shiftLabelForDay(tradeForm.receiveDayId, rotation);
    const form = {
      ...tradeForm,
      give: buildShiftTradeLabel(tradeForm.giveDayId, giveShift),
      receive: buildShiftTradeLabel(tradeForm.receiveDayId, receiveShift),
      giveShift,
      receiveShift,
    };
    const next = {
      id: uniqueRecordId("TR"),
      requestedBy: requester.name,
      personnelId: requester.id,
      give: form.give,
      receive: form.receive,
      giveDayId: form.giveDayId,
      receiveDayId: form.receiveDayId,
      giveShift,
      receiveShift,
      coverage: form.coverage,
      submitted: shortDateLabel(),
      submittedAt: new Date().toISOString(),
      ...buildShiftTradeApprovalMeta(personnel, form, rotation),
    };
    setTrades((current) => [next, ...current]);
    setShowNew(false);
    setTradeForm(blankTrade);
    setFormError("");
    setFilter("All");
    setMessage("New shift trade request submitted — awaiting coverage member approval");
  }

  return (
    <div className="shift-trades-panel">
      <div className="shift-trades-panel-toolbar">
        <p className="auth-help">
          Member swap requests go to the coverage member first, then both affected Battalion Chiefs for approval.
        </p>
        <div className="heading-actions">
          <button type="button" className="secondary-button" disabled={!visibleTrades.length} onClick={() => exportCsv(`shift-trades-${new Date().toISOString().slice(0, 10)}.csv`, visibleTrades.map((t) => ({ Request: t.id, "Requested by": t.requestedBy, Giving: t.give, Receiving: t.receive, Coverage: t.coverage, Submitted: t.submitted, Status: t.status })))}>Export Trades</button>
          <button type="button" className="primary-button" onClick={() => setShowNew(true)}>
            <CirclePlus size={14} /> New Trade Request
          </button>
        </div>
      </div>
      <section className="trade-summary">
        {["Awaiting Member", "Pending Battalion Chief", "Approved", "Denied"].map((status) => (
          <button
            key={status}
            type="button"
            className={`cert-stat stat-${toneFromStatus(status)}`}
            onClick={() => setFilter(status)}
          >
            <strong>{trades.filter((trade) => trade.status === status).length}</strong>
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
      <section className="cert-toolbar">
        <div className="segmented-control">
          {["All", "Awaiting Member", "Pending Battalion Chief", "Approved", "Denied"].map((item) => (
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
        <span>{visibleTrades.length} trade requests shown</span>
      </section>
      <Panel title="Shift Trade Review Queue" icon={Activity} >
        <div className="trade-table">
          <div className="trade-row trade-head">
            <span>Requested By</span><span>Give</span><span>Receive</span><span>Coverage</span><span>Submitted</span><span>Status</span><span />
          </div>
          {visibleTrades.map((trade) => {
            const stage = inferShiftTradeStage(trade);
            const actionable = stage === "battalionChief";
            return (
              <div className="trade-row" key={trade.id}>
                <strong>{trade.requestedBy}</strong>
                <span>{trade.give}</span>
                <span>{trade.receive}</span>
                <span>{trade.coverage}</span>
                <span>{trade.submitted}</span>
                <div>
                  <Badge>{trade.status}</Badge>
                  <small>{shiftTradeStatusDetail(trade)}</small>
                </div>
                <div className="inline-actions">
                  {actionable ? (
                    <>
                      <button type="button" onClick={() => decideTrade(trade.id, "Approved")}><Check size={13} /> Approve</button>
                      <button type="button" onClick={() => decideTrade(trade.id, "Denied")}><X size={13} /> Deny</button>
                    </>
                  ) : (
                    <button type="button" onClick={() => setMessage(`${trade.id} opened for audit review`)}>Open</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Panel>
      {showNew ? (
        <Modal title="New Shift Trade Request" onClose={() => setShowNew(false)}>
          <div className="workflow-form">
            {formError && <p className="form-error" role="alert">{formError}</p>}
            <label><span>Requesting Member</span><select value={tradeForm.personnelId} onChange={(e) => setTradeForm({ ...tradeForm, personnelId: e.target.value })}><option value="">Choose a member</option>{people.map((person) => <option key={person.id} value={person.id}>{person.name}{person.shift ? ` (${person.shift})` : ""}</option>)}</select></label>
            <label><span>Shift to Give</span><input type="date" value={tradeForm.giveDayId} onChange={(e) => setTradeForm({ ...tradeForm, giveDayId: e.target.value })} />{tradeForm.giveDayId && <small>{shiftLabelForDay(tradeForm.giveDayId, rotation)}</small>}</label>
            <label><span>Shift to Receive</span><input type="date" value={tradeForm.receiveDayId} onChange={(e) => setTradeForm({ ...tradeForm, receiveDayId: e.target.value })} />{tradeForm.receiveDayId && <small>{shiftLabelForDay(tradeForm.receiveDayId, rotation)}</small>}</label>
            <label><span>Coverage Member</span><select value={tradeForm.coverage} onChange={(e) => setTradeForm({ ...tradeForm, coverage: e.target.value })}><option value="">Choose a member</option>{people.filter((person) => person.id !== tradeForm.personnelId).map((person) => <option key={person.id} value={person.name}>{person.name}{person.shift ? ` (${person.shift})` : ""}</option>)}</select></label>
          </div>
          <div className="modal-actions">
            <button type="button" className="secondary-button" onClick={() => setShowNew(false)}>Cancel</button>
            <button type="button" className="primary-button" onClick={submitTrade}><Check size={14} /> Submit for Review</button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
