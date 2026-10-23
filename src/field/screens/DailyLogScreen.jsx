import { useMemo } from "react";
import { BookOpen, Lock, Plus, Users } from "lucide-react";
import { useField } from "../fieldContext.jsx";
import { refItems } from "../fieldRefData.js";
import { localDate } from "../fieldValidation.js";
import { isDailyLogLocked } from "../../lib/dailyLogLock.js";
import { Banner, Screen, StatusChip, formatDay } from "../ui.jsx";

/** Server logs merged with logs saved on this device (newest copy wins). */
export function useMergedDailyLogs() {
  const { refData, records } = useField();
  return useMemo(() => {
    const map = new Map();
    refItems(refData, "dailyLogs").forEach((log) => map.set(log.id, { log, record: null }));
    records.filter((record) => record.kind === "dailyLog").forEach((record) => {
      const id = record.data?.id;
      if (!id) return;
      const existing = map.get(id);
      const recordTime = record.updatedAt || "";
      if (!existing || record.status !== "synced" || recordTime > (existing.log?.updatedAt || "")) {
        map.set(id, { log: { ...(existing?.log || {}), ...record.data }, record, server: existing?.log || null });
      } else {
        map.set(id, { ...existing, record: null });
      }
    });
    return [...map.values()].sort((a, b) => String(b.log.date).localeCompare(String(a.log.date)) || String(a.log.apparatus).localeCompare(String(b.log.apparatus), undefined, { numeric: true }));
  }, [refData, records]);
}

export default function DailyLogScreen() {
  const { caps, snapshot, navigate, back } = useField();
  const logs = useMergedDailyLogs();
  const today = localDate();
  const shiftChangeTime = snapshot.settings?.shiftChangeTime;
  const groups = useMemo(() => {
    const byDay = new Map();
    logs.forEach((entry) => {
      const day = entry.log.date || "No date";
      if (!byDay.has(day)) byDay.set(day, []);
      byDay.get(day).push(entry);
    });
    return [...byDay.entries()];
  }, [logs]);

  return (
    <Screen
      title="Daily log"
      subtitle="Last few days on this device"
      onBack={back}
      footer={caps.dailyLogEdit ? (
        <button type="button" className="fa-btn fa-btn-primary fa-btn-block" onClick={() => navigate("dailyLogForm")}>
          <Plus size={22} /> New log
        </button>
      ) : null}
    >
      {!logs.length ? (
        <Banner tone="info" icon={<BookOpen size={22} />} title="No recent logs">
          {caps.dailyLogEdit ? "Start today's log with New log." : "Logs from the last few days show here."}
        </Banner>
      ) : null}
      {groups.map(([day, entries]) => (
        <section key={day} className="fa-section">
          <div className="fa-section-head"><h2>{day === today ? "Today" : formatDay(day)}</h2></div>
          <div className="fa-list">
            {entries.map(({ log, record, server }) => {
              const locked = isDailyLogLocked(server || log, shiftChangeTime);
              return (
                <button
                  key={log.id}
                  type="button"
                  className="fa-row"
                  onClick={() => navigate("dailyLogForm", record && record.status !== "synced" ? { localId: record.localId } : { logId: log.id })}
                >
                  <span className="fa-row-text">
                    <strong>{log.apparatus || "Unit"} · {log.shift || "Shift"}</strong>
                    <small>
                      <Users size={13} /> {(log.crew || []).length} crew
                      {log.notes ? ` · ${String(log.notes).slice(0, 60)}${String(log.notes).length > 60 ? "…" : ""}` : ""}
                    </small>
                  </span>
                  {record && record.status !== "synced" ? <StatusChip status={record.status} /> : locked ? <span className="fa-status tone-muted"><Lock size={14} /> Locked</span> : null}
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </Screen>
  );
}
