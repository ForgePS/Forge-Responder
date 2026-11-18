import { useMemo, useState } from "react";
import { Check, Search, X } from "lucide-react";
import { Badge, Modal } from "../shell/ui.jsx";
import { RECORD_STATUSES } from "../../lib/training/trainingWorkflow.js";
import { COMPLIANCE_STATUSES } from "../../lib/training/trainingCompliance.js";

export { Badge, Modal };

/** Status badge for record workflow or compliance statuses. */
export function StatusBadge({ status, kind = "record" }) {
  const map = kind === "compliance" ? COMPLIANCE_STATUSES : RECORD_STATUSES;
  const entry = map[status] || { label: status || "—", tone: "neutral" };
  return <Badge tone={entry.tone}>{entry.label}</Badge>;
}

/** A KPI card that opens the matching filtered view when clicked. */
export function Kpi({ label, value, hint, tone, onClick }) {
  const body = <><span>{label}</span><strong className={tone ? `trn-tone-${tone}` : ""}>{value}</strong>{hint ? <small>{hint}</small> : null}</>;
  return onClick
    ? <button type="button" className="inspections-kpi-card inspections-kpi-card-button trn-kpi" onClick={onClick}>{body}</button>
    : <div className="inspections-kpi-card trn-kpi">{body}</div>;
}

export function EmptyState({ title, children, action }) {
  return <div className="inspections-empty-state"><strong>{title}</strong>{children ? <p>{children}</p> : null}{action}</div>;
}

export function ErrorNote({ error, onClose }) {
  if (!error) return null;
  return <p className="form-error trn-banner" role="alert">{String(error)}{onClose ? <button type="button" className="icon-button" aria-label="Dismiss" onClick={onClose}><X size={13} /></button> : null}</p>;
}

export function Notice({ message, onClose }) {
  if (!message) return null;
  return <div className="success-banner" role="status">{message}{onClose ? <button type="button" onClick={onClose} aria-label="Dismiss"><X size={13} /></button> : null}</div>;
}

export function Field({ label, children, hint, wide = false }) {
  return <label className={`trn-field${wide ? " trn-field-wide" : ""}`}><span>{label}</span>{children}{hint ? <small className="trn-muted">{hint}</small> : null}</label>;
}

export function Section({ title, actions, children, className = "" }) {
  return <section className={`panel trn-section ${className}`}><header><h3>{title}</h3>{actions ? <div className="trn-actions">{actions}</div> : null}</header><div className="panel-body">{children}</div></section>;
}

/** A simple table. columns: [{ key, label, render? }] */
export function Table({ columns, rows, empty = "Nothing to show.", rowKey = (r) => r.id, onRowClick }) {
  if (!rows.length) return <p className="empty-table">{empty}</p>;
  return (
    <div className="data-table-wrap">
      <table className="trn-table">
        <thead><tr>{columns.map((c) => <th key={c.key} scope="col">{c.label}</th>)}</tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={rowKey(r)} className={onRowClick ? "trn-click-row" : ""} onClick={onRowClick ? () => onRowClick(r) : undefined}>
              {columns.map((c) => <td key={c.key} data-label={c.label}>{c.render ? c.render(r) : r[c.key] ?? ""}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Searchable personnel multi-select. value: [personId]. People are real
 * personnel records; off-roster participants are added separately.
 */
export function PersonPicker({ personnel = [], value = [], onChange, label = "Personnel", groups = null }) {
  const [q, setQ] = useState("");
  const selected = new Set(value.map(String));
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return personnel.filter((p) => !needle || [p.name, p.rank, p.station, p.shift, p.badgeNumber, p.id].join(" ").toLowerCase().includes(needle)).slice(0, 200);
  }, [personnel, q]);
  const toggle = (id) => {
    const next = new Set(selected);
    if (next.has(String(id))) next.delete(String(id)); else next.add(String(id));
    onChange([...next]);
  };
  return (
    <div className="trn-picker" role="group" aria-label={label}>
      <div className="trn-picker-head">
        <label className="global-search trn-search"><Search size={14} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${label.toLowerCase()}…`} aria-label={`Search ${label}`} /></label>
        <span className="trn-muted">{selected.size} selected</span>
        {groups ? groups.map((g) => <button key={g.label} type="button" className="secondary-button" onClick={() => onChange([...new Set([...value.map(String), ...g.ids.map(String)])])}>{g.label}</button>) : null}
        {selected.size ? <button type="button" className="text-button" onClick={() => onChange([])}>Clear</button> : null}
      </div>
      <div className="trn-picker-list">
        {shown.map((p) => (
          <label key={p.id} className={`trn-picker-row${selected.has(String(p.id)) ? " selected" : ""}`}>
            <input type="checkbox" checked={selected.has(String(p.id))} onChange={() => toggle(p.id)} />
            <span>{p.name}</span>
            <small className="trn-muted">{[p.rank, stationLabel(p.station), shiftLabel(p.shift)].filter(Boolean).join(" · ")}</small>
          </label>
        ))}
        {!shown.length ? <p className="trn-muted">No matching personnel.</p> : null}
      </div>
    </div>
  );
}

/** A confirm-then-act button for destructive or final actions. */
export function ConfirmButton({ children, confirm, onConfirm, className = "secondary-button", disabled }) {
  return <button type="button" className={className} disabled={disabled} onClick={() => { if (window.confirm(confirm)) onConfirm(); }}>{children}</button>;
}

export function PersonName({ id, personnel }) {
  const p = personnel.find((x) => String(x.id) === String(id));
  return <>{p?.name || id || "—"}</>;
}

export function ModalActions({ onCancel, onSave, saveLabel = "Save", busy, disabled, extra }) {
  return (
    <div className="modal-actions">
      {extra}
      <button type="button" className="secondary-button" onClick={onCancel}>Cancel</button>
      {onSave ? <button type="button" className="primary-button" onClick={onSave} disabled={busy || disabled}><Check size={14} /> {busy ? "Saving…" : saveLabel}</button> : null}
    </div>
  );
}

/** "3" → "Station 3"; "Station 3" stays as is. Same for shifts. */
export const stationLabel = (v) => (!v ? "" : /station/i.test(String(v)) ? String(v) : `Station ${v}`);
export const shiftLabel = (v) => (!v ? "" : /shift/i.test(String(v)) ? String(v) : `${v} shift`);

export const fmtHours = (n) => {
  const v = Math.round((Number(n) || 0) * 100) / 100;
  return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
};

export const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export function downloadText(filename, text, type = "text/csv") {
  const blob = new Blob([text], { type: `${type};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
