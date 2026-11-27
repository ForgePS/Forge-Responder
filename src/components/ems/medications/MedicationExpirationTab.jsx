import { useMemo, useState } from "react";
import { CalendarClock, Download, Trash2 } from "lucide-react";
import { Badge, FleetSummary, Panel } from "../../shell/ui.jsx";
import { DEFAULT_EMS_SETTINGS, EXPIRATION_TONES, formatDate, todayIso } from "../../../lib/ems/inventoryDisplay.js";
import { expiringLots } from "../../../lib/ems/medicationScreens.js";
import { downloadTextFile } from "../../../lib/downloadTextFile.js";

const csvCell = (value) => {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};


export default function MedicationExpirationTab({ items, balances, locations, settings, canUse, onRecord }) {
  const warningDays = settings?.expirationWarningDays?.length ? settings.expirationWarningDays : DEFAULT_EMS_SETTINGS.expirationWarningDays;
  const windows = [...warningDays].sort((a, b) => a - b);
  const largest = windows[windows.length - 1];
  const [within, setWithin] = useState(String(largest));
  const today = todayIso();
  const all = useMemo(() => expiringLots({ items, balances, locations, warningDays, today }), [items, balances, locations, warningDays, today]);
  const limit = within === "all" ? Infinity : Number(within);
  const shown = all.filter((r) => r.status.level === "expired" || (r.status.days !== null && r.status.days <= limit) || within === "all");
  const count = (fn) => all.filter(fn).reduce((sum, r) => sum + r.lot.quantity, 0);

  const summary = [
    ["Expired, still on hand", count((r) => r.status.level === "expired"), "critical"],
    ...windows.map((d, i) => [
      `Expiring in ${i ? `${windows[i - 1] + 1}–` : "0–"}${d} days`,
      count((r) => r.status.days !== null && r.status.days >= (i ? windows[i - 1] + 1 : 0) && r.status.days <= d),
      i === 0 ? "critical" : "warning",
    ]),
  ];

  function exportCsv() {
    const header = ["Medication", "Lot", "Expiration", "Days left", "Location", "Quantity", "Unit", "On hold"];
    const lines = shown.map((r) => [r.item.name, r.lot.lot, r.lot.expiration, r.status.days ?? "", r.path, r.lot.quantity, r.item.unitOfMeasure || "each", r.lot.held ? "yes" : ""]);
    downloadTextFile(`medication-expirations-${today}.csv`, [header, ...lines].map((row) => row.map(csvCell).join(",")).join("\n"));
  }

  return (
    <>
      <FleetSummary items={summary} />
      <Panel
        title="Medication expirations"
        icon={CalendarClock}
        action={<button type="button" className="secondary-button" onClick={exportCsv} disabled={!shown.length}><Download size={14} /> Export CSV</button>}
      >
        <div className="ems-filters">
          <select value={within} onChange={(e) => setWithin(e.target.value)} aria-label="Show">
            {windows.map((d) => <option key={d} value={d}>Expired or expiring within {d} days</option>)}
            <option value="all">Every lot on hand</option>
          </select>
          <small className="occupancy-muted">Warning windows come from EMS settings ({windows.join(", ")} days).</small>
        </div>
        <div className="data-table-wrap">
          <table className="ems-table">
            <thead><tr><th>Medication</th><th>Lot</th><th>Expires</th><th>Location</th><th>Qty</th><th><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id}>
                  <td><strong>{r.item.name}</strong>{r.lot.held ? <> <Badge tone="critical">On hold</Badge></> : null}</td>
                  <td>{r.lot.lot || "no lot"}</td>
                  <td>
                    {r.lot.expiration ? formatDate(r.lot.expiration) : "—"}
                    <small className="ems-block"><Badge tone={EXPIRATION_TONES[r.status.level]}>{r.status.label}</Badge></small>
                  </td>
                  <td>{r.path}</td>
                  <td className="ems-num">{r.lot.quantity} <small className="occupancy-muted">{r.item.unitOfMeasure || "each"}</small></td>
                  <td>
                    {canUse && r.status.level === "expired" ? (
                      <button type="button" className="secondary-button" title="Remove as expired"
                        onClick={() => onRecord({ type: "expired", itemId: r.item.id, fromLocationId: r.location.id, lotKey: r.lot.key })}>
                        <Trash2 size={14} /> Remove
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!shown.length ? <div className="empty-table">Nothing expired or expiring in this window.</div> : null}
        </div>
      </Panel>
    </>
  );
}
