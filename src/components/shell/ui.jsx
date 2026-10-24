import { useMemo } from "react";
import { normalizeTableRows } from "../../lib/tableRows.js";

import { X } from "lucide-react";

export function toneFromStatus(value, fallback = "neutral") {
  const text = String(value).toLowerCase();
  if (/active|complete|approved|in service|scheduled|compliant|upcoming/.test(text)) return "success";
  if (/overdue|expired|deficit|out of service|high/.test(text)) return "critical";
  if (/due|pending|leave|pm|medium/.test(text)) return "warning";
  if (/review|submitted|progress/.test(text)) return "info";
  return fallback;
}

export function Badge({ children, tone = "neutral" }) {
  return <span className={`badge badge-${toneFromStatus(children, tone)}`}>{children}</span>;
}

export function Panel({ title, icon: Icon, action, children, className = "" }) {
  return <section className={`panel ${className}`}><header><div><Icon size={15} /><strong>{title}</strong></div>{action}</header><div className="panel-body">{children}</div></section>;
}

export function MiniTable({ columns, rows }) {
  const safeRows = normalizeTableRows(rows);
  return <div className="mini-table"><div className="mini-row mini-head" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}>{columns.map((column) => <span key={column}>{column}</span>)}</div>{safeRows.map((row, rowIndex) => <div className="mini-row" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }} key={`${row.join("-")}-${rowIndex}`}>{row.map((cell, index) => <span key={`${cell}-${index}`} className={index === row.length - 1 ? `cell-${toneFromStatus(cell)}` : ""}>{cell}</span>)}</div>)}</div>;
}

export function trainingCompliancePercent(records = []) {
  if (!records.length) return 0;
  return Math.round(records.reduce((sum, record) => sum + Number(record.completion || 0), 0) / records.length);
}

export function DataTable({ columns, rows, query }) {
  const filtered = useMemo(() => rows.filter((row) => row.join(" ").toLowerCase().includes(query.toLowerCase())), [rows, query]);
  return <div className="data-table-wrap"><table><thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{filtered.map((row) => <tr key={row.join("-")}>{row.map((cell, index) => <td key={`${cell}-${index}`}>{index === row.length - 1 ? <Badge>{cell}</Badge> : cell}</td>)}</tr>)}</tbody></table>{!filtered.length && <div className="empty-table">No records match the current search.</div>}</div>;
}

export function Modal({ title, onClose, children }) {
  return <div className="modal-backdrop"><section className="workflow-modal"><header><strong>{title}</strong><button onClick={onClose}><X size={16} /></button></header><div className="modal-content">{children}</div></section></div>;
}

export function FleetSummary({ items }) {
  return <section className="fleet-summary">{items.map(([label, value, tone]) => <div key={label} className={`fleet-stat stat-${tone}`}><strong>{value}</strong><span>{label}</span></div>)}</section>;
}
