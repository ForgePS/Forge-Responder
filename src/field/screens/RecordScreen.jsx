import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, Pencil, RefreshCw, Trash2 } from "lucide-react";
import { useField } from "../fieldContext.jsx";
import { FORM_FOR_KIND, KIND_LABELS } from "../fieldKinds.js";
import { discardRecord, getRecord, patchRecord, recordExportJson, subscribeRecords } from "../fieldRecords.js";
import { setPath } from "../fieldMerge.js";
import { syncNow } from "../fieldSync.js";
import { downloadTextFile } from "../../lib/downloadTextFile.js";
import { Banner, Confirm, PhotoStrip, Screen, Section, Segmented, StatusChip, cx, formatWhen } from "../ui.jsx";

const FIELD_NAMES = {
  crew: "Crew",
  notes: "Notes",
  incidentDate: "Incident date",
  incidentAddress: "Address",
  incidentTypeSummary: "Incident type",
  disciplines: "Disciplines",
  "workspace.cad.incidentNumber": "CAD / incident #",
  "workspace.cad.dispatchTime": "Dispatched",
  "workspace.cad.arrivalTime": "On scene",
  "workspace.cad.clearTime": "Cleared",
  "workspace.units": "Units",
  "workspace.personnel": "Crew",
  "workspace.ems.patientCount": "Patients",
  "workspace.ems.chiefComplaint": "Chief complaint",
  "workspace.narrative.body": "Narrative",
};

