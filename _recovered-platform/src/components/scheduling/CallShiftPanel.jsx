import { useMemo, useState } from "react";
import {
  ChevronDown, ChevronRight, CirclePlus, History, ListOrdered, PhoneCall, Send, X,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext.jsx";
import { useDropdowns } from "../../context/DropdownContext.jsx";
import { createPersonnelNotification } from "../../lib/notificationService.js";
import {
  buildCallShiftNotificationMessage,
  buildCallShiftPreview,
  buildCallShiftRecord,
  CALL_SHIFT_POSITIONS,
  DEFAULT_CALL_SHIFT_TIERS,
  formatCallShiftStatus,
  listCallShiftHistory,
} from "../../lib/callShiftWorkflow.js";
import { formatDayId } from "../../lib/shiftCalendar.js";
import "../../theme/call-shift.css";

const INFO_SECTIONS = [
  {
    id: "automated",
    title: "Automated Call Shifts",
    body: "Send vacancy-fill requests to ranked personnel using in-app notifications. Tiered messaging lets you start with the same shift seniority list, then expand to all qualified members.",
  },
  {
    id: "tiered",
    title: "Tiered Messaging",
    body: "Each tier waits the configured number of minutes before the next group is notified. Tier 1 targets the selected shift group; later tiers can include all qualified personnel.",
  },
  {
    id: "ranking",
    title: "Advanced Sorting Logic",
    body: "Ranking uses Start Date Ranking first, then hire date, rank order, and name. Excluded members include inactive personnel, leave, wrong shift group, and members already on duty.",
  },
  {
    id: "rules",
    title: "Call Shift Rules",
    body: "Only active personnel matching the selected position/qualifier are eligible. Responses are tracked per tier. SMS and email delivery can be added in a later phase.",
  },
];

function emptyForm(todayId = "") {
  return {
    dayId: todayId,
    shift: "",
    group: "All",
    position: "Firefighter",
    positionsNeeded: 1,
    apparatus: "",
    qualifier: "",
    startDate: todayId,
    startTime: "0700",
    endDate: todayId,
    endTime: "0700",
    deadlineDate: todayId,
    deadlineTime: "1700",
    waitMinutes: 15,
    tieredEnabled: true,
    tiers: DEFAULT_CALL_SHIFT_TIERS,
    message: "",
  };
}

function PreviewList({ title, items = [], emptyLabel = "None" }) {
  return (
    <section className="call-shift-preview-list">
      <header><strong>{title}</strong><span>{items.length}</span></header>
      <ol>
        {items.length ? items.map((item, index) => (
          <li key={item.personnelId || item.name || index}>
            <span>{index + 1}. {item.name}</span>
            <small>{[item.rank, item.shift, item.reason].filter(Boolean).join(" · ")}</small>
          </li>
        )) : <li className="is-empty">{emptyLabel}</li>}
      </ol>
    </section>
  );
}

export default function CallShiftPanel({
  callShifts = [],
  setCallShifts,
  personnel = [],
  roster = [],
  leaveRequests = [],
  shiftTrades = [],
  scheduleDays = [],
  schedulingSettings = {},
  apparatus = [],
  shiftRotation = {},
  profileShifts = [],
  departmentId = "",
  canManage = false,
}) {
  const { user } = useAuth();
  const { getOptions } = useDropdowns();
  const todayId = formatDayId(new Date());
  const [view, setView] = useState("initiate");
  const [form, setForm] = useState(() => emptyForm(todayId));
  const [expandedInfo, setExpandedInfo] = useState("automated");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  const rankOptions = getOptions("ranks");
  const shiftOptions = useMemo(() => {
    const configured = (Array.isArray(profileShifts) ? profileShifts : []).filter(Boolean);
    return ["All", ...configured];
  }, [profileShifts]);

  const preview = useMemo(() => buildCallShiftPreview({
    personnel,
    roster,
    leaveRequests,
    shiftTrades,
    schedulingSettings,
    apparatus,
    scheduleDays,
    rotation: shiftRotation,
    rankOptions,
    dayId: form.dayId,
    shift: form.shift,
    position: form.position,
    group: form.group,
    positionsNeeded: form.positionsNeeded,
    tieredEnabled: form.tieredEnabled,
    tiers: form.tiers,
  }), [
    personnel,
    roster,
    leaveRequests,
    shiftTrades,
    schedulingSettings,
    apparatus,
    scheduleDays,
    shiftRotation,
    rankOptions,
    form,
  ]);

  const history = useMemo(() => listCallShiftHistory(callShifts), [callShifts]);

  function updateForm(patch) {
    setForm((current) => ({ ...current, ...patch }));
  }

  function resetForm() {
    setForm(emptyForm(todayId));
    setMessage("");
  }

  async function handleSend() {
    if (!canManage || !setCallShifts) {
      setMessage("You do not have permission to initiate call shifts.");
      return;
    }
    if (!preview.eligible.length) {
      setMessage("No eligible personnel match this call shift.");
      return;
    }

    setSending(true);
    try {
      const record = buildCallShiftRecord({
        form,
        preview,
        startedBy: user?.displayName || user?.email || "Admin",
        startedByPersonnelId: "",
        existing: callShifts,
      });

      const activeTier = preview.tierPreviews[0];
      const notifyTargets = (activeTier?.candidates || preview.eligible).slice(0, 25);
      const notifiedIds = [];

      if (departmentId) {
        await Promise.all(notifyTargets.map(async (candidate) => {
          if (!candidate.personnelId) return;
          await createPersonnelNotification(departmentId, candidate.personnelId, {
            title: "Call shift opportunity",
            message: buildCallShiftNotificationMessage(record, activeTier),
            module: "Scheduling",
            recordId: record.id,
          });
          notifiedIds.push(candidate.personnelId);
        }));
      }

      record.tierHistory = [{
        tier: 1,
        startedAt: record.createdAt,
        notifiedPersonnelIds: notifiedIds,
      }];

      setCallShifts((current) => [record, ...current]);
      setMessage(`Call shift sent to ${notifiedIds.length} member${notifiedIds.length === 1 ? "" : "s"}.`);
      setView("history");
    } catch (error) {
      console.error("Call shift send failed:", error);
      setMessage("Could not send call shift. Try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="call-shift-page">
      <header className="call-shift-header">
        <div>
          <PhoneCall size={18} />
          <strong>Call Shift</strong>
        </div>
        <div className="call-shift-view-tabs">
          <button type="button" className={view === "initiate" ? "active" : ""} onClick={() => setView("initiate")}>
            <CirclePlus size={14} /> Initiate
          </button>
          <button type="button" className={view === "history" ? "active" : ""} onClick={() => setView("history")}>
            <History size={14} /> History
          </button>
          <button type="button" className={view === "ranking" ? "active" : ""} onClick={() => setView("ranking")}>
            <ListOrdered size={14} /> Ranking
          </button>
        </div>
        {view === "initiate" ? (
          <button type="button" className="secondary-button" onClick={resetForm}>Clear</button>
        ) : null}
      </header>

      {message ? (
        <div className="success-banner">
          {message}
          <button type="button" onClick={() => setMessage("")}><X size={13} /></button>
        </div>
      ) : null}

      {view === "initiate" ? (
        <div className="call-shift-layout">
          <section className="call-shift-form panel">
            <header className="panel-header"><strong>Initiate Call Shift</strong></header>
            <div className="panel-body call-shift-form-grid">
              <label>
                <span>Start Date</span>
                <input type="date" value={form.startDate} onChange={(e) => updateForm({ startDate: e.target.value, dayId: e.target.value })} />
              </label>
              <label>
                <span>Start Time</span>
                <input type="text" value={form.startTime} placeholder="0700 or 7A" onChange={(e) => updateForm({ startTime: e.target.value })} />
              </label>
              <label>
                <span>End Date</span>
                <input type="date" value={form.endDate} onChange={(e) => updateForm({ endDate: e.target.value })} />
              </label>
              <label>
                <span>End Time</span>
                <input type="text" value={form.endTime} placeholder="0700 or 7A" onChange={(e) => updateForm({ endTime: e.target.value })} />
              </label>
              <label>
                <span>Deadline Date</span>
                <input type="date" value={form.deadlineDate} onChange={(e) => updateForm({ deadlineDate: e.target.value })} />
              </label>
              <label>
                <span>Deadline Time</span>
                <input type="text" value={form.deadlineTime} onChange={(e) => updateForm({ deadlineTime: e.target.value })} />
              </label>
              <label>
                <span>Positions Needed</span>
                <input type="number" min="1" value={form.positionsNeeded} onChange={(e) => updateForm({ positionsNeeded: e.target.value })} />
              </label>
              <label>
                <span>Wait Time (minutes)</span>
                <input type="number" min="0" value={form.waitMinutes} onChange={(e) => updateForm({ waitMinutes: e.target.value })} />
              </label>
              <label>
                <span>Shift</span>
                <select value={form.shift} onChange={(e) => updateForm({ shift: e.target.value })}>
                  <option value="">Use calendar shift</option>
                  {shiftOptions.filter((shift) => shift !== "All").map((shift) => (
                    <option key={shift} value={shift}>{shift}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Group</span>
                <select value={form.group} onChange={(e) => updateForm({ group: e.target.value })}>
                  {shiftOptions.map((shift) => <option key={shift} value={shift}>{shift}</option>)}
                </select>
              </label>
              <label>
                <span>Position / Qualifier</span>
                <select value={form.position} onChange={(e) => updateForm({ position: e.target.value })}>
                  {CALL_SHIFT_POSITIONS.map((position) => (
                    <option key={position} value={position}>{position}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Apparatus</span>
                <input type="text" value={form.apparatus} placeholder="Engine 1" onChange={(e) => updateForm({ apparatus: e.target.value })} />
              </label>

              <label className="call-shift-toggle">
                <input
                  type="checkbox"
                  checked={form.tieredEnabled}
                  onChange={(e) => updateForm({ tieredEnabled: e.target.checked })}
                />
                <span>Tiered call shift</span>
              </label>

              <label className="call-shift-message">
                <span>Message</span>
                <textarea rows={4} value={form.message} onChange={(e) => updateForm({ message: e.target.value })} placeholder="Optional instructions for responders..." />
              </label>

              <button
                type="button"
                className="primary-button call-shift-send"
                disabled={!canManage || sending}
                onClick={handleSend}
              >
                <Send size={14} /> {sending ? "Sending..." : "Send Now"}
              </button>
            </div>
          </section>

          <section className="call-shift-preview panel">
            <header className="panel-header"><strong>Call Shift Preview</strong></header>
            <div className="panel-body">
              <dl className="call-shift-preview-meta">
                <div><dt>Required</dt><dd>{preview.summary.requiredPersons}</dd></div>
                <div><dt>Group</dt><dd>{preview.group}</dd></div>
                <div><dt>Shift</dt><dd>{preview.shift || "—"}</dd></div>
                <div><dt>Date</dt><dd>{preview.dateLabel}</dd></div>
                <div><dt>Length</dt><dd>{preview.summary.lengthHours || form.lengthHours || 24} hrs</dd></div>
              </dl>

              <PreviewList title="Call Shift Preview" items={preview.eligible} emptyLabel="No eligible personnel" />
              <PreviewList
                title="Excluded Employees"
                items={preview.excluded.map(({ person, reason }) => ({
                  personnelId: person?.id,
                  name: person?.name || person?.id,
                  rank: person?.rank,
                  shift: person?.shift,
                  reason,
                }))}
                emptyLabel="None excluded"
              />

              {form.tieredEnabled ? preview.tierPreviews.map((tier) => (
                <PreviewList
                  key={tier.tier}
                  title={`Tier ${tier.tier} · ${tier.label}`}
                  items={tier.candidates}
                  emptyLabel="No members in this tier"
                />
              )) : null}
            </div>
          </section>

          <aside className="call-shift-info">
            {INFO_SECTIONS.map((section) => {
              const isOpen = expandedInfo === section.id;
              return (
                <section key={section.id} className={`call-shift-info-card${isOpen ? " is-open" : ""}`}>
                  <button
                    type="button"
                    className="call-shift-info-toggle"
                    onClick={() => setExpandedInfo(isOpen ? "" : section.id)}
                  >
                    {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    <strong>{section.title}</strong>
                  </button>
                  {isOpen ? <p>{section.body}</p> : null}
                </section>
              );
            })}
          </aside>
        </div>
      ) : null}

      {view === "history" ? (
        <section className="panel call-shift-history">
          <header className="panel-header"><strong>Call Shift History</strong></header>
          <div className="panel-body">
            {history.length ? history.map((record) => (
              <article key={record.id} className="call-shift-history-row">
                <div>
                  <strong>{record.dateLabel || record.dayId}</strong>
                  <small>{record.shift} · {record.position} · {formatCallShiftStatus(record)}</small>
                  {record.message ? <p>{record.message}</p> : null}
                </div>
                <span className="call-shift-history-meta">
                  {record.previewSnapshot?.eligible?.length || 0} eligible
                </span>
              </article>
            )) : <p className="auth-help">No call shifts have been initiated yet.</p>}
          </div>
        </section>
      ) : null}

      {view === "ranking" ? (
        <section className="panel call-shift-ranking-guide">
          <header className="panel-header"><strong>Ranking Order</strong></header>
          <div className="panel-body">
            <ol className="call-shift-ranking-steps">
              <li>Start Date Ranking (personnel profile)</li>
              <li>Hire date / secondary start date</li>
              <li>Rank order (Fire Chief → Firefighter)</li>
              <li>Name (A–Z)</li>
            </ol>
            <p className="auth-help">
              Update Start Date Ranking on each member&apos;s personnel profile to control call shift seniority.
            </p>
          </div>
        </section>
      ) : null}
    </section>
  );
}
