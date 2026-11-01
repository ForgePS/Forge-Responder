import { useMemo, useState } from "react";
import { CheckCircle2, CloudOff, RefreshCw } from "lucide-react";
import { useField } from "../fieldContext.jsx";
import { KIND_LABELS } from "../fieldKinds.js";
import { syncNow } from "../fieldSync.js";
import { Banner, Screen, Segmented, StatusChip, formatWhen } from "../ui.jsx";

const FILTERS = [
  { value: "waiting", label: "To send" },
  { value: "attention", label: "Attention" },
  { value: "all", label: "All" },
];

export default function ActivityScreen({ params = {} }) {
  const { records, counts, online, sync, navigate } = useField();
  const [filter, setFilter] = useState(params.filter || (counts.attention ? "attention" : "waiting"));
  const rows = useMemo(() => {
    if (filter === "attention") return records.filter((record) => record.status === "attention");
    if (filter === "waiting") return records.filter((record) => ["queued", "syncing", "draft", "attention"].includes(record.status));
    return records;
  }, [records, filter]);
  const waiting = counts.queued + counts.syncing;

  return (
    <Screen title="Records on this device" subtitle={sync.lastSyncAt ? `Last sync check ${formatWhen(sync.lastSyncAt)}` : ""}>
      {!online ? (
        <Banner tone="info" icon={<CloudOff size={22} />} title="You're offline">
          {waiting ? `${waiting} record${waiting === 1 ? " is" : "s are"} saved on this device and will send automatically when you're back online.` : "New records are saved on this device until you're back online."}
        </Banner>
      ) : waiting ? (
        <Banner
          tone="info"
          icon={<RefreshCw size={22} className={sync.running ? "fa-spin" : ""} />}
          title={sync.running ? "Sending…" : `${waiting} waiting to send`}
          action={!sync.running ? <button type="button" className="fa-btn fa-btn-sm" onClick={() => syncNow({ force: true })}>Send now</button> : null}
        >
          {sync.lastError || "Records send automatically, oldest first."}
        </Banner>
      ) : !counts.attention ? (
        <Banner tone="ok" icon={<CheckCircle2 size={22} />} title="Everything is synced">Nothing is waiting on this device.</Banner>
      ) : null}

      <Segmented value={filter} options={FILTERS.map((item) => ({ ...item, label: item.value === "attention" && counts.attention ? `${item.label} (${counts.attention})` : item.label }))} onChange={setFilter} columns={3} />

      <div className="fa-list">
        {rows.map((record) => (
          <button key={record.localId} type="button" className="fa-row" onClick={() => navigate("record", { localId: record.localId })}>
            <span className="fa-row-text">
              <strong>{record.title}</strong>
              <small>
                {KIND_LABELS[record.kind] || record.kind} · {formatWhen(record.updatedAt)}
                {record.status === "queued" && record.lastError ? ` · ${record.lastError}` : ""}
              </small>
            </span>
            <StatusChip status={record.status} />
          </button>
        ))}
        {!rows.length ? <p className="fa-empty">{filter === "all" ? "Nothing saved on this device yet." : "Nothing here."}</p> : null}
      </div>
    </Screen>
  );
}