function show(value) {
  if (value === undefined || value === null || value === "") return "(empty)";
  if (Array.isArray(value)) return value.map((item) => (typeof item === "object" ? item.name || item.unitId || JSON.stringify(item) : item)).join(", ") || "(empty)";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function ConflictResolver({ record, onResolved }) {
  const conflicts = record.attention?.conflicts || [];
  const [choices, setChoices] = useState(() => Object.fromEntries(conflicts.map((conflict) => [conflict.path, "mine"])));
  async function apply() {
    // My copy becomes: my value / their value / both, for each conflicting field.
    let data = { ...record.data };
    let base = record.base ? { ...record.base } : {};
    for (const conflict of conflicts) {
      const choice = choices[conflict.path];
      let value = conflict.mine;
      if (choice === "server") value = conflict.server;
      if (choice === "both") {
        if (Array.isArray(conflict.mine) || Array.isArray(conflict.server)) {
          const seen = new Map();
          [...(conflict.server || []), ...(conflict.mine || [])].forEach((item) => seen.set(typeof item === "object" ? item.name || item.unitId || JSON.stringify(item) : item, item));
          value = [...seen.values()];
        } else {
          value = [conflict.server, conflict.mine].filter((item) => item !== undefined && item !== null && String(item).trim()).join("\n\n");
        }
      }
      data = setPath(data, conflict.path, value);
      // The server copy we just looked at becomes the new starting point.
      base = setPath(base, conflict.path, conflict.server);
    }
    await patchRecord(record.localId, {
      data,
      base,
      status: "queued",
      attention: null,
      attempts: 0,
      nextAttemptAt: "",
      lastError: "",
    }, "Conflict resolved on device");
    syncNow({ force: true });
    onResolved();
  }
  return (
    <Section title="Choose what to keep" hint="These fields were changed on the server after you started. Everything else is merged automatically.">
      {conflicts.map((conflict) => {
        const canBoth = typeof conflict.mine === "string" || Array.isArray(conflict.mine);
        return (
          <div key={conflict.path} className="fa-conflict">
            <strong>{FIELD_NAMES[conflict.path] || conflict.path}</strong>
            <div className="fa-conflict-values">
              <div className={cx(choices[conflict.path] === "mine" && "is-picked")}><span>Yours</span><p>{show(conflict.mine)}</p></div>
              <div className={cx(choices[conflict.path] === "server" && "is-picked")}><span>On the server</span><p>{show(conflict.server)}</p></div>
            </div>
            <Segmented
              value={choices[conflict.path]}
              options={[{ value: "mine", label: "Keep mine" }, { value: "server", label: "Use theirs" }, ...(canBoth ? [{ value: "both", label: "Keep both" }] : [])]}
              onChange={(value) => setChoices((current) => ({ ...current, [conflict.path]: value }))}
              columns={canBoth ? 3 : 2}
            />
          </div>
        );
      })}
      <button type="button" className="fa-btn fa-btn-primary fa-btn-block" onClick={apply}>Save choices and send</button>
    </Section>
  );
}

export default function RecordScreen({ params = {} }) {
  const { navigate, back, toast } = useField();
  const [record, setRecord] = useState(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  useEffect(() => {
    const load = () => getRecord(params.localId).then((row) => setRecord(row || false));
    load();
    return subscribeRecords(load);
  }, [params.localId]);

  if (record === null) return <Screen title="Record" onBack={back} />;
  if (record === false) {
    return (
      <Screen title="Record" onBack={back}>
        <p className="fa-empty">This record is no longer on this device.</p>
      </Screen>
    );
  }

  const attention = record.status === "attention" ? record.attention : null;
  const canEdit = record.status !== "syncing";

  function exportCopy() {
    downloadTextFile(`${record.kind}-${record.localId}.json`, recordExportJson(record), "application/json");
    toast("Copy downloaded");
  }

  async function retry() {
    await patchRecord(record.localId, { status: "queued", attention: null, attempts: 0, nextAttemptAt: "", lastError: "" }, "Retry requested");
    syncNow({ force: true });
    toast(navigator.onLine ? "Sending again…" : "Will send when you're back online");
  }

  return (
    <Screen title={record.title} subtitle={`${KIND_LABELS[record.kind] || record.kind} · saved ${formatWhen(record.savedAt || record.updatedAt)}`} onBack={back}>
      <div className="fa-record-status">
        <StatusChip status={record.status} />
        {record.syncedAt ? <span>Synced {formatWhen(record.syncedAt)}</span> : null}
        {record.serverIds?.reportNumber ? <span>{record.serverIds.reportNumber}</span> : null}
      </div>

      {attention?.type === "conflict" ? (
        <>
          <Banner tone="warn" icon={<AlertTriangle size={22} />} title="Changed by someone else too">{attention.message}</Banner>
          <ConflictResolver record={record} onResolved={() => toast("Saved your choices")} />
        </>
      ) : null}

      {attention && attention.type !== "conflict" ? (
        <Banner tone="warn" icon={<AlertTriangle size={22} />} title="The server didn't accept this record">
          {attention.message} Your entry is kept on this device. Fix it and send again, or download a copy for your officer.
        </Banner>
      ) : null}

      {record.status === "queued" && record.lastError ? (
        <Banner tone="info" icon={<RefreshCw size={22} />} title="Waiting to send">
          Last try: {record.lastError}{record.nextAttemptAt ? ` Next try ${formatWhen(record.nextAttemptAt)}.` : ""}
        </Banner>
      ) : null}

      {record.warnings?.length ? (
        <Banner tone="info" icon={<CheckCircle2 size={22} />} title="Sent, with notes">{record.warnings.join("; ")}</Banner>
      ) : null}

      {record.attachments?.length ? (
        <Section title="Photos"><PhotoStrip attachments={record.attachments} /></Section>
      ) : null}

      <div className="fa-action-stack">
        {canEdit && FORM_FOR_KIND[record.kind] ? (
          <button type="button" className="fa-btn fa-btn-secondary fa-btn-block" onClick={() => navigate(FORM_FOR_KIND[record.kind], { localId: record.localId })}>
            <Pencil size={20} /> {record.status === "synced" ? "Edit and send again" : "Open and edit"}
          </button>
        ) : null}
        {attention && attention.type !== "conflict" ? (
          <button type="button" className="fa-btn fa-btn-primary fa-btn-block" onClick={retry}><RefreshCw size={20} /> Try sending again</button>
        ) : null}
        {record.status === "queued" ? (
          <button type="button" className="fa-btn fa-btn-ghost fa-btn-block" onClick={retry}><RefreshCw size={20} /> Send now</button>
        ) : null}
        <button type="button" className="fa-btn fa-btn-ghost fa-btn-block" onClick={exportCopy}><Download size={20} /> Download a copy</button>
        {record.status !== "syncing" ? (
          <button type="button" className="fa-btn fa-btn-danger-ghost fa-btn-block" onClick={() => setConfirmDiscard(true)}>
            <Trash2 size={20} /> {record.status === "synced" ? "Remove from this device" : "Discard"}
          </button>
        ) : null}
      </div>

      <details className="fa-history">
        <summary>History on this device</summary>
        <ul>
          {(record.history || []).slice().reverse().map((entry, index) => (
            <li key={index}><span>{formatWhen(entry.at)}</span> {entry.note || entry.status}</li>
          ))}
        </ul>
      </details>

      <Confirm
        open={confirmDiscard}
        title={record.status === "synced" ? "Remove from this device?" : "Discard this record?"}
        body={record.status === "synced"
          ? "It's already on the server; this only removes the copy on this phone."
          : "It has NOT been sent to the server. Discarding deletes it for good. Download a copy first if you're unsure."}
        confirmLabel={record.status === "synced" ? "Remove" : "Discard for good"}
        onCancel={() => setConfirmDiscard(false)}
        onConfirm={async () => {
          setConfirmDiscard(false);
          await discardRecord(record.localId);
          toast(record.status === "synced" ? "Removed from this device" : "Discarded");
          back();
        }}
      />
    </Screen>
  );
}
