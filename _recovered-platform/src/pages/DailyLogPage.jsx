import { useEffect, useMemo, useState } from "react";
import {
  BookOpen, Check, CirclePlus, Lock, LockOpen, Save, X,
} from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { useDropdowns } from "../context/DropdownContext.jsx";
import ManagedSelect from "../components/ManagedSelect.jsx";
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
import { formatDayId, shiftForDate } from "../lib/shiftCalendar.js";
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
  profileShifts = [],
  shiftRotation = {},
  shiftChangeTime = DEFAULT_SHIFT_CHANGE_TIME,
  query = "",
  canEdit = false,
  canUnlock = false,
}) {
  const { user } = useAuth();
  const { getOptions } = useDropdowns();
  const actorName = resolveActorName(user);
  const today = formatDayId(new Date());

  const [selectedId, setSelectedId] = useState("");
  const [filterDate, setFilterDate] = useState(today);
  const [filterShift, setFilterShift] = useState("All");
  const [message, setMessage] = useState("");
  const [draft, setDraft] = useState(null);

  const shiftOptions = useMemo(() => {
    const configured = getOptions("shifts");
    const profile = (Array.isArray(profileShifts) ? profileShifts : []).filter(Boolean);
    return [...new Set([...configured, ...profile])].filter((shift) => !/^administration$/i.test(shift));
  }, [getOptions, profileShifts]);

  const apparatusOptions = useMemo(() => {
    const fleet = (Array.isArray(apparatus) ? apparatus : [])
      .map((unit) => unit?.unit)
      .filter(Boolean);
    const dropdown = getOptions("apparatusUnits");
    return [...new Set([...dropdown, ...fleet])];
  }, [apparatus, getOptions]);

  useEffect(() => {
    setRecords((current) => applyAutoLocksToDailyLogs(current, shiftChangeTime));
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
      setSelectedId("");
      setDraft(null);
      return;
    }
    if (!visibleRecords.some((record) => record.id === selectedId)) {
      setSelectedId(visibleRecords[0].id);
    }
  }, [visibleRecords, selectedId]);

  const selected = visibleRecords.find((record) => record.id === selectedId)
    || records.find((record) => record.id === selectedId)
    || null;

  useEffect(() => {
    if (!selected) {
      setDraft(null);
      return;
    }
    setDraft(normalizeDailyLogRecord(selected));
  }, [selected]);

  const selectedLocked = selected
    ? isDailyLogLocked(selected, shiftChangeTime)
    : false;
  const canEditSelected = canEdit && (!selectedLocked || canUnlock);
  const lockStatus = selected ? dailyLogLockStatus(selected, shiftChangeTime) : null;

  const crewCandidates = useMemo(() => {
    if (!draft?.shift) return [];
    return (Array.isArray(personnel) ? personnel : [])
      .filter((person) => String(person.status || "Active").toLowerCase() === "active")
      .filter((person) => !draft.shift || person.shift === draft.shift)
      .sort((a, b) => getPersonDisplayName(a).localeCompare(getPersonDisplayName(b)));
  }, [personnel, draft?.shift]);

  function updateDraft(patch) {
    setDraft((current) => normalizeDailyLogRecord({ ...current, ...patch }));
  }

  function toggleCrewMember(name) {
    if (!canEditSelected || !draft) return;
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
    if (!draft || !canEditSelected) return;
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
    setSelectedId(saved.id);
  }

  function handleCreate() {
    const defaultShift = filterShift !== "All"
      ? filterShift
      : shiftForDate(parseDayId(filterDate || today), shiftRotation);
    const next = createEmptyDailyLog({
      date: filterDate || today,
      shift: defaultShift || shiftOptions[0] || "",
      apparatus: apparatusOptions[0] || "",
      autoLockAt: resolveAutoLockAt(filterDate || today, shiftChangeTime),
    });
    setDraft(next);
    setSelectedId("");
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
                  onClick={() => setSelectedId(record.id)}
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
                  {canEditSelected && (
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
                    disabled={!canEditSelected}
                    onChange={(event) => updateDraft({
                      date: event.target.value,
                      autoLockAt: resolveAutoLockAt(event.target.value, shiftChangeTime),
                    })}
                  />
                </label>
                <label>
                  <span>Shift</span>
                  <ManagedSelect
                    dropdownId="shifts"
                    value={draft.shift || ""}
                    disabled={!canEditSelected}
                    onChange={(value) => updateDraft({ shift: value, crew: [] })}
                  />
                </label>
                <label>
                  <span>Apparatus</span>
                  <ManagedSelect
                    dropdownId="apparatusUnits"
                    value={draft.apparatus || ""}
                    disabled={!canEditSelected}
                    onChange={(value) => updateDraft({ apparatus: value })}
                  />
                </label>
                <div className="daily-log-auto-lock">
                  <span>Auto-lock</span>
                  <strong>{formatAutoLockLabel(draft.autoLockAt || resolveAutoLockAt(draft.date, shiftChangeTime)) || "Set date to calculate"}</strong>
                </div>

                <section className="daily-log-crew-panel">
                  <header>
                    <strong>Crew on apparatus</strong>
                    <span>{draft.crew?.length || 0} selected</span>
                  </header>
                  {!draft.shift ? (
                    <p className="daily-log-help">Select a shift to choose crew members.</p>
                  ) : (
                    <div className="daily-log-crew-grid">
                      {crewCandidates.length ? crewCandidates.map((person) => {
                        const name = getPersonDisplayName(person);
                        const checked = (draft.crew || []).includes(name);
                        return (
                          <label key={person.id || name} className={checked ? "active" : ""}>
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={!canEditSelected}
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
                  )}
                </section>

                <label className="daily-log-notes">
                  <span>Log notes</span>
                  <textarea
                    rows={12}
                    value={draft.notes || ""}
                    disabled={!canEditSelected}
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

function parseDayId(id) {
  const [year, month, day] = String(id).split("-").map(Number);
  return new Date(year, month - 1, day);
}
