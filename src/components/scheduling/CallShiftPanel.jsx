import { useEffect, useMemo, useState } from "react";
import {
  ChevronDown, ChevronRight, CirclePlus, History, ListOrdered, PhoneCall, Send, Settings2, X,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext.jsx";
import { useDropdowns } from "../../context/DropdownContext.jsx";
import { createPersonnelNotification } from "../../lib/notificationService.js";
import { sendShiftBroadcastSms } from "../../lib/shiftBroadcastSmsService.js";
import {
  buildCallShiftNotificationMessage,
  buildCallShiftPreview,
  buildCallShiftRecord,
  CALL_SHIFT_POSITIONS,
  DEFAULT_CALL_SHIFT_TIERS,
  formatCallShiftStatus,
  listCallShiftHistory,
  resolveCallShiftLengthHours,
} from "../../lib/callShiftWorkflow.js";
import { formatDayId } from "../../lib/shiftCalendar.js";
import { normalizeCallShiftRules } from "../../lib/callShiftRules.js";
import { matchesCallShiftPreviewRank } from "../../lib/callShiftRanking.js";
import { resolveEmployeePerson } from "../../lib/employeePortalUtils.js";
import { getPersonDisplayName } from "../../lib/personnelSchema.js";
import CallShiftRulesPanel from "./CallShiftRulesPanel.jsx";
import CallShiftMultiSelect from "./CallShiftMultiSelect.jsx";
import "../../theme/call-shift.css";

const INFO_SECTIONS = [
  {
    id: "automated",
    title: "Automated Shift Broadcasts",
    body: "Send vacancy-fill requests to ranked personnel using in-app notifications and optional SMS. Tiered messaging lets you start with the same shift seniority list, then expand to all qualified members.",
  },
  {
    id: "tiered",
    title: "Tiered Messaging",
    body: "Each tier waits the configured number of minutes before the next group is notified. Tier 1 targets the selected shift group; later tiers can include all qualified personnel.",
  },
  {
    id: "ranking",
    title: "Advanced Sorting Logic",
    body: "You can rank and sort shift broadcasts based on your department's rules. In addition, you have the flexibility to add sorting logic at any time.",
  },
  {
    id: "rules",
    title: "Shift Broadcast Rules",
    body: "Drive compliance with flexible shift broadcast rules, including qualifier matching, global ranking, tie breakers, and default rule fallback.",
  },
];

function emptyForm(todayId = "") {
  return {
    dayId: todayId,
    shift: "",
    groups: [],
    rotations: [],
    positionsNeeded: 1,
    apparatus: "",
    qualifiers: [],
    ranks: [],
    startDate: todayId,
    startTime: "0700",
    endDate: todayId,
    endTime: "0700",
    deadlineDate: todayId,
    deadlineTime: "1700",
    waitMinutes: 15,
    waitEnabled: true,
    tieredEnabled: true,
    tiers: DEFAULT_CALL_SHIFT_TIERS,
    tierConfig: {
      deadlineDate: todayId,
      deadlineTime: "1700",
      qualifier: "Firefighter",
      waitMinutes: 15,
    },
    message: "",
    notifyInApp: true,
    notifySms: false,
  };
}

function formatMultiSelectSummary(values = [], emptyLabel = "All") {
  const list = (Array.isArray(values) ? values : [])
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  if (!list.length) return emptyLabel;
  if (list.length <= 2) return list.join(", ");
  return `${list.length} selected`;
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

function CallShiftInfoAside({ expandedInfo, onToggleSection }) {
  return (
    <aside className="call-shift-info">
      {INFO_SECTIONS.map((section) => {
        const isOpen = expandedInfo === section.id;
        return (
          <section key={section.id} className={`call-shift-info-card${isOpen ? " is-open" : ""}`}>
            <button
              type="button"
              className="call-shift-info-toggle"
              onClick={() => onToggleSection(isOpen ? "" : section.id)}
            >
              {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              <strong>{section.title}</strong>
            </button>
            {isOpen ? <p>{section.body}</p> : null}
          </section>
        );
      })}
    </aside>
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
  callShiftRules = [],
  canManage = false,
}) {
  const { user, membership } = useAuth();
  const { getOptions } = useDropdowns();
  const todayId = formatDayId(new Date());
  const [view, setView] = useState("initiate");
  const [form, setForm] = useState(() => emptyForm(todayId));
  const [expandedInfo, setExpandedInfo] = useState("ranking");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [previewRankTab, setPreviewRankTab] = useState("");

  const positionDropdownOptions = getOptions("personnelPositions");
  const qualifierOptions = getOptions("personnelQualifiers");
  const shiftOptions = useMemo(() => {
    const configured = (Array.isArray(profileShifts) ? profileShifts : []).filter(Boolean);
    return configured;
  }, [profileShifts]);

  const qualifierMultiOptions = useMemo(() => {
    const extras = CALL_SHIFT_POSITIONS.filter((option) => (
      option !== "Any" && !qualifierOptions.includes(option)
    ));
    return [...qualifierOptions, ...extras];
  }, [qualifierOptions]);

  const normalizedRules = useMemo(() => normalizeCallShiftRules(callShiftRules), [callShiftRules]);

  const submittedByPerson = useMemo(
    () => resolveEmployeePerson(personnel, membership, user),
    [personnel, membership, user]
  );

  const submittedByName = useMemo(() => {
    if (submittedByPerson) return getPersonDisplayName(submittedByPerson);
    if (membership?.displayName) return membership.displayName;
    if (user?.displayName) return user.displayName;
    return "Admin";
  }, [submittedByPerson, membership, user]);

  const preview = useMemo(() => buildCallShiftPreview({
    personnel,
    roster,
    leaveRequests,
    shiftTrades,
    schedulingSettings,
    apparatus,
    scheduleDays,
    rotation: shiftRotation,
    positionOptions: positionDropdownOptions,
    dayId: form.dayId,
    shift: form.shift,
    groups: form.groups,
    rotations: form.rotations,
    ranks: form.ranks,
    positionsNeeded: form.positionsNeeded,
    tieredEnabled: form.tieredEnabled,
    tiers: form.tiers,
    callShiftRules: normalizedRules,
    qualifiers: form.qualifiers,
  }), [
    personnel,
    roster,
    leaveRequests,
    shiftTrades,
    schedulingSettings,
    apparatus,
    scheduleDays,
    shiftRotation,
    positionDropdownOptions,
    form,
    normalizedRules,
  ]);

  const previewPositionTabs = useMemo(
    () => preview.rankPreviews?.map((entry) => entry.rank).filter(Boolean) || [],
    [preview.rankPreviews]
  );

  useEffect(() => {
    if (!previewPositionTabs.length) return;
    if (!previewRankTab || !previewPositionTabs.includes(previewRankTab)) {
      setPreviewRankTab(previewPositionTabs[0]);
    }
  }, [previewPositionTabs, previewRankTab]);
  const activeRankPreview = useMemo(() => (
    preview.rankPreviews?.find((entry) => entry.rank === previewRankTab)
    || preview.rankPreviews?.[0]
    || { rank: previewRankTab, eligible: preview.eligible }
  ), [preview, previewRankTab]);

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
      setMessage("You do not have permission to initiate shift broadcasts.");
      return;
    }
    if (!form.notifyInApp && !form.notifySms) {
      setMessage("Select at least one notification channel (In-app or SMS).");
      return;
    }
    if (!preview.eligible.length) {
      setMessage("No eligible personnel match this shift broadcast.");
      return;
    }

    setSending(true);
    try {
      const record = buildCallShiftRecord({
        form,
        preview,
        startedBy: submittedByName,
        startedByPersonnelId: submittedByPerson?.id || membership?.personnelId || "",
        existing: callShifts,
      });

      const activeTier = preview.tierPreviews[0];
      const notifyTargets = (activeTier?.candidates || preview.eligible).slice(0, 25);
      const targetIds = notifyTargets.map((candidate) => candidate.personnelId).filter(Boolean);
      const notifiedIds = [];

      if (form.notifyInApp && departmentId) {
        await Promise.all(notifyTargets.map(async (candidate) => {
          if (!candidate.personnelId) return;
          await createPersonnelNotification(departmentId, candidate.personnelId, {
            title: "Shift broadcast opportunity",
            message: buildCallShiftNotificationMessage(record, activeTier),
            module: "Scheduling",
            recordId: record.id,
          });
          notifiedIds.push(candidate.personnelId);
        }));
      }

      let smsSummary = null;
      if (form.notifySms) {
        if (!departmentId) {
          setMessage("SMS requires an active department. In-app notifications were not sent.");
          return;
        }
        try {
          smsSummary = await sendShiftBroadcastSms({
            departmentId,
            broadcastId: record.id,
            personnelIds: targetIds,
            message: form.message,
            record,
          });
        } catch (error) {
          console.error("Shift broadcast SMS failed:", error);
          smsSummary = {
            sent: 0,
            attempted: targetIds.length,
            failed: [{ error: error.message || "SMS delivery unavailable" }],
          };
        }
        record.smsSummary = smsSummary;
      }

      record.tierHistory = [{
        tier: 1,
        startedAt: record.createdAt,
        notifiedPersonnelIds: notifiedIds,
        smsSentCount: smsSummary?.sent || 0,
      }];

      setCallShifts((current) => [record, ...current]);

      const parts = [];
      if (form.notifyInApp) {
        parts.push(`${notifiedIds.length} in-app`);
      }
      if (form.notifySms && smsSummary) {
        const smsFailed = smsSummary.failed?.length || 0;
        parts.push(`${smsSummary.sent || 0} SMS${smsFailed ? ` (${smsFailed} failed)` : ""}`);
      }
      setMessage(`Shift broadcast sent: ${parts.join(", ")}.`);
      setView("history");
    } catch (error) {
      console.error("Shift broadcast send failed:", error);
      setMessage("Could not send shift broadcast. Try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="call-shift-page">
      <header className="call-shift-header call-shift-header-anchor">
        <div className="call-shift-header-start">
          <div className="call-shift-header-brand">
            <PhoneCall size={18} />
            <strong>Shift Broadcast</strong>
          </div>
          <div className="call-shift-view-tabs" role="tablist" aria-label="Shift broadcast views">
            <button type="button" role="tab" aria-selected={view === "initiate"} className={view === "initiate" ? "active" : ""} onClick={() => setView("initiate")}>
              <CirclePlus size={14} /> Initiate
            </button>
            <button type="button" role="tab" aria-selected={view === "history"} className={view === "history" ? "active" : ""} onClick={() => setView("history")}>
              <History size={14} /> History
            </button>
            <button type="button" role="tab" aria-selected={view === "ranking"} className={view === "ranking" ? "active" : ""} onClick={() => setView("ranking")}>
              <ListOrdered size={14} /> Ranking
            </button>
            <button type="button" role="tab" aria-selected={view === "rules"} className={view === "rules" ? "active" : ""} onClick={() => setView("rules")}>
              <Settings2 size={14} /> Rules
            </button>
          </div>
        </div>
        {view === "initiate" ? (
          <div className="call-shift-header-actions">
            <button type="button" className="secondary-button" onClick={resetForm}>Clear</button>
          </div>
        ) : null}
      </header>

      <div className="call-shift-view-body">
      {message ? (
        <div className="success-banner">
          {message}
          <button type="button" onClick={() => setMessage("")}><X size={13} /></button>
        </div>
      ) : null}

      {view === "initiate" ? (
        <div className="call-shift-layout">
          <section className="call-shift-form panel">
            <header className="panel-header"><strong>Initiate Shift Broadcast</strong></header>
            <div className="panel-body call-shift-form-grid">
              <label>
                <span>Positions Needed</span>
                <input type="number" min="1" value={form.positionsNeeded} onChange={(e) => updateForm({ positionsNeeded: e.target.value })} />
              </label>
              <label className="call-shift-field-wide">
                <span>Qualifiers</span>
                <CallShiftMultiSelect
                  options={qualifierMultiOptions}
                  value={form.qualifiers}
                  placeholder="All qualifiers"
                  onChange={(qualifiers) => updateForm({ qualifiers })}
                />
              </label>
              <label className="call-shift-field-wide">
                <span>Groups</span>
                <CallShiftMultiSelect
                  options={shiftOptions}
                  value={form.groups}
                  placeholder="All groups"
                  onChange={(groups) => updateForm({ groups })}
                />
              </label>
              <label className="call-shift-field-wide">
                <span>Positions</span>
                <CallShiftMultiSelect
                  options={positionDropdownOptions}
                  value={form.ranks}
                  placeholder="All positions"
                  onChange={(ranks) => updateForm({ ranks })}
                />
              </label>
              <label className="call-shift-field-wide">
                <span>Rotations</span>
                <CallShiftMultiSelect
                  options={shiftOptions}
                  value={form.rotations}
                  placeholder="All rotations"
                  onChange={(rotations) => updateForm({ rotations })}
                />
              </label>
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
              <label className="call-shift-wait-row">
                <span>Wait Time (minutes)</span>
                <div className="call-shift-wait-controls">
                  <input
                    type="number"
                    min="0"
                    value={form.waitMinutes}
                    disabled={!form.waitEnabled}
                    onChange={(e) => updateForm({ waitMinutes: e.target.value })}
                  />
                  <label className="call-shift-toggle call-shift-wait-toggle">
                    <input
                      type="checkbox"
                      checked={form.waitEnabled}
                      onChange={(e) => updateForm({ waitEnabled: e.target.checked })}
                    />
                    <span>Enabled</span>
                  </label>
                </div>
              </label>
              <label>
                <span>Shift Override</span>
                <select value={form.shift} onChange={(e) => updateForm({ shift: e.target.value })}>
                  <option value="">Use calendar shift</option>
                  {shiftOptions.filter((shift) => shift !== "All").map((shift) => (
                    <option key={shift} value={shift}>{shift}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Apparatus</span>
                <input type="text" value={form.apparatus} placeholder="Engine 1" onChange={(e) => updateForm({ apparatus: e.target.value })} />
              </label>

              <label className="call-shift-toggle call-shift-tier-toggle">
                <input
                  type="checkbox"
                  checked={form.tieredEnabled}
                  onChange={(e) => updateForm({ tieredEnabled: e.target.checked })}
                />
                <span>Tiered shift broadcast</span>
              </label>

              {form.tieredEnabled ? (
                <section className="call-shift-tier-box">
                  <strong>Tier 1 settings</strong>
                  <div className="call-shift-tier-grid">
                    <label>
                      <span>Deadline Date</span>
                      <input
                        type="date"
                        value={form.tierConfig.deadlineDate}
                        onChange={(e) => updateForm({
                          tierConfig: { ...form.tierConfig, deadlineDate: e.target.value },
                        })}
                      />
                    </label>
                    <label>
                      <span>Deadline Time</span>
                      <input
                        type="text"
                        value={form.tierConfig.deadlineTime}
                        onChange={(e) => updateForm({
                          tierConfig: { ...form.tierConfig, deadlineTime: e.target.value },
                        })}
                      />
                    </label>
                    <label>
                      <span>Qualifier</span>
                      <select
                        value={form.tierConfig.qualifier}
                        onChange={(e) => updateForm({
                          tierConfig: { ...form.tierConfig, qualifier: e.target.value },
                        })}
                      >
                        {qualifierOptions.map((option) => (
                          <option key={option} value={option}>{option}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>Wait Time (minutes)</span>
                      <input
                        type="number"
                        min="0"
                        value={form.tierConfig.waitMinutes}
                        onChange={(e) => updateForm({
                          tierConfig: { ...form.tierConfig, waitMinutes: e.target.value },
                          tiers: form.tiers.map((tier, index) => (
                            index === 0 ? { ...tier, waitMinutes: Number.parseInt(e.target.value, 10) || 0 } : tier
                          )),
                        })}
                      />
                    </label>
                  </div>
                </section>
              ) : null}

              <fieldset className="call-shift-channels">
                <legend>Notification channels</legend>
                <label className="call-shift-toggle">
                  <input
                    type="checkbox"
                    checked={form.notifyInApp}
                    onChange={(e) => updateForm({ notifyInApp: e.target.checked })}
                  />
                  <span>In-app notification</span>
                </label>
                <label className="call-shift-toggle">
                  <input
                    type="checkbox"
                    checked={form.notifySms}
                    onChange={(e) => updateForm({ notifySms: e.target.checked })}
                  />
                  <span>SMS text message</span>
                </label>
                {form.notifySms ? (
                  <p className="call-shift-channel-note">
                    SMS is sent to personnel with a valid mobile number on file.
                  </p>
                ) : null}
              </fieldset>

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
            <header className="panel-header">
              <strong>Shift Broadcast Preview</strong>
              <div className="call-shift-preview-rank-tabs">
                {previewPositionTabs.map((position) => (
                  <button
                    key={position}
                    type="button"
                    className={previewRankTab === position ? "active" : ""}
                    onClick={() => setPreviewRankTab(position)}
                  >
                    {position}
                  </button>
                ))}
              </div>
            </header>
            <div className="panel-body">
              <dl className="call-shift-preview-meta">
                <div><dt>Required</dt><dd>{preview.summary.requiredPersons}</dd></div>
                <div><dt>Groups</dt><dd>{formatMultiSelectSummary(form.groups)}</dd></div>
                <div><dt>Qualifiers</dt><dd>{formatMultiSelectSummary(form.qualifiers)}</dd></div>
                <div><dt>Positions</dt><dd>{formatMultiSelectSummary(form.ranks)}</dd></div>
                <div><dt>Rotations</dt><dd>{formatMultiSelectSummary(form.rotations)}</dd></div>
                <div><dt>Date</dt><dd>{preview.dateLabel}</dd></div>
                <div><dt>Rule</dt><dd>{preview.summary.ruleName || "Default Rule"}</dd></div>
                <div><dt>Length</dt><dd>{resolveCallShiftLengthHours(form.startTime, form.endTime)} hrs</dd></div>
                <div><dt>Started by</dt><dd>{submittedByName}</dd></div>
              </dl>

              <PreviewList
                title={`Shift Broadcast Preview · ${activeRankPreview.rank}`}
                items={activeRankPreview.eligible}
                emptyLabel="No eligible personnel for this position"
              />
              <PreviewList
                title="Excluded Employees"
                items={preview.excluded.map(({ person, reason }) => ({
                  personnelId: person?.id,
                  name: person?.name || person?.id,
                  rank: person?.position || person?.rank,
                  shift: person?.shift,
                  reason,
                }))}
                emptyLabel="None excluded"
              />

              {form.tieredEnabled ? (
                <section className="call-shift-tier-preview-block">
                  <header><strong>Tiered Shift Broadcast Preview</strong></header>
                  {preview.tierPreviews.map((tier) => (
                    <PreviewList
                      key={tier.tier}
                      title={`Tier ${tier.tier} · ${tier.label}`}
                      items={tier.candidates.filter((entry) => (
                        matchesCallShiftPreviewRank(entry.position || entry.rank, previewRankTab)
                      ))}
                      emptyLabel="No members in this tier"
                    />
                  ))}
                </section>
              ) : null}
            </div>
          </section>

          <CallShiftInfoAside
            expandedInfo={expandedInfo}
            onToggleSection={setExpandedInfo}
          />
        </div>
      ) : null}

      {view === "history" ? (
        <div className="call-shift-layout call-shift-layout-secondary">
          <section className="panel call-shift-history call-shift-main-panel">
            <header className="panel-header"><strong>Shift Broadcast History</strong></header>
            <div className="panel-body">
              {history.length ? history.map((record) => (
                <article key={record.id} className="call-shift-history-row">
                  <div>
                    <strong>{record.dateLabel || record.dayId}</strong>
                    <small>{record.shift} · {record.position} · {formatCallShiftStatus(record)}</small>
                    {record.notifyChannels?.length ? (
                      <small className="call-shift-history-channels">
                        {record.notifyChannels.join(" · ")}
                        {record.smsSummary?.sent ? ` · ${record.smsSummary.sent} SMS sent` : ""}
                      </small>
                    ) : null}
                    {record.message ? <p>{record.message}</p> : null}
                  </div>
                  <span className="call-shift-history-meta">
                    {record.previewSnapshot?.eligible?.length || 0} eligible
                  </span>
                </article>
              )) : <p className="auth-help">No shift broadcasts have been initiated yet.</p>}
            </div>
          </section>
          <CallShiftInfoAside
            expandedInfo={expandedInfo}
            onToggleSection={setExpandedInfo}
          />
        </div>
      ) : null}

      {view === "rules" ? (
        <div className="call-shift-layout call-shift-layout-secondary">
          <div className="call-shift-main-panel">
          <CallShiftRulesPanel
            rules={normalizedRules}
            canManage={canManage}
            onMessage={setMessage}
          />
          </div>
          <CallShiftInfoAside
            expandedInfo={expandedInfo}
            onToggleSection={setExpandedInfo}
          />
        </div>
      ) : null}

      {view === "ranking" ? (
        <div className="call-shift-layout call-shift-layout-secondary">
          <section className="panel call-shift-ranking-guide call-shift-main-panel">
            <header className="panel-header"><strong>Ranking Order</strong></header>
            <div className="panel-body">
              <ol className="call-shift-ranking-steps">
                <li>Start Date Ranking (personnel profile)</li>
                <li>Hire date / secondary start date</li>
                <li>Position order (Command → Firefighter)</li>
                <li>Name (A–Z)</li>
              </ol>
              <p className="auth-help">
                Update Start Date Ranking on each member&apos;s personnel profile to control shift broadcast seniority.
              </p>
            </div>
          </section>
          <CallShiftInfoAside
            expandedInfo={expandedInfo}
            onToggleSection={setExpandedInfo}
          />
        </div>
      ) : null}
      </div>
    </section>
  );
}
