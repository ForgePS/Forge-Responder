/**
 * CAD dialogs for patient care reports: start a report from a CAD record, and import CAD into an open report.
 * Records come from loadCadRecords (Active911 alerts, the demo department's CAD runs) or a pasted CAD record.
 */
import { useMemo, useState } from "react";
import { Ambulance, ArrowRight, Check, ClipboardPaste, FilePlus2, Loader2, Radio, RefreshCw, X } from "lucide-react";
import { parseCadPayload } from "../../lib/neris/cadImport.js";
import { cadChanges, cadRecordFromPayload, cadValues, recentCadRecords, sameUnit } from "../../lib/pcr/pcrCad.js";

function formatWhen(value) {
  const t = Date.parse(value || "");
  return Number.isNaN(t) ? "" : new Date(t).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

function Dialog({ title, onClose, children, wide = false }) {
  return (
    <div className="nr-dialog-backdrop" onClick={onClose}>
      <div className={`nr-dialog${wide ? " pcr-dialog-wide" : ""}`} role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>{title}</h2>
          <button type="button" className="nr-icon-btn" aria-label="Close" onClick={onClose}><X size={18} /></button>
        </header>
        {children}
      </div>
    </div>
  );
}

const SOURCE_LABEL = { active911: "Active911", "demo-cad": "CAD", cad: "CAD", paste: "Pasted" };
const EMS_UNIT = /medic|ambulance|rescue|ems|squad|^m\s?\d/i;

/** The unit to chart for by default: the one the person last used, else the first EMS-looking unit. */
function defaultUnit(record, preferred) {
  const units = record.units || [];
  return units.find((u) => preferred && sameUnit(u.id, preferred))?.id || units.find((u) => EMS_UNIT.test(u.id))?.id || units[0]?.id || preferred || "";
}

/** Recent CAD records, plus a paste box. Calls onPick(record, unit). */
function CadRecordPicker({ records, loading, onReload, preferredUnit, onPick, pickLabel }) {
  const [selected, setSelected] = useState("");
  const [unit, setUnit] = useState("");
  const [pasting, setPasting] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [pasteError, setPasteError] = useState("");
  const recent = useMemo(() => recentCadRecords(records, { hours: 7 * 24, limit: 40 }), [records]);
  const keyOf = (r) => `${r.source}:${r.id}`;
  const current = recent.find((r) => keyOf(r) === selected);

  const choose = (record) => {
    setSelected(keyOf(record));
    setUnit(defaultUnit(record, preferredUnit));
  };

  const usePasted = () => {
    const parsed = parseCadPayload(pasteText);
    if (!parsed.ok || !parsed.payload) {
      setPasteError(parsed.errors?.[0] || "That CAD record couldn't be read.");
      return;
    }
    const record = { ...cadRecordFromPayload(parsed.payload, { source: "paste" }), id: parsed.payload.cad?.incidentNumber || `paste-${Date.now()}` };
    onPick(record, defaultUnit(record, preferredUnit));
  };

  if (pasting) {
    return (
      <div className="pcr-cad-paste">
        <p className="nr-muted">Paste a CAD record (JSON, CSV, XML or "Field: value" lines). Times, address and units are read from it.</p>
        <textarea className="nr-input nr-textarea" rows={9} value={pasteText} onChange={(e) => { setPasteText(e.target.value); setPasteError(""); }} placeholder={"Incident Number: 2026-04179\nReceived: 2026-11-16 16:38\nAddress: 88 Willow Ln\nUnits: Medic 1, Engine 1"} />
        {pasteError ? <p className="nr-error" role="alert">{pasteError}</p> : null}
        <div className="pcr-dialog-actions">
          <button type="button" className="nr-btn nr-btn-ghost" onClick={() => setPasting(false)}>Back to recent calls</button>
          <button type="button" className="nr-btn nr-btn-primary" disabled={!pasteText.trim()} onClick={usePasted}>{pickLabel} <ArrowRight size={15} /></button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="pcr-cad-head">
        <strong><Radio size={15} /> Recent calls from CAD</strong>
        <span>
          <button type="button" className="nr-btn nr-btn-ghost nr-small" onClick={onReload} disabled={loading}>
            {loading ? <Loader2 size={14} className="nr-spin" /> : <RefreshCw size={14} />} Check CAD
          </button>
          <button type="button" className="nr-btn nr-btn-ghost nr-small" onClick={() => setPasting(true)}><ClipboardPaste size={14} /> Paste a CAD record</button>
        </span>
      </div>
      {recent.length ? (
        <ul className="pcr-cad-list">
          {recent.map((record) => {
            const on = keyOf(record) === selected;
            return (
              <li key={keyOf(record)}>
                <button type="button" className={`pcr-cad-item${on ? " on" : ""}`} onClick={() => choose(record)} aria-pressed={on}>
                  <span className="pcr-cad-main">
                    <strong>{record.description || "Dispatch"}</strong>
                    <small>{[record.address, formatWhen(record.sentAt), record.incidentNumber && `#${record.incidentNumber}`].filter(Boolean).join(" · ")}</small>
                  </span>
                  <span className="nr-pill">{SOURCE_LABEL[record.source] || "CAD"}</span>
                  {on ? <Check size={16} /> : null}
                </button>
                {on && record.units?.length ? (
                  <div className="pcr-cad-units" role="radiogroup" aria-label="Unit">
                    <span>Charting for</span>
                    {record.units.map((u) => (
                      <button key={u.id} type="button" role="radio" aria-checked={unit === u.id} className={`nr-chip${unit === u.id ? " on" : ""}`} onClick={() => setUnit(u.id)}>
                        <Ambulance size={12} /> {u.id}
                      </button>
                    ))}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="nr-muted pcr-cad-empty">{loading ? "Checking CAD…" : "No calls from CAD in the last 7 days. Paste a CAD record, or start without one."}</p>
      )}
      {current ? (
        <div className="pcr-dialog-actions">
          <button type="button" className="nr-btn nr-btn-primary" onClick={() => onPick(current, unit)}>{pickLabel} <ArrowRight size={15} /></button>
        </div>
      ) : null}
    </>
  );
}

/** Start a report: from a CAD record, or blank. onStart({ record?, unit }) */
export function PcrStartDialog({ records, loading, onReload, preferredUnit = "", busy = false, onStart, onClose }) {
  const [unit, setUnit] = useState(preferredUnit);
  return (
    <Dialog title="Start a patient care report" onClose={onClose} wide>
      <CadRecordPicker records={records} loading={loading} onReload={onReload} preferredUnit={preferredUnit} pickLabel={busy ? "Starting…" : "Start from this call"} onPick={(record, pickedUnit) => !busy && onStart({ record, unit: pickedUnit })} />
      <div className="pcr-start-blank">
        <p className="nr-muted">Or start without CAD:</p>
        <div className="pcr-inline">
          <input className="nr-input" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="Unit, e.g. Medic 1" aria-label="Unit" />
          <button type="button" className="nr-btn nr-btn-soft" disabled={busy} onClick={() => onStart({ record: null, unit: unit.trim() })}><FilePlus2 size={15} /> Start a blank report</button>
        </div>
      </div>
    </Dialog>
  );
}

/** Import CAD into an open report: pick a record, preview what changes, apply. onApply({ record, unit, values, changes }) */
export function PcrCadImportDialog({ schema, report, records, loading, onReload, onApply, onClose }) {
  const [picked, setPicked] = useState(null);
  const values = picked ? cadValues(picked.record, picked.unit) : {};
  const changes = picked ? cadChanges(schema, report.nemsis || {}, values, null, { overwrite: true }) : [];
  return (
    <Dialog title="Import from CAD" onClose={onClose} wide>
      {!picked ? (
        <CadRecordPicker records={records} loading={loading} onReload={onReload} preferredUnit={report.unit} pickLabel="Preview" onPick={(record, unit) => setPicked({ record, unit })} />
      ) : (
        <>
          <p className="nr-muted">
            {picked.record.description || "Call"}{picked.record.address ? ` at ${picked.record.address}` : ""}{picked.unit ? `, times for ${picked.unit}` : ""}.
            {changes.length ? " These fields will be filled in:" : " The report already matches CAD."}
          </p>
          {changes.length ? (
            <table className="nr-table pcr-cad-preview">
              <thead><tr><th>Field</th><th>Now</th><th>From CAD</th></tr></thead>
              <tbody>
                {changes.map((c) => (
                  <tr key={c.el}><td>{c.label}</td><td>{(c.time ? formatWhen(c.from) : c.from) || "—"}</td><td><strong>{c.time ? formatWhen(c.to) : c.to}</strong></td></tr>
                ))}
              </tbody>
            </table>
          ) : null}
          <div className="pcr-dialog-actions">
            <button type="button" className="nr-btn nr-btn-ghost" onClick={() => setPicked(null)}>Pick another call</button>
            <button type="button" className="nr-btn nr-btn-primary" onClick={() => onApply({ ...picked, values, changes })}>
              <Check size={15} /> {changes.length ? "Import" : "Link this call"}
            </button>
          </div>
        </>
      )}
    </Dialog>
  );
}
