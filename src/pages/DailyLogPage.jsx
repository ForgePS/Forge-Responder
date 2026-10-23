import { useEffect, useMemo, useState } from "react";
import {
  BookOpen, ChevronDown, ChevronRight, CirclePlus, Lock, LockOpen, Save, X,
} from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { useDropdowns } from "../context/DropdownContext.jsx";
import ManagedSelect from "../components/ManagedSelect.jsx";
import { resolveEmployeePerson } from "../lib/employeePortalUtils.js";
import {
  applyAutoLocksToDailyLogs,
  dailyLogLockStatus,
  DEFAULT_SHIFT_CHANGE_TIME,
  formatAutoLockLabel,
  isDailyLogLocked,
  lockDailyLogRecord,
  resolveAutoLockAt,
  unlockDailyLogRecord,
} from "../lib/dailyLogLock.js";
import {
  buildDailyLogId,
  createEmptyDailyLog,
  dailyLogSummary,
  normalizeDailyLogRecord,
} from "../lib/dailyLogSchema.js";
import { getPersonDisplayName } from "../lib/personnelSchema.js";
import {
  resolveDailyLogApparatusOptions,
  resolveDailyLogCrewForApparatus,
  resolveDailyLogScheduleDefaults,
} from "../lib/schedulingRoster.js";
import {
  resolveDailyLogDefaultDate,
  resolveDailyLogDefaultFilterShift,
  resolveDailyLogShiftForDate,
} from "../lib/dailyLogSchedule.js";
import { formatDayId, parseDayId } from "../lib/shiftCalendar.js";
import "../theme/daily-log.css";

function Badge({ children, tone = "neutral" }) {
  return <span className={`daily-log-badge daily-log-badge-${tone}`}>{children}</span>;
}

function Panel({ title, icon: Icon, action, children }) {
  return (
    <section className="panel">
      <header className="panel-header">
        <div><Icon size={16} /> <strong>{title}</strong></div>
        {action}
      </header>
      <div className="panel-body">{children}</div>
    </section>
  );
}

function sortDailyLogs(records = []) {
  return [...records].sort((a, b) => {
    const dateCompare = String(b.date || "").localeCompare(String(a.date || ""));
    if (dateCompare) return dateCompare;
    const shiftCompare = String(a.shift || "").localeCompare(String(b.shift || ""));
    if (shiftCompare) return shiftCompare;
    return String(a.apparatus || "").localeCompare(String(b.apparatus || ""));
  });
}

function resolveActorName(user) {
  return user?.displayName || user?.email || "User";
}

