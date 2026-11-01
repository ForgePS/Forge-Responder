import { useMemo } from "react";
import { MapPin, Plus, Siren } from "lucide-react";
import { useField } from "../fieldContext.jsx";
import { refItems } from "../fieldRefData.js";
import { Banner, Screen, StatusChip, formatDay } from "../ui.jsx";

export default function IncidentsScreen() {
  const { refData, records, navigate, back } = useField();
  const rows = useMemo(() => {
    const map = new Map();
    refItems(refData, "incidents").forEach((report) => map.set(report.id, { report, record: null }));
    records.filter((record) => record.kind === "incident").forEach((record) => {
      const id = record.data?.id;
      const existing = map.get(id);
      if (!existing || record.status !== "synced" || (record.updatedAt || "") > (existing.report?.updatedAt || "")) {
        map.set(id, { report: { ...(existing?.report || {}), ...record.data }, record });
      }
    });
    return [...map.values()].sort((a, b) => String(b.report.incidentDate || b.report.createdAt || "").localeCompare(String(a.report.incidentDate || a.report.createdAt || "")));
  }, [refData, records]);

  return (
    <Screen
      title="Incident reports"
      subtitle="Start at the scene, finish in the RMS"
      onBack={back}
      footer={(
        <button type="button" className="fa-btn fa-btn-primary fa-btn-block" onClick={() => navigate("incidentForm")}>
          <Plus size={22} /> New incident report
        </button>
      )}
    >
      {!rows.length ? (
        <Banner tone="info" icon={<Siren size={22} />} title="No recent draft reports">
          Start a report with the basics — address, type, times, units and crew. The full NERIS report is finished in the RMS.
        </Banner>
      ) : null}
      <div className="fa-list">
        {rows.map(({ report, record }) => (
          <button
            key={report.id}
            type="button"
            className="fa-row"
            onClick={() => navigate("incidentForm", record && record.status !== "synced" ? { localId: record.localId } : { reportId: report.id })}
          >
            <span className="fa-row-text">
              <strong>{report.incidentTypeSummary || "Incident"}{report.reportNumber ? ` · ${report.reportNumber}` : ""}</strong>
              <small><MapPin size={13} /> {report.incidentAddress || "No address"} · {formatDay(report.incidentDate)}</small>
            </span>
            {record && record.status !== "synced" ? <StatusChip status={record.status} /> : <span className="fa-status tone-muted">{report.status || "Draft"}</span>}
          </button>
        ))}
      </div>
    </Screen>
  );
}
