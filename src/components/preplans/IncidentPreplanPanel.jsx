import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, History, Link2, MapPin, Radio, RefreshCw, Search } from "lucide-react";
import { listOccupancyRecords } from "../../lib/inspections/occupancyService.js";
import { incidentFrom, incidentKey, matchIncidentToPreplans } from "../../lib/preplans/incidentMatch.js";
import {
  linkIncidentToPreplan, listIncidentLinksForIncident, listRecentIncidentLinks, matchMethodLabel,
} from "../../lib/preplans/incidentLinkService.js";
import PreplanResponseView from "./PreplanResponseView.jsx";

function when(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}

const STATUS_TEXT = {
  matched: "Approved preplan found",
  confirm: "Needs confirmation",
  none: "No approved preplan",
};

function MatchChip({ status }) {
  const tone = status === "matched" ? "is-ok" : status === "confirm" ? "is-warn" : "is-none";
  return <span className={`ipm-chip ${tone}`}>{STATUS_TEXT[status] || status}</span>;
}

/**
 * RMS → Preplans → Incident Preplans: recent dispatches (Active911, and the
 * demo's sample CAD runs) matched to approved preplans, an address lookup,
 * and the record of which preplan version was used on which call.
 */
export default function IncidentPreplanPanel({ departmentId, actor, preplans = [] }) {
  const [occupancies, setOccupancies] = useState([]);
  const [dispatches, setDispatches] = useState(null);
  const [links, setLinks] = useState(null);
  const [selected, setSelected] = useState(null); // { incident, result }
  const [incidentLinks, setIncidentLinks] = useState([]);
  const [address, setAddress] = useState("");
  const [suite, setSuite] = useState("");
  const [responseFor, setResponseFor] = useState(null);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const preplanById = useMemo(() => new Map(preplans.map((row) => [row.id, row])), [preplans]);

  const loadDispatches = useCallback(async ({ sync = false } = {}) => {
    setBusy(sync ? "sync" : "");
    try {
      const { loadCadRecords } = await import("../../lib/pcrService.js");
      const records = await loadCadRecords(departmentId, { sync });
      const sorted = [...records].sort((a, b) => String(b.sentAt).localeCompare(String(a.sentAt))).slice(0, 40);
      setDispatches(sorted);
    } catch (loadError) {
      setDispatches([]);
      setError(loadError?.message || "Couldn't load dispatches.");
    } finally {
      setBusy("");
    }
  }, [departmentId]);

  const loadLinks = useCallback(async () => {
    try {
      setLinks(await listRecentIncidentLinks(departmentId, 50));
    } catch (loadError) {
      setLinks([]);
      setError(loadError?.message || "Couldn't load incident links.");
    }
  }, [departmentId]);

  useEffect(() => {
    listOccupancyRecords(departmentId).then(setOccupancies).catch(() => setOccupancies([]));
    loadDispatches();
    loadLinks();
  }, [departmentId, loadDispatches, loadLinks]);

  const matched = useMemo(() => (dispatches || []).map((record) => {
    const incident = incidentFrom(record);
    return { record, incident, result: matchIncidentToPreplans(incident, preplans, { occupancies }) };
  }), [dispatches, preplans, occupancies]);

  async function choose(incident, result) {
    setSelected({ incident, result });
    setMessage("");
    setError("");
    const key = incidentKey(incident);
    setIncidentLinks(key ? await listIncidentLinksForIncident(departmentId, key).catch(() => []) : []);
  }

  function lookUp(event) {
    event.preventDefault();
    if (!address.trim()) return;
    const incident = incidentFrom({ address, suite, source: "manual" });
    choose(incident, matchIncidentToPreplans(incident, preplans, { occupancies }));
  }

  async function link(preplan, method) {
    if (!selected) return;
    setBusy(`link:${preplan.id}`);
    setError("");
    try {
      const saved = await linkIncidentToPreplan(departmentId, { incident: selected.incident, preplanId: preplan.id, method, actor });
      setMessage(saved.existing
        ? "Already linked to this call."
        : `Linked: version ${saved.revisionNumber ?? "?"} of ${saved.preplanName} is recorded for this call.`);
      const key = incidentKey(selected.incident);
      if (key) setIncidentLinks(await listIncidentLinksForIncident(departmentId, key).catch(() => []));
      loadLinks();
    } catch (linkError) {
      setError(linkError?.message || "Couldn't link the preplan.");
    } finally {
      setBusy("");
    }
  }

  const linkedIds = new Set(incidentLinks.map((row) => row.preplanId));
  const result = selected?.result;

  function candidateRow(row, { primary = false } = {}) {
    const preplan = row.preplan;
    const method = primary ? row.method : "confirmed";
    return (
      <div key={preplan.id} className={`ipm-candidate${primary ? " is-primary" : ""}`}>
        <div>
          <strong>{preplan.facilityName || preplan.occupancyName || preplan.address}</strong>
          <small>{preplan.preplanNumber ? `${preplan.preplanNumber} · ` : ""}{preplan.address}{row.distance !== null ? ` · ${row.distance} m from the CAD location` : ""}</small>
          <ul>{row.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
          {!row.sameAddress ? <p className="ipm-warn"><AlertTriangle size={13} /> Not the dispatched address. Use it only if you've confirmed it's the same property.</p> : null}
        </div>
        <div className="ipm-actions">
          <button type="button" className="secondary-button" onClick={() => setResponseFor(preplan)}>Open response view</button>
          {linkedIds.has(preplan.id) ? (
            <span className="ipm-linked"><CheckCircle2 size={14} /> Linked to this call</span>
          ) : (
            <button type="button" className={primary ? "primary-button" : "secondary-button"} disabled={Boolean(busy)} onClick={() => link(preplan, method)}>
              <Link2 size={14} /> {primary ? "Link to this call" : "This is the dispatched property"}
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      <section className="panel">
        <header>
          <div><Radio size={15} /><strong>Recent dispatches</strong></div>
          <button type="button" className="secondary-button" disabled={Boolean(busy)} onClick={() => loadDispatches({ sync: true })}>
            <RefreshCw size={14} /> {busy === "sync" ? "Checking…" : "Check for new"}
          </button>
        </header>
        <div className="panel-body">
          <p className="occupancy-muted">
            Each dispatch is matched to an approved preplan by its street address (and suite, when CAD sends one). A different address, a nearby building
            or several preplans at one address are never picked automatically; they wait for someone to confirm. Draft preplans are never offered.
          </p>
          {dispatches === null ? <p className="occupancy-muted">Loading…</p> : null}
          {dispatches && !dispatches.length ? <p className="occupancy-muted">No dispatches. They come from the Active911 integration (System → Integrations).</p> : null}
          {matched.length ? (
            <div className="cert-table">
              <div className="cert-row cert-head">
                <span>Received</span>
                <span>Call</span>
                <span>Address</span>
                <span>Preplan</span>
              </div>
              {matched.map(({ record, incident, result: rowResult }) => (
                <button
                  type="button"
                  key={`${record.source}:${record.id}`}
                  className={`cert-row ipm-row${selected && incidentKey(selected.incident) === incidentKey(incident) ? " is-selected" : ""}`}
                  onClick={() => choose(incident, rowResult)}
                >
                  <span>{when(record.sentAt)}</span>
                  <strong>{record.description || "Dispatch"}{record.incidentNumber ? ` · ${record.incidentNumber}` : ""}</strong>
                  <span>{record.address || "—"}</span>
                  <span>
                    <MatchChip status={rowResult.status} />
                    {rowResult.match ? ` ${rowResult.match.preplan.facilityName || rowResult.match.preplan.address}` : ""}
                  </span>
                </button>
              ))}
            </div>
          ) : null}

          <form className="ipm-lookup" onSubmit={lookUp}>
            <label className="config-field">
              <span>Or look up an address</span>
              <input value={address} onChange={(event) => setAddress(event.target.value)} placeholder="214 Main St" />
            </label>
            <label className="config-field ipm-suite">
              <span>Suite</span>
              <input value={suite} onChange={(event) => setSuite(event.target.value)} />
            </label>
            <button type="submit" className="secondary-button"><Search size={14} /> Find</button>
          </form>
        </div>
      </section>

      {selected ? (
        <section className="panel">
          <header><div><MapPin size={15} /><strong>{selected.incident.address || "Dispatch"}{selected.incident.parsed.suite ? `, suite ${selected.incident.parsed.suite}` : ""}</strong></div></header>
          <div className="panel-body">
            <p className={`ipm-status is-${result.status}`}><MatchChip status={result.status} /> {result.message}</p>
            {result.match ? candidateRow(result.match, { primary: true }) : null}
            {result.status === "confirm" ? result.candidates.map((row) => candidateRow(row)) : null}
            {result.status === "matched" && result.candidates.length > 1 ? (
              <details className="ipm-more">
                <summary>Other preplans nearby or in the same building ({result.candidates.length - 1})</summary>
                {result.candidates.filter((row) => row.preplan.id !== result.match.preplan.id).map((row) => candidateRow(row))}
              </details>
            ) : null}
            {result.unapproved.length ? (
              <p className="occupancy-muted">
                Not approved for response: {result.unapproved.map((row) => `${row.preplanNumber || row.id} (${row.status || "draft"})`).join(", ")}.
              </p>
            ) : null}
            {message ? <p className="occupancy-message" role="status">{message}</p> : null}
            {error ? <p className="occupancy-error" role="alert">{error}</p> : null}
          </div>
        </section>
      ) : null}

      <section className="panel">
        <header><div><History size={15} /><strong>Preplans used on calls</strong></div></header>
        <div className="panel-body">
          {links === null ? <p className="occupancy-muted">Loading…</p> : null}
          {links && !links.length ? <p className="occupancy-muted">None yet. Crews link a preplan when they open it from a dispatch in FORGE FIELD, or here.</p> : null}
          {links && links.length ? (
            <div className="cert-table">
              <div className="cert-row cert-head">
                <span>When</span>
                <span>Call</span>
                <span>Preplan and version used</span>
                <span>Matched by</span>
              </div>
              {links.map((row) => {
                const current = preplanById.get(row.preplanId);
                const revised = current && current.publishedRevisionId && current.publishedRevisionId !== row.revisionId;
                return (
                  <div key={row.id} className="cert-row">
                    <span>{when(row.linkedAt)}</span>
                    <span>{row.incidentDescription || "Call"}{row.incidentNumber ? ` · ${row.incidentNumber}` : ""}<br /><small>{row.incidentAddress}</small></span>
                    <span>
                      <strong>{row.preplanName}</strong> · version {row.revisionNumber ?? "?"}
                      {revised ? <><br /><small>Revised since; this call used the earlier approved version.</small></> : null}
                      {!current ? <><br /><small>The preplan has since been removed.</small></> : null}
                    </span>
                    <span>{matchMethodLabel(row.matchMethod)}{row.linkedByName ? ` · ${row.linkedByName}` : ""}</span>
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
      </section>

      {responseFor ? <PreplanResponseView departmentId={departmentId} preplan={responseFor} onClose={() => setResponseFor(null)} /> : null}
    </>
  );
}