export default function DailyLogPage({
  records = [],
  setRecords,
  personnel = [],
  apparatus = [],
  roster = [],
  leaveRequests = [],
  shiftTrades = [],
  scheduleDays = [],
  schedulingSettings = {},
  profileShifts = [],
  shiftRotation = {},
  shiftChangeTime = DEFAULT_SHIFT_CHANGE_TIME,
  query = "",
  canEdit = false,
  canUnlock = false,
  actingPerson = null,
}) {
  const { user, membership } = useAuth();
  const { getOptions } = useDropdowns();
  const actorName = resolveActorName(user);
  const today = formatDayId(new Date());
  const schedulePerson = actingPerson || resolveEmployeePerson(personnel, membership, user);
  const defaultFilterDate = useMemo(
    () => resolveDailyLogDefaultDate({
      person: schedulePerson,
      shiftRotation,
      profileShifts,
    }),
    [schedulePerson, shiftRotation, profileShifts]
  );
  const defaultFilterShift = useMemo(
    () => resolveDailyLogDefaultFilterShift({
      person: schedulePerson,
      shiftRotation,
      profileShifts,
    }),
    [schedulePerson, shiftRotation, profileShifts]
  );

  const [selectedId, setSelectedId] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [filterDate, setFilterDate] = useState(defaultFilterDate);
  const [filterShift, setFilterShift] = useState(defaultFilterShift);
  const [message, setMessage] = useState("");
  const [draft, setDraft] = useState(null);
  const [crewExpanded, setCrewExpanded] = useState(false);

  const shiftOptions = useMemo(() => {
    const configured = getOptions("shifts");
    const profile = (Array.isArray(profileShifts) ? profileShifts : []).filter(Boolean);
    return [...new Set([...configured, ...profile])].filter((shift) => !/^administration$/i.test(shift));
  }, [getOptions, profileShifts]);

  const draftApparatusOptions = useMemo(() => {
    const shift = draft?.shift || (filterShift !== "All" ? filterShift : "");
    const options = resolveDailyLogApparatusOptions({
      schedulingSettings,
      apparatus,
      roster,
      personnel,
      leaveRequests,
      date: draft?.date || filterDate || today,
      shift,
    });
    if (draft?.apparatus && !options.includes(draft.apparatus)) {
      return [...options, draft.apparatus];
    }
    return options;
  }, [
    draft?.shift,
    draft?.date,
    draft?.apparatus,
    schedulingSettings,
    apparatus,
    roster,
    personnel,
    leaveRequests,
    filterDate,
    filterShift,
    today,
  ]);

  useEffect(() => {
    const tick = () => {
      setRecords((current) => {
        const next = applyAutoLocksToDailyLogs(current, shiftChangeTime);
        return next === current ? current : next;
      });
    };

    tick();
    const timer = window.setInterval(tick, 60000);
    return () => window.clearInterval(timer);
  }, [setRecords, shiftChangeTime]);

  const visibleRecords = useMemo(() => {
    const haystack = String(query || "").trim().toLowerCase();
    return sortDailyLogs(records).filter((record) => {
      if (filterDate && record.date !== filterDate) return false;
      if (filterShift !== "All" && record.shift !== filterShift) return false;
      if (!haystack) return true;
      const text = [
        record.date,
        record.shift,
        record.apparatus,
        ...(record.crew || []),
        record.notes,
      ].join(" ").toLowerCase();
      return text.includes(haystack);
    });
  }, [records, filterDate, filterShift, query]);

  useEffect(() => {
    if (!visibleRecords.length) {
      if (!isCreating) setSelectedId("");
      return;
    }
    if (!isCreating && !visibleRecords.some((record) => record.id === selectedId)) {
      setSelectedId(visibleRecords[0].id);
    }
  }, [visibleRecords, selectedId, isCreating]);

  const selected = !isCreating
    ? (visibleRecords.find((record) => record.id === selectedId)
      || records.find((record) => record.id === selectedId)
      || null)
    : null;

  useEffect(() => {
    if (isCreating) return;
    if (!selected) {
      setDraft(null);
      return;
    }
    setDraft(normalizeDailyLogRecord(selected));
    setCrewExpanded(false);
  }, [selected, isCreating]);

  const selectedLocked = selected
    ? isDailyLogLocked(selected, shiftChangeTime)
    : false;
  const canEditDraft = canEdit && (isCreating || !selectedLocked || canUnlock);
  const lockStatus = selected ? dailyLogLockStatus(selected, shiftChangeTime) : null;

  const crewCandidates = useMemo(() => {
    if (!draft?.shift) return [];
    const scheduledNames = new Set(
      (draft?.apparatus
        ? resolveDailyLogCrewForApparatus({
          schedulingSettings,
          apparatus,
          roster,
          personnel,
          leaveRequests,
          shiftTrades,
          date: draft.date || filterDate || today,
          shift: draft.shift,
          unit: draft.apparatus,
        }).map((member) => member.name)
        : []
      ).filter(Boolean)
    );
    const selectedNames = new Set(Array.isArray(draft?.crew) ? draft.crew : []);

    return (Array.isArray(personnel) ? personnel : [])
      .filter((person) => String(person.status || "Active").toLowerCase() === "active")
      .filter((person) => !draft.shift || person?.shift === draft.shift)
      .sort((left, right) => {
        const leftName = getPersonDisplayName(left);
        const rightName = getPersonDisplayName(right);
        const leftScheduled = scheduledNames.has(leftName) || selectedNames.has(leftName);
        const rightScheduled = scheduledNames.has(rightName) || selectedNames.has(rightName);
        if (leftScheduled !== rightScheduled) return leftScheduled ? -1 : 1;
        return leftName.localeCompare(rightName);
      });
  }, [
    personnel,
    draft?.shift,
    draft?.date,
    draft?.apparatus,
    draft?.crew,
    schedulingSettings,
    apparatus,
    roster,
    leaveRequests,
    shiftTrades,
    filterDate,
    today,
  ]);

  function resolveShiftForLogDate(dayId, draftShift = "") {
    return resolveDailyLogShiftForDate({
      dayId,
      scheduleDays,
      shiftRotation,
      profileShifts,
    }) || draftShift || shiftOptions[0] || "";
  }

  function buildScheduleDefaults(date, shift, unit = "") {
    return resolveDailyLogScheduleDefaults({
      personnelId: schedulePerson?.id || "",
      unit,
      date,
      shift,
      schedulingSettings,
      apparatus,
      roster,
      personnel,
      leaveRequests,
      shiftTrades,
    });
  }

  function applyScheduleDefaults(baseDraft, { unit = "" } = {}) {
    if (!baseDraft?.date) return baseDraft;
    const shift = resolveShiftForLogDate(baseDraft.date, baseDraft.shift);
    const defaults = buildScheduleDefaults(baseDraft.date, shift, unit);
    return normalizeDailyLogRecord({
      ...baseDraft,
      shift,
      apparatus: unit || defaults.apparatus,
      crew: defaults.crew,
    });
  }

  function updateDraft(patch) {
    setDraft((current) => normalizeDailyLogRecord({ ...current, ...patch }));
  }

  function toggleCrewMember(name) {
    if (!canEditDraft || !draft) return;
    const crew = Array.isArray(draft.crew) ? [...draft.crew] : [];
    const index = crew.indexOf(name);
    if (index >= 0) crew.splice(index, 1);
    else crew.push(name);
    updateDraft({ crew });
  }

  function persistRecord(nextRecord, successMessage) {
    setRecords((current) => {
      const index = current.findIndex((record) => record.id === nextRecord.id);
      if (index === -1) return [...current, nextRecord];
      return current.map((record, recordIndex) => (
        recordIndex === index ? nextRecord : record
      ));
    });
    setMessage(successMessage);
  }

  function handleSave() {
    if (!draft || !canEditDraft) return;
    if (!draft.date || !draft.shift || !draft.apparatus) {
      setMessage("Date, shift, and apparatus are required.");
      return;
    }

    const nextId = buildDailyLogId(draft.date, draft.shift, draft.apparatus);
    const duplicate = records.find((record) => (
      record.id !== draft.id
      && record.date === draft.date
      && record.shift === draft.shift
      && record.apparatus === draft.apparatus
    ));
    if (duplicate) {
      setMessage("A daily log already exists for that date, shift, and apparatus.");
      return;
    }

    const now = new Date().toISOString();
    const saved = normalizeDailyLogRecord({
      ...draft,
      id: draft.id || nextId,
      autoLockAt: draft.autoLockAt || resolveAutoLockAt(draft.date, shiftChangeTime),
      updatedAt: now,
      updatedBy: actorName,
      createdAt: draft.createdAt || now,
    });
    persistRecord(saved, `Daily log saved for ${saved.apparatus}.`);
    setIsCreating(false);
    setSelectedId(saved.id);
  }

  function handleCreate() {
    try {
      const date = filterDate || today;
      const defaultShift = resolveShiftForLogDate(date);
      const scheduleDefaults = buildScheduleDefaults(date, defaultShift);
      const next = applyScheduleDefaults(createEmptyDailyLog({
        date,
        shift: defaultShift,
        apparatus: scheduleDefaults.apparatus || "",
        crew: scheduleDefaults.crew,
        autoLockAt: resolveAutoLockAt(date, shiftChangeTime),
      }));
      setMessage("");
      setIsCreating(true);
      setDraft(next);
      setSelectedId("");
      setCrewExpanded(Boolean(next.crew?.length));
    } catch (error) {
      console.error("Daily log create failed:", error);
      setMessage("Could not open a new log entry. Try again or refresh the page.");
    }
  }

  function handleLock() {
    if (!selected || !canEdit || selectedLocked) return;
    const locked = lockDailyLogRecord(selected, { actorName, lockType: "manual", shiftChangeTime });
    persistRecord(locked, `${locked.apparatus} daily log locked.`);
  }

  function handleUnlock() {
    if (!selected || !canUnlock || !selectedLocked) return;
    const unlocked = unlockDailyLogRecord(selected, { actorName });
    persistRecord(unlocked, `${unlocked.apparatus} daily log unlocked.`);
  }

  return (
    <div className="module-page daily-log-page">
      <section className="module-heading">
        <div>
          <span className="module-icon"><BookOpen size={22} /></span>
          <div>
            <h1>Daily Log</h1>
            <p>Shift apparatus logs with crew assignments, free-text notes, manual lock, and automatic lock three hours after shift change.</p>
          </div>
        </div>
        <div className="heading-actions">
          {canEdit && (
            <button type="button" className="secondary-button" onClick={handleCreate}>
              <CirclePlus size={14} /> New Log Entry
            </button>
          )}
        </div>
      </section>

      {message && (
        <div className="success-banner">
          {message}
          <button type="button" onClick={() => setMessage("")}><X size={13} /></button>
        </div>
      )}

      <section className="daily-log-toolbar">
        <label>
          <span>Date</span>
          <input
            type="date"
            value={filterDate}
            onChange={(event) => setFilterDate(event.target.value)}
          />
        </label>
        <label>
          <span>Shift</span>
          <select value={filterShift} onChange={(event) => setFilterShift(event.target.value)}>
            <option value="All">All shifts</option>
            {shiftOptions.map((shift) => <option key={shift} value={shift}>{shift}</option>)}
          </select>
        </label>
        <span className="daily-log-toolbar-meta">
          Shift change {shiftChangeTime} · Auto-lock +3 hours · {visibleRecords.length} entries
        </span>
      </section>

      <section className="daily-log-workspace">
        <Panel title="Daily Logs" icon={BookOpen} action={<span className="panel-count">{visibleRecords.length}</span>}>
          <div className="daily-log-list">
            {visibleRecords.length ? visibleRecords.map((record) => {
              const status = dailyLogLockStatus(record, shiftChangeTime);
              return (
                <button
                  key={record.id}
                  type="button"
                  className={record.id === selectedId ? "daily-log-row selected" : "daily-log-row"}
                  onClick={() => {
                    setIsCreating(false);
                    setSelectedId(record.id);
                  }}
                >
                  <span>
                    <strong>{record.apparatus || "Apparatus"}</strong>
                    <small>{record.shift} · {record.date}</small>
                    <small>{dailyLogSummary(record)}</small>
                  </span>
                  <Badge tone={status.tone}>{status.label}</Badge>
                </button>
              );
            }) : (
              <p className="daily-log-empty">No daily logs for this date and shift.</p>
            )}
          </div>
        </Panel>

        <section className="daily-log-detail">
          {!draft ? (
            <div className="daily-log-empty-panel">
              <BookOpen size={28} />
              <h2>Select or create a daily log</h2>
              <p>Choose an entry from the list or create a new log for the selected date and shift.</p>
              {canEdit && (
                <button type="button" className="primary-button" onClick={handleCreate}>
                  <CirclePlus size={14} /> New Log Entry
                </button>
              )}
            </div>
          ) : (
            <>
              <header className="daily-log-detail-header">
                <div>
                  <h2>{draft.apparatus || "New daily log"}</h2>
                  <p>{draft.shift || "Shift"} · {draft.date || "Date"}</p>
                  {lockStatus && <Badge tone={lockStatus.tone}>{lockStatus.label}</Badge>}
                </div>
                <div className="heading-actions">
                  {canEdit && !selectedLocked && (
                    <button type="button" className="secondary-button" onClick={handleLock}>
                      <Lock size={14} /> Lock Log
                    </button>
                  )}
                  {canUnlock && selectedLocked && (
                    <button type="button" className="secondary-button" onClick={handleUnlock}>
                      <LockOpen size={14} /> Unlock Log
                    </button>
                  )}
                  {canEditDraft && (
                    <button type="button" className="primary-button" onClick={handleSave}>
                      <Save size={14} /> Save
                    </button>
                  )}
                </div>
              </header>

              <div className="daily-log-form">
                <label>
                  <span>Date</span>
                  <input
                    type="date"
                    value={draft.date || ""}
                    disabled={!canEditDraft}
                    onChange={(event) => {
                      const date = event.target.value;
                      setDraft((current) => {
                        const next = normalizeDailyLogRecord({
                          ...current,
                          date,
                          autoLockAt: resolveAutoLockAt(date, shiftChangeTime),
                        });
                        return isCreating ? applyScheduleDefaults(next) : next;
                      });
                    }}
                  />
                </label>
                <label>
                  <span>Shift</span>
                  <ManagedSelect
                    dropdownId="shifts"
                    value={draft.shift || ""}
                    disabled={!canEditDraft}
                    onChange={(value) => {
                      setDraft((current) => {
                        const next = normalizeDailyLogRecord({ ...current, shift: value });
                        return isCreating ? applyScheduleDefaults(next) : next;
                      });
                    }}
                  />
                </label>
                <label>
                  <span>Apparatus</span>
                  <select
                    value={draft.apparatus || ""}
                    disabled={!canEditDraft}
                    onChange={(event) => {
                      const unit = event.target.value;
                      setDraft((current) => applyScheduleDefaults(current, { unit }));
                    }}
                  >
                    {!draft.apparatus && <option value="">Select apparatus...</option>}
                    {draftApparatusOptions.map((unit) => (
                      <option key={unit} value={unit}>{unit}</option>
                    ))}
                  </select>
                </label>
                <div className="daily-log-auto-lock">
                  <span>Auto-lock</span>
                  <strong>{formatAutoLockLabel(draft.autoLockAt || resolveAutoLockAt(draft.date, shiftChangeTime)) || "Set date to calculate"}</strong>
                </div>

                <section className={`daily-log-crew-panel${crewExpanded ? " is-expanded" : " is-collapsed"}`}>
                  <button
                    type="button"
                    className="daily-log-crew-toggle"
                    onClick={() => setCrewExpanded((current) => !current)}
                    aria-expanded={crewExpanded}
                  >
                    <span className="daily-log-crew-toggle-label">
                      {crewExpanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                      <strong>Crew on apparatus</strong>
                    </span>
                    <span className="daily-log-crew-toggle-meta">
                      {draft.crew?.length
                        ? `${draft.crew.length} selected`
                        : `${crewCandidates.length} on roster`}
                    </span>
                  </button>
                  {!crewExpanded && draft.crew?.length > 0 && (
                    <p className="daily-log-crew-summary">{draft.crew.join(", ")}</p>
                  )}
                  {crewExpanded && (
                    !draft.shift ? (
                      <p className="daily-log-help">Select a shift to choose crew members.</p>
                    ) : (
                      <>
                        <p className="daily-log-help">Crew is pre-filled from the daily apparatus roster. Adjust selections as needed.</p>
                        <div className="daily-log-crew-grid">
                        {crewCandidates.length ? crewCandidates.map((person) => {
                          const name = getPersonDisplayName(person);
                          const checked = (draft.crew || []).includes(name);
                          return (
                            <label key={person.id || name} className={checked ? "active" : ""}>
                              <input
                                type="checkbox"
                                checked={checked}
                                disabled={!canEditDraft}
                                onChange={() => toggleCrewMember(name)}
                              />
                              <span>
                                <strong>{name}</strong>
                                <small>{[person.rank, person.unit || person.assignment].filter(Boolean).join(" · ")}</small>
                              </span>
                            </label>
                          );
                        }) : (
                          <p className="daily-log-help">No active personnel found for {draft.shift}.</p>
                        )}
                        </div>
                      </>
                    )
                  )}
                </section>

                <label className="daily-log-notes">
                  <span>Log notes</span>
                  <textarea
                    rows={12}
                    value={draft.notes || ""}
                    disabled={!canEditDraft}
                    placeholder="Enter calls, training, maintenance, station activity, and other shift notes..."
                    onChange={(event) => updateDraft({ notes: event.target.value })}
                  />
                </label>

                {selectedLocked && !canUnlock && (
                  <p className="daily-log-locked-note">
                    <Lock size={14} /> This log is locked. Contact an administrator to unlock it for edits.
                  </p>
                )}
              </div>
            </>
          )}
        </section>
      </section>
    </div>
  );
}
